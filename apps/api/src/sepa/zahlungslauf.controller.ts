import { BadRequestException, Body, ConflictException, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query, StreamableFile } from "@nestjs/common";
import { schema } from "@bt/db";
import { ZahlungslaufEingabe, bauabzugFrist, ibanGueltig, money, pain001, summe } from "@bt/domain";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { Benutzer, pruefe } from "../common/eingabe.js";
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

  /** Zahlungsvorschlag: freigegebene Rechnungen mit Zahlbetrag am Ausführungstag, je Gesellschaft. */
  @Get("vorschlag")
  async vorschlag(@Query("ausfuehrungAm") ausfuehrungAm?: string) {
    const datum = istDatum(ausfuehrungAm) ?? heute();
    const liste = await this.freigegebene();
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
      });
      gr.summe = money(gr.summe).plus(e.auszahlung!).toFixed(2);
      gruppen.set(x.gesellschaft.id, gr);
    }
    return { ausfuehrungAm: datum, gesellschaften: [...gruppen.values()] };
  }

  /** Legt den Zahlungslauf an, verbucht die Zahlungen und erzeugt die SEPA-Datei. */
  @Post()
  async anlegen(@Body() body: unknown, @Benutzer() benutzer: string) {
    const { rechnungIds, ausfuehrungAm } = pruefe(ZahlungslaufEingabe, body);
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
      for (const { z } of zahlungen) await this.kosten.zahlungBuchen(tx, z, ausfuehrungAm, benutzer, lauf!.id);
      await protokollieren(tx, { tabelle: "zahlungslauf", id: lauf!.id, aktion: "insert", neu: { nr, ausfuehrungAm, anzahl: zahlungen.length, summe: gesamt.toFixed(2) }, benutzer });
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
