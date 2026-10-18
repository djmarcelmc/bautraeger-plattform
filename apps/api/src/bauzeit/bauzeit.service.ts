import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { schema } from "@bt/db";
import {
  abschnittsAnteil,
  kritischerPfad,
  cent,
  kostenstand,
  MABV_ABSCHNITTE,
  datumPlusMonate,
  datumPlusTage,
  liquiditaetsplan,
  summe,
  umlagenSumme,
  vertragsabfluss,
  meilensteinDatum,
  money,
  verteileWoechentlich,
  ZERO,
  type LiquiditaetsPosten,
  type MabvAbschnitt,
  type Money,
} from "@bt/domain";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { KontextService } from "../common/kontext.service.js";
import { DB, type Db } from "../db.provider.js";
import { KostenService } from "../kosten/kosten.service.js";
import { VerkaufService } from "../verkauf/verkauf.service.js";

const { vorgang: vg, gewerk: gw, projekt: p, gesellschaft: g, einheit: e } = schema;
const heute = () => new Date().toISOString().slice(0, 10);
/** Annahme für noch nicht verkaufte Einheiten: Zahlungsziel wie Standard-Kaufvertrag. */
const ZAHLUNGSZIEL_UNVERKAUFT = 10;
/** Annahmen für Schlussrechnungen: Prüfung/Zahlung nach Abnahme, Gewährleistung nach BGB-Werkvertrag (Bauwerk). */
const SCHLUSSZAHLUNG_TAGE = 30;
const GEWAEHRLEISTUNG_MONATE = 60;

export const EINNAHME_ARTEN: Record<string, string> = {
  angefordert: "Angeforderte Raten",
  anforderbar: "Anforderbare Raten (Bautenstand erreicht)",
  raten: "Raten nach Bauzeitenplan",
  verkauf: "Unverkaufte Einheiten (Annahme Listenpreis)",
};
export const AUSGABE_ARTEN: Record<string, string> = {
  rechnungen: "Geprüfte, offene Rechnungen",
  bauleistung: "Abschläge nach Bauzeitenplan",
  ohnePlan: "Gewerke ohne Vorgang (über die Bauzeit verteilt)",
  schlusszahlung: "Schlusszahlungen (Freigabe Vertragserfüllungseinbehalt)",
  gewaehrleistung: "Auszahlung Gewährleistungseinbehalte",
};

export interface PlanOptionen {
  projektId?: string;
  gesellschaftId?: string;
  nurLaufende?: boolean;
  wochen: number;
  anfangsbestand?: string;
  unverkauft: boolean;
  /** Skonto ziehen, wo der Vertrag es vorsieht (Standard: ja) */
  skonto?: boolean;
  stichtag?: string;
}

export interface EinbehaltKennzahlen {
  skontoErsparnis: Money;
  einbehaltenBisher: Money;
  gewaehrleistung: Money;
}

