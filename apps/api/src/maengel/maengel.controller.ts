import { BadRequestException, Body, ConflictException, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { schema } from "@bt/db";
import { ErledigtEingabe, MangelEingabe, RuegeEingabe, mangelStatus, naechsteRuege, type MangelEingabe as MangelWerte } from "@bt/domain";
import { and, asc, eq, max, or, ilike, isNotNull, isNull, sql } from "drizzle-orm";
import { Benutzer, pruefe } from "../common/eingabe.js";
import { KontextService } from "../common/kontext.service.js";
import { differenz, protokollieren } from "../common/protokoll.js";
import { DB, type Db } from "../db.provider.js";
import { VerkaufService } from "../verkauf/verkauf.service.js";
import { NachrichtenService } from "../benachrichtigung/nachrichten.service.js";
import { MaengelService, heute } from "./maengel.service.js";

const { mangel: m, ruege: r } = schema;

@Controller("maengel")
export class MaengelController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
    @Inject(VerkaufService) private readonly verkauf: VerkaufService,
    @Inject(MaengelService) private readonly maengel: MaengelService,
    @Inject(NachrichtenService) private readonly nachrichten: NachrichtenService,
  ) {}

  /** Führt eine Änderung aus und informiert ggf. den Käufer über den neuen Bearbeitungsstand. */
  private async mitKaeuferInfo<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const vorher = await this.nachrichten.portalStatusVon(id);
    const ergebnis = await fn();
    await this.nachrichten.mangelStatusGeaendert(id, vorher).catch((e: Error) => console.error("Benachrichtigung:", e.message));
    return ergebnis;
  }

  /** Mängelliste mit Status und Fristen; status = offen | ueberfaellig | erledigt | alle. */
  @Get()
  async liste(
    @Query("projektId") projektId?: string,
    @Query("status") status = "offen",
    @Query("handwerkerId") handwerkerId?: string,
    @Query("suche") suche?: string,
  ) {
    const mandantId = await this.kontext.mandantId();
    const muster = suche ? `%${suche.trim()}%` : undefined;
    const zeilen = await this.db
      .select({
        id: m.id,
        nr: m.nr,
        titel: m.titel,
        ort: m.ort,
        mangelart: m.mangelart,
        eigentum: m.eigentum,
        festgestelltAm: m.festgestelltAm,
        erledigtAm: m.erledigtAm,
        einbehalt: m.einbehalt,
        wertHandwerkerBrutto: m.wertHandwerkerBrutto,
        projektId: schema.projekt.id,
        projektNr: schema.projekt.nr,
        projekt: schema.projekt.suchcode,
        einheit: schema.einheit.nr,
        gewerk: schema.gewerk.bezeichnung,
        handwerker: sql<string | null>`coalesce(${schema.geschaeftspartner.firma}, ${schema.geschaeftspartner.nachname}, ${schema.geschaeftspartner.suchcode})`,
        fotos: sql<number>`(select count(*)::int from ${schema.dokument} d where d.objekt_typ = 'mangel' and d.objekt_id = ${m.id} and d.geloescht_am is null)`,
      })
      .from(m)
      .innerJoin(schema.projekt, eq(m.projektId, schema.projekt.id))
      .innerJoin(schema.gesellschaft, eq(schema.projekt.gesellschaftId, schema.gesellschaft.id))
      .leftJoin(schema.einheit, eq(m.einheitId, schema.einheit.id))
      .leftJoin(schema.gewerk, eq(m.gewerkId, schema.gewerk.id))
      .leftJoin(schema.geschaeftspartner, eq(m.handwerkerId, schema.geschaeftspartner.id))
      .where(
        and(
          eq(schema.gesellschaft.mandantId, mandantId),
          projektId ? eq(schema.projekt.id, projektId) : undefined,
          handwerkerId ? eq(m.handwerkerId, handwerkerId) : undefined,
          status === "erledigt" ? isNotNull(m.erledigtAm) : status === "alle" ? undefined : isNull(m.erledigtAm),
          muster ? or(ilike(m.titel, muster), ilike(m.beschreibung, muster), ilike(m.ort, muster)) : undefined,
        ),
      )
      .orderBy(asc(schema.projekt.nr), asc(m.nr));
    const ruegen = await this.maengel.ruegen(zeilen.map((z) => z.id));
    const h = heute();
    const mitStatus = zeilen.map((z) => {
      const rr = ruegen.get(z.id) ?? [];
      const letzte = rr.at(-1);
      return { ...z, status: mangelStatus(z, rr, h), ruegen: rr.length, fristBis: letzte ? (letzte.nachfristBis ?? letzte.fristBis) : null };
    });
    return status === "ueberfaellig" ? mitStatus.filter((z) => z.status === "ueberfaellig") : mitStatus;
  }

  @Get(":id")
  eins(@Param("id", ParseUUIDPipe) id: string) {
    return this.maengel.mangel(id);
  }

  /** Prüft Bezüge (gehören zum Projekt) und übernimmt Handwerker/Gewerk aus dem Vertrag. */
  private async bezuegeAufloesen(w: MangelWerte) {
    await this.verkauf.projekt(w.projektId);
    let handwerkerId: string | null = null;
    let gewerkId = w.gewerkId ?? null;
    if (w.handwerkervertragId) {
      const [v] = await this.db
        .select({ handwerkerId: schema.handwerkervertrag.handwerkerId, gewerkId: schema.handwerkervertrag.gewerkId, projektId: schema.gewerk.projektId })
        .from(schema.handwerkervertrag)
        .innerJoin(schema.gewerk, eq(schema.handwerkervertrag.gewerkId, schema.gewerk.id))
        .where(eq(schema.handwerkervertrag.id, w.handwerkervertragId));
      if (!v || v.projektId !== w.projektId) throw new BadRequestException("Der Handwerkervertrag gehört nicht zu diesem Projekt");
      handwerkerId = v.handwerkerId;
      gewerkId = v.gewerkId;
    }
    const pruefen = async (tabelle: typeof schema.einheit | typeof schema.gewerk | typeof schema.kaufvertrag, wert: string | null | undefined, name: string) => {
      if (!wert) return;
      const [x] = await this.db.select({ projektId: tabelle.projektId }).from(tabelle).where(eq(tabelle.id, wert));
      if (!x || x.projektId !== w.projektId) throw new BadRequestException(`${name} gehört nicht zu diesem Projekt`);
    };
    await pruefen(schema.einheit, w.einheitId, "Die Einheit");
    await pruefen(schema.gewerk, gewerkId, "Das Gewerk");
    await pruefen(schema.kaufvertrag, w.kaufvertragId, "Der Kaufvertrag");
    return { ...w, handwerkerId, gewerkId, festgestelltAm: w.festgestelltAm! };
  }

  @Post()
  async anlegen(@Body() body: unknown, @Benutzer() benutzer: string) {
    const werte = await this.bezuegeAufloesen(pruefe(MangelEingabe, body));
    return this.db.transaction(async (tx) => {
      const [{ n }] = (await tx.select({ n: max(m.nr) }).from(m).where(eq(m.projektId, werte.projektId))) as [{ n: number | null }];
      const [neu] = await tx.insert(m).values({ ...werte, nr: (n ?? 0) + 1 }).returning();
      await protokollieren(tx, { tabelle: "mangel", id: neu!.id, aktion: "insert", neu: werte, benutzer });
      return neu;
    });
  }

  @Put(":id")
  async aendern(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const alt = await this.maengel.mangel(id);
    const werte = await this.bezuegeAufloesen(pruefe(MangelEingabe, body));
    if (werte.projektId !== alt.projektId) throw new BadRequestException("Das Projekt eines Mangels kann nicht geändert werden");
    return this.mitKaeuferInfo(id, () => this.db.transaction(async (tx) => {
      const [neu] = await tx.update(m).set({ ...werte, geaendertAm: new Date() }).where(eq(m.id, id)).returning();
      const d = differenz(alt as unknown as Record<string, unknown>, neu!);
      if (d.geaendert) await protokollieren(tx, { tabelle: "mangel", id, aktion: "update", ...d, benutzer });
      return neu;
    }));
  }

  /** Nächste Rüge (höchstens drei); ohne Frist wird die Standardfrist der Stufe gesetzt. */
  @Post(":id/ruegen")
  async ruegen(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const e = pruefe(RuegeEingabe, body);
    const x = await this.maengel.mangel(id);
    if (x.erledigtAm) throw new ConflictException("Der Mangel ist bereits erledigt.");
    if (!x.handwerkerId) throw new ConflictException("Bitte zuerst den verantwortlichen Handwerker (Vertrag) zuordnen.");
    const vorschlag = naechsteRuege(x.ruegen.length, e.geruegtAm!);
    if (!vorschlag) throw new ConflictException("Der Mangel wurde bereits dreimal gerügt – jetzt Ersatzvornahme prüfen.");
    const letzte = x.ruegen.at(-1);
    if (letzte && e.geruegtAm! < letzte.geruegtAm) throw new BadRequestException("Die Rüge kann nicht vor der vorherigen Rüge liegen.");
    return this.mitKaeuferInfo(id, () => this.db.transaction(async (tx) => {
      const [neu] = await tx
        .insert(r)
        .values({ mangelId: id, stufe: vorschlag.stufe, geruegtAm: e.geruegtAm!, fristBis: e.fristBis ?? vorschlag.fristBis, bemerkung: e.bemerkung })
        .returning();
      await protokollieren(tx, { tabelle: "mangel", id, aktion: "update", neu: { ruege: neu!.stufe, geruegtAm: neu!.geruegtAm, fristBis: neu!.fristBis }, benutzer });
      return neu;
    }));
  }

  @Post(":id/erledigt")
  async erledigt(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const e = pruefe(ErledigtEingabe, body);
    const x = await this.maengel.mangel(id);
    if (x.erledigtAm) throw new ConflictException("Der Mangel ist bereits erledigt.");
    const vorher = await this.nachrichten.portalStatusVon(id);
    await this.db.transaction(async (tx) => {
      await tx.update(m).set({ erledigtAm: e.erledigtAm!, erledigtVon: e.erledigtVon ?? benutzer, geaendertAm: new Date() }).where(eq(m.id, id));
      await protokollieren(tx, { tabelle: "mangel", id, aktion: "update", alt: { erledigtAm: null }, neu: { erledigtAm: e.erledigtAm, erledigtVon: e.erledigtVon ?? benutzer }, benutzer });
    });
    await this.nachrichten.mangelStatusGeaendert(id, vorher).catch((err: Error) => console.error("Benachrichtigung:", err.message));
    return this.maengel.mangel(id);
  }

  @Post(":id/wiedereroeffnen")
  async wiedereroeffnen(@Param("id", ParseUUIDPipe) id: string, @Benutzer() benutzer: string) {
    const x = await this.maengel.mangel(id);
    if (!x.erledigtAm) throw new ConflictException("Der Mangel ist nicht erledigt.");
    await this.db.transaction(async (tx) => {
      await tx.update(m).set({ erledigtAm: null, erledigtVon: null, geaendertAm: new Date() }).where(eq(m.id, id));
      await protokollieren(tx, { tabelle: "mangel", id, aktion: "update", alt: { erledigtAm: x.erledigtAm }, neu: { erledigtAm: null }, benutzer });
    });
    return this.maengel.mangel(id);
  }
}
