import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { schema, type DbOderTx } from "@bt/db";
import {
  ABNAHME_ART_TEXT,
  AbnahmeAbschluss,
  AbnahmeEingabe,
  AbnahmeMaengelEingabe,
  datumPlusMonate,
  mangelStatus,
  type AbnahmeArt,
  type AbnahmeEingabe as Werte,
} from "@bt/domain";
import { and, asc, eq, inArray, max, sql } from "drizzle-orm";
import { Benutzer, pruefe } from "../common/eingabe.js";
import { KontextService } from "../common/kontext.service.js";
import { differenz, protokollieren } from "../common/protokoll.js";
import { DB, type Db } from "../db.provider.js";
import { MaengelService, heute } from "../maengel/maengel.service.js";
import { VerkaufService } from "../verkauf/verkauf.service.js";

const { abnahme: ab, mangel: m, kaufvertrag: kv, handwerkervertrag: hv, gewerk: gw, einheit: e, geschaeftspartner: gp } = schema;

@Controller()
export class AbnahmenController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
    @Inject(VerkaufService) private readonly verkauf: VerkaufService,
    @Inject(MaengelService) private readonly maengel: MaengelService,
  ) {}

  /** Abnahme des Mandanten (über Projekt → Gesellschaft). */
  private async kopf(id: string) {
    const [x] = await this.db
      .select({ abnahme: ab })
      .from(ab)
      .innerJoin(schema.projekt, eq(ab.projektId, schema.projekt.id))
      .innerJoin(schema.gesellschaft, eq(schema.projekt.gesellschaftId, schema.gesellschaft.id))
      .where(and(eq(ab.id, id), eq(schema.gesellschaft.mandantId, await this.kontext.mandantId())));
    if (!x) throw new NotFoundException("Abnahme nicht gefunden");
    return x.abnahme;
  }

  private offen(a: { abgeschlossenAm: Date | null }) {
    if (a.abgeschlossenAm) throw new ConflictException("Die Abnahme ist abgeschlossen und kann nicht mehr geändert werden.");
  }

  /** Bezüge müssen zum Projekt gehören; die Einheit wird beim Sondereigentum aus dem Kaufvertrag vorbelegt. */
  private async bezuege(projektId: string, w: Werte) {
    let einheitId = w.einheitId ?? null;
    if (w.art === "sondereigentum") {
      const [v] = await this.db.select({ projektId: kv.projektId }).from(kv).where(eq(kv.id, w.kaufvertragId!));
      if (!v || v.projektId !== projektId) throw new BadRequestException("Der Kaufvertrag gehört nicht zu diesem Projekt");
      if (!einheitId) {
        const [x] = await this.db
          .select({ id: e.id })
          .from(schema.kaufvertragEinheit)
          .innerJoin(e, eq(schema.kaufvertragEinheit.einheitId, e.id))
          .where(eq(schema.kaufvertragEinheit.kaufvertragId, w.kaufvertragId!))
          .orderBy(sql`case when ${e.typ} = 'wohnung' then 0 else 1 end`, asc(e.nr))
          .limit(1);
        einheitId = x?.id ?? null;
      }
    }
    if (w.art === "handwerker") {
      const [v] = await this.db.select({ projektId: gw.projektId }).from(hv).innerJoin(gw, eq(hv.gewerkId, gw.id)).where(eq(hv.id, w.handwerkervertragId!));
      if (!v || v.projektId !== projektId) throw new BadRequestException("Der Handwerkervertrag gehört nicht zu diesem Projekt");
    }
    if (einheitId) {
      const [x] = await this.db.select({ projektId: e.projektId }).from(e).where(eq(e.id, einheitId));
      if (!x || x.projektId !== projektId) throw new BadRequestException("Die Einheit gehört nicht zu diesem Projekt");
    }
    return {
      ...w,
      kaufvertragId: w.art === "sondereigentum" ? w.kaufvertragId! : null,
      handwerkervertragId: w.art === "handwerker" ? w.handwerkervertragId! : null,
      einheitId: w.art === "gemeinschaftseigentum" ? null : einheitId,
      zaehler: Object.fromEntries(Object.entries(w.zaehler).filter(([, x]) => x !== undefined)) as Record<string, string | null>,
    };
  }

  @Get("abnahmen")
  async liste(@Query("projektId") projektId?: string) {
    const zeilen = await this.db
      .select({
        id: ab.id,
        nr: ab.nr,
        art: ab.art,
        datum: ab.datum,
        ergebnis: ab.ergebnis,
        abgeschlossenAm: ab.abgeschlossenAm,
        projektId: ab.projektId,
        projekt: sql<string>`${schema.projekt.nr} || ' ' || ${schema.projekt.suchcode}`,
        bezug: sql<string | null>`coalesce('Kaufvertrag ' || ${kv.nr}, ${gw.nr} || ' ' || ${gw.bezeichnung})`,
        einheit: e.nr,
        maengel: sql<number>`(select count(*)::int from ${m} where ${m.abnahmeId} = ${ab.id})`,
        maengelOffen: sql<number>`(select count(*)::int from ${m} where ${m.abnahmeId} = ${ab.id} and ${m.erledigtAm} is null)`,
      })
      .from(ab)
      .innerJoin(schema.projekt, eq(ab.projektId, schema.projekt.id))
      .innerJoin(schema.gesellschaft, eq(schema.projekt.gesellschaftId, schema.gesellschaft.id))
      .leftJoin(kv, eq(ab.kaufvertragId, kv.id))
      .leftJoin(hv, eq(ab.handwerkervertragId, hv.id))
      .leftJoin(gw, eq(hv.gewerkId, gw.id))
      .leftJoin(e, eq(ab.einheitId, e.id))
      .where(and(eq(schema.gesellschaft.mandantId, await this.kontext.mandantId()), projektId && /^[0-9a-f-]{36}$/.test(projektId) ? eq(ab.projektId, projektId) : undefined))
      .orderBy(asc(schema.projekt.nr), asc(ab.nr));
    return zeilen.map((z) => ({ ...z, artText: ABNAHME_ART_TEXT[z.art as AbnahmeArt] ?? z.art }));
  }

  @Post("projekte/:id/abnahmen")
  async anlegen(@Param("id", ParseUUIDPipe) projektId: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    await this.verkauf.projekt(projektId);
    const werte = await this.bezuege(projektId, pruefe(AbnahmeEingabe, body));
    return this.db.transaction(async (tx) => {
      const [x] = await tx.select({ n: max(ab.nr) }).from(ab).where(eq(ab.projektId, projektId));
      const [neu] = await tx.insert(ab).values({ ...werte, projektId, nr: (x?.n ?? 0) + 1 }).returning();
      await protokollieren(tx, { tabelle: "abnahme", id: neu!.id, aktion: "insert", neu: werte, benutzer });
      return neu;
    });
  }

  /** Abnahme mit Beteiligten, Objekt und Mängeln (Grundlage für Bildschirm und Protokoll). */
  @Get("abnahmen/:id")
  async eine(@Param("id", ParseUUIDPipe) id: string) {
    const a = await this.kopf(id);
    const { projekt, gesellschaft } = await this.verkauf.projekt(a.projektId);
    const vertrag = a.kaufvertragId ? await this.verkauf.vertrag(a.kaufvertragId) : null;
    const [handwerk] = a.handwerkervertragId
      ? await this.db
          .select({ id: hv.id, nrIntern: hv.nrIntern, gewerk: sql<string>`${gw.nr} || ' ' || ${gw.bezeichnung}`, handwerker: gp })
          .from(hv)
          .innerJoin(gw, eq(hv.gewerkId, gw.id))
          .leftJoin(gp, eq(hv.handwerkerId, gp.id))
          .where(eq(hv.id, a.handwerkervertragId))
      : [];
    const [einheit] = a.einheitId ? await this.db.select({ id: e.id, nr: e.nr, typ: e.typ, art: e.art, etage: e.etage }).from(e).where(eq(e.id, a.einheitId)) : [];
    const liste = await this.db
      .select({ mangel: m, gewerk: sql<string | null>`${gw.nr} || ' ' || ${gw.bezeichnung}`, handwerker: sql<string | null>`coalesce(${gp.firma}, ${gp.nachname})` })
      .from(m)
      .leftJoin(gw, eq(m.gewerkId, gw.id))
      .leftJoin(gp, eq(m.handwerkerId, gp.id))
      .where(eq(m.abnahmeId, id))
      .orderBy(asc(m.nr));
    const ruegen = await this.maengel.ruegen(liste.map((x) => x.mangel.id));
    const h = heute();
    return {
      ...a,
      artText: ABNAHME_ART_TEXT[a.art as AbnahmeArt] ?? a.art,
      projekt: { id: projekt.id, nr: projekt.nr, suchcode: projekt.suchcode, strasse: projekt.strasse, plz: projekt.plz, ort: projekt.ort },
      gesellschaft: { id: gesellschaft.id, name: gesellschaft.name, anschrift: gesellschaft.anschrift },
      kaufvertrag: vertrag ? { id: vertrag.id, nr: vertrag.nr, urkundennr: vertrag.urkundennr, kaeufer: vertrag.kaeufer, einheiten: vertrag.einheiten, uebergabeIst: vertrag.uebergabeIst, gewaehrleistungBis: vertrag.gewaehrleistungBis } : null,
      handwerkervertrag: handwerk ?? null,
      einheit: einheit ?? null,
      maengel: liste.map((x) => ({
        id: x.mangel.id,
        nr: x.mangel.nr,
        titel: x.mangel.titel,
        ort: x.mangel.ort,
        beschreibung: x.mangel.beschreibung,
        gewerk: x.gewerk,
        handwerker: x.handwerker,
        erledigtAm: x.mangel.erledigtAm,
        status: mangelStatus(x.mangel, ruegen.get(x.mangel.id) ?? [], h),
      })),
    };
  }

  @Put("abnahmen/:id")
  async aendern(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const alt = await this.kopf(id);
    this.offen(alt);
    const w = pruefe(AbnahmeEingabe, body);
    if (w.art !== alt.art) throw new BadRequestException("Die Art der Abnahme kann nicht geändert werden.");
    const werte = await this.bezuege(alt.projektId, w);
    return this.db.transaction(async (tx) => {
      const [neu] = await tx.update(ab).set({ ...werte, geaendertAm: new Date() }).where(eq(ab.id, id)).returning();
      const d = differenz(alt, neu!);
      if (d.geaendert) await protokollieren(tx, { tabelle: "abnahme", id, aktion: "update", ...d, benutzer });
      return neu;
    });
  }

  @Delete("abnahmen/:id")
  async loeschen(@Param("id", ParseUUIDPipe) id: string, @Benutzer() benutzer: string) {
    const alt = await this.kopf(id);
    this.offen(alt);
    const [x] = await this.db.select({ n: sql<number>`count(*)::int` }).from(m).where(eq(m.abnahmeId, id));
    if (x!.n > 0) throw new ConflictException("Die Abnahme enthält bereits Mängel und kann nicht gelöscht werden.");
    await this.db.transaction(async (tx) => {
      await tx.delete(ab).where(eq(ab.id, id));
      await protokollieren(tx, { tabelle: "abnahme", id, aktion: "delete", alt, benutzer });
    });
    return { geloescht: true };
  }

  /** Erfasst Mängel zur Abnahme – frei oder aus dem Standardkatalog (Gewerk über die Gewerknummer). */
  @Post("abnahmen/:id/maengel")
  async maengelErfassen(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const a = await this.kopf(id);
    this.offen(a);
    const w = pruefe(AbnahmeMaengelEingabe, body);
    const vorlagen = w.vorlageIds.length
      ? await this.db
          .select()
          .from(schema.mangelvorlage)
          .where(and(inArray(schema.mangelvorlage.id, w.vorlageIds), eq(schema.mangelvorlage.mandantId, await this.kontext.mandantId())))
      : [];
    if (vorlagen.length !== new Set(w.vorlageIds).size) throw new BadRequestException("Mindestens eine Mängelvorlage wurde nicht gefunden.");
    const gewerke = await this.db.select({ id: gw.id, nr: gw.nr }).from(gw).where(eq(gw.projektId, a.projektId));
    if (w.gewerkId && !gewerke.some((g) => g.id === w.gewerkId)) throw new BadRequestException("Das Gewerk gehört nicht zu diesem Projekt");
    let handwerkerId: string | null = null;
    let vertragGewerk: string | null = null;
    if (a.handwerkervertragId) {
      const [v] = await this.db.select({ handwerkerId: hv.handwerkerId, gewerkId: hv.gewerkId }).from(hv).where(eq(hv.id, a.handwerkervertragId));
      handwerkerId = v?.handwerkerId ?? null;
      vertragGewerk = v?.gewerkId ?? null;
    }
    const basis = {
      projektId: a.projektId,
      abnahmeId: id,
      einheitId: a.einheitId,
      kaufvertragId: a.kaufvertragId,
      handwerkervertragId: a.handwerkervertragId,
      handwerkerId,
      eigentum: (a.art === "gemeinschaftseigentum" ? "gemeinschaft" : "sonder") as "sonder" | "gemeinschaft",
      festgestelltAm: a.datum,
      festgestelltDurch: "Abnahme",
      mangelart: "Abnahmemangel",
      ort: w.ort ?? null,
    };
    const neue = [
      ...vorlagen.map((v) => ({ ...basis, titel: v.titel, beschreibung: v.beschreibung, gewerkId: vertragGewerk ?? gewerke.find((g) => g.nr === v.gewerkNr)?.id ?? null })),
      ...(w.titel ? [{ ...basis, titel: w.titel, beschreibung: w.beschreibung ?? null, gewerkId: vertragGewerk ?? w.gewerkId ?? null }] : []),
    ];
    return this.db.transaction(async (tx) => {
      const [x] = await tx.select({ n: max(m.nr) }).from(m).where(eq(m.projektId, a.projektId));
      let nr = x?.n ?? 0;
      const angelegt = await tx.insert(m).values(neue.map((n) => ({ ...n, nr: ++nr }))).returning({ id: m.id, nr: m.nr, titel: m.titel });
      for (const z of angelegt) await protokollieren(tx, { tabelle: "mangel", id: z.id, aktion: "insert", neu: { titel: z.titel, abnahmeId: id }, benutzer });
      return { angelegt: angelegt.length, maengel: angelegt };
    });
  }

  /**
   * Schließt die Abnahme ab. Folgen (außer bei Verweigerung):
   * Sondereigentum → Übergabe und Gewährleistungsende im Kaufvertrag,
   * Handwerkerleistung → Abnahmedatum (und Gewährleistungsfrist) im Handwerkervertrag,
   * Gemeinschaftseigentum → Fertigstellung (Ist) im Projekt, falls noch leer.
   */
  @Post("abnahmen/:id/abschliessen")
  async abschliessen(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const a = await this.kopf(id);
    this.offen(a);
    const w = pruefe(AbnahmeAbschluss, body);
    const folgen: string[] = [];
    await this.db.transaction(async (tx) => {
      await tx
        .update(ab)
        .set({ ergebnis: w.ergebnis, vorbehaltVertragsstrafe: w.vorbehaltVertragsstrafe, gewaehrleistungMonate: w.gewaehrleistungMonate, abgeschlossenAm: new Date(), abgeschlossenVon: benutzer, geaendertAm: new Date() })
        .where(eq(ab.id, id));
      await protokollieren(tx, { tabelle: "abnahme", id, aktion: "update", neu: { ...w, abgeschlossen: true }, benutzer });
      if (w.ergebnis !== "verweigert") await this.folgen(tx, a, w.gewaehrleistungMonate, benutzer, folgen);
    });
    return { ...(await this.eine(id)), folgen };
  }

  private async folgen(tx: DbOderTx, a: typeof ab.$inferSelect, monate: number, benutzer: string, folgen: string[]) {
    const bis = datumPlusMonate(a.datum, monate);
    if (a.art === "sondereigentum" && a.kaufvertragId) {
      const [alt] = await tx.select({ uebergabeIst: kv.uebergabeIst, gewaehrleistungBis: kv.gewaehrleistungBis }).from(kv).where(eq(kv.id, a.kaufvertragId));
      const uebergabe = new Date(`${a.datum}T12:00:00Z`);
      await tx.update(kv).set({ uebergabeIst: uebergabe, gewaehrleistungBis: bis, geaendertAm: new Date() }).where(eq(kv.id, a.kaufvertragId));
      await protokollieren(tx, { tabelle: "kaufvertrag", id: a.kaufvertragId, aktion: "update", alt, neu: { uebergabeIst: uebergabe, gewaehrleistungBis: bis, durch: `Abnahme ${a.nr}` }, benutzer });
      folgen.push(`Kaufvertrag: Übergabe am ${a.datum}, Gewährleistung bis ${bis}`);
    }
    if (a.art === "handwerker" && a.handwerkervertragId) {
      const [alt] = await tx.select({ abnahmeAm: hv.abnahmeAm, gewaehrleistungMonate: hv.gewaehrleistungMonate }).from(hv).where(eq(hv.id, a.handwerkervertragId));
      const neu = { abnahmeAm: a.datum, gewaehrleistungMonate: alt?.gewaehrleistungMonate ?? monate };
      await tx.update(hv).set({ ...neu, geaendertAm: new Date() }).where(eq(hv.id, a.handwerkervertragId));
      await protokollieren(tx, { tabelle: "handwerkervertrag", id: a.handwerkervertragId, aktion: "update", alt, neu: { ...neu, durch: `Abnahme ${a.nr}` }, benutzer });
      folgen.push(`Handwerkervertrag: Abnahme am ${a.datum}, Gewährleistung ${neu.gewaehrleistungMonate} Monate`);
    }
    if (a.art === "gemeinschaftseigentum") {
      const [p] = await tx.select({ fertigstellungIst: schema.projekt.fertigstellungIst }).from(schema.projekt).where(eq(schema.projekt.id, a.projektId));
      if (!p?.fertigstellungIst) {
        await tx.update(schema.projekt).set({ fertigstellungIst: a.datum, geaendertAm: new Date() }).where(eq(schema.projekt.id, a.projektId));
        await protokollieren(tx, { tabelle: "projekt", id: a.projektId, aktion: "update", alt: { fertigstellungIst: null }, neu: { fertigstellungIst: a.datum, durch: `Abnahme ${a.nr}` }, benutzer });
        folgen.push(`Projekt: Fertigstellung (Ist) am ${a.datum}`);
      }
    }
  }
}
