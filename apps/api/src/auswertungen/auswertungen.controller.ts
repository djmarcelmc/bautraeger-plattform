import { Controller, Get, Inject, Param, ParseUUIDPipe, Query, StreamableFile } from "@nestjs/common";
import { KostenService } from "../kosten/kosten.service.js";
import { VerkaufService } from "../verkauf/verkauf.service.js";
import { FESTSTELLUNG_ART_TEXT } from "@bt/domain";
import { AuswertungenService, type Filter } from "./auswertungen.service.js";
import { MabvPruefberichtService } from "./mabv-pruefbericht.service.js";
import { XLSX, excelDatei, type Abschnitt } from "./excel.js";


const datei = (inhalt: Buffer, name: string) => new StreamableFile(inhalt, { type: XLSX, disposition: `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.xlsx"` });
const filter = (gesellschaftId?: string, laufend?: string): Filter => ({
  gesellschaftId: gesellschaftId && /^[0-9a-f-]{36}$/.test(gesellschaftId) ? gesellschaftId : undefined,
  nurLaufende: laufend !== "alle",
});

@Controller("auswertungen")
export class AuswertungenController {
  constructor(
    @Inject(AuswertungenService) private readonly auswertungen: AuswertungenService,
    @Inject(KostenService) private readonly kosten: KostenService,
    @Inject(VerkaufService) private readonly verkauf: VerkaufService,
    @Inject(MabvPruefberichtService) private readonly mabv: MabvPruefberichtService,
  ) {}

  /** Prüfbericht nach § 16 MaBV (Standard: Vorjahr, erste Gesellschaft). */
  @Get("mabv-pruefbericht")
  async mabvPruefbericht(@Query("gesellschaftId") gesellschaftId?: string, @Query("von") von?: string, @Query("bis") bis?: string, @Query("format") format?: string) {
    const d = await this.mabv.bericht({ gesellschaftId: gesellschaftId && /^[0-9a-f-]{36}$/.test(gesellschaftId) ? gesellschaftId : undefined, von, bis });
    if (format !== "xlsx") return d;
    const e = "euro" as const;
    const de = (iso: string | null) => (iso ? iso.split("-").reverse().join(".") : "");
    const titel = `MaBV-Prüfbericht ${d.gesellschaft.name}, ${de(d.zeitraum.von)}–${de(d.zeitraum.bis)}`;
    return datei(
      await excelDatei("MaBV", titel, [
        {
          titel: "Kaufverträge",
          spalten: [
            { titel: "Kaufvertrag", breite: 14 },
            { titel: "Projekt", breite: 18 },
            { titel: "Käufer", breite: 26 },
            { titel: "Einheiten", breite: 12 },
            { titel: "Datum", breite: 11 },
            { titel: "Sicherung", breite: 10 },
            { titel: "Vormerkung", breite: 11 },
            { titel: "Vertragssumme", art: e, breite: 15 },
            { titel: "angefordert (Zeitraum)", art: e, breite: 16 },
            { titel: "eingegangen (Zeitraum)", art: e, breite: 16 },
            { titel: "Verstöße", art: "zahl", breite: 9 },
          ],
          zeilen: d.vertraege.map((v) => [
            v.nr,
            `${v.projekt.nr} ${v.projekt.suchcode}`,
            v.kaeufer.join(", "),
            v.einheiten.join(", "),
            de(v.datum),
            v.sicherung.art,
            de(v.sicherung.vormerkungEingetragenAm),
            v.vertragssumme,
            v.summen.angefordertImZeitraum,
            v.summen.eingegangenImZeitraum,
            v.verstoesse,
          ]),
        },
        {
          titel: "Zahlungsanforderungen im Zeitraum",
          spalten: [
            { titel: "Kaufvertrag", breite: 14 },
            { titel: "Rechnung", breite: 15 },
            { titel: "angefordert", breite: 11 },
            { titel: "Raten / Bauabschnitte (fertig gemeldet)", breite: 60 },
            { titel: "Betrag", art: e, breite: 15 },
            { titel: "ordnungsgemäß", breite: 13 },
          ],
          zeilen: d.vertraege.flatMap((v) =>
            v.anforderungen.map((a) => [
              v.nr,
              a.rechnungsnr,
              de(a.angefordertAm),
              a.raten.map((r) => `Rate ${r.nr}: ${r.abschnitte.map((x) => `${x.text} (${de(x.fertigAm) || "nicht gemeldet"})`).join("; ")}`).join(" | "),
              a.betrag,
              a.ordnungsgemaess ? "ja" : "nein",
            ]),
          ),
        },
        {
          titel: "Feststellungen",
          spalten: [
            { titel: "Kaufvertrag", breite: 14 },
            { titel: "Bereich", breite: 30 },
            { titel: "Art", breite: 10 },
            { titel: "Rechnung", breite: 15 },
            { titel: "Feststellung", breite: 90 },
          ],
          zeilen: d.vertraege.flatMap((v) => v.feststellungen.map((f) => [v.nr, FESTSTELLUNG_ART_TEXT[f.art], f.schwere === "verstoss" ? "Verstoß" : "Hinweis", f.rechnungsnr ?? "", f.text])),
        },
      ]),
      "MaBV-Pruefbericht",
    );
  }