@Injectable()
export class BauzeitService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
    @Inject(KostenService) private readonly kosten: KostenService,
    @Inject(VerkaufService) private readonly verkauf: VerkaufService,
  ) {}

  async vorgang(id: string) {
    const [r] = await this.db
      .select({ vorgang: vg })
      .from(vg)
      .innerJoin(p, eq(vg.projektId, p.id))
      .innerJoin(g, eq(p.gesellschaftId, g.id))
      .where(and(eq(vg.id, id), eq(g.mandantId, await this.kontext.mandantId())));
    if (!r) throw new NotFoundException("Vorgang nicht gefunden");
    return r.vorgang;
  }

  async vorgaenge(projektId: string) {
    return this.db.select().from(vg).where(eq(vg.projektId, projektId)).orderBy(asc(vg.nr), asc(vg.beginn));
  }

  /** Bauzeitenplan mit Gewerken, MaBV-Meilensteinen und gemeldetem Bautenstand. */
  async bauzeitenplan(projektId: string) {
    const [vorgaenge, gewerke, einheiten] = await Promise.all([
      this.vorgaenge(projektId),
      this.kosten.kostenkontrolle(projektId).then((k) => k.gewerke),
      this.db.select({ id: e.id }).from(e).where(eq(e.projektId, projektId)),
    ]);
    const meldungen = einheiten.length
      ? await this.db
          .select({ abschnitt: schema.bautenstand.abschnitt, n: sql<number>`count(*)::int` })
          .from(schema.bautenstand)
          .where(inArray(schema.bautenstand.einheitId, einheiten.map((x) => x.id)))
          .groupBy(schema.bautenstand.abschnitt)
      : [];
    const verplant = new Set(vorgaenge.flatMap((v) => v.gewerkIds));
    const kritisch = kritischerPfad(vorgaenge);
    const jeId = new Map(vorgaenge.map((v) => [v.id, v]));
    const name = new Map(gewerke.map((x) => [x.id, { id: x.id, nr: x.nr, bezeichnung: x.bezeichnung, trend: x.stand.trend, berechnet: x.stand.berechnet }]));
    return {
      vorgaenge: vorgaenge.map((v) => ({
        ...v,
        gewerke: v.gewerkIds.map((id) => name.get(id)).filter((x) => !!x),
        meilenstein: v.mabvAbschnitt ? meilensteinDatum(v) : null,
        gemeldet: v.mabvAbschnitt ? (meldungen.find((m) => m.abschnitt === v.mabvAbschnitt)?.n ?? 0) : null,
        kritisch: vorgaenge.some((x) => x.abhaengigkeiten.length) && kritisch.has(v.id),
        vorgaenger: v.abhaengigkeiten.filter((a) => jeId.has(a.vorgangId)).map((a) => ({ id: a.vorgangId, nr: jeId.get(a.vorgangId)!.nr, abstandTage: a.abstandTage })),
      })),
      einheiten: einheiten.length,
      beginn: vorgaenge.reduce<string | null>((a, v) => (!a || v.beginn < a ? v.beginn : a), null),
      ende: vorgaenge.reduce<string | null>((a, v) => (!a || (v.endeIst ?? v.ende) > a ? (v.endeIst ?? v.ende) : a), null),
      gewerkeOhneVorgang: gewerke.filter((x) => !verplant.has(x.id) && Number(x.stand.trend) > 0).map((x) => name.get(x.id)!),
    };
  }

  /** Erwartete Zahlungsein- und -ausgänge eines Projekts. */
  async posten(
    projektId: string,
    stichtag: string,
    unverkauft: boolean,
    skonto = true,
  ): Promise<{ posten: LiquiditaetsPosten[]; hatPlan: boolean; einbehalte: EinbehaltKennzahlen }> {
    const vorgaenge = await this.vorgaenge(projektId);
    const posten: LiquiditaetsPosten[] = [];
    const meilenstein = new Map(vorgaenge.filter((v) => v.mabvAbschnitt).map((v) => [v.mabvAbschnitt as MabvAbschnitt, meilensteinDatum(v)]));
    /** Datum, an dem eine Rate voraussichtlich bezahlt wird (null = Abschnitt nicht terminiert). */
    const zahltermin = (abschnitte: string[], ziel: number) => {
      let spaetestens = stichtag;
      for (const a of abschnitte) {
        const d = meilenstein.get(a as MabvAbschnitt);
        if (!d) return null;
        if (d > spaetestens) spaetestens = d;
      }
      return datumPlusTage(spaetestens, ziel);
    };

    // ---- Einnahmen aus Kaufverträgen
    const vertraege = await this.db.select({ id: schema.kaufvertrag.id }).from(schema.kaufvertrag).where(eq(schema.kaufvertrag.projektId, projektId));
    for (const { id } of vertraege) {
      const v = await this.verkauf.vertrag(id);
      for (const a of v.anforderungen) if (money(a.offen).gt(0)) posten.push({ richtung: "ein", art: "angefordert", datum: a.faelligAm, betrag: a.offen });
      const fertig = new Set(v.fertigeAbschnitte);
      for (const r of v.raten) {
        if (r.zahlungsanforderungId) continue; // Sonderwünsche ohne Abschnitt: sofort anforderbar
        const offeneAbschnitte = r.abschnitte.filter((a) => !fertig.has(a as MabvAbschnitt));
        if (!offeneAbschnitte.length) posten.push({ richtung: "ein", art: "anforderbar", datum: datumPlusTage(stichtag, v.zahlungszielTage), betrag: r.betrag });
        else posten.push({ richtung: "ein", art: "raten", datum: zahltermin(offeneAbschnitte, v.zahlungszielTage), betrag: r.betrag });
      }
    }

    // ---- Unverkaufte Einheiten (optional): Listenpreis, Standard-Ratenplan nach Bautenstand
    if (unverkauft) {
      const frei = await this.db
        .select({ vkBrutto: e.vkBrutto })
        .from(e)
        .where(and(eq(e.projektId, projektId), sql`not exists (select 1 from ${schema.kaufvertragEinheit} ke where ke.einheit_id = ${e.id})`));
      const vk = frei.reduce((s, x) => s.plus(money(x.vkBrutto ?? "0")), ZERO);
      if (!vk.isZero())
        for (const { key } of MABV_ABSCHNITTE)
          posten.push({ richtung: "ein", art: "verkauf", datum: zahltermin([key], ZAHLUNGSZIEL_UNVERKAUFT), betrag: cent(vk.times(abschnittsAnteil(key)).dividedBy(100)) });
    }

    // ---- Ausgaben je Gewerk; vergebene Gewerke je Vertrag nach Prüfkette (Nachlass, Umlagen, Einbehalte, Skonto)
    const { gewerke } = await this.kosten.kostenkontrolle(projektId);
    const vertragIds = gewerke.flatMap((x) => x.vertraege.map((v) => v.id));
    const [vertragsdaten, kennzahlen, buergschaften] = vertragIds.length
      ? await Promise.all([
          this.db.select().from(schema.handwerkervertrag).where(inArray(schema.handwerkervertrag.id, vertragIds)),
          this.kosten.vertragsKennzahlen(vertragIds),
          this.db
            .select({ vertragId: schema.buergschaft.handwerkervertragId, art: schema.buergschaft.art })
            .from(schema.buergschaft)
            .where(and(inArray(schema.buergschaft.handwerkervertragId, vertragIds), eq(schema.buergschaft.richtung, "erhalten"), isNull(schema.buergschaft.rueckgabeAm))),
        ])
      : [[], new Map(), []];
    const einbehalte = { skontoErsparnis: [] as Money[], einbehaltenBisher: [] as Money[], gewaehrleistung: [] as Money[] };
    const bauBeginn = vorgaenge.reduce<string | null>((a, v) => (!a || v.beginn < a ? v.beginn : a), null);
    const bauEnde = vorgaenge.reduce<string | null>((a, v) => (!a || (v.endeIst ?? v.ende) > a ? (v.endeIst ?? v.ende) : a), null);
    const verteilen = (betrag: Money, von: string | null, bis: string | null, art: string) => {
      if (von && bis) for (const t of verteileWoechentlich(betrag, von, bis, stichtag)) posten.push({ richtung: "aus", art, datum: t.datum, betrag: t.betrag });
      else posten.push({ richtung: "aus", art, datum: null, betrag });
    };
    for (const x of gewerke) {
      const eigene = vorgaenge.filter((v) => v.gewerkIds.includes(x.id));
      const von = eigene.length ? eigene.reduce((a, v) => (v.beginn < a ? v.beginn : a), eigene[0]!.beginn) : null;
      const bis = eigene.length ? eigene.reduce((a, v) => ((v.endeIst ?? v.ende) > a ? (v.endeIst ?? v.ende) : a), eigene[0]!.endeIst ?? eigene[0]!.ende) : null;

      if (!x.vertraege.length) {
        // noch nicht vergeben: Schätzung brutto, ohne Abzüge
        const rest = money(x.stand.trend).minus(money(x.stand.berechnet));
        if (!rest.gt(0)) continue;
        if (von && bis) verteilen(rest, von, bis, "bauleistung");
        else verteilen(rest, bauBeginn, bauEnde, "ohnePlan");
        continue;
      }
      for (const { id } of x.vertraege) {
        const v = vertragsdaten.find((d) => d.id === id)!;
        const k = kennzahlen.get(id)!;
        const arten = new Set(buergschaften.filter((b) => b.vertragId === id).map((b) => b.art));
        const a = vertragsabfluss({
          summeVergeben: kostenstand("0", [{ ...k, vertragBrutto: v.vertragBrutto }]).summeVergeben,
          berechnet: k.berechnet,
          abgegolten: k.abgegolten,
          nachlassProzent: Number(v.nachlassProzent ?? 0),
          umlagenProzent: umlagenSumme(v.umlagen ?? {}),
          einbehaltVertragserfuellungProzent: Number(v.einbehaltVertragserfuellungProzent ?? 0),
          einbehaltGewaehrleistungProzent: Number(v.einbehaltGewaehrleistungProzent ?? 0),
          skontoProzent: Number(v.skontoProzent ?? 0),
          skontoNutzen: skonto,
          buergschaftVertragserfuellung: arten.has("vertragserfuellung"),
          buergschaftGewaehrleistung: arten.has("gewaehrleistung"),
        });
        if (a.rechnungen.gt(0)) posten.push({ richtung: "aus", art: "rechnungen", datum: stichtag, betrag: a.rechnungen });
        if (a.bauleistung.gt(0)) {
          if (von && bis) verteilen(a.bauleistung, von, bis, "bauleistung");
          else verteilen(a.bauleistung, bauBeginn, bauEnde, "ohnePlan");
        }
        const ende = v.abnahmeAm ?? bis ?? bauEnde;
        if (a.schlusszahlung.gt(0))
          posten.push({ richtung: "aus", art: "schlusszahlung", datum: ende ? datumPlusTage(ende > stichtag ? ende : stichtag, v.zahlungsfristTage ?? SCHLUSSZAHLUNG_TAGE) : null, betrag: a.schlusszahlung });
        if (a.gewaehrleistung.gt(0)) {
          const frei = ende ? datumPlusMonate(ende, v.gewaehrleistungMonate ?? GEWAEHRLEISTUNG_MONATE) : null;
          posten.push({ richtung: "aus", art: "gewaehrleistung", datum: frei && frei < stichtag ? stichtag : frei, betrag: a.gewaehrleistung });
        }
        einbehalte.skontoErsparnis.push(a.skontoErsparnis);
        einbehalte.einbehaltenBisher.push(a.einbehaltenBisher);
        einbehalte.gewaehrleistung.push(a.gewaehrleistung);
      }
    }
    return {
      posten,
      hatPlan: vorgaenge.length > 0,
      einbehalte: { skontoErsparnis: summe(einbehalte.skontoErsparnis), einbehaltenBisher: summe(einbehalte.einbehaltenBisher), gewaehrleistung: summe(einbehalte.gewaehrleistung) },
    };
  }

  async liquiditaetsplan(o: PlanOptionen) {
    const stichtag = o.stichtag ?? heute();
    const projekte = await this.db
      .select({ id: p.id, nr: p.nr, suchcode: p.suchcode, gesellschaft: g.name })
      .from(p)
      .innerJoin(g, eq(p.gesellschaftId, g.id))
      .where(
        and(
          eq(g.mandantId, await this.kontext.mandantId()),
          o.projektId ? eq(p.id, o.projektId) : undefined,
          o.gesellschaftId ? eq(g.id, o.gesellschaftId) : undefined,
          o.nurLaufende && !o.projektId ? eq(p.abgeschlossen, false) : undefined,
        ),
      )
      .orderBy(asc(g.nr), asc(p.nr));
    if (o.projektId && !projekte.length) throw new NotFoundException("Projekt nicht gefunden");
    const alle: LiquiditaetsPosten[] = [];
    const info = [];
    const kz: EinbehaltKennzahlen[] = [];
    const skonto = o.skonto ?? true;
    for (const x of projekte) {
      const { posten, hatPlan, einbehalte } = await this.posten(x.id, stichtag, o.unverkauft, skonto);
      alle.push(...posten);
      info.push({ ...x, hatPlan });
      kz.push(einbehalte);
    }
    const gesamt = (k: keyof EinbehaltKennzahlen) => summe(kz.map((e) => e[k])).toFixed(2);
    return {
      stichtag,
      projekte: info,
      artText: { ein: EINNAHME_ARTEN, aus: AUSGABE_ARTEN },
      skonto,
      einbehalte: { skontoErsparnis: gesamt("skontoErsparnis"), einbehaltenBisher: gesamt("einbehaltenBisher"), gewaehrleistung: gesamt("gewaehrleistung") },
      ...liquiditaetsplan(alle, { stichtag, wochen: o.wochen, anfangsbestand: o.anfangsbestand }),
    };
  }
}
