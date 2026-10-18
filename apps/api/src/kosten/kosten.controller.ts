import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { schema } from "@bt/db";
import {
  BudgetumbuchungEingabe,
  EingangsrechnungEingabe,
  GewerkEingabe,
  GewerkeplanEingabe,
  HandwerkervertragEingabe,
  NachtragEingabe,
  type HandwerkervertragEingabe as HandwerkervertragWerte,
  type NachtragEingabe as NachtragWerte,
  RechnungPruefen,
  RechnungZahlung,
  gewerkeplanAusVorlage,
  umbuchungPruefen,
  KostenEinstellung,
  money,
} from "@bt/domain";
import { and, asc, eq, inArray, max, sql } from "drizzle-orm";
import { Benutzer, pruefe } from "../common/eingabe.js";
import { KontextService } from "../common/kontext.service.js";
import { anmeldungAktiv } from "../common/rechte.guard.js";
import { differenz, protokollieren } from "../common/protokoll.js";
import { DB, type Db } from "../db.provider.js";
import { VerkaufService } from "../verkauf/verkauf.service.js";
import { KostenService } from "./kosten.service.js";

const { gewerk: gw, handwerkervertrag: hv, eingangsrechnung: er, nachtrag: nt } = schema;

/** Formularwerte → Spalten (Pflichtfelder sind durch die Schemas bereits geprüft). */
const vertragWerte = (w: HandwerkervertragWerte) => ({
  ...w,
  vertragBrutto: w.vertragBrutto!,
  umlagen: Object.fromEntries(Object.entries(w.umlagen).filter(([, v]) => v !== undefined)) as Record<string, string | null>,
});
const nachtragWerte = (w: NachtragWerte) => ({ ...w, betragBrutto: w.betragBrutto! });