  @Get("liquiditaet")
  async liquiditaet(@Query("gesellschaftId") g?: string, @Query("projekte") laufend?: string, @Query("format") format?: string) {
    const d = await this.auswertungen.liquiditaet(filter(g, laufend));
    if (format !== "xlsx") return d;
    const spalten = [
      { titel: "Projekt", breite: 26 },
      { titel: "", breite: 12 },
      { titel: "Trend", art: "euro" as const, breite: 16 },
      { titel: "Angefordert", art: "euro" as const, breite: 16 },
      { titel: "Bezahlt", art: "euro" as const, breite: 16 },
      { titel: "Offen", art: "euro" as const, breite: 16 },
    ];
    type B = { trend: string; angefordert: string; bezahlt: string; offen: string };
    const block = (name: string, x: { erloese: B; kosten: B; saldo: B }) => [
      [name, "Erlöse", x.erloese.trend, x.erloese.angefordert, x.erloese.bezahlt, x.erloese.offen],
      ["", "− Kosten", x.kosten.trend, x.kosten.angefordert, x.kosten.bezahlt, x.kosten.offen],
      ["", "= Saldo", x.saldo.trend, x.saldo.angefordert, x.saldo.bezahlt, x.saldo.offen],
    ];
    const abschnitte: Abschnitt[] = d.gesellschaften.map((g2) => {
      const zeilen = [...g2.projekte.flatMap((p) => block(`${p.projekt.nr} ${p.projekt.suchcode}`, p as never)), ...block(`Summe ${g2.gesellschaft.name}`, g2.summe as never)];
      return { titel: g2.gesellschaft.name, spalten, zeilen, fett: zeilen.map((_, i) => i).filter((i) => i % 3 === 2 || i >= zeilen.length - 3) };
    });
    abschnitte.push({ titel: "Gesamt", spalten, zeilen: block("Gesamt", d.gesamt as never), fett: [0, 1, 2] });
    return datei(await excelDatei("Liquidität", "Liquiditätsbetrachtung", abschnitte), "Liquiditaetsbetrachtung");
  }

  @Get("controlling")
  async controlling(@Query("gesellschaftId") g?: string, @Query("projekte") laufend?: string, @Query("format") format?: string) {
    const d = await this.auswertungen.controlling(filter(g, laufend));
    if (format !== "xlsx") return d;
    const zeile = (name: string, x: (typeof d)["gesamt"]) => [
      name,
      x.kosten.standProzent,
      x.kosten.geschaetzt,
      x.kosten.trend,
      x.kosten.abweichung,
      x.verkauf.standProzent,
      x.verkauf.geschaetzt,
      x.verkauf.trend,
      x.verkauf.abweichung,
      x.ertrag.geschaetzt,
      x.ertrag.trend,
      x.ertrag.abweichung,
    ];
    const e = "euro" as const;
    const zeilen = [...d.projekte.map((p) => zeile(`${p.projekt.nr} ${p.projekt.suchcode}`, p)), zeile("Gesamt", d.gesamt)];
    return datei(
      await excelDatei("Controlling", "Controlling-Übersicht (Beträge brutto)", [
        {
          spalten: [
            { titel: "Projekt", breite: 26 },
            { titel: "Kosten Stand", art: "prozent" },
            { titel: "Kosten geschätzt", art: e, breite: 16 },
            { titel: "Kosten Trend", art: e, breite: 16 },
            { titel: "Kosten Abw.", art: e, breite: 15 },
            { titel: "Verkauf Stand", art: "prozent" },
            { titel: "Verkauf geschätzt", art: e, breite: 16 },
            { titel: "Verkauf Trend", art: e, breite: 16 },
            { titel: "Verkauf Abw.", art: e, breite: 15 },
            { titel: "Ertrag geschätzt", art: e, breite: 16 },
            { titel: "Ertrag Trend", art: e, breite: 16 },
            { titel: "Ertrag Abw.", art: e, breite: 15 },
          ],
          zeilen,
          fett: [zeilen.length - 1],
        },
      ]),
      "Controlling",
    );
  }

