import { Inject, Injectable } from "@nestjs/common";
import { schema } from "@bt/db";
import { money, summe, type Money } from "@bt/domain";
import { and, asc, eq, sql } from "drizzle-orm";
import { KontextService } from "../common/kontext.service.js";
import { DB, type Db } from "../db.provider.js";
import { KostenService } from "../kosten/kosten.service.js";
import { MaengelService } from "../maengel/maengel.service.js";
import { VerkaufService } from "../verkauf/verkauf.service.js";

const f = (m: Money) => m.toFixed(2);
const quote = (teil: Money, ganz: Money) => (ganz.isZero() ? "0.0" : teil.dividedBy(ganz).times(100).toFixed(1));

export interface Filter {
  gesellschaftId?: string;
  nurLaufende?: boolean;
}

/** Kennzahlen eines Projekts für Liquidität und Controlling (alle Beträge brutto, als Money). */
interface ProjektZahlen {
  projekt: { id: string; nr: number; suchcode: string; ort: string | null; abgeschlossen: boolean };
  gesellschaft: { id: string; nr: number; name: string; anschrift: string | null };
  vkPlan: Money;
  vkPlanVerkauft: Money;
  vkTrend: Money;
  angefordert: Money;
  bezahlt: Money;
  kostenGeschaetzt: Money;
  kostenTrend: Money;
  kostenBerechnet: Money;
  kostenAbgegolten: Money;
  kostenAbfluss: Money;
}

