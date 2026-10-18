import { Controller, Get, Inject, Injectable } from "@nestjs/common";
import { schema } from "@bt/db";
import {
  MABV_ABSCHNITTE,
  basiszinsFehlt,
  buchhaltungsAufgaben,
  datumPlusTage,
  fristDringlichkeit,
  mangelStatus,
  money,
  sortiereAufgaben,
  summe,
  type Aufgabe,
} from "@bt/domain";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { KontextService } from "../common/kontext.service.js";
import { DB, type Db } from "../db.provider.js";
import { BankabgleichService } from "../bankabgleich/bankabgleich.service.js";
import { BauabzugService } from "../bauabzug/bauabzug.service.js";
import { BuchhaltungService } from "../buchhaltung/buchhaltung.service.js";
import { IbanService } from "../sepa/iban.service.js";
import { BauzeitService } from "../bauzeit/bauzeit.service.js";
import { KostenService } from "../kosten/kosten.service.js";
import { MaengelService } from "../maengel/maengel.service.js";
import { BuergschaftenService } from "../sepa/buergschaften.service.js";
import { VerkaufService } from "../verkauf/verkauf.service.js";

const { projekt: p, gesellschaft: g, kaufvertrag: kv, eingangsrechnung: er, handwerkervertrag: hv, gewerk: gw, mangel: m, abnahme: ab } = schema;
const de = (iso: string) => iso.split("-").reverse().join(".");
const eur = (v: string | number) => `${Number(v).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const ABSCHNITT = Object.fromEntries(MABV_ABSCHNITTE.map((a, i) => [a.key, `${i + 1}. ${a.bezeichnung}`]));

/** Aufgaben aus allen Bereichen für die Startseite („Was ist heute zu tun?“) und die tägliche Übersicht. */
@Injectable()
export class CockpitService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
    @Inject(VerkaufService) private readonly verkauf: VerkaufService,
    @Inject(KostenService) private readonly kosten: KostenService,
    @Inject(MaengelService) private readonly maengel: MaengelService,
    @Inject(BauzeitService) private readonly bauzeit: BauzeitService,
    @Inject(BuergschaftenService) private readonly buergschaften: BuergschaftenService,
    @Inject(BauabzugService) private readonly bauabzug: BauabzugService,
    @Inject(BankabgleichService) private readonly bank: BankabgleichService,
    @Inject(BuchhaltungService) private readonly buchhaltung: BuchhaltungService,
    @Inject(IbanService) private readonly iban: IbanService,
  ) {}

  async cockpit() {
    const heute = new Date().toISOString().slice(0, 10);
    const mandantId = await this.kontext.mandantId();
    const aufgaben: Aufgabe[] = [];
    const projekte = await this.db
      .select({ id: p.id, nr: p.nr, suchcode: p.suchcode })
      .from(p)
      .innerJoin(g, eq(p.gesellschaftId, g.id))
      .where(and(eq(g.mandantId, mandantId), eq(p.abgeschlossen, false)))
      .orderBy(asc(p.nr));
    const projektName = new Map(projekte.map((x) => [x.id, `${x.nr} ${x.suchcode}`]));
    const projektIds = projekte.map((x) => x.id);

    // ---------------------------------------------------------------- Verkauf
    let forderungen = money(0);
    let ueberfaellig = money(0);
    const vertraege = projektIds.length ? await this.db.select({ id: kv.id }).from(kv).where(inArray(kv.projektId, projektIds)).orderBy(asc(kv.nr)) : [];
    for (const { id } of vertraege) {
      const v = await this.verkauf.vertrag(id);
      const projekt = projektName.get(v.projekt.id) ?? null;
      const kaeufer = v.kaeufer.map((k) => k.firma ?? k.nachname).join(", ");
      const anforderbar = v.raten.filter((r) => r.status === "anforderbar");
      if (anforderbar.length)
        aufgaben.push({
          bereich: "verkauf",
          dringlichkeit: "mittel",
          titel: `Raten anfordern: ${v.nr}`,
          text: `${kaeufer} – ${anforderbar.length === 1 ? `Rate ${anforderbar[0]!.nr}` : `Raten ${anforderbar.map((r) => r.nr).join(", ")}`} anforderbar (Bautenstand erreicht)`,
          betrag: summe(anforderbar.map((r) => money(r.betrag).minus(r.bezahlt))).toFixed(2),
          projekt,
          link: `/kaufvertraege/${v.id}`,
        });
      for (const a of v.anforderungen) {
        forderungen = forderungen.plus(a.offen);
        if (!a.ueberfaellig) continue;
        ueberfaellig = ueberfaellig.plus(a.offen);
        const tage = Math.floor((Date.parse(heute) - Date.parse(a.faelligAm)) / 864e5);
        aufgaben.push({
          bereich: "verkauf",
          dringlichkeit: tage > 7 ? "hoch" : "mittel",
          titel: `Zahlung überfällig: ${a.rechnungsnr}`,
          text: `${kaeufer} – seit ${tage} Tagen fällig${a.mahnstufe ? `, Mahnstufe ${a.mahnstufe}` : ", noch nicht gemahnt"}`,
          datum: a.faelligAm,
          betrag: a.offen,
          projekt,
          link: "/verkauf?reiter=mahnwesen",
        });
      }
    }

    // ---------------------------------------------------------------- Kosten
    const rechnungen = await this.db
      .select({ id: er.id, status: er.status, eingangAm: er.eingangAm, betrag: sql<string>`coalesce(${er.geprueftKumuliert}, ${er.betragBrutto})` })
      .from(er)
      .innerJoin(hv, eq(er.handwerkervertragId, hv.id))
      .innerJoin(gw, eq(hv.gewerkId, gw.id))
      .innerJoin(p, eq(gw.projektId, p.id))
      .innerJoin(g, eq(p.gesellschaftId, g.id))
      .where(and(eq(g.mandantId, mandantId), sql`${er.status} <> 'bezahlt'`))
      .orderBy(asc(er.eingangAm));
    const zuPruefen = rechnungen.filter((r) => r.status === "erfasst");
    const freizugeben = rechnungen.filter((r) => r.status === "sachlich_geprueft" || r.status === "rechnerisch_geprueft");
    if (zuPruefen.length)
      aufgaben.push({
        bereich: "kosten",
        dringlichkeit: zuPruefen[0]!.eingangAm <= datumPlusTage(heute, -7) ? "hoch" : "mittel",
        titel: `${zuPruefen.length} ${zuPruefen.length === 1 ? "Rechnung" : "Rechnungen"} prüfen`,
        text: `älteste eingegangen am ${de(zuPruefen[0]!.eingangAm)} – Skontofristen laufen ab Eingang`,
        datum: zuPruefen[0]!.eingangAm,
        betrag: summe(zuPruefen.map((r) => money(r.betrag))).toFixed(2),
        link: "/kosten?reiter=pruefen",
      });
    if (freizugeben.length)
      aufgaben.push({
        bereich: "kosten",
        dringlichkeit: "mittel",
        titel: `${freizugeben.length} ${freizugeben.length === 1 ? "Rechnung" : "Rechnungen"} freigeben`,
        text: "sachlich und rechnerisch geprüft, wartet auf Freigabe",
        betrag: summe(freizugeben.map((r) => money(r.betrag))).toFixed(2),
        link: "/kosten?reiter=freigeben",
      });
    let zuZahlen = money(0);
    for (const r of rechnungen.filter((x) => x.status === "freigegeben")) {
      const z = await this.kosten.zahlbetrag(r.id, heute).catch(() => null);
      if (!z) continue;
      const { r: x, e } = z;
      zuZahlen = zuZahlen.plus(e.auszahlung!);
      const handwerker = x.vertrag.handwerker?.firma ?? x.vertrag.handwerker?.nachname ?? "";
      const skonto = x.vorschau.skontoMoeglich && x.vorschau.skontoFristBis && money(x.vorschau.mitSkonto.skonto!).gt(0);
      const frist = skonto ? x.vorschau.skontoFristBis! : x.faelligAm;
      aufgaben.push({
        bereich: "kosten",
        dringlichkeit: frist ? fristDringlichkeit(frist, heute) : "mittel",
        titel: skonto ? `Skonto nutzen: ${x.rechnungsnr}` : `Rechnung bezahlen: ${x.rechnungsnr}`,
        text: `${handwerker} – ${skonto ? `${eur(x.vorschau.mitSkonto.skonto!)} Skonto bis ${de(frist!)}` : frist ? `fällig ${de(frist)}` : "ohne Zahlungsfrist"}`,
        datum: frist,
        betrag: e.auszahlung,
        projekt: projektName.get(x.vertrag.projekt.id) ?? `${x.vertrag.projekt.nr} ${x.vertrag.projekt.suchcode}`,
        link: "/zahlungslaeufe",
      });
    }

    // ---------------------------------------------------------------- Mängel
    const offeneMaengel = projektIds.length
      ? await this.db
          .select({ id: m.id, nr: m.nr, titel: m.titel, projektId: m.projektId, festgestelltAm: m.festgestelltAm, erledigtAm: m.erledigtAm, handwerkerId: m.handwerkerId, festgestelltDurch: m.festgestelltDurch, ort: m.ort })
          .from(m)
          .where(and(inArray(m.projektId, projektIds), isNull(m.erledigtAm)))
      : [];
    const ruegen = await this.maengel.ruegen(offeneMaengel.map((x) => x.id));
    const ungeruegt = [];
    for (const x of offeneMaengel) {
      const rr = ruegen.get(x.id) ?? [];
      const status = mangelStatus(x, rr, heute);
      const projekt = projektName.get(x.projektId)!;
      if (status === "ueberfaellig") {
        const letzte = rr.at(-1)!;
        aufgaben.push({
          bereich: "maengel",
          dringlichkeit: "hoch",
          titel: `Mängelfrist überschritten: ${projekt.split(" ")[0]}-${x.nr}`,
          text: `${x.titel} – ${letzte.stufe}. Rüge, Frist ${de(letzte.nachfristBis ?? letzte.fristBis)}${letzte.stufe < 3 ? " → nächste Rüge" : " → Ersatzvornahme prüfen"}`,
          datum: letzte.nachfristBis ?? letzte.fristBis,
          projekt,
          link: `/maengel/${x.id}`,
        });
      } else if (status === "neu" && x.festgestelltDurch === "Käuferportal" && !x.handwerkerId)
        aufgaben.push({
          bereich: "maengel",
          dringlichkeit: x.festgestelltAm <= datumPlusTage(heute, -3) ? "hoch" : "mittel",
          titel: `Mängelanzeige vom Käufer: ${projekt.split(" ")[0]}-${x.nr}`,
          text: `${x.titel}${x.ort ? ` (${x.ort})` : ""} – Handwerker zuordnen und rügen, Käufer sieht den Stand im Portal`,
          datum: x.festgestelltAm,
          projekt,
          link: `/maengel/${x.id}`,
        });
      else if (status === "neu" && x.festgestelltAm <= datumPlusTage(heute, -7)) ungeruegt.push(x);
    }
    if (ungeruegt.length)
      aufgaben.push({
        bereich: "maengel",
        dringlichkeit: "mittel",
        titel: `${ungeruegt.length} ${ungeruegt.length === 1 ? "Mangel" : "Mängel"} noch nicht gerügt`,
        text: `seit mehr als 7 Tagen festgestellt${ungeruegt.some((x) => !x.handwerkerId) ? " – teils ohne zugeordneten Handwerker" : ""}`,
        datum: ungeruegt.map((x) => x.festgestelltAm).sort()[0],
        link: "/maengel?status=offen",
      });

    // ---------------------------------------------------------------- Bürgschaften
    for (const b of await this.buergschaften.abfrage({})) {
      if (!["abgelaufen", "rueckgabe_faellig", "laeuft_ab"].includes(b.status)) continue;
      const art = `${b.artText}${b.nr ? ` ${b.nr}` : ""}`;
      aufgaben.push({
        bereich: "sicherheiten",
        dringlichkeit: b.status === "abgelaufen" ? "hoch" : b.status === "laeuft_ab" && b.gueltigBis ? fristDringlichkeit(b.gueltigBis, heute, 14, 60) : "mittel",
        titel: b.status === "abgelaufen" ? "Bürgschaft abgelaufen" : b.status === "laeuft_ab" ? "Bürgschaft läuft ab" : b.richtung === "erhalten" ? "Bürgschaft zurückgeben" : "Bürgschaft zurückfordern",
        text: `${art} – ${b.bezug}${b.status === "rueckgabe_faellig" && b.rueckgabeFaelligAb ? `, fällig seit ${de(b.rueckgabeFaelligAb)}` : b.gueltigBis ? `, gültig bis ${de(b.gueltigBis)}` : ""}`,
        datum: b.status === "rueckgabe_faellig" ? b.rueckgabeFaelligAb : b.gueltigBis,
        betrag: b.betrag,
        projekt: b.projekt ? `${b.projekt.nr} ${b.projekt.suchcode}` : null,
        link: `/buergschaften/${b.id}`,
      });
    }

    // ---------------------------------------------------------------- Bau: Bauzeitenplan, Bautenstand, Abnahmen
    for (const pr of projekte) {
      const plan = await this.bauzeit.bauzeitenplan(pr.id);
      const projekt = projektName.get(pr.id)!;
      const verzug = plan.vorgaenge.filter((v) => !v.endeIst && v.ende < heute);
      if (verzug.length)
        aufgaben.push({
          bereich: "bau",
          dringlichkeit: "mittel",
          titel: `${verzug.length} ${verzug.length === 1 ? "Vorgang" : "Vorgänge"} über Plan-Ende`,
          text: `${verzug
            .slice(0, 3)
            .map((v) => v.bezeichnung)
            .join(", ")}${verzug.length > 3 ? " …" : ""} – Ist-Ende eintragen oder Plan verschieben`,
          datum: verzug.map((v) => v.ende).sort()[0],
          projekt,
          link: `/projekte/${pr.id}?reiter=bauzeit`,
        });
      for (const v of plan.vorgaenge) {
        if (!v.meilenstein || !v.mabvAbschnitt || !plan.einheiten || (v.gemeldet ?? 0) >= plan.einheiten) continue;
        if (v.meilenstein <= heute)
          aufgaben.push({
            bereich: "bau",
            dringlichkeit: v.meilenstein <= datumPlusTage(heute, -7) ? "hoch" : "mittel",
            titel: `Bautenstand prüfen: ${ABSCHNITT[v.mabvAbschnitt]}`,
            text: `laut Plan am ${de(v.meilenstein)} erreicht, gemeldet für ${v.gemeldet}/${plan.einheiten} Einheiten – Meldung ermöglicht die Ratenanforderung`,
            datum: v.meilenstein,
            projekt,
            link: `/projekte/${pr.id}?reiter=bautenstand`,
          });
        else if (v.meilenstein <= datumPlusTage(heute, 14))
          aufgaben.push({ bereich: "bau", dringlichkeit: "info", titel: `Meilenstein: ${ABSCHNITT[v.mabvAbschnitt]}`, text: `geplant am ${de(v.meilenstein)}`, datum: v.meilenstein, projekt, link: `/projekte/${pr.id}?reiter=bauzeit` });
      }
    }
    const abnahmen = projektIds.length
      ? await this.db.select({ id: ab.id, nr: ab.nr, art: ab.art, datum: ab.datum, projektId: ab.projektId }).from(ab).where(and(inArray(ab.projektId, projektIds), isNull(ab.abgeschlossenAm)))
      : [];
    for (const a of abnahmen) {
      const art = a.art === "sondereigentum" ? "Sondereigentum" : a.art === "gemeinschaftseigentum" ? "Gemeinschaftseigentum" : "Handwerkerleistung";
      if (a.datum <= heute)
        aufgaben.push({ bereich: "bau", dringlichkeit: "mittel", titel: `Abnahme abschließen: Nr. ${a.nr}`, text: `${art}, Termin war am ${de(a.datum)}`, datum: a.datum, projekt: projektName.get(a.projektId), link: `/abnahmen/${a.id}` });
      else if (a.datum <= datumPlusTage(heute, 14))
        aufgaben.push({ bereich: "bau", dringlichkeit: "info", titel: `Abnahmetermin: Nr. ${a.nr}`, text: `${art} am ${de(a.datum)} – Protokoll vorbereiten`, datum: a.datum, projekt: projektName.get(a.projektId), link: `/abnahmen/${a.id}` });
    }

    // ---------------------------------------------------------------- Steuern & Einstellungen
    for (const m of (await this.bauabzug.uebersicht(12, heute)).monate) {
      if (!m.nichtAbgefuehrt || m.faelligAm > datumPlusTage(heute, 45)) continue;
      const anzahl = m.offen ? `${m.offen} von ${m.zeilen.length} Handwerkern noch anzumelden` : `${m.nichtAbgefuehrt} Anmeldung(en) noch nicht abgeführt`;
      aufgaben.push({
        bereich: "steuern",
        dringlichkeit: fristDringlichkeit(m.faelligAm, heute, 5, 20),
        titel: `Bauabzugsteuer ${m.offen ? "anmelden" : "abführen"}: ${m.monatText}`,
        text: `bis ${de(m.faelligAm)} beim Finanzamt des Leistenden (§ 48a EStG) – ${anzahl}`,
        datum: m.faelligAm,
        betrag: m.summe.abzugsbetrag,
        link: "/bauabzug",
      });
    }
    // ---------------------------------------------------------------- IBAN-Änderungen ohne Rückruf
    for (const x of await this.iban.offeneRueckrufe())
      aufgaben.push({
        bereich: "kosten",
        dringlichkeit: "hoch",
        titel: `IBAN von ${x.name} geändert – Rückruf dokumentieren`,
        text: `am ${de(x.aenderung.am.slice(0, 10))} von ${x.aenderung.von} – vor der nächsten Zahlung beim Handwerker unter der bekannten Telefonnummer bestätigen lassen`,
        datum: x.aenderung.am.slice(0, 10),
        link: `/partner/${x.id}#bankverbindung`,
      });

    // ---------------------------------------------------------------- Rechnungseingang
    const [eingang] = await this.db
      .select({ anzahl: sql<number>`count(*)::int`, aeltester: sql<string | null>`min(${schema.belegeingang.empfangenAm})::date::text` })
      .from(schema.belegeingang)
      .where(and(eq(schema.belegeingang.mandantId, mandantId), eq(schema.belegeingang.status, "neu")));
    if (eingang?.anzahl)
      aufgaben.push({
        bereich: "kosten",
        dringlichkeit: eingang.aeltester && eingang.aeltester <= datumPlusTage(heute, -3) ? "mittel" : "info",
        titel: `${eingang.anzahl} ${eingang.anzahl === 1 ? "Rechnung" : "Rechnungen"} im Eingang erfassen`,
        text: `eingegangen seit ${de(eingang.aeltester!)} – Vertrag zuordnen und zur Prüfung geben (Skontofristen laufen ab Eingang)`,
        datum: eingang.aeltester,
        link: "/rechnungseingang",
      });

    // ---------------------------------------------------------------- Buchhaltung: Bankabgleich, DATEV, Belege
    const gesellschaften = await this.db.select({ id: g.id, nr: g.nr, name: g.name }).from(g).where(eq(g.mandantId, mandantId)).orderBy(asc(g.nr));
    for (const ges of gesellschaften) {
      const [bank, export_, ohneScan] = await Promise.all([
        this.bank.stand(ges.id),
        this.buchhaltung.nichtExportiert(ges.id, heute),
        this.db
          .select({ id: er.id })
          .from(er)
          .innerJoin(hv, eq(er.handwerkervertragId, hv.id))
          .innerJoin(gw, eq(hv.gewerkId, gw.id))
          .innerJoin(p, eq(gw.projektId, p.id))
          .where(
            and(
              eq(p.gesellschaftId, ges.id),
              inArray(er.status, ["freigegeben", "bezahlt"]),
              sql`not exists (select 1 from ${schema.dokument} d where d.objekt_typ = 'eingangsrechnung' and d.objekt_id = ${er.id} and d.geloescht_am is null)`,
            ),
          )
          .orderBy(asc(er.eingangAm)),
      ]);
      aufgaben.push(
        ...buchhaltungsAufgaben(
          {
            gesellschaft: { ...ges, datevBereit: export_.datevBereit },
            bank: { offen: bank.offen, aeltestes: bank.aeltestes, letzterAuszugBis: bank.letzterAuszugBis },
            laeufeOhneBeleg: bank.laeufeOhneBeleg,
            nichtExportiert: { anzahl: export_.anzahl, aeltestes: export_.aeltestes },
            rechnungenOhneBeleg: { anzahl: ohneScan.length, ersteId: ohneScan[0]?.id ?? null },
          },
          heute,
        ),
      );
    }

    const fehlt = basiszinsFehlt(await this.db.select({ gueltigAb: schema.basiszins.gueltigAb }).from(schema.basiszins), heute);
    if (fehlt)
      aufgaben.push({ bereich: "einstellungen", dringlichkeit: "hoch", titel: "Basiszinssatz nachtragen", text: `Für das Halbjahr ab ${de(fehlt)} fehlt der Basiszins – Verzugszinsen werden sonst zu niedrig berechnet.`, link: "/einstellungen" });

    const sortiert = sortiereAufgaben(aufgaben);
    return {
      stichtag: heute,
      aufgaben: sortiert,
      anzahl: { hoch: sortiert.filter((a) => a.dringlichkeit === "hoch").length, mittel: sortiert.filter((a) => a.dringlichkeit === "mittel").length, info: sortiert.filter((a) => a.dringlichkeit === "info").length },
      kennzahlen: {
        projekte: projekte.length,
        offeneForderungen: forderungen.toFixed(2),
        ueberfaellig: ueberfaellig.toFixed(2),
        zuZahlen: zuZahlen.toFixed(2),
        offeneMaengel: offeneMaengel.length,
      },
    };
  }
}

@Controller("cockpit")
export class CockpitController {
  constructor(@Inject(CockpitService) private readonly service: CockpitService) {}

  @Get()
  cockpit() {
    return this.service.cockpit();
  }
}