  @Get("kostenreport/:projektId")
  async kostenreport(@Param("projektId", ParseUUIDPipe) projektId: string, @Query("format") format?: string) {
    const { projekt } = await this.verkauf.projekt(projektId);
    const k = await this.kosten.kostenkontrolle(projektId);
    if (format !== "xlsx") return { projekt: { id: projekt.id, nr: projekt.nr, suchcode: projekt.suchcode, strasse: projekt.strasse, plz: projekt.plz, ort: projekt.ort }, ...k };
    const e = "euro" as const;
    const zeilen = [
      ...k.gewerke.map((g) => [
        g.nr,
        g.bezeichnung,
        g.vertraege.map((v) => v.handwerker?.firma ?? v.handwerker?.nachname ?? v.handwerker?.suchcode).join(", "),
        g.stand.geschaetzt,
        g.stand.vergeben,
        g.stand.nachtraege,
        g.stand.summeVergeben,
        g.stand.berechnet,
        g.stand.bezahlt,
        g.stand.abweichung,
      ]),
      ["", "Summe", "", k.summe.geschaetzt, k.summe.vergeben, k.summe.nachtraege, k.summe.summeVergeben, k.summe.berechnet, k.summe.bezahlt, k.summe.abweichung],
    ];
    return datei(
      await excelDatei("Kostenreport", `Kostenreport ${projekt.nr} ${projekt.suchcode} (Beträge brutto)`, [
        {
          spalten: [
            { titel: "Nr.", art: "zahl", breite: 7 },
            { titel: "Gewerk", breite: 28 },
            { titel: "Vertragspartner", breite: 26 },
            { titel: "geschätzt", art: e, breite: 15 },
            { titel: "vergeben", art: e, breite: 15 },
            { titel: "Nachträge", art: e, breite: 14 },
            { titel: "Summe vergeben", art: e, breite: 15 },
            { titel: "berechnet (geprüft)", art: e, breite: 17 },
            { titel: "bezahlt", art: e, breite: 15 },
            { titel: "Abweichung", art: e, breite: 15 },
          ],
          zeilen,
          fett: [zeilen.length - 1],
        },
      ]),
      `Kostenreport-${projekt.nr}`,
    );
  }

  @Get("projektbericht/:projektId")
  async projektbericht(@Param("projektId", ParseUUIDPipe) projektId: string, @Query("format") format?: string) {
    const b = await this.auswertungen.projektbericht(projektId);
    if (format !== "xlsx") return b;
    const e = "euro" as const;
    return datei(
      await excelDatei("Projektbericht", `Projektbericht ${b.projekt.nr} ${b.projekt.suchcode}`, [
        {
          titel: "Verkaufte Einheiten",
          spalten: [
            { titel: "Kaufvertrag", breite: 14 },
            { titel: "UR-Nr.", breite: 14 },
            { titel: "Käufer", breite: 30 },
            { titel: "Einheiten", breite: 14 },
            { titel: "VK gesamt", art: e, breite: 15 },
            { titel: "angefordert", art: e, breite: 15 },
            { titel: "bezahlt", art: e, breite: 15 },
            { titel: "% bezahlt", art: "prozent" },
            { titel: "noch zu zahlen", art: e, breite: 15 },
          ],
          zeilen: [
            ...b.verkauf.vertraege.map((v) => [
              v.nr,
              v.urkundennr,
              v.kaeufer.join(", "),
              v.einheiten.map((x) => x.nr).join(", "),
              v.summen.vertragssumme,
              v.summen.angefordert,
              v.summen.bezahlt,
              v.bezahltProzent,
              String(Number(v.summen.vertragssumme) - Number(v.summen.bezahlt)),
            ]),
            ["Summe", "", "", "", b.verkauf.summen.vertragssumme, b.verkauf.summen.angefordert, b.verkauf.summen.bezahlt, null, String(Number(b.verkauf.summen.vertragssumme) - Number(b.verkauf.summen.bezahlt))],
          ],
          fett: [b.verkauf.vertraege.length],
        },
        {
          titel: "Zu verkaufen",
          spalten: [{ titel: "Einheit" }, { titel: "Art", breite: 20 }, { titel: "Fläche m²", art: "zahl" }, { titel: "VK Plan", art: e, breite: 15 }],
          zeilen: [...b.verkauf.unverkauft.map((x) => [x.nr, x.art ?? x.typ, x.wohnflaeche, x.vkBrutto]), ["Summe", "", null, b.verkauf.summen.unverkauftPlan]],
          fett: [b.verkauf.unverkauft.length],
        },
        {
          titel: "Kosten",
          spalten: [{ titel: "" }, { titel: "geschätzt", art: e, breite: 15 }, { titel: "Summe vergeben", art: e, breite: 15 }, { titel: "berechnet", art: e, breite: 15 }, { titel: "bezahlt", art: e, breite: 15 }, { titel: "Abweichung", art: e, breite: 15 }],
          zeilen: [["Projekt gesamt", b.kosten.summe.geschaetzt, b.kosten.summe.summeVergeben, b.kosten.summe.berechnet, b.kosten.summe.bezahlt, b.kosten.summe.abweichung]],
        },
      ]),
      `Projektbericht-${b.projekt.nr}`,
    );
  }
}
