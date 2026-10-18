import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { schema } from "@bt/db";
import {
  BautenstandMeldung,
  ZahlungsanforderungEingabe,
  ZahlungseingangEingabe,
  datumPlusTage,
  money,
  offen,
  rechnungsnummer,
  summe,
} from "@bt/domain";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { Benutzer, pruefe } from "../common/eingabe.js";
import { KontextService } from "../common/kontext.service.js";
import { protokollieren } from "../common/protokoll.js";
import { DB, type Db } from "../db.provider.js";
import { VerkaufService } from "./verkauf.service.js";

const za = schema.zahlungsanforderung;

@Controller()
export class ZahlungenController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
    @Inject(VerkaufService) private readonly verkauf: VerkaufService,
  ) {}

  // ------------------------------------------------------------ Bautenstand

  /** Raster Einheiten × gemeldete Abschnitte für ein Projekt. */
  @Get("projekte/:id/bautenstand")
  async bautenstand(@Param("id", ParseUUIDPipe) projektId: string) {
    await this.verkauf.projekt(projektId);
    const einheiten = await this.db
      .select({ id: schema.einheit.id, nr: schema.einheit.nr, typ: schema.einheit.typ, bauabschnitt: schema.einheit.bauabschnitt })
      .from(schema.einheit)
      .where(eq(schema.einheit.projektId, projektId))
      .orderBy(asc(schema.einheit.bauabschnitt), asc(schema.einheit.nr));
    const meldungen = einheiten.length
      ? await this.db.select().from(schema.bautenstand).where(inArray(schema.bautenstand.einheitId, einheiten.map((e) => e.id)))
      : [];
    return { einheiten, meldungen };
  }

  /** Fertigmeldung eines Abschnitts für mehrere Einheiten (bereits gemeldete bleiben unverändert). */
  @Post("projekte/:id/bautenstand")
  async bautenstandMelden(@Param("id", ParseUUIDPipe) projektId: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const m = pruefe(BautenstandMeldung, body);
    await this.verkauf.projekt(projektId);
    const einheiten = await this.db
      .select({ id: schema.einheit.id })
      .from(schema.einheit)
      .where(and(inArray(schema.einheit.id, m.einheitIds), eq(schema.einheit.projektId, projektId)));
    if (einheiten.length !== m.einheitIds.length) throw new BadRequestException("Einheiten gehören nicht zum Projekt");
    return this.db.transaction(async (tx) => {
      const neu = await tx
        .insert(schema.bautenstand)
        .values(m.einheitIds.map((einheitId) => ({ einheitId, abschnitt: m.abschnitt, fertigAm: m.fertigAm!, gemeldetVon: benutzer })))
        .onConflictDoNothing()
        .returning();
      for (const x of neu)
        await protokollieren(tx, { tabelle: "bautenstand", id: x.id, aktion: "insert", neu: { einheitId: x.einheitId, abschnitt: x.abschnitt, fertigAm: x.fertigAm }, benutzer });
      return { gemeldet: neu.length };
    });
  }

  /** Nimmt eine Fertigmeldung zurück – nicht mehr möglich, sobald darauf eine Rate angefordert wurde. */
  @Delete("bautenstand/:id")
  async bautenstandZuruecknehmen(@Param("id", ParseUUIDPipe) id: string, @Benutzer() benutzer: string) {
    const [m] = await this.db
      .select({ meldung: schema.bautenstand, projektId: schema.einheit.projektId })
      .from(schema.bautenstand)
      .innerJoin(schema.einheit, eq(schema.bautenstand.einheitId, schema.einheit.id))
      .where(eq(schema.bautenstand.id, id));
    if (!m) throw new NotFoundException("Meldung nicht gefunden");
    await this.verkauf.projekt(m.projektId);
    const [angefordert] = await this.db
      .select({ nr: schema.rate.nr, vertrag: schema.kaufvertrag.nr })
      .from(schema.rate)
      .innerJoin(schema.kaufvertrag, eq(schema.rate.kaufvertragId, schema.kaufvertrag.id))
      .innerJoin(schema.kaufvertragEinheit, eq(schema.kaufvertragEinheit.kaufvertragId, schema.kaufvertrag.id))
      .where(
        and(
          eq(schema.kaufvertragEinheit.einheitId, m.meldung.einheitId),
          sql`${m.meldung.abschnitt} = any(${schema.rate.abschnitte})`,
          sql`${schema.rate.zahlungsanforderungId} is not null`,
        ),
      );
    if (angefordert) throw new ConflictException(`Rate ${angefordert.nr} aus ${angefordert.vertrag} ist bereits angefordert`);
    await this.db.transaction(async (tx) => {
      await tx.delete(schema.bautenstand).where(eq(schema.bautenstand.id, id));
      await protokollieren(tx, { tabelle: "bautenstand", id, aktion: "delete", alt: { einheitId: m.meldung.einheitId, abschnitt: m.meldung.abschnitt, fertigAm: m.meldung.fertigAm }, benutzer });
    });
    return { geloescht: true };
  }

  // ------------------------------------------------------------ Zahlungsanforderungen

  /** Fordert Raten eines Vertrags an (mehrere Raten werden zu einer Anforderung zusammengefasst). */
  @Post("zahlungsanforderungen")
  async anfordern(@Body() body: unknown, @Benutzer() benutzer: string) {
    const e = pruefe(ZahlungsanforderungEingabe, body);
    const [ersteRate] = await this.db.select().from(schema.rate).where(eq(schema.rate.id, e.rateIds[0]!));
    if (!ersteRate) throw new NotFoundException("Rate nicht gefunden");
    return this.anforderungErstellen(ersteRate.kaufvertragId, e.rateIds, e.datum!, benutzer);
  }

  /** Sammelanforderung: alle anforderbaren Raten eines Projekts, je Vertrag eine Anforderung. */
  @Post("projekte/:id/zahlungsanforderungen")
  async sammelanforderung(@Param("id", ParseUUIDPipe) projektId: string, @Body() body: { datum?: string }, @Benutzer() benutzer: string) {
    const datum = body?.datum;
    if (!datum || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) throw new BadRequestException("Datum angeben");
    await this.verkauf.projekt(projektId);
    const vertraege = await this.db.select({ id: schema.kaufvertrag.id }).from(schema.kaufvertrag).where(eq(schema.kaufvertrag.projektId, projektId));
    const erstellt = [];
    for (const v of vertraege) {
      const detail = await this.verkauf.vertrag(v.id);
      const anforderbar = detail.raten.filter((r) => r.status === "anforderbar");
      const ids = anforderbar.map((r) => r.id);
      // reine Gutschriften warten auf die nächste Rate
      if (ids.length && summe(anforderbar.map((r) => money(r.betrag))).gt(0)) erstellt.push(await this.anforderungErstellen(v.id, ids, datum, benutzer));
    }
    return { anzahl: erstellt.length, anforderungen: erstellt };
  }

  private async anforderungErstellen(kaufvertragId: string, rateIds: string[], datum: string, benutzer: string) {
    const v = await this.verkauf.vertrag(kaufvertragId);
    const raten = v.raten.filter((r) => rateIds.includes(r.id));
    if (raten.length !== rateIds.length) throw new BadRequestException("Alle Raten müssen zum selben Kaufvertrag gehören");
    const nicht = raten.filter((r) => r.status !== "anforderbar");
    if (nicht.length)
      throw new ConflictException(`Nicht anforderbar: ${nicht.map((r) => `Rate ${r.nr} (${r.status})`).join(", ")}`);
    const betrag = summe(raten.map((r) => money(r.betrag)));
    if (!betrag.gt(0)) throw new ConflictException("Gutschriften werden mit einer Rate verrechnet – bitte zusammen mit einer anforderbaren Rate anfordern.");
    return this.db.transaction(async (tx) => {
      const lfd = await this.verkauf.nummerZiehen(tx, v.gesellschaft.id, "ZA", Number(datum.slice(0, 4)));
      const nr = rechnungsnummer("ZA", Number(datum.slice(0, 4)), lfd);
      const [neu] = await tx
        .insert(za)
        .values({ kaufvertragId, rechnungsnr: nr, angefordertAm: datum, faelligAm: datumPlusTage(datum, v.zahlungszielTage), betrag: betrag.toFixed(2) })
        .returning();
      await tx.update(schema.rate).set({ zahlungsanforderungId: neu!.id, geaendertAm: new Date() }).where(inArray(schema.rate.id, rateIds));
      await protokollieren(tx, {
        tabelle: "zahlungsanforderung",
        id: neu!.id,
        aktion: "insert",
        neu: { rechnungsnr: nr, kaufvertrag: v.nr, raten: raten.map((r) => r.nr), betrag: betrag.toFixed(2) },
        benutzer,
      });
      return neu!;
    });
  }

  /** Daten für das Anforderungsschreiben (Druckansicht). */
  @Get("zahlungsanforderungen/:id")
  async anforderung(@Param("id", ParseUUIDPipe) id: string) {
    const [a] = await this.db.select().from(za).where(eq(za.id, id));
    if (!a) throw new NotFoundException("Zahlungsanforderung nicht gefunden");
    const v = await this.verkauf.vertrag(a.kaufvertragId);
    const empfaenger = v.kaeufer.find((x) => x.id === v.zahlungsanforderungAn) ?? v.kaeufer[0];
    const stand = v.anforderungen.find((x) => x.id === id)!;
    return {
      ...stand,
      raten: v.raten.filter((r) => r.zahlungsanforderungId === id),
      vertrag: { id: v.id, nr: v.nr, urkundennr: v.urkundennr, datum: v.datum, einheiten: v.einheiten, summen: v.summen },
      projekt: v.projekt,
      gesellschaft: v.gesellschaft,
      empfaenger,
      kaeufer: v.kaeufer,
      fruehere: v.anforderungen.filter((x) => x.angefordertAm <= a.angefordertAm && x.id !== id),
    };
  }

  // ------------------------------------------------------------ Zahlungseingänge & offene Posten

  @Post("zahlungseingaenge")
  async zahlungseingang(@Body() body: unknown, @Benutzer() benutzer: string) {
    const e = pruefe(ZahlungseingangEingabe, body);
    const [a] = await this.db.select().from(za).where(eq(za.id, e.zahlungsanforderungId));
    if (!a) throw new NotFoundException("Zahlungsanforderung nicht gefunden");
    const v = await this.verkauf.vertrag(a.kaufvertragId); // inkl. Mandantenprüfung
    const offenBetrag = money(v.anforderungen.find((x) => x.id === a.id)!.offen);
    if (money(e.betrag!).gt(offenBetrag))
      throw new ConflictException(
        offenBetrag.isZero()
          ? `${a.rechnungsnr} ist bereits vollständig bezahlt.`
          : `Der Betrag übersteigt den offenen Betrag von ${offenBetrag.toFixed(2).replace(".", ",")} € für ${a.rechnungsnr}. Überzahlungen bitte gesondert klären.`,
      );
    return this.db.transaction(async (tx) => {
      const [neu] = await tx
        .insert(schema.zahlungseingang)
        .values({ zahlungsanforderungId: a.id, kaufvertragId: a.kaufvertragId, datum: e.datum!, betrag: e.betrag!, verwendungszweck: e.verwendungszweck })
        .returning();
      await protokollieren(tx, { tabelle: "zahlungseingang", id: neu!.id, aktion: "insert", neu: { rechnungsnr: a.rechnungsnr, betrag: e.betrag, datum: e.datum }, benutzer });
      return neu;
    });
  }

  /** Offene Posten aller (oder eines Projekts) Anforderungen, älteste Fälligkeit zuerst. */
  @Get("offene-posten")
  async offenePosten(@Query("projektId") projektId?: string) {
    const mandantId = await this.kontext.mandantId();
    const bezahlt = sql<string>`(select coalesce(sum(betrag), 0)::text from ${schema.zahlungseingang} where zahlungsanforderung_id = ${za.id})`;
    const zeilen = await this.db
      .select({
        id: za.id,
        rechnungsnr: za.rechnungsnr,
        angefordertAm: za.angefordertAm,
        faelligAm: za.faelligAm,
        betrag: za.betrag,
        mahnstufe: za.mahnstufe,
        bezahlt,
        kaufvertragId: schema.kaufvertrag.id,
        kaufvertrag: schema.kaufvertrag.nr,
        projektId: schema.projekt.id,
        projektNr: schema.projekt.nr,
        projekt: schema.projekt.suchcode,
        empfaenger: sql<string>`(select coalesce(firma, concat_ws(' ', vorname, nachname)) from ${schema.geschaeftspartner} where id = ${schema.kaufvertrag.zahlungsanforderungAn})`,
      })
      .from(za)
      .innerJoin(schema.kaufvertrag, eq(za.kaufvertragId, schema.kaufvertrag.id))
      .innerJoin(schema.projekt, eq(schema.kaufvertrag.projektId, schema.projekt.id))
      .innerJoin(schema.gesellschaft, eq(schema.projekt.gesellschaftId, schema.gesellschaft.id))
      .where(and(eq(schema.gesellschaft.mandantId, mandantId), projektId ? eq(schema.projekt.id, projektId) : undefined, sql`${za.betrag} > ${bezahlt}::numeric`))
      .orderBy(asc(za.faelligAm));
    const heute = new Date().toISOString().slice(0, 10);
    return zeilen.map((z) => {
      const tage = Math.floor((Date.parse(heute) - Date.parse(z.faelligAm)) / 864e5);
      return { ...z, offen: offen(money(z.betrag), money(z.bezahlt)).toFixed(2), tageUeberfaellig: Math.max(0, tage) };
    });
  }
}