@Injectable()
export class AuswertungenService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
    @Inject(KostenService) private readonly kosten: KostenService,
    @Inject(VerkaufService) private readonly verkauf: VerkaufService,
    @Inject(MaengelService) private readonly maengel: MaengelService,
  ) {}

  private async projektZahlen(filter: Filter): Promise<ProjektZahlen[]> {
    const { projekt: p, gesellschaft: g, einheit: e, kaufvertragEinheit: ke, kaufvertrag: kv, zahlungsanforderung: za, zahlungseingang: ze } = schema;
    const projekte = await this.db
      .select({
        projekt: { id: p.id, nr: p.nr, suchcode: p.suchcode, ort: p.ort, abgeschlossen: p.abgeschlossen },
        gesellschaft: { id: g.id, nr: g.nr, name: g.name, anschrift: g.anschrift },
        vkPlan: sql<string>`(select coalesce(sum(${e.vkBrutto}), 0) from ${e} where ${e.projektId} = ${p.id})`,
        vkPlanVerkauft: sql<string>`(select coalesce(sum(${e.vkBrutto}), 0) from ${e} where ${e.projektId} = ${p.id} and exists (select 1 from ${ke} where ${ke.einheitId} = ${e.id}))`,
        vkVertrag: sql<string>`(select coalesce(sum(${ke.vkBrutto}), 0) from ${ke} join ${e} on ${e.id} = ${ke.einheitId} where ${e.projektId} = ${p.id})`,
        angefordert: sql<string>`(select coalesce(sum(${za.betrag}), 0) from ${za} join ${kv} on ${kv.id} = ${za.kaufvertragId} where ${kv.projektId} = ${p.id})`,
        bezahlt: sql<string>`(select coalesce(sum(${ze.betrag}), 0) from ${ze} join ${kv} on ${kv.id} = ${ze.kaufvertragId} where ${kv.projektId} = ${p.id})`,
        abfluss: sql<string>`(select coalesce(sum(zo.betrag + zo.bauabzugsteuer), 0) from ${schema.zahlungsausgang} zo
          join ${schema.eingangsrechnung} er on er.id = zo.eingangsrechnung_id
          join ${schema.handwerkervertrag} hv on hv.id = er.handwerkervertrag_id
          join ${schema.gewerk} gw on gw.id = hv.gewerk_id where gw.projekt_id = ${p.id})`,
      })
      .from(p)
      .innerJoin(g, eq(p.gesellschaftId, g.id))
      .where(
        and(
          eq(g.mandantId, await this.kontext.mandantId()),
          filter.gesellschaftId ? eq(g.id, filter.gesellschaftId) : undefined,
          filter.nurLaufende ? eq(p.abgeschlossen, false) : undefined,
        ),
      )
      .orderBy(asc(g.nr), asc(p.nr));
    const ergebnis: ProjektZahlen[] = [];
    for (const x of projekte) {
      const k = (await this.kosten.kostenkontrolle(x.projekt.id)).summe;
      const vkPlan = money(x.vkPlan);
      const vkPlanVerkauft = money(x.vkPlanVerkauft);
      ergebnis.push({
        projekt: x.projekt,
        gesellschaft: x.gesellschaft,
        vkPlan,
        vkPlanVerkauft,
        // Trend: verkaufte Einheiten zum Vertragspreis, unverkaufte zum Listenpreis
        vkTrend: money(x.vkVertrag).plus(vkPlan.minus(vkPlanVerkauft)),
        angefordert: money(x.angefordert),
        bezahlt: money(x.bezahlt),
        kostenGeschaetzt: money(k.geschaetzt),
        kostenTrend: money(k.trend),
        kostenBerechnet: money(k.berechnet),
        kostenAbgegolten: money(k.bezahlt),
        kostenAbfluss: money(x.abfluss),
      });
    }
    return ergebnis;
  }

  /** Liquiditätsbetrachtung: Erlöse, Kosten und Saldo je Projekt, Gesellschaft und gesamt. */
  async liquiditaet(filter: Filter) {
    const zahlen = await this.projektZahlen(filter);
    type Block = { trend: Money; angefordert: Money; bezahlt: Money; offen: Money };
    const zeile = (z: ProjektZahlen) => {
      const erloese: Block = { trend: z.vkTrend, angefordert: z.angefordert, bezahlt: z.bezahlt, offen: z.angefordert.minus(z.bezahlt) };
      const kosten: Block = { trend: z.kostenTrend, angefordert: z.kostenBerechnet, bezahlt: z.kostenAbfluss, offen: z.kostenBerechnet.minus(z.kostenAbgegolten) };
      const saldo: Block = {
        trend: erloese.trend.minus(kosten.trend),
        angefordert: erloese.angefordert.minus(kosten.angefordert),
        bezahlt: erloese.bezahlt.minus(kosten.bezahlt),
        offen: erloese.offen.minus(kosten.offen),
      };
      return { erloese, kosten, saldo };
    };
    const addiere = (bloecke: ReturnType<typeof zeile>[]) => {
      const s = (teil: "erloese" | "kosten" | "saldo", feld: keyof Block) => summe(bloecke.map((b) => b[teil][feld]));
      return Object.fromEntries(
        (["erloese", "kosten", "saldo"] as const).map((t) => [t, Object.fromEntries((["trend", "angefordert", "bezahlt", "offen"] as const).map((k) => [k, s(t, k)]))]),
      ) as ReturnType<typeof zeile>;
    };
    const alsText = (b: ReturnType<typeof zeile>) =>
      Object.fromEntries(
        (["erloese", "kosten", "saldo"] as const).map((t) => [t, Object.fromEntries(Object.entries(b[t]).map(([k, v]) => [k, f(v)]))]),
      ) as Record<"erloese" | "kosten" | "saldo", Record<keyof Block, string>>;
    const gesellschaften = [...new Map(zahlen.map((z) => [z.gesellschaft.id, z.gesellschaft])).values()].map((g) => {
      const eigene = zahlen.filter((z) => z.gesellschaft.id === g.id);
      const zeilen = eigene.map((z) => ({ projekt: z.projekt, ...zeile(z) }));
      return { gesellschaft: g, projekte: zeilen.map((z) => ({ projekt: z.projekt, ...alsText(z) })), summe: alsText(addiere(zeilen)) };
    });
    return { gesellschaften, gesamt: alsText(addiere(zahlen.map(zeile))), stand: new Date().toISOString().slice(0, 10) };
  }

  /** Controlling-Übersicht: Kosten, Verkauf und Ertrag – geschätzt gegen Trend. */
  async controlling(filter: Filter) {
    const zahlen = await this.projektZahlen(filter);
    const zeile = (z: Pick<ProjektZahlen, "kostenGeschaetzt" | "kostenTrend" | "kostenBerechnet" | "vkPlan" | "vkPlanVerkauft" | "vkTrend">) => ({
      kosten: { standProzent: quote(z.kostenBerechnet, z.kostenTrend), geschaetzt: f(z.kostenGeschaetzt), trend: f(z.kostenTrend), abweichung: f(z.kostenGeschaetzt.minus(z.kostenTrend)) },
      verkauf: { standProzent: quote(z.vkPlanVerkauft, z.vkPlan), geschaetzt: f(z.vkPlan), trend: f(z.vkTrend), abweichung: f(z.vkTrend.minus(z.vkPlan)) },
      ertrag: {
        geschaetzt: f(z.vkPlan.minus(z.kostenGeschaetzt)),
        trend: f(z.vkTrend.minus(z.kostenTrend)),
        abweichung: f(z.vkTrend.minus(z.kostenTrend).minus(z.vkPlan.minus(z.kostenGeschaetzt))),
      },
    });
    const s = (k: keyof ProjektZahlen) => summe(zahlen.map((z) => z[k] as Money));
    return {
      projekte: zahlen.map((z) => ({ projekt: z.projekt, gesellschaft: z.gesellschaft, ...zeile(z) })),
      gesamt: zeile({ kostenGeschaetzt: s("kostenGeschaetzt"), kostenTrend: s("kostenTrend"), kostenBerechnet: s("kostenBerechnet"), vkPlan: s("vkPlan"), vkPlanVerkauft: s("vkPlanVerkauft"), vkTrend: s("vkTrend") }),
      stand: new Date().toISOString().slice(0, 10),
    };
  }

  /** Projektbericht: Verkauf (Verträge, Zahlungen, unverkaufte Einheiten), Kosten und Mängel eines Projekts. */
  async projektbericht(projektId: string) {
    const { projekt, gesellschaft } = await this.verkauf.projekt(projektId);
    const vertragIds = await this.db.select({ id: schema.kaufvertrag.id }).from(schema.kaufvertrag).where(eq(schema.kaufvertrag.projektId, projektId)).orderBy(asc(schema.kaufvertrag.nr));
    const vertraege = await Promise.all(vertragIds.map(async ({ id }) => {
      const v = await this.verkauf.vertrag(id);
      return {
        id: v.id,
        nr: v.nr,
        urkundennr: v.urkundennr,
        datum: v.datum,
        kaeufer: v.kaeufer.map((k) => k.firma ?? [k.vorname, k.nachname].filter(Boolean).join(" ")),
        einheiten: v.einheiten.map((e) => ({ nr: e.nr, typ: e.typ, vkBrutto: e.vkBrutto })),
        summen: v.summen,
        bezahltProzent: quote(money(v.summen.bezahlt), money(v.summen.vertragssumme)),
        zahlungen: v.eingaenge.map((z) => ({ datum: z.datum, betrag: z.betrag })),
      };
    }));
    const unverkauft = await this.db
      .select({ id: schema.einheit.id, nr: schema.einheit.nr, typ: schema.einheit.typ, art: schema.einheit.art, wohnflaeche: schema.einheit.wohnflaeche, vkBrutto: schema.einheit.vkBrutto })
      .from(schema.einheit)
      .where(and(eq(schema.einheit.projektId, projektId), sql`not exists (select 1 from ${schema.kaufvertragEinheit} where ${schema.kaufvertragEinheit.einheitId} = ${schema.einheit.id})`))
      .orderBy(asc(schema.einheit.nr));
    const k = await this.kosten.kostenkontrolle(projektId);
    const offeneMaengel = await this.db
      .select({ id: schema.mangel.id })
      .from(schema.mangel)
      .where(and(eq(schema.mangel.projektId, projektId), sql`${schema.mangel.erledigtAm} is null`));
    const ruegen = await this.maengel.ruegen(offeneMaengel.map((m) => m.id));
    const heute = new Date().toISOString().slice(0, 10);
    const ueberfaellig = offeneMaengel.filter((m) => {
      const l = ruegen.get(m.id)?.at(-1);
      return l && (l.nachfristBis ?? l.fristBis) < heute;
    }).length;
    const verkaufSumme = (feld: "vertragssumme" | "bezahlt" | "angefordert") => f(summe(vertraege.map((v) => money(v.summen[feld]))));
    return {
      projekt,
      gesellschaft: { id: gesellschaft.id, name: gesellschaft.name },
      verkauf: {
        vertraege,
        unverkauft,
        summen: {
          vertragssumme: verkaufSumme("vertragssumme"),
          angefordert: verkaufSumme("angefordert"),
          bezahlt: verkaufSumme("bezahlt"),
          unverkauftPlan: f(summe(unverkauft.map((e) => money(e.vkBrutto ?? "0")))),
        },
      },
      kosten: { summe: k.summe, vergeben: k.gewerke.filter((g) => g.vertraege.length) },
      maengel: { offen: offeneMaengel.length, ueberfaellig },
      stand: heute,
    };
  }
}

