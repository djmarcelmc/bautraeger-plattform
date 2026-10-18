import { BadRequestException, Body, ConflictException, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query, StreamableFile } from "@nestjs/common";
import { schema } from "@bt/db";
import { ZahlungslaufEingabe, bauabzugFrist, ibanGueltig, ibanPruefen, money, pain001, summe, type IbanAenderung, type IbanPruefung } from "@bt/domain";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { Benutzer, pruefe } from "../common/eingabe.js";
import { anmeldungAktiv } from "../common/rechte.guard.js";
import { KontextService } from "../common/kontext.service.js";
import { protokollieren } from "../common/protokoll.js";
import { DB, type Db } from "../db.provider.js";
import { KostenService } from "../kosten/kosten.service.js";
import { VerkaufService } from "../verkauf/verkauf.service.js";

const { zahlungslauf: zl, zahlungsausgang: za, eingangsrechnung: er, handwerkervertrag: hv, gewerk: gw, projekt: p, gesellschaft: g, geschaeftspartner: gp } = schema;
const heute = () => new Date().toISOString().slice(0, 10);
const istDatum = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);

@Controller("zahlungslaeufe")
export class ZahlungslaufController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
    @Inject(KostenService) private readonly kosten: KostenService,
    @Inject(VerkaufService) private readonly verkauf: VerkaufService,
  ) {}

  /** Freigegebene Rechnungen mit Gesellschaft und Empfängerkonto. */
  private async freigegebene(ids?: string[]) {
    return this.db
      .select({
        id: er.id,
        rechnungsnr: er.rechnungsnr,
        rechnungsdatum: er.rechnungsdatum,
        gesellschaft: { id: g.id, nr: g.nr, name: g.name, iban: g.iban, bic: g.bic },
        projekt: { id: p.id, nr: p.nr, suchcode: p.suchcode },
        gewerk: sql<string>`${gw.nr} || ' ' || ${gw.bezeichnung}`,
        handwerker: { id: gp.id, name: sql<string>`coalesce(${gp.firma}, trim(coalesce(${gp.vorname}, '') || ' ' || coalesce(${gp.nachname}, '')), ${gp.suchcode})`, iban: gp.iban, bic: gp.bic },
      })
      .from(er)
      .innerJoin(hv, eq(er.handwerkervertragId, hv.id))
      .innerJoin(gw, eq(hv.gewerkId, gw.id))
      .innerJoin(p, eq(gw.projektId, p.id))
      .innerJoin(g, eq(p.gesellschaftId, g.id))
      .leftJoin(gp, eq(hv.handwerkerId, gp.id))
      .where(and(eq(g.mandantId, await this.kontext.mandantId()), eq(er.status, "freigegeben"), ids ? inArray(er.id, ids) : undefined))
      .orderBy(asc(g.nr), asc(er.eingangAm))
      .then((zeilen) => zeilen.map((z) => ({ ...z, handwerker: z.handwerker ?? { id: "", name: "(ohne Handwerker)", iban: null, bic: null } })));
  }

  /**
   * IBAN-Prüfung je Rechnung: Änderungen der Bankverbindung (Änderungsprotokoll), bisher bezahlte IBANs des
   * Handwerkers und die IBAN auf der eingegangenen Rechnung (Rechnungseingang).
   */
  private async ibanPruefungen(liste: Awaited<ReturnType<ZahlungslaufController["freigegebene"]>>, benutzer: string): Promise<Map<string, IbanPruefung>> {
    const hwIds = [...new Set(liste.map((x) => x.handwerker.id).filter(Boolean))];
    const rIds = liste.map((x) => x.id);
    const ap = schema.aenderungsprotokoll;
    const [aenderungen, gezahlt, eingang] = await Promise.all([
      hwIds.length
        ? this.db
            .select({ id: ap.datensatzId, am: sql<string>`${ap.zeitpunkt}::text`, von: ap.benutzer, aktion: ap.aktion, alt: sql<string | null>`${ap.alt}->>'iban'`, neu: sql<string | null>`${ap.neu}->>'iban'` })
            .from(ap)
            .where(and(eq(ap.tabelle, "geschaeftspartner"), inArray(ap.datensatzId, hwIds), sql`${ap.neu} ? 'iban'`))
        : [],
      hwIds.length
        ? this.db
            .selectDistinct({ handwerkerId: hv.handwerkerId, iban: za.empfaengerIban })
            .from(za)
            .innerJoin(er, eq(za.eingangsrechnungId, er.id))
            .innerJoin(hv, eq(er.handwerkervertragId, hv.id))
            .where(and(inArray(hv.handwerkerId, hwIds), sql`${za.empfaengerIban} is not null`))
        : [],
      rIds.length
        ? this.db.select({ id: schema.belegeingang.eingangsrechnungId, iban: sql<string | null>`${schema.belegeingang.daten}->>'iban'` }).from(schema.belegeingang).where(inArray(schema.belegeingang.eingangsrechnungId, rIds))
        : [],
    ]);
    const ergebnis = new Map<string, IbanPruefung>();
    for (const x of liste)
      ergebnis.set(
        x.id,
        ibanPruefen({
          iban: x.handwerker.iban,
          aenderungen: aenderungen.filter((a) => a.id === x.handwerker.id).map((a): IbanAenderung => ({ am: new Date(a.am).toISOString(), von: a.von, alt: a.alt, neu: a.neu, angelegt: a.aktion === "insert" })),
          bisherGezahlt: gezahlt.filter((g) => g.handwerkerId === x.handwerker.id).map((g) => g.iban!),
          rechnungsIban: eingang.find((e) => e.id === x.id)?.iban ?? null,
          stichtag: heute(),
          benutzer,
          vierAugen: anmeldungAktiv(),
        }),
      );
    return ergebnis;
  }

  /** Zahlungsvorschlag: freigegebene Rechnungen mit Zahlbetrag am Ausführungstag, je Gesellschaft. */
  @Get("vorschlag")
  async vorschlag(@Query("ausfuehrungAm") ausfuehrungAm: string | undefined, @Benutzer() benutzer: string) {
    const datum = istDatum(ausfuehrungAm) ?? heute();
    const liste = await this.freigegebene();
    const pruefungen = await this.ibanPruefungen(liste, benutzer);
    const gruppen = new Map<string, { gesellschaft: (typeof liste)[number]["gesellschaft"] & { kontoOk: boolean }; rechnungen: unknown[]; summe: string }>();
    for (const x of liste) {
      const { r, e } = await this.kosten.zahlbetrag(x.id, datum).catch(() => ({ r: null, e: null }));
      if (!r || !e) continue;
      const hinweise: string[] = [];
      if (!x.handwerker.iban) hinweise.push("Keine IBAN beim Handwerker hinterlegt");
      else if (!ibanGueltig(x.handwerker.iban)) hinweise.push("IBAN des Handwerkers ungültig");
      if (r.faelligAm && r.faelligAm < datum) hinweise.push(`Zahlungsfrist am ${r.faelligAm.split("-").reverse().join(".")} abgelaufen`);
      if (r.vorschau.skontoFristBis && !r.vorschau.skontoMoeglich && money(r.vorschau.mitSkonto.skonto!).gt(0)) hinweise.push("Skontofrist abgelaufen");
      if (money(e.bauabzugsteuer!).gt(0)) hinweise.push("Ohne gültige Freistellung: 15 % Bauabzugsteuer werden einbehalten");
      const gr = gruppen.get(x.gesellschaft.id) ?? { gesellschaft: { ...x.gesellschaft, kontoOk: !!x.gesellschaft.iban && ibanGueltig(x.gesellschaft.iban) }, rechnungen: [], summe: "0" };
      gr.rechnungen.push({
        id: x.id,
        rechnungsnr: x.rechnungsnr,
        rechnungsdatum: x.rechnungsdatum,
        projekt: x.projekt,
        gewerk: x.gewerk,
        handwerker: { name: x.handwerker.name, iban: x.handwerker.iban },
        faelligAm: r.faelligAm,
        skontoFristBis: r.vorschau.skontoFristBis,
        skontoMoeglich: r.vorschau.skontoMoeglich,
        auszahlung: e.auszahlung,
        skonto: e.skonto,
        bauabzugsteuer: e.bauabzugsteuer,
        zahlbar: !!x.handwerker.iban && ibanGueltig(x.handwerker.iban),
        hinweise,
        ibanPruefung: pruefungen.get(x.id) ?? null,
      });
      gr.summe = money(gr.summe).plus(e.auszahlung!).toFixed(2);
      gruppen.set(x.gesellschaft.id, gr);
    }
    return { ausfuehrungAm: datum, gesellschaften: [...gruppen.values()] };
  }

  /** Legt den Zahlungslauf an, verbucht die Zahlungen und erzeugt die SEPA-Datei. */
  @Post()
  async anlegen(@Body() body: unknown, @Benutzer() benutzer: string) {
    const { rechnungIds, ausfuehrungAm, ibanBestaetigt } = pruefe(ZahlungslaufEingabe, body);
    if (ausfuehrungAm < heute()) throw new BadRequestException("Das Ausführungsdatum darf nicht in der Vergangenheit liegen.");
    const ids = [...new Set(rechnungIds)];
    const liste = await this.freigegebene(ids);
    if (liste.length !== ids.length) throw new ConflictException("Mindestens eine Rechnung ist nicht (mehr) freigegeben.");
    const gesellschaften = new Set(liste.map((x) => x.gesellschaft.id));
    if (gesellschaften.size > 1) throw new BadRequestException("Ein Zahlungslauf umfasst nur Rechnungen einer Gesellschaft (ein Auftraggeberkonto).");
    const ges = liste[0]!.gesellschaft;
    if (!ges.iban || !ibanGueltig(ges.iban)) throw new BadRequestException(`Bei der Gesellschaft „${ges.name}“ ist keine gültige IBAN hinterlegt.`);
    const ohneKonto = liste.filter((x) => !x.handwerker.iban || !ibanGueltig(x.handwerker.iban));
    if (ohneKonto.length) throw new BadRequestException(`Keine gültige IBAN: ${ohneKonto.map((x) => `${x.handwerker.name} (${x.rechnungsnr})`).join(", ")}`);
    // IBAN-Prüfung: gesperrte Zahlungen abweisen, kritische Hinweise müssen bestätigt sein
    const pruefungen = await this.ibanPruefungen(liste, benutzer);
    const gesperrt = liste.filter((x) => pruefungen.get(x.id)?.gesperrt);
    if (gesperrt.length) throw new ConflictException(`${gesperrt.map((x) => `${x.rechnungsnr} (${x.handwerker.name})`).join(", ")}: ${pruefungen.get(gesperrt[0]!.id)!.gesperrt}`);
    const offen = liste.filter((x) => pruefungen.get(x.id)?.bestaetigungNoetig && !ibanBestaetigt.includes(x.id));
    if (offen.length)
      throw new ConflictException(
        `Bankverbindung bitte bestätigen (z. B. Rückruf beim Handwerker unter bekannter Nummer): ${offen
          .map((x) => `${x.rechnungsnr} ${x.handwerker.name} – ${pruefungen.get(x.id)!.hinweise.filter((h) => h.stufe === "kritisch").map((h) => h.text).join("; ")}`)
          .join(" | ")}`,
      );
    const bestaetigt = liste.filter((x) => pruefungen.get(x.id)?.bestaetigungNoetig).map((x) => ({ rechnung: x.rechnungsnr, iban: x.handwerker.iban, hinweise: pruefungen.get(x.id)!.hinweise.map((h) => h.text) }));
    const zahlungen = await Promise.all(liste.map(async (x) => ({ x, z: await this.kosten.zahlbetrag(x.id, ausfuehrungAm) })));
    return this.db.transaction(async (tx) => {
      const lfd = await this.verkauf.nummerZiehen(tx, ges.id, "SL", Number(ausfuehrungAm.slice(0, 4)));
      const nr = `SL-${ausfuehrungAm.slice(0, 4)}-${String(lfd).padStart(5, "0")}`;
      const xml = pain001({
        msgId: nr,
        erstelltAm: new Date().toISOString(),
        ausfuehrungAm,
        auftraggeber: { name: ges.name, iban: ges.iban!, bic: ges.bic },
        zahlungen: zahlungen.map(({ x, z }) => ({
          endToEndId: `${nr}-${x.rechnungsnr}`.slice(0, 35),
          betrag: money(z.e.auszahlung!),
          name: x.handwerker.name,
          iban: x.handwerker.iban!,
          bic: x.handwerker.bic,
          verwendungszweck: `Rechnung ${x.rechnungsnr} vom ${x.rechnungsdatum.split("-").reverse().join(".")}${money(z.e.skonto!).gt(0) ? `, abzgl. Skonto ${money(z.e.skonto!).toFixed(2).replace(".", ",")}` : ""}${money(z.e.bauabzugsteuer!).gt(0) ? `, abzgl. Bauabzugsteuer ${money(z.e.bauabzugsteuer!).toFixed(2).replace(".", ",")}` : ""} BV ${x.projekt.nr} ${x.projekt.suchcode}`,
        })),
      });
      const gesamt = summe(zahlungen.map(({ z }) => money(z.e.auszahlung!)));
      const [lauf] = await tx.insert(zl).values({ gesellschaftId: ges.id, nr, ausfuehrungAm, anzahl: zahlungen.length, summe: gesamt.toFixed(2), xml, erstelltVon: benutzer }).returning({ id: zl.id });
      for (const { x, z } of zahlungen) await this.kosten.zahlungBuchen(tx, z, ausfuehrungAm, benutzer, lauf!.id, x.handwerker.iban?.replace(/\s/g, "").toUpperCase());
      await protokollieren(tx, { tabelle: "zahlungslauf", id: lauf!.id, aktion: "insert", neu: { nr, ausfuehrungAm, anzahl: zahlungen.length, summe: gesamt.toFixed(2), ...(bestaetigt.length ? { ibanBestaetigt: bestaetigt } : {}) }, benutzer });
      return { id: lauf!.id, nr, anzahl: zahlungen.length, summe: gesamt.toFixed(2) };
    });
  }

  @Get()
  async liste() {
    return this.db
      .select({ id: zl.id, nr: zl.nr, ausfuehrungAm: zl.ausfuehrungAm, anzahl: zl.anzahl, summe: zl.summe, erstelltVon: zl.erstelltVon, angelegtAm: zl.angelegtAm, gesellschaft: g.name })
      .from(zl)
      .innerJoin(g, eq(zl.gesellschaftId, g.id))
      .where(eq(g.mandantId, await this.kontext.mandantId()))
      .orderBy(desc(zl.angelegtAm))
      .limit(200);
  }

  private async lauf(id: string) {
    const [x] = await this.db
      .select({ lauf: zl, gesellschaft: { id: g.id, name: g.name, iban: g.iban, bic: g.bic } })
      .from(zl)
      .innerJoin(g, eq(zl.gesellschaftId, g.id))
      .where(and(eq(zl.id, id), eq(g.mandantId, await this.kontext.mandantId())));
    if (!x) throw new NotFoundException("Zahlungslauf nicht gefunden");
    return x;
  }

  @Get(":id")
  async detail(@Param("id", ParseUUIDPipe) id: string) {
    const { lauf, gesellschaft } = await this.lauf(id);
    const zahlungen = await this.db
      .select({
        rechnungId: er.id,
        rechnungsnr: er.rechnungsnr,
        betrag: za.betrag,
        skonto: za.skonto,
        bauabzugsteuer: za.bauabzugsteuer,
        projekt: sql<string>`${p.nr} || ' ' || ${p.suchcode}`,
        gewerk: sql<string>`${gw.nr} || ' ' || ${gw.bezeichnung}`,
        handwerker: sql<string>`coalesce(${gp.firma}, ${gp.nachname}, ${gp.suchcode})`,
        iban: gp.iban,
      })
      .from(za)
      .innerJoin(er, eq(za.eingangsrechnungId, er.id))
      .innerJoin(hv, eq(er.handwerkervertragId, hv.id))
      .innerJoin(gw, eq(hv.gewerkId, gw.id))
      .innerJoin(p, eq(gw.projektId, p.id))
      .leftJoin(gp, eq(hv.handwerkerId, gp.id))
      .where(eq(za.zahlungslaufId, id))
      .orderBy(asc(er.rechnungsnr));
    const { xml: _xml, ...kopf } = lauf;
    const bauabzug = summe(zahlungen.map((z) => money(z.bauabzugsteuer)));
    return {
      ...kopf,
      gesellschaft,
      zahlungen,
      bauabzugsteuer: { summe: bauabzug.toFixed(2), faelligAm: bauabzug.gt(0) ? bauabzugFrist(lauf.ausfuehrungAm.slice(0, 7)) : null },
      skonto: summe(zahlungen.map((z) => money(z.skonto))).toFixed(2),
    };
  }

  @Get(":id/xml")
  async xml(@Param("id", ParseUUIDPipe) id: string) {
    const { lauf } = await this.lauf(id);
    return new StreamableFile(Buffer.from(lauf.xml, "utf8"), { type: "application/xml; charset=utf-8", disposition: `attachment; filename="SEPA-${lauf.nr}.xml"` });
  }
}
