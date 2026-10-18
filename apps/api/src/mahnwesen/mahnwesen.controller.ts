import { BadRequestException, Body, Controller, Get, Inject, Post, Query } from "@nestjs/common";
import { schema } from "@bt/db";
import {
  BasiszinsEingabe,
  BasiszinsFehlt,
  MAHNSTUFEN,
  MahnlaufEingabe,
  ZINSAUFSCHLAG,
  datumPlusTage,
  mahnvorschlag,
  money,
  offen,
  verzugszinsen,
  type Basiszins,
} from "@bt/domain";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { Benutzer, pruefe } from "../common/eingabe.js";
import { KontextService } from "../common/kontext.service.js";
import { protokollieren } from "../common/protokoll.js";
import { DB, type Db } from "../db.provider.js";
import { VerkaufService } from "../verkauf/verkauf.service.js";

const { zahlungsanforderung: za, mahnung: mh, kaufvertrag: kv } = schema;
const heute = () => new Date().toISOString().slice(0, 10);

@Controller()
export class MahnwesenController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
    @Inject(VerkaufService) private readonly verkauf: VerkaufService,
  ) {}

  // ------------------------------------------------------------ Basiszinssätze

  @Get("basiszinssaetze")
  basiszinssaetze() {
    return this.db.select().from(schema.basiszins).orderBy(desc(schema.basiszins.gueltigAb));
  }

  @Post("basiszinssaetze")
  async basiszinsSpeichern(@Body() body: unknown) {
    const e = pruefe(BasiszinsEingabe, body);
    const [x] = await this.db
      .insert(schema.basiszins)
      .values({ gueltigAb: e.gueltigAb!, satz: e.satz! })
      .onConflictDoUpdate({ target: schema.basiszins.gueltigAb, set: { satz: e.satz!, geaendertAm: new Date() } })
      .returning();
    return x;
  }

  // ------------------------------------------------------------ Mahnvorschlag

  /** Alle offenen, überfälligen Zahlungsanforderungen mit Mahnvorschlag und Verzugszinsen zum Stichtag. */
  @Get("mahnwesen/vorschlag")
  async vorschlag(@Query("stichtag") stichtagParam?: string, @Query("projektId") projektId?: string) {
    const stichtag = stichtagParam && /^\d{4}-\d{2}-\d{2}$/.test(stichtagParam) ? stichtagParam : heute();
    return this.offenePosten(stichtag, projektId);
  }

  private async offenePosten(stichtag: string, projektId?: string, ids?: string[]) {
    const mandantId = await this.kontext.mandantId();
    const zeilen = await this.db
      .select({
        anforderung: za,
        vertrag: { id: kv.id, nr: kv.nr, mahnsperre: kv.mahnsperre, verbraucher: kv.verbraucher, verzugszinsProzent: kv.verzugszinsProzent, zahlungsanforderungAn: kv.zahlungsanforderungAn },
        projekt: { id: schema.projekt.id, nr: schema.projekt.nr, suchcode: schema.projekt.suchcode },
        empfaenger: sql<string | null>`(select coalesce(firma, concat_ws(' ', vorname, nachname)) from ${schema.geschaeftspartner} where id = ${kv.zahlungsanforderungAn})`,
      })
      .from(za)
      .innerJoin(kv, eq(za.kaufvertragId, kv.id))
      .innerJoin(schema.projekt, eq(kv.projektId, schema.projekt.id))
      .innerJoin(schema.gesellschaft, eq(schema.projekt.gesellschaftId, schema.gesellschaft.id))
      .where(
        and(
          eq(schema.gesellschaft.mandantId, mandantId),
          projektId ? eq(schema.projekt.id, projektId) : undefined,
          ids ? inArray(za.id, ids) : sql`${za.faelligAm} < ${stichtag}`,
        ),
      )
      .orderBy(asc(za.faelligAm));
    if (!zeilen.length) return [];
    const alleIds = zeilen.map((z) => z.anforderung.id);
    const [eingaenge, mahnungen, saetze] = await Promise.all([
      this.db.select().from(schema.zahlungseingang).where(inArray(schema.zahlungseingang.zahlungsanforderungId, alleIds)),
      this.db.select().from(mh).where(inArray(mh.zahlungsanforderungId, alleIds)).orderBy(asc(mh.stufe)),
      this.db.select().from(schema.basiszins),
    ]);
    return zeilen
      .map((z) => {
        const a = z.anforderung;
        const zahlungen = eingaenge.filter((e) => e.zahlungsanforderungId === a.id).map((e) => ({ datum: e.datum, betrag: e.betrag }));
        const bezahltBisStichtag = zahlungen.filter((e) => e.datum <= stichtag).reduce((s, e) => s.plus(e.betrag), money(0));
        const o = offen(money(a.betrag), bezahltBisStichtag);
        const eigeneMahnungen = mahnungen.filter((x) => x.zahlungsanforderungId === a.id);
        const letzte = eigeneMahnungen.at(-1);
        const vorschlag = mahnvorschlag({ faelligAm: a.faelligAm, offen: o, mahnstufe: letzte?.stufe ?? 0, letzteFristBis: letzte?.fristBis ?? null, mahnsperre: z.vertrag.mahnsperre }, stichtag);
        let zinsen = "0.00";
        let zinsHinweis: string | undefined;
        try {
          zinsen = verzugszinsen({
            betrag: money(a.betrag),
            verzugAb: datumPlusTage(a.faelligAm, 1),
            bis: stichtag,
            zahlungen,
            basiszinsen: saetze as Basiszins[],
            aufschlag: z.vertrag.verbraucher ? ZINSAUFSCHLAG.verbraucher : ZINSAUFSCHLAG.unternehmer,
            festerZinssatz: z.vertrag.verzugszinsProzent,
          }).zinsen.toFixed(2);
        } catch (e) {
          if (!(e instanceof BasiszinsFehlt)) throw e;
          zinsHinweis = e.message;
        }
        return {
          id: a.id,
          rechnungsnr: a.rechnungsnr,
          angefordertAm: a.angefordertAm,
          faelligAm: a.faelligAm,
          betrag: a.betrag,
          offen: o.toFixed(2),
          tageUeberfaellig: Math.max(0, Math.round((Date.parse(stichtag) - Date.parse(a.faelligAm)) / 864e5)),
          mahnstufe: letzte?.stufe ?? 0,
          letzteMahnung: letzte ?? null,
          mahnungen: eigeneMahnungen,
          verzugszinsen: zinsen,
          zinsHinweis,
          vorschlag,
          vertrag: z.vertrag,
          projekt: z.projekt,
          empfaenger: z.empfaenger,
        };
      })
      .filter((z) => ids || money(z.offen).gt(0));
  }

  // ------------------------------------------------------------ Mahnlauf & Mahnungen

  /** Erstellt für die gewählten Anforderungen die jeweils nächste Mahnstufe (nicht fällige werden übersprungen). */
  @Post("mahnungen")
  async mahnlauf(@Body() body: unknown, @Benutzer() benutzer: string) {
    const e = pruefe(MahnlaufEingabe, body);
    const posten = await this.offenePosten(e.datum!, undefined, e.zahlungsanforderungIds);
    if (posten.length !== e.zahlungsanforderungIds.length) throw new BadRequestException("Unbekannte Zahlungsanforderung");
    const erstellt: string[] = [];
    const uebersprungen: { rechnungsnr: string; grund: string }[] = [];
    for (const p of posten) {
      if (!p.vorschlag.stufe) {
        uebersprungen.push({ rechnungsnr: p.rechnungsnr, grund: p.vorschlag.hinweis ?? (money(p.offen).gt(0) ? "noch nicht fällig zur Mahnung" : "bezahlt") });
        continue;
      }
      const stufe = MAHNSTUFEN[p.vorschlag.stufe - 1]!;
      await this.db.transaction(async (tx) => {
        const [neu] = await tx
          .insert(mh)
          .values({
            zahlungsanforderungId: p.id,
            stufe: stufe.stufe,
            datum: e.datum!,
            fristBis: datumPlusTage(e.datum!, stufe.fristTage),
            offenerBetrag: p.offen,
            verzugszinsen: stufe.stufe >= 2 ? p.verzugszinsen : "0",
            mahngebuehr: stufe.stufe >= 2 ? (e.mahngebuehr ?? "0") : "0",
            erstelltVon: benutzer,
          })
          .returning();
        await tx.update(za).set({ mahnstufe: stufe.stufe, letzteMahnungAm: e.datum!, geaendertAm: new Date() }).where(eq(za.id, p.id));
        await protokollieren(tx, { tabelle: "zahlungsanforderung", id: p.id, aktion: "update", alt: { mahnstufe: p.mahnstufe }, neu: { mahnstufe: stufe.stufe, mahnung: stufe.titel, datum: e.datum }, benutzer });
        erstellt.push(neu!.id);
      });
    }
    return { erstellt, uebersprungen };
  }

  /** Druckdaten für Mahnschreiben (eine oder mehrere Mahnungen). */
  @Get("mahnungen")
  async mahnungen(@Query("ids") idsParam?: string, @Query("kaufvertragId") kaufvertragId?: string) {
    const ids = idsParam?.split(",").filter((x) => /^[0-9a-f-]{36}$/.test(x));
    if (!ids?.length && !kaufvertragId) throw new BadRequestException("ids oder kaufvertragId angeben");
    const liste = await this.db
      .select({ mahnung: mh, kaufvertragId: za.kaufvertragId })
      .from(mh)
      .innerJoin(za, eq(mh.zahlungsanforderungId, za.id))
      .where(ids?.length ? inArray(mh.id, ids) : eq(za.kaufvertragId, kaufvertragId!))
      .orderBy(asc(mh.datum), asc(mh.stufe));
    const saetze = (await this.db.select().from(schema.basiszins)) as Basiszins[];
    const ergebnis = [];
    for (const { mahnung, kaufvertragId: vid } of liste) {
      const v = await this.verkauf.vertrag(vid); // inkl. Mandantenprüfung
      const a = v.anforderungen.find((x) => x.id === mahnung.zahlungsanforderungId)!;
      const zahlungen = v.eingaenge.filter((x) => x.zahlungsanforderungId === a.id && x.datum <= mahnung.datum).map((x) => ({ datum: x.datum, betrag: x.betrag }));
      let perioden: ReturnType<typeof verzugszinsen>["perioden"] = [];
      try {
        perioden = verzugszinsen({
          betrag: money(a.betrag),
          verzugAb: datumPlusTage(a.faelligAm, 1),
          bis: mahnung.datum,
          zahlungen,
          basiszinsen: saetze,
          aufschlag: v.verbraucher ? ZINSAUFSCHLAG.verbraucher : ZINSAUFSCHLAG.unternehmer,
          festerZinssatz: v.verzugszinsProzent,
        }).perioden;
      } catch (e) {
        if (!(e instanceof BasiszinsFehlt)) throw e;
      }
      ergebnis.push({
        ...mahnung,
        titel: MAHNSTUFEN[mahnung.stufe - 1]!.titel,
        anforderung: { id: a.id, rechnungsnr: a.rechnungsnr, angefordertAm: a.angefordertAm, faelligAm: a.faelligAm, betrag: a.betrag, raten: a.raten },
        zahlungen,
        zinsperioden: perioden,
        vertrag: { id: v.id, nr: v.nr, urkundennr: v.urkundennr, datum: v.datum, einheiten: v.einheiten, verbraucher: v.verbraucher, verzugszinsProzent: v.verzugszinsProzent },
        projekt: v.projekt,
        gesellschaft: v.gesellschaft,
        empfaenger: v.kaeufer.find((k) => k.id === v.zahlungsanforderungAn) ?? v.kaeufer[0],
        kaeufer: v.kaeufer,
        vorherige: a.mahnungen.filter((x) => x.stufe < mahnung.stufe),
      });
    }
    return ergebnis;
  }
}
