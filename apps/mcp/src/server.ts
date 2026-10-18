import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Db } from "@bt/db";
import { schema } from "@bt/db";
import {
  MABV_ABSCHNITTE,
  STANDARD_7_RATEN,
  formatDe,
  money,
  pruefkette,
  ratenplanBerechnen,
  type MabvAbschnitt,
} from "@bt/domain";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

const abschnittKeys = MABV_ABSCHNITTE.map((a) => a.key) as [MabvAbschnitt, ...MabvAbschnitt[]];

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const json = (v: unknown) => text(JSON.stringify(v, null, 2));

/**
 * MCP-Server der Bauträger-Plattform.
 * Lesende Tools liefern Daten; schreibende Tools (folgen) erzeugen nur Entwürfe.
 */
export function erstelleServer(db?: Db, apiUrl = process.env.API_URL) {
  const server = new McpServer({ name: "bautraeger-plattform", version: "0.1.0" });

  /** Lesender Aufruf der REST-API – dort gelten dieselben Prüfregeln wie in der Oberfläche. */
  const apiGet = async <T>(pfad: string): Promise<T> => {
    // Technische Lese-Identität: bei aktiver Microsoft-Anmeldung darf der MCP-Server nur lesen
    const res = await fetch(`${apiUrl}/api${pfad}`, { headers: { "x-benutzer": "mcp", "x-rollen": "System.Lesen" } });
    if (!res.ok) throw new Error(`API-Fehler ${res.status} bei ${pfad}`);
    return (await res.json()) as T;
  };

  if (apiUrl)
    server.registerTool(
      "anforderbare_raten",
      {
        title: "Anforderbare Raten",
        description:
          "Listet je Kaufvertrag die Raten, die jetzt angefordert werden können (Bautenstand gemeldet, MaBV-Voraussetzungen erfüllt), sowie gesperrte Raten mit fehlender Voraussetzung. Optional für ein Projekt (Projektnummer).",
        inputSchema: { projektNr: z.number().int().optional() },
        annotations: { readOnlyHint: true },
      },
      async ({ projektNr }) => {
        let projektId: string | undefined;
        if (projektNr !== undefined) {
          const projekte = await apiGet<{ id: string; nr: number }[]>(`/projekte?abgeschlossen=alle&suche=${projektNr}`);
          projektId = projekte.find((x) => x.nr === projektNr)?.id;
          if (!projektId) return text(`Projekt ${projektNr} nicht gefunden.`);
        }
        const vertraege = await apiGet<{ id: string }[]>(`/kaufvertraege${projektId ? `?projektId=${projektId}` : ""}`);
        const ergebnis = [];
        for (const { id } of vertraege) {
          const v = await apiGet<{
            nr: string;
            projekt: { nr: number; suchcode: string };
            kaeufer: { firma: string | null; vorname: string | null; nachname: string | null }[];
            raten: { nr: number; betrag: string; status: string; text: string | null }[];
            voraussetzungen: Record<string, boolean>;
          }>(`/kaufvertraege/${id}`);
          const anforderbar = v.raten.filter((r) => r.status === "anforderbar");
          const gesperrt = v.raten.filter((r) => r.status === "gesperrt");
          if (!anforderbar.length && !gesperrt.length) continue;
          const fehlend = Object.entries({
            "Vertrag wirksam": v.voraussetzungen.vertragWirksam,
            Auflassungsvormerkung: v.voraussetzungen.vormerkungEingetragen,
            Lastenfreistellung: v.voraussetzungen.lastenfreistellungGesichert,
          })
            .filter(([, ok]) => !ok && !v.voraussetzungen.buergschaftNach7)
            .map(([t]) => t);
          ergebnis.push({
            kaufvertrag: v.nr,
            projekt: `${v.projekt.nr} ${v.projekt.suchcode}`,
            kaeufer: v.kaeufer.map((k) => k.firma ?? [k.vorname, k.nachname].filter(Boolean).join(" ")).join(", "),
            anforderbar: anforderbar.map((r) => ({ rate: r.nr, betrag: formatDe(money(r.betrag)), bauabschnitt: r.text })),
            summeAnforderbar: formatDe(anforderbar.reduce((s, r) => s.plus(r.betrag), money(0))),
            gesperrt: gesperrt.map((r) => r.nr),
            fehlendeVoraussetzungen: v.voraussetzungen.anforderungssperre ? ["Anforderungssperre"] : fehlend,
          });
        }
        return ergebnis.length ? json(ergebnis) : text("Derzeit sind keine Raten anforderbar.");
      },
    );

  server.registerTool(
    "mabv_ratenplan_berechnen",
    {
      title: "MaBV-Ratenplan berechnen",
      description:
        "Berechnet Prozentsätze und Beträge eines Ratenplans nach § 3 Abs. 2 MaBV. Ohne Angabe von Raten wird der Standardplan mit 7 Raten verwendet.",
      inputSchema: {
        vertragssumme: z.string().describe("Vertragssumme brutto in EUR, z. B. \"324930.00\""),
        erbbaurecht: z.boolean().optional(),
        raten: z
          .array(z.object({ bezeichnung: z.string().optional(), abschnitte: z.array(z.enum(abschnittKeys)).min(1) }))
          .optional()
          .describe("Raten mit den jeweils enthaltenen Bauabschnitten"),
      },
    },
    async ({ vertragssumme, erbbaurecht, raten }) => {
      const plan = ratenplanBerechnen(money(vertragssumme), raten ?? STANDARD_7_RATEN, { erbbaurecht });
      return json(
        plan.map((r) => ({ rate: r.nr, prozent: r.prozent.toFixed(2), betrag: formatDe(r.betrag), text: r.bezeichnung })),
      );
    },
  );

  server.registerTool(
    "handwerker_pruefkette",
    {
      title: "Handwerkerrechnung prüfen",
      description:
        "Rechnet eine Handwerker-Abschlags- oder Schlussrechnung durch: Nachlass, Umlagen, Sicherheitseinbehalt, Skonto, Bauabzugsteuer (§ 48 EStG) und Auszahlungsbetrag.",
      inputSchema: {
        geprueftKumuliert: z.string().describe("Kumuliert geprüfter Betrag brutto in EUR"),
        nachlassProzent: z.number().optional(),
        umlagenProzent: z.number().optional(),
        einbehaltProzent: z.number().optional(),
        bisherAbgegolten: z.string().optional().describe("Bisher gezahlt inkl. Skonto und Bauabzugsteuer"),
        skontoProzent: z.number().optional(),
        freistellungGueltig: z.boolean().describe("Liegt eine gültige Freistellungsbescheinigung vor?"),
      },
    },
    async (e) => {
      const r = pruefkette({
        ...e,
        geprueftKumuliert: money(e.geprueftKumuliert),
        bisherAbgegolten: e.bisherAbgegolten ? money(e.bisherAbgegolten) : undefined,
      });
      return json(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, formatDe(v)])));
    },
  );

  if (apiUrl)
    server.registerTool(
      "kostenstand",
      {
        title: "Kostenstand eines Projekts",
        description:
          "Kostenkontrolle je Projekt: Summen (geschätzt, vergeben inkl. Nachträge, berechnet, bezahlt, Trend, Abweichung), die vergebenen Gewerke mit Vertragspartnern sowie Eingangsrechnungen, die auf Prüfung, Freigabe oder Zahlung warten.",
        inputSchema: { projektNr: z.number().int() },
        annotations: { readOnlyHint: true },
      },
      async ({ projektNr }) => {
        const projekte = await apiGet<{ id: string; nr: number; suchcode: string }[]>(`/projekte?abgeschlossen=alle&suche=${projektNr}`);
        const projekt = projekte.find((x) => x.nr === projektNr);
        if (!projekt) return text(`Projekt ${projektNr} nicht gefunden.`);
        type Stand = Record<string, string>;
        const [k, rechnungen] = await Promise.all([
          apiGet<{
            summe: Stand;
            gewerke: { nr: number; bezeichnung: string; stand: Stand; vertraege: { handwerker: { firma: string | null; nachname: string | null; suchcode: string } | null }[] }[];
          }>(`/projekte/${projekt.id}/kosten`),
          apiGet<{ rechnungsnr: string; status: string; handwerker: string | null; gewerk: string; betragBrutto: string; geprueftKumuliert: string | null; eingangAm: string }[]>(
            `/eingangsrechnungen?projektId=${projekt.id}&status=erfasst,sachlich_geprueft,rechnerisch_geprueft,freigegeben`,
          ),
        ]);
        const euro = (v: string) => `${formatDe(money(v))} €`;
        const schritt: Record<string, string> = { erfasst: "zu prüfen", sachlich_geprueft: "freizugeben", rechnerisch_geprueft: "freizugeben", freigegeben: "zu zahlen" };
        return json({
          projekt: `${projekt.nr} ${projekt.suchcode}`,
          summe: Object.fromEntries(Object.entries(k.summe).map(([key, v]) => [key, euro(v)])),
          vergebeneGewerke: k.gewerke
            .filter((g) => g.vertraege.length)
            .map((g) => ({
              gewerk: `${g.nr} ${g.bezeichnung}`,
              vertragspartner: g.vertraege.map((v) => v.handwerker?.firma ?? v.handwerker?.nachname ?? v.handwerker?.suchcode).join(", "),
              geschaetzt: euro(g.stand.geschaetzt!),
              vergebenInklNachtraege: euro(g.stand.summeVergeben!),
              berechnet: euro(g.stand.berechnet!),
              bezahlt: euro(g.stand.bezahlt!),
              abweichung: euro(g.stand.abweichung!),
            })),
          offeneRechnungen: rechnungen.map((r) => ({
            rechnung: r.rechnungsnr,
            handwerker: r.handwerker,
            gewerk: r.gewerk,
            schritt: schritt[r.status] ?? r.status,
            betragKumuliert: euro(r.geprueftKumuliert ?? r.betragBrutto),
            eingang: r.eingangAm,
          })),
        });
      },
    );

  if (apiUrl)
    server.registerTool(
      "maengel_offen",
      {
        title: "Offene Mängel",
        description:
          "Listet offene Mängel mit Status (nicht gerügt, Frist läuft, Frist überschritten), Rügestufe, Frist, Einheit und verantwortlichem Handwerker – optional für ein Projekt (Projektnummer) oder nur überfällige.",
        inputSchema: { projektNr: z.number().int().optional(), nurUeberfaellig: z.boolean().optional() },
        annotations: { readOnlyHint: true },
      },
      async ({ projektNr, nurUeberfaellig }) => {
        let projektId: string | undefined;
        if (projektNr !== undefined) {
          const projekte = await apiGet<{ id: string; nr: number }[]>(`/projekte?abgeschlossen=alle&suche=${projektNr}`);
          projektId = projekte.find((x) => x.nr === projektNr)?.id;
          if (!projektId) return text(`Projekt ${projektNr} nicht gefunden.`);
        }
        const q = new URLSearchParams({ status: nurUeberfaellig ? "ueberfaellig" : "offen", ...(projektId ? { projektId } : {}) });
        const liste = await apiGet<
          { nr: number; projektNr: number; projekt: string; titel: string; ort: string | null; einheit: string | null; handwerker: string | null; status: string; ruegen: number; fristBis: string | null; einbehalt: boolean }[]
        >(`/maengel?${q}`);
        const statusText: Record<string, string> = { neu: "nicht gerügt", frist_laeuft: "Frist läuft", ueberfaellig: "Frist überschritten" };
        if (!liste.length) return text(nurUeberfaellig ? "Keine überfälligen Mängel." : "Keine offenen Mängel.");
        return json(
          liste.map((m) => ({
            mangel: `${m.projektNr}-${m.nr}`,
            projekt: m.projekt,
            titel: m.titel,
            ort: m.ort,
            einheit: m.einheit ?? "Gemeinschaft",
            handwerker: m.handwerker,
            status: statusText[m.status] ?? m.status,
            ruegen: m.ruegen,
            fristBis: m.fristBis,
            einbehalt: m.einbehalt,
          })),
        );
      },
    );

  if (apiUrl)
    server.registerTool(
      "liquiditaet",
      {
        title: "Liquiditätsbetrachtung",
        description:
          "Erlöse, Kosten und Saldo je Projekt und Gesellschaft mit Trend (Prognose), angefordert, bezahlt und offen. Standardmäßig nur laufende Projekte; optional alle Projekte.",
        inputSchema: { alleProjekte: z.boolean().optional() },
        annotations: { readOnlyHint: true },
      },
      async ({ alleProjekte }) => {
        type Block = { trend: string; angefordert: string; bezahlt: string; offen: string };
        type Zeile = { erloese: Block; kosten: Block; saldo: Block };
        const d = await apiGet<{
          gesellschaften: { gesellschaft: { name: string }; projekte: (Zeile & { projekt: { nr: number; suchcode: string } })[]; summe: Zeile }[];
          gesamt: Zeile;
          stand: string;
        }>(`/auswertungen/liquiditaet${alleProjekte ? "?projekte=alle" : ""}`);
        const euro = (v: string) => `${formatDe(money(v))} €`;
        const block = (b: Block) => ({ trend: euro(b.trend), angefordert: euro(b.angefordert), bezahlt: euro(b.bezahlt), offen: euro(b.offen) });
        const zeile = (z: Zeile) => ({ erloese: block(z.erloese), kosten: block(z.kosten), saldo: block(z.saldo) });
        return json({
          stand: d.stand,
          hinweis: "Beträge brutto. Erlöse-Trend = Vertragspreise + Listenpreise unverkaufter Einheiten; Kosten-Trend = Vergaben inkl. Nachträge, sonst Schätzung.",
          gesellschaften: d.gesellschaften.map((g) => ({
            gesellschaft: g.gesellschaft.name,
            projekte: g.projekte.map((p) => ({ projekt: `${p.projekt.nr} ${p.projekt.suchcode}`, ...zeile(p) })),
            summe: zeile(g.summe),
          })),
          gesamt: zeile(d.gesamt),
        });
      },
    );

  if (apiUrl)
    server.registerTool(
      "liquiditaetsplan",
      {
        title: "Liquiditätsplan nach Kalenderwochen",
        description:
          "Erwartete Ein- und Auszahlungen je Kalenderwoche aus Bauzeitenplan, MaBV-Raten und Gewerken, mit Bestand und Tiefststand (Finanzierungsbedarf). Kosten nach Prüfkette der Verträge (Nachlass, Umlagen, Einbehalte, Skonto) inkl. Schlusszahlungen und Auszahlung der Gewährleistungseinbehalte. Optional für ein Projekt (Projektnummer), mit Anfangsbestand, unverkauften Einheiten und ohne Skonto.",
        inputSchema: {
          projektNr: z.number().int().optional(),
          wochen: z.number().int().min(4).max(104).optional(),
          anfangsbestand: z.number().optional(),
          unverkaufteEinheiten: z.boolean().optional(),
          ohneSkonto: z.boolean().optional(),
        },
        annotations: { readOnlyHint: true },
      },
      async ({ projektNr, wochen, anfangsbestand, unverkaufteEinheiten, ohneSkonto }) => {
        const q = new URLSearchParams({ wochen: String(wochen ?? 26) });
        if (projektNr !== undefined) {
          const projekte = await apiGet<{ id: string; nr: number }[]>(`/projekte?abgeschlossen=alle&suche=${projektNr}`);
          const id = projekte.find((x) => x.nr === projektNr)?.id;
          if (!id) return text(`Projekt ${projektNr} nicht gefunden.`);
          q.set("projektId", id);
        }
        if (anfangsbestand !== undefined) q.set("anfangsbestand", anfangsbestand.toFixed(2));
        if (unverkaufteEinheiten) q.set("unverkauft", "1");
        if (ohneSkonto) q.set("skonto", "0");
        const d = await apiGet<{
          stichtag: string;
          projekte: { nr: number; suchcode: string; hatPlan: boolean }[];
          artText: { ein: Record<string, string>; aus: Record<string, string> };
          wochen: { jahr: number; woche: number; ein: Record<string, string>; aus: Record<string, string>; einSumme: string; ausSumme: string; bestand: string }[];
          summe: { ein: string; aus: string; endbestand: string };
          tiefstand: { bestand: string; woche: { jahr: number; woche: number } | null };
          ueberfaellig: { ein: string; aus: string };
          spaeter: { ein: string; aus: string };
          ohneTermin: { ein: string; aus: string };
          skonto: boolean;
          einbehalte: { skontoErsparnis: string; einbehaltenBisher: string; gewaehrleistung: string };
        }>(`/auswertungen/liquiditaetsplan?${q}`);
        const euro = (v: string) => `${formatDe(money(v))} €`;
        const posten = (r: Record<string, string>, t: Record<string, string>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [t[k] ?? k, euro(v)]));
        return json({
          stichtag: d.stichtag,
          projekte: d.projekte.map((p) => `${p.nr} ${p.suchcode}${p.hatPlan ? "" : " (ohne Bauzeitenplan)"}`),
          summe: { einnahmen: euro(d.summe.ein), ausgaben: euro(d.summe.aus), endbestand: euro(d.summe.endbestand) },
          tiefstand: { bestand: euro(d.tiefstand.bestand), kw: d.tiefstand.woche ? `KW ${d.tiefstand.woche.woche}/${d.tiefstand.woche.jahr}` : null },
          davonUeberfaellig: { einnahmen: euro(d.ueberfaellig.ein), ausgaben: euro(d.ueberfaellig.aus) },
          spaeter: { einnahmen: euro(d.spaeter.ein), ausgaben: euro(d.spaeter.aus) },
          ohneTermin: { einnahmen: euro(d.ohneTermin.ein), ausgaben: euro(d.ohneTermin.aus) },
          einbehalte: {
            vertragserfuellungDerzeit: euro(d.einbehalte.einbehaltenBisher),
            gewaehrleistungGesamt: euro(d.einbehalte.gewaehrleistung),
            [d.skonto ? "skontoertragEingerechnet" : "skontoertragMoeglich"]: euro(d.einbehalte.skontoErsparnis),
          },
          wochen: d.wochen.map((w) => ({
            kw: `KW ${w.woche}/${w.jahr}`,
            einnahmen: posten(w.ein, d.artText.ein),
            ausgaben: posten(w.aus, d.artText.aus),
            bestand: euro(w.bestand),
          })),
        });
      },
    );

  if (apiUrl)
    server.registerTool(
      "buergschaften",
      {
        title: "Bürgschaften",
        description:
          "Listet erhaltene (Handwerker) und ausgegebene Bürgschaften (§ 7 MaBV) mit Status: aktiv, läuft bald ab, Rückgabe fällig, abgelaufen, zurückgegeben. Standard: nur solche mit Handlungsbedarf.",
        inputSchema: { alle: z.boolean().optional() },
        annotations: { readOnlyHint: true },
      },
      async ({ alle }) => {
        const d = await apiGet<{
          buergschaften: { artText: string; richtung: string; projekt: { nr: number; suchcode: string } | null; bezug: string; buerge: string | null; nr: string | null; betrag: string; gueltigBis: string | null; rueckgabeFaelligAb: string | null; status: string }[];
          summen: { erhalten: string; ausgegeben: string; handlungsbedarf: number };
        }>(`/buergschaften?status=${alle ? "offen" : "handlung"}`);
        const statusText: Record<string, string> = { aktiv: "aktiv", laeuft_ab: "läuft bald ab", rueckgabe_faellig: "Rückgabe fällig", abgelaufen: "abgelaufen", zurueckgegeben: "zurückgegeben" };
        const euro = (v: string) => `${formatDe(money(v))} €`;
        return json({
          summen: { erhalten: euro(d.summen.erhalten), ausgegeben: euro(d.summen.ausgegeben), handlungsbedarf: d.summen.handlungsbedarf },
          buergschaften: d.buergschaften.map((x) => ({
            art: x.artText,
            richtung: x.richtung,
            projekt: x.projekt ? `${x.projekt.nr} ${x.projekt.suchcode}` : null,
            bezug: x.bezug,
            buerge: x.buerge,
            nr: x.nr,
            betrag: euro(x.betrag),
            gueltigBis: x.gueltigBis,
            rueckgabeFaelligAb: x.rueckgabeFaelligAb,
            status: statusText[x.status] ?? x.status,
          })),
        });
      },
    );

  if (apiUrl)
    server.registerTool(
      "bauabzugsteuer",
      {
        title: "Bauabzugsteuer (§ 48a EStG)",
        description:
          "Einbehaltene Bauabzugsteuer je Monat und Handwerker mit Anmeldetermin (10. des Folgemonats) und Stand: anzumelden, angemeldet, abgeführt oder Anmeldung zu berichtigen. Standard: letzte 12 Monate.",
        inputSchema: { monate: z.number().int().min(1).max(36).optional() },
        annotations: { readOnlyHint: true },
      },
      async ({ monate }) => {
        const d = await apiGet<{
          monate: {
            monatText: string;
            faelligAm: string;
            ueberfaellig: boolean;
            summe: { abzugsbetrag: string };
            zeilen: { handwerkerId: string; gegenleistung: string; abzugsbetrag: string; status: string; anmeldung: { angemeldetAm: string; abgefuehrtAm: string | null } | null }[];
          }[];
          handwerker: { id: string; suchcode: string; firma: string | null; nachname: string | null; finanzamt: string | null }[];
        }>(`/bauabzug?monate=${monate ?? 12}`);
        const statusText: Record<string, string> = { offen: "anzumelden", angemeldet: "angemeldet, nicht abgeführt", abgefuehrt: "abgeführt", abweichung: "Anmeldung berichtigen" };
        const euro = (v: string) => `${formatDe(money(v))} €`;
        const name = new Map(d.handwerker.map((h) => [h.id, { name: h.firma ?? h.nachname ?? h.suchcode, finanzamt: h.finanzamt }]));
        return json(
          d.monate.map((m) => ({
            monat: m.monatText,
            termin: m.faelligAm,
            terminUeberschritten: m.ueberfaellig,
            abzugGesamt: euro(m.summe.abzugsbetrag),
            handwerker: m.zeilen.map((z) => ({
              name: name.get(z.handwerkerId)?.name ?? "–",
              finanzamt: name.get(z.handwerkerId)?.finanzamt ?? "fehlt",
              gegenleistung: euro(z.gegenleistung),
              abzug: euro(z.abzugsbetrag),
              stand: statusText[z.status] ?? z.status,
              angemeldetAm: z.anmeldung?.angemeldetAm ?? null,
              abgefuehrtAm: z.anmeldung?.abgefuehrtAm ?? null,
            })),
          })),
        );
      },
    );

  if (apiUrl)
    server.registerTool(
      "mabv_pruefbericht",
      {
        title: "MaBV-Prüfbericht (§ 16 MaBV)",
        description:
          "Prüfhilfe je Gesellschaft und Jahr: Kaufverträge mit Sicherungsart, Zahlungsanforderungen und automatische Feststellungen (Anforderung vor Bautenstand, fehlende Voraussetzungen nach § 3 oder Sicherheit nach § 7, Ratenplan). Standard: Vorjahr.",
        inputSchema: { jahr: z.number().int().min(2000).max(2100).optional(), gesellschaftNr: z.number().int().optional() },
        annotations: { readOnlyHint: true },
      },
      async ({ jahr, gesellschaftNr }) => {
        const q = new URLSearchParams(jahr ? { von: `${jahr}-01-01`, bis: `${jahr}-12-31` } : {});
        if (gesellschaftNr !== undefined) {
          const ges = await apiGet<{ id: string; nr: number }[]>("/gesellschaften");
          const g = ges.find((x) => x.nr === gesellschaftNr);
          if (!g) return text(`Gesellschaft ${gesellschaftNr} nicht gefunden.`);
          q.set("gesellschaftId", g.id);
        }
        const d = await apiGet<{
          gesellschaft: { name: string };
          zeitraum: { von: string; bis: string };
          summen: { vertraege: number; vertragssumme: string; angefordertImZeitraum: string; eingegangenImZeitraum: string; anforderungen: number; verstoesse: number; hinweise: number };
          vertraege: { nr: string; kaeufer: string[]; sicherung: { art: string }; verstoesse: number; feststellungen: { art: string; schwere: string; text: string; rechnungsnr?: string }[] }[];
        }>(`/auswertungen/mabv-pruefbericht?${q}`);
        const euro = (v: string) => `${formatDe(money(v))} €`;
        return json({
          gesellschaft: d.gesellschaft.name,
          zeitraum: d.zeitraum,
          summen: { ...d.summen, vertragssumme: euro(d.summen.vertragssumme), angefordertImZeitraum: euro(d.summen.angefordertImZeitraum), eingegangenImZeitraum: euro(d.summen.eingegangenImZeitraum) },
          feststellungen: d.vertraege.flatMap((v) => v.feststellungen.map((f) => ({ kaufvertrag: v.nr, kaeufer: v.kaeufer.join(", "), sicherung: v.sicherung.art, ...f }))),
          hinweis: "Prüfhilfe auf Basis der erfassten Daten; die Würdigung obliegt dem Prüfer nach § 16 MaBV.",
        });
      },
    );

  if (apiUrl)
    server.registerTool(
      "aufgaben",
      {
        title: "Aufgaben (Cockpit)",
        description:
          "Was ist heute zu tun? Offene Aufgaben aus allen Bereichen, nach Dringlichkeit sortiert: überfällige Zahlungen, anforderbare Raten, Rechnungen prüfen/freigeben/zahlen (Skontofristen), Mängelfristen, Bürgschaften, Bauverzug, zu meldender Bautenstand, Abnahmen, Bauabzugsteuer-Termine.",
        inputSchema: { nurDringend: z.boolean().optional(), bereich: z.enum(["verkauf", "kosten", "maengel", "sicherheiten", "bau", "steuern", "einstellungen"]).optional() },
        annotations: { readOnlyHint: true },
      },
      async ({ nurDringend, bereich }) => {
        const d = await apiGet<{
          stichtag: string;
          anzahl: { hoch: number; mittel: number; info: number };
          kennzahlen: Record<string, string | number>;
          aufgaben: { bereich: string; dringlichkeit: string; titel: string; text: string; datum?: string | null; betrag?: string | null; projekt?: string | null }[];
        }>("/cockpit");
        const liste = d.aufgaben.filter((a) => (!nurDringend || a.dringlichkeit === "hoch") && (!bereich || a.bereich === bereich));
        if (!liste.length) return text(nurDringend ? "Keine dringenden Aufgaben." : "Keine offenen Aufgaben.");
        return json({
          stichtag: d.stichtag,
          anzahl: d.anzahl,
          aufgaben: liste.map((a) => ({ ...a, betrag: a.betrag ? `${formatDe(money(a.betrag))} €` : undefined })),
        });
      },
    );

  if (!db) return server;

  server.registerTool(
    "projekte_auflisten",
    {
      title: "Projekte auflisten",
      description: "Listet Projekte mit Nummer, Suchcode, Ort und Gesellschaft. Optional nur laufende Projekte.",
      inputSchema: { nurLaufende: z.boolean().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ nurLaufende }) => {
      const rows = await db
        .select({
          nr: schema.projekt.nr,
          suchcode: schema.projekt.suchcode,
          ort: schema.projekt.ort,
          art: schema.projekt.art,
          gesellschaft: schema.gesellschaft.name,
          abgeschlossen: schema.projekt.abgeschlossen,
        })
        .from(schema.projekt)
        .innerJoin(schema.gesellschaft, eq(schema.projekt.gesellschaftId, schema.gesellschaft.id))
        .where(nurLaufende ? eq(schema.projekt.abgeschlossen, false) : undefined)
        .orderBy(asc(schema.projekt.nr));
      return json(rows);
    },
  );

  server.registerTool(
    "offene_zahlungsanforderungen",
    {
      title: "Offene Zahlungsanforderungen",
      description:
        "Zeigt angeforderte, aber noch nicht vollständig bezahlte Raten – optional für ein Projekt (Projektnummer) und nur überfällige.",
      inputSchema: { projektNr: z.number().int().optional(), nurUeberfaellig: z.boolean().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ projektNr, nurUeberfaellig }) => {
      const za = schema.zahlungsanforderung;
      const bezahlt = sql<string>`coalesce((select sum(${schema.zahlungseingang.betrag}) from ${schema.zahlungseingang} where ${schema.zahlungseingang.zahlungsanforderungId} = ${za.id}), 0)`;
      const rows = await db
        .select({
          projekt: schema.projekt.nr,
          kaufvertrag: schema.kaufvertrag.nr,
          rechnungsnr: za.rechnungsnr,
          raten: sql<string>`(select string_agg(${schema.rate.nr}::text, ', ' order by ${schema.rate.nr}) from ${schema.rate} where ${schema.rate.zahlungsanforderungId} = ${za.id})`,
          faelligAm: za.faelligAm,
          betrag: za.betrag,
          bezahlt,
          mahnstufe: za.mahnstufe,
        })
        .from(za)
        .innerJoin(schema.kaufvertrag, eq(za.kaufvertragId, schema.kaufvertrag.id))
        .innerJoin(schema.projekt, eq(schema.kaufvertrag.projektId, schema.projekt.id))
        .where(
          and(
            projektNr !== undefined ? eq(schema.projekt.nr, projektNr) : undefined,
            nurUeberfaellig ? sql`${za.faelligAm} < current_date` : undefined,
            sql`${za.betrag} > ${bezahlt}`,
          ),
        )
        .orderBy(asc(za.faelligAm));
      return json(
        rows.map((r) => ({ ...r, offen: formatDe(money(r.betrag).minus(r.bezahlt)), betrag: formatDe(money(r.betrag)) })),
      );
    },
  );

  return server;
}