@Controller()
export class KostenController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
    @Inject(VerkaufService) private readonly verkauf: VerkaufService,
    @Inject(KostenService) private readonly kosten: KostenService,
  ) {}

  // ------------------------------------------------------------ Gewerke & Kostenkontrolle

  @Get("projekte/:id/kosten")
  async kostenkontrolle(@Param("id", ParseUUIDPipe) projektId: string) {
    await this.verkauf.projekt(projektId);
    return this.kosten.kostenkontrolle(projektId);
  }

  @Get("einstellungen/kosten")
  einstellung() {
    return this.kosten.einstellung();
  }

  @Put("einstellungen/kosten")
  einstellungSpeichern(@Body() body: unknown, @Benutzer() benutzer: string) {
    return this.kosten.einstellungSpeichern(pruefe(KostenEinstellung, body), benutzer);
  }

  /** Legt den Gewerkeplan aus der Standardvorlage an (nur, solange das Projekt noch keine Gewerke hat). */
  @Post("projekte/:id/gewerkeplan")
  async gewerkeplan(@Param("id", ParseUUIDPipe) projektId: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const { budgetBrutto } = pruefe(GewerkeplanEingabe, body);
    await this.verkauf.projekt(projektId);
    const [vorhanden] = await this.db.select({ n: sql<number>`count(*)::int` }).from(gw).where(eq(gw.projektId, projektId));
    if (vorhanden!.n > 0) throw new ConflictException("Das Projekt hat bereits Gewerke.");
    const plan = gewerkeplanAusVorlage(money(budgetBrutto!));
    await this.db.transaction(async (tx) => {
      await tx.insert(gw).values(plan.map((x) => ({ ...x, projektId })));
      await protokollieren(tx, { tabelle: "projekt", id: projektId, aktion: "update", neu: { gewerkeplan: `${plan.length} Gewerke aus Vorlage`, budgetBrutto }, benutzer });
    });
    return { angelegt: plan.length };
  }

  @Post("projekte/:id/gewerke")
  async gewerkAnlegen(@Param("id", ParseUUIDPipe) projektId: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const werte = pruefe(GewerkEingabe, body);
    await this.verkauf.projekt(projektId);
    return this.db.transaction(async (tx) => {
      const [neu] = await tx.insert(gw).values({ ...werte, projektId }).returning();
      await protokollieren(tx, { tabelle: "gewerk", id: neu!.id, aktion: "insert", neu: werte, benutzer });
      return neu;
    });
  }

  @Put("gewerke/:id")
  async gewerkAendern(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const werte = pruefe(GewerkEingabe, body);
    const { gewerk: alt } = await this.kosten.gewerk(id);
    return this.db.transaction(async (tx) => {
      const [neu] = await tx.update(gw).set({ ...werte, geaendertAm: new Date() }).where(eq(gw.id, id)).returning();
      const d = differenz(alt, neu!);
      if (d.geaendert) await protokollieren(tx, { tabelle: "gewerk", id, aktion: "update", ...d, benutzer });
      return neu;
    });
  }

  // ------------------------------------------------------------ Budget umschichten

  @Get("projekte/:id/budgetumbuchungen")
  async budgetumbuchungen(@Param("id", ParseUUIDPipe) projektId: string) {
    await this.verkauf.projekt(projektId);
    return this.kosten.budgetumbuchungen(projektId);
  }

  /** Budget von einem Gewerk auf ein anderes desselben Projekts umbuchen (höchstens das freie Budget der Quelle). */
  @Post("projekte/:id/budgetumbuchungen")
  async budgetUmbuchen(@Param("id", ParseUUIDPipe) projektId: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const w = pruefe(BudgetumbuchungEingabe, body);
    await this.verkauf.projekt(projektId);
    const k = await this.kosten.kostenkontrolle(projektId);
    const von = k.gewerke.find((x) => x.id === w.vonGewerkId);
    const nach = k.gewerke.find((x) => x.id === w.nachGewerkId);
    if (!von || !nach) throw new BadRequestException({ message: "Eingabe ungültig", fehler: ["Beide Gewerke müssen zum Projekt gehören."] });
    const fehler = umbuchungPruefen(von, w.betrag!);
    if (fehler) throw new ConflictException(fehler);
    return this.db.transaction(async (tx) => {
      const [a] = await tx.update(gw).set({ geschaetztBrutto: sql`${gw.geschaetztBrutto} - ${w.betrag}`, geaendertAm: new Date() }).where(eq(gw.id, von.id)).returning({ geschaetztBrutto: gw.geschaetztBrutto });
      if (Number(a!.geschaetztBrutto) < 0) throw new ConflictException("Die Schätzung der Quelle würde negativ.");
      const [b] = await tx.update(gw).set({ geschaetztBrutto: sql`${gw.geschaetztBrutto} + ${w.betrag}`, geaendertAm: new Date() }).where(eq(gw.id, nach.id)).returning({ geschaetztBrutto: gw.geschaetztBrutto });
      const [u] = await tx.insert(schema.budgetumbuchung).values({ projektId, vonGewerkId: von.id, nachGewerkId: nach.id, betrag: w.betrag!, begruendung: w.begruendung!, benutzer }).returning();
      await protokollieren(tx, { tabelle: "gewerk", id: von.id, aktion: "update", alt: { geschaetztBrutto: von.geschaetztBrutto }, neu: { geschaetztBrutto: a!.geschaetztBrutto, umbuchung: u!.id, nach: `${nach.nr} ${nach.bezeichnung}` }, benutzer });
      await protokollieren(tx, { tabelle: "gewerk", id: nach.id, aktion: "update", alt: { geschaetztBrutto: nach.geschaetztBrutto }, neu: { geschaetztBrutto: b!.geschaetztBrutto, umbuchung: u!.id, von: `${von.nr} ${von.bezeichnung}` }, benutzer });
      return u;
    });
  }

  @Delete("gewerke/:id")
  async gewerkLoeschen(@Param("id", ParseUUIDPipe) id: string, @Benutzer() benutzer: string) {
    const { gewerk: alt } = await this.kosten.gewerk(id);
    await this.db.transaction(async (tx) => {
      await tx.delete(gw).where(eq(gw.id, id)); // bei vorhandenen Verträgen → 409 (Fremdschlüssel)
      await protokollieren(tx, { tabelle: "gewerk", id, aktion: "delete", alt, benutzer });
    });
    return { geloescht: true };
  }

  // ------------------------------------------------------------ Handwerkerverträge & Nachträge

  @Get("handwerkervertraege/:id")
  vertrag(@Param("id", ParseUUIDPipe) id: string) {
    return this.kosten.vertrag(id);
  }

  private async handwerkerPruefen(handwerkerId: string) {
    const [x] = await this.db
      .select({ id: schema.geschaeftspartner.id })
      .from(schema.geschaeftspartner)
      .where(and(eq(schema.geschaeftspartner.id, handwerkerId), eq(schema.geschaeftspartner.mandantId, await this.kontext.mandantId())));
    if (!x) throw new BadRequestException("Unbekannter Handwerker");
  }

  @Post("handwerkervertraege")
  async vertragAnlegen(@Body() body: unknown, @Benutzer() benutzer: string) {
    const werte = pruefe(HandwerkervertragEingabe, body);
    await this.kosten.gewerk(werte.gewerkId);
    await this.handwerkerPruefen(werte.handwerkerId);
    return this.db.transaction(async (tx) => {
      const [neu] = await tx.insert(hv).values(vertragWerte(werte)).returning();
      await tx
        .update(schema.geschaeftspartner)
        .set({ rollen: sql`array(select distinct unnest(array_append(${schema.geschaeftspartner.rollen}, 'handwerker')))` })
        .where(eq(schema.geschaeftspartner.id, werte.handwerkerId));
      await protokollieren(tx, { tabelle: "handwerkervertrag", id: neu!.id, aktion: "insert", neu: werte, benutzer });
      return neu;
    });
  }

  @Put("handwerkervertraege/:id")
  async vertragAendern(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const werte = pruefe(HandwerkervertragEingabe, body);
    const alt = await this.kosten.vertrag(id);
    if (werte.gewerkId !== alt.gewerkId) await this.kosten.gewerk(werte.gewerkId);
    await this.handwerkerPruefen(werte.handwerkerId);
    return this.db.transaction(async (tx) => {
      const [neu] = await tx.update(hv).set({ ...vertragWerte(werte), geaendertAm: new Date() }).where(eq(hv.id, id)).returning();
      const d = differenz(alt as unknown as Record<string, unknown>, neu!);
      if (d.geaendert) await protokollieren(tx, { tabelle: "handwerkervertrag", id, aktion: "update", ...d, benutzer });
      return neu;
    });
  }

  @Post("handwerkervertraege/:id/nachtraege")
  async nachtragAnlegen(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const werte = pruefe(NachtragEingabe, body);
    await this.kosten.vertrag(id);
    return this.db.transaction(async (tx) => {
      const [{ m }] = (await tx.select({ m: max(nt.nr) }).from(nt).where(eq(nt.handwerkervertragId, id))) as [{ m: number | null }];
      const [neu] = await tx.insert(nt).values({ ...nachtragWerte(werte), handwerkervertragId: id, nr: (m ?? 0) + 1 }).returning();
      await protokollieren(tx, { tabelle: "nachtrag", id: neu!.id, aktion: "insert", neu: werte, benutzer });
      return neu;
    });
  }

  @Put("nachtraege/:id")
  async nachtragAendern(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const werte = pruefe(NachtragEingabe, body);
    const [alt] = await this.db.select().from(nt).where(eq(nt.id, id));
    if (!alt) throw new BadRequestException("Nachtrag nicht gefunden");
    await this.kosten.vertrag(alt.handwerkervertragId);
    return this.db.transaction(async (tx) => {
      const [neu] = await tx.update(nt).set({ ...nachtragWerte(werte), geaendertAm: new Date() }).where(eq(nt.id, id)).returning();
      const d = differenz(alt, neu!);
      if (d.geaendert) await protokollieren(tx, { tabelle: "nachtrag", id, aktion: "update", ...d, benutzer });
      return neu;
    });
  }

  // ------------------------------------------------------------ Eingangsrechnungen: erfassen → prüfen → freigeben → zahlen

  /** Rechnungseingangsbuch, optional nach Status und Projekt gefiltert. */
  @Get("eingangsrechnungen")
  async rechnungen(@Query("status") status?: string, @Query("projektId") projektId?: string) {
    const mandantId = await this.kontext.mandantId();
    const stati = status ? status.split(",") : undefined;
    return this.db
      .select({
        id: er.id,
        rechnungsnr: er.rechnungsnr,
        rechnungsdatum: er.rechnungsdatum,
        eingangAm: er.eingangAm,
        schlussrechnung: er.schlussrechnung,
        betragBrutto: er.betragBrutto,
        geprueftKumuliert: er.geprueftKumuliert,
        status: er.status,
        auszahlung: sql<string | null>`${er.pruefergebnis}->>'auszahlung'`,
        vertragId: hv.id,
        gewerkNr: gw.nr,
        gewerk: gw.bezeichnung,
        projektId: schema.projekt.id,
        projektNr: schema.projekt.nr,
        projekt: schema.projekt.suchcode,
        handwerker: sql<string>`coalesce(${schema.geschaeftspartner.firma}, ${schema.geschaeftspartner.nachname}, ${schema.geschaeftspartner.suchcode})`,
      })
      .from(er)
      .innerJoin(hv, eq(er.handwerkervertragId, hv.id))
      .innerJoin(gw, eq(hv.gewerkId, gw.id))
      .innerJoin(schema.projekt, eq(gw.projektId, schema.projekt.id))
      .innerJoin(schema.gesellschaft, eq(schema.projekt.gesellschaftId, schema.gesellschaft.id))
      .leftJoin(schema.geschaeftspartner, eq(hv.handwerkerId, schema.geschaeftspartner.id))
      .where(
        and(
          eq(schema.gesellschaft.mandantId, mandantId),
          stati ? inArray(er.status, stati as (typeof er.status.enumValues)[number][]) : undefined,
          projektId ? eq(schema.projekt.id, projektId) : undefined,
        ),
      )
      .orderBy(asc(er.eingangAm));
  }

  @Get("eingangsrechnungen/:id")
  rechnung(@Param("id", ParseUUIDPipe) id: string, @Query("zahlungsdatum") zahlungsdatum?: string) {
    return this.kosten.rechnung(id, zahlungsdatum && /^\d{4}-\d{2}-\d{2}$/.test(zahlungsdatum) ? zahlungsdatum : undefined);
  }

  /** Neue Rechnung – nur, wenn alle vorherigen Rechnungen des Vertrags bezahlt sind (kumulierte Abrechnung). */
  @Post("eingangsrechnungen")
  async rechnungErfassen(@Body() body: unknown, @Benutzer() benutzer: string) {
    const werte = pruefe(EingangsrechnungEingabe, body);
    return this.db.transaction((tx) => this.kosten.rechnungAnlegen(tx, werte, benutzer));
  }

  /** Sachliche und rechnerische Prüfung: geprüfter (kumulierter) Betrag; die Prüfkette wird gespeichert. */
  @Post("eingangsrechnungen/:id/pruefen")
  async pruefen(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const werte = pruefe(RechnungPruefen, body);
    const r = await this.kosten.rechnung(id);
    if (!["erfasst", "sachlich_geprueft", "rechnerisch_geprueft"].includes(r.status))
      throw new ConflictException("Bereits freigegebene oder bezahlte Rechnungen können nicht mehr geprüft werden.");
    if (money(werte.geprueftKumuliert!).gt(r.betragBrutto)) throw new BadRequestException("Der geprüfte Betrag darf den Rechnungsbetrag nicht übersteigen.");
    await this.db.transaction(async (tx) => {
      await tx
        .update(er)
        .set({ geprueftKumuliert: werte.geprueftKumuliert!, bemerkung: werte.bemerkung, status: "rechnerisch_geprueft", geprueftAm: new Date(), geprueftVon: benutzer, geaendertAm: new Date() })
        .where(eq(er.id, id));
      await protokollieren(tx, { tabelle: "eingangsrechnung", id, aktion: "update", alt: { status: r.status, geprueftKumuliert: r.geprueftKumuliert }, neu: { status: "rechnerisch_geprueft", geprueftKumuliert: werte.geprueftKumuliert }, benutzer });
    });
    const neu = await this.kosten.rechnung(id);
    await this.db.update(er).set({ pruefergebnis: neu.vorschau.ohneSkonto }).where(eq(er.id, id));
    return neu;
  }

  @Post("eingangsrechnungen/:id/freigeben")
  async freigeben(@Param("id", ParseUUIDPipe) id: string, @Body() body: { ueberschreitungBestaetigt?: boolean } | undefined, @Benutzer() benutzer: string) {
    const r = await this.kosten.rechnung(id);
    const ueber = r.auftragsrahmen.stufe === "ueber";
    if (ueber && body?.ueberschreitungBestaetigt !== true) throw new ConflictException(`${r.auftragsrahmen.text} Freigabe nur mit ausdrücklicher Bestätigung der Überschreitung.`);
    if (r.status !== "rechnerisch_geprueft" && r.status !== "sachlich_geprueft") throw new ConflictException("Nur geprüfte Rechnungen können freigegeben werden.");
    if (anmeldungAktiv() && r.geprueftVon === benutzer) throw new ConflictException("Vier-Augen-Prinzip: Die Freigabe muss eine andere Person vornehmen als die Prüfung.");
    await this.db.transaction(async (tx) => {
      await tx.update(er).set({ status: "freigegeben", freigegebenAm: new Date(), freigegebenVon: benutzer, geaendertAm: new Date() }).where(eq(er.id, id));
      await protokollieren(tx, { tabelle: "eingangsrechnung", id, aktion: "update", alt: { status: r.status }, neu: { status: "freigegeben", ...(ueber ? { auftragUeberschritten: r.auftragsrahmen.ueberschreitung } : {}) }, benutzer });
    });
    return this.kosten.rechnung(id);
  }

  /** Zahlung buchen: Skonto nur innerhalb der Frist, Bauabzugsteuer ohne gültige Freistellung am Zahlungstag. */
  @Post("eingangsrechnungen/:id/zahlung")
  async zahlung(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const { datum } = pruefe(RechnungZahlung, body);
    const z = await this.kosten.zahlbetrag(id, datum!);
    await this.db.transaction((tx) => this.kosten.zahlungBuchen(tx, z, datum!, benutzer));
    return this.kosten.rechnung(id);
  }
}
