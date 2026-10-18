import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { schema } from "@bt/db";
import { mabvPruefung, money, summe } from "@bt/domain";
import { and, asc, eq, sql } from "drizzle-orm";
import { KontextService } from "../common/kontext.service.js";
import { DB, type Db } from "../db.provider.js";
import { VerkaufService } from "../verkauf/verkauf.service.js";

const { kaufvertrag: kv, projekt: p, gesellschaft: g, buergschaft: b, geschaeftspartner: gp } = schema;
const istDatum = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Prüfbericht nach § 16 MaBV je Gesellschaft und Prüfungszeitraum. */
@Injectable()
export class MabvPruefberichtService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
    @Inject(VerkaufService) private readonly verkauf: VerkaufService,
  ) {}

  async bericht(o: { gesellschaftId?: string; von?: string; bis?: string }) {
    const vorjahr = new Date().getFullYear() - 1;
    const von = istDatum(o.von) ? o.von! : `${vorjahr}-01-01`;
    const bis = istDatum(o.bis) ? o.bis! : `${vorjahr}-12-31`;
    if (von > bis) throw new BadRequestException("Der Zeitraum beginnt nach seinem Ende.");
    const mandantId = await this.kontext.mandantId();
    const gesellschaften = await this.db.select({ id: g.id, nr: g.nr, name: g.name, anschrift: g.anschrift }).from(g).where(eq(g.mandantId, mandantId)).orderBy(asc(g.nr));
    const ges = o.gesellschaftId ? gesellschaften.find((x) => x.id === o.gesellschaftId) : gesellschaften[0];
    if (!ges) throw new NotFoundException("Gesellschaft nicht gefunden");

    // Verträge, die bis zum Ende des Zeitraums geschlossen wurden oder darin Anforderungen haben
    const vertraege = await this.db
      .select({ id: kv.id })
      .from(kv)
      .innerJoin(p, eq(kv.projektId, p.id))
      .where(
        and(
          eq(p.gesellschaftId, ges.id),
          sql`(${kv.datum} <= ${bis} or exists (select 1 from ${schema.zahlungsanforderung} za where za.kaufvertrag_id = ${kv.id} and za.angefordert_am <= ${bis}))`,
        ),
      )
      .orderBy(asc(p.nr), asc(kv.nr));

    const ergebnis: Awaited<ReturnType<MabvPruefberichtService["vertrag"]>>[] = [];
    for (const { id } of vertraege) ergebnis.push(await this.vertrag(id, von, bis));
    const s = (f: (x: (typeof ergebnis)[number]) => string) => summe(ergebnis.map((x) => money(f(x)))).toFixed(2);
    return {
      gesellschaft: ges,
      gesellschaften,
      zeitraum: { von, bis },
      erstelltAm: new Date().toISOString().slice(0, 10),
      vertraege: ergebnis,
      summen: {
        vertraege: ergebnis.length,
        vertragssumme: s((x) => x.vertragssumme),
        angefordertImZeitraum: s((x) => x.summen.angefordertImZeitraum),
        eingegangenImZeitraum: s((x) => x.summen.eingegangenImZeitraum),
        anforderungen: ergebnis.reduce((n, x) => n + x.anforderungen.length, 0),
        verstoesse: ergebnis.reduce((n, x) => n + x.verstoesse, 0),
        hinweise: ergebnis.reduce((n, x) => n + x.feststellungen.length - x.verstoesse, 0),
        mitParagraph7: ergebnis.filter((x) => x.sicherung.art === "§ 7").length,
      },
    };
  }

  private async vertrag(id: string, von: string, bis: string) {
    const v = await this.verkauf.vertrag(id);
    const buergschaften = await this.db
      .select({ nr: b.nr, betrag: b.betrag, ausgestelltAm: b.ausgestelltAm, gueltigBis: b.gueltigBis, rueckgabeAm: b.rueckgabeAm, buerge: sql<string | null>`coalesce(${gp.firma}, ${gp.nachname})` })
      .from(b)
      .leftJoin(gp, eq(b.buergeId, gp.id))
      .where(and(eq(b.kaufvertragId, id), eq(b.art, "mabv7")));
    const pruefung = mabvPruefung(
      {
        erbbaurecht: v.erbbaurecht,
        vertragWirksam: v.vertragWirksam,
        vormerkungEingetragenAm: v.vormerkungEingetragenAm,
        lastenfreistellungGesichert: v.lastenfreistellungGesichert,
        buergschaftNach7: v.buergschaftNach7,
        einheiten: v.einheiten,
        meldungen: v.bautenstand,
        raten: v.raten,
        anforderungen: v.anforderungen,
        buergschaften7: buergschaften,
      },
      { von, bis },
    );
    const eingaenge = v.eingaenge.filter((e) => e.datum >= von && e.datum <= bis);
    const bisEnde = (liste: { datum?: string; angefordertAm?: string; betrag: string }[], feld: "datum" | "angefordertAm") => summe(liste.filter((x) => (x[feld] ?? "") <= bis).map((x) => money(x.betrag))).toFixed(2);
    return {
      id: v.id,
      nr: v.nr,
      urkundennr: v.urkundennr,
      datum: v.datum,
      projekt: v.projekt,
      kaeufer: v.kaeufer.map((k) => k.firma ?? [k.vorname, k.nachname].filter(Boolean).join(" ")),
      einheiten: v.einheiten.map((e) => e.nr),
      sicherung: {
        art: pruefung.sicherung,
        vertragWirksam: v.vertragWirksam,
        vormerkungEingetragenAm: v.vormerkungEingetragenAm,
        lastenfreistellungGesichert: v.lastenfreistellungGesichert,
        buergschaften,
      },
      vertragssumme: pruefung.vertragssumme,
      anforderungen: pruefung.anforderungen.filter((a) => a.imZeitraum),
      eingaenge: eingaenge.map((e) => ({ datum: e.datum, betrag: e.betrag, verwendungszweck: e.verwendungszweck })),
      summen: {
        angefordertImZeitraum: summe(pruefung.anforderungen.filter((a) => a.imZeitraum).map((a) => money(a.betrag))).toFixed(2),
        eingegangenImZeitraum: summe(eingaenge.map((e) => money(e.betrag))).toFixed(2),
        angefordertBisEnde: bisEnde(v.anforderungen, "angefordertAm"),
        eingegangenBisEnde: bisEnde(v.eingaenge, "datum"),
      },
      feststellungen: pruefung.feststellungen,
      verstoesse: pruefung.verstoesse,
    };
  }
}
