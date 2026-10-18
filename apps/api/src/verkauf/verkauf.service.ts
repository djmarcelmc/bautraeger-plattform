import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { schema, type DbOderTx } from "@bt/db";
import {
  fertigeAbschnitteFuerVertrag,
  money,
  offen,
  ratenStatus,
  summe,
  type MabvAbschnitt,
  type RatenStatus,
} from "@bt/domain";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { KontextService } from "../common/kontext.service.js";
import { DB, type Db } from "../db.provider.js";

const { kaufvertrag: k, projekt: p, gesellschaft: g } = schema;

@Injectable()
export class VerkaufService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
  ) {}

  /** Zieht die nächste fortlaufende Nummer (atomar per Upsert). */
  async nummerZiehen(tx: DbOderTx, gesellschaftId: string, art: string, jahr: number): Promise<number> {
    const [r] = await tx
      .insert(schema.nummernkreis)
      .values({ gesellschaftId, art, jahr, letzte: 1 })
      .onConflictDoUpdate({
        target: [schema.nummernkreis.gesellschaftId, schema.nummernkreis.art, schema.nummernkreis.jahr],
        set: { letzte: sql`${schema.nummernkreis.letzte} + 1` },
      })
      .returning({ letzte: schema.nummernkreis.letzte });
    return r!.letzte;
  }

  /** Projekt inkl. Gesellschaft, sofern es zum Mandanten gehört. */
  async projekt(projektId: string) {
    const [r] = await this.db
      .select({ projekt: p, gesellschaft: g })
      .from(p)
      .innerJoin(g, eq(p.gesellschaftId, g.id))
      .where(and(eq(p.id, projektId), eq(g.mandantId, await this.kontext.mandantId())));
    if (!r) throw new NotFoundException("Projekt nicht gefunden");
    return r;
  }

  /** Vollständige Sicht auf einen Kaufvertrag inkl. Ratenstatus und Summen. */
  async vertrag(id: string, db: DbOderTx = this.db) {
    const [kopf] = await db
      .select({ vertrag: k, projekt: { id: p.id, nr: p.nr, suchcode: p.suchcode, strasse: p.strasse, plz: p.plz, ort: p.ort }, gesellschaft: g })
      .from(k)
      .innerJoin(p, eq(k.projektId, p.id))
      .innerJoin(g, eq(p.gesellschaftId, g.id))
      .where(and(eq(k.id, id), eq(g.mandantId, await this.kontext.mandantId())));
    if (!kopf) throw new NotFoundException("Kaufvertrag nicht gefunden");

    const [kaeufer, einheiten, raten, anforderungen, eingaenge, mahnungen] = await Promise.all([
      db
        .select({ partner: schema.geschaeftspartner, anteilProzent: schema.kaufvertragKaeufer.anteilProzent })
        .from(schema.kaufvertragKaeufer)
        .innerJoin(schema.geschaeftspartner, eq(schema.kaufvertragKaeufer.partnerId, schema.geschaeftspartner.id))
        .where(eq(schema.kaufvertragKaeufer.kaufvertragId, id)),
      db
        .select({ id: schema.einheit.id, nr: schema.einheit.nr, typ: schema.einheit.typ, art: schema.einheit.art, wohnflaeche: schema.einheit.wohnflaeche, vkBrutto: schema.kaufvertragEinheit.vkBrutto })
        .from(schema.kaufvertragEinheit)
        .innerJoin(schema.einheit, eq(schema.kaufvertragEinheit.einheitId, schema.einheit.id))
        .where(eq(schema.kaufvertragEinheit.kaufvertragId, id))
        .orderBy(asc(schema.einheit.nr)),
      db.select().from(schema.rate).where(eq(schema.rate.kaufvertragId, id)).orderBy(asc(schema.rate.nr)),
      db.select().from(schema.zahlungsanforderung).where(eq(schema.zahlungsanforderung.kaufvertragId, id)).orderBy(asc(schema.zahlungsanforderung.angefordertAm)),
      db.select().from(schema.zahlungseingang).where(eq(schema.zahlungseingang.kaufvertragId, id)).orderBy(asc(schema.zahlungseingang.datum)),
      db
        .select({ mahnung: schema.mahnung })
        .from(schema.mahnung)
        .innerJoin(schema.zahlungsanforderung, eq(schema.mahnung.zahlungsanforderungId, schema.zahlungsanforderung.id))
        .where(eq(schema.zahlungsanforderung.kaufvertragId, id))
        .orderBy(asc(schema.mahnung.datum)),
    ]);

    const meldungen = einheiten.length
      ? await db
          .select({ einheitId: schema.bautenstand.einheitId, abschnitt: schema.bautenstand.abschnitt, fertigAm: schema.bautenstand.fertigAm })
          .from(schema.bautenstand)
          .where(inArray(schema.bautenstand.einheitId, einheiten.map((e) => e.id)))
      : [];
    const fertig = fertigeAbschnitteFuerVertrag(einheiten, meldungen);
    const v = kopf.vertrag;
    const voraussetzungen = {
      vertragWirksam: v.vertragWirksam,
      vormerkungEingetragen: !!v.vormerkungEingetragenAm,
      lastenfreistellungGesichert: v.lastenfreistellungGesichert,
      buergschaftNach7: v.buergschaftNach7,
    };
    const voraussetzungenErfuellt =
      !v.anforderungssperre &&
      (v.buergschaftNach7 || (voraussetzungen.vertragWirksam && voraussetzungen.vormerkungEingetragen && voraussetzungen.lastenfreistellungGesichert));

    // Zahlungen werden je Anforderung den enthaltenen Raten in Reihenfolge zugeordnet
    const bezahltJeAnforderung = new Map<string, ReturnType<typeof money>>();
    for (const e of eingaenge)
      if (e.zahlungsanforderungId)
        bezahltJeAnforderung.set(e.zahlungsanforderungId, (bezahltJeAnforderung.get(e.zahlungsanforderungId) ?? money(0)).plus(e.betrag));
    const restJeAnforderung = new Map(bezahltJeAnforderung);

    const ratenMitStatus = raten.map((r) => {
      const betrag = money(r.betrag);
      let bezahlt = money(0);
      if (r.zahlungsanforderungId) {
        const rest = restJeAnforderung.get(r.zahlungsanforderungId) ?? money(0);
        bezahlt = rest.gte(betrag) ? betrag : rest;
        restJeAnforderung.set(r.zahlungsanforderungId, rest.minus(bezahlt));
      }
      const abschnitteFertig = r.abschnitte.length > 0 && r.abschnitte.every((a) => fertig.has(a as MabvAbschnitt));
      const status: RatenStatus = ratenStatus({
        angefordert: !!r.zahlungsanforderungId,
        betrag,
        bezahlt,
        abschnitteFertig: r.typ === "mabv" ? abschnitteFertig : true,
        voraussetzungenErfuellt,
      });
      const anf = anforderungen.find((a) => a.id === r.zahlungsanforderungId);
      return { ...r, bezahlt: bezahlt.toFixed(2), status, rechnungsnr: anf?.rechnungsnr ?? null, faelligAm: anf?.faelligAm ?? null };
    });

    const heute = new Date().toISOString().slice(0, 10);
    const anforderungenMitStand = anforderungen.map((a) => {
      const bezahlt = bezahltJeAnforderung.get(a.id) ?? money(0);
      const o = offen(money(a.betrag), bezahlt);
      return {
        ...a,
        bezahlt: bezahlt.toFixed(2),
        offen: o.toFixed(2),
        ueberfaellig: o.gt(0) && a.faelligAm < heute,
        raten: ratenMitStatus.filter((r) => r.zahlungsanforderungId === a.id).map((r) => r.nr),
        mahnungen: mahnungen.map((x) => x.mahnung).filter((x) => x.zahlungsanforderungId === a.id),
      };
    });

    const vertragssumme = summe(einheiten.map((e) => money(e.vkBrutto)));
    const angefordert = summe(anforderungen.map((a) => money(a.betrag)));
    const bezahlt = summe(eingaenge.map((e) => money(e.betrag)));
    return {
      ...v,
      projekt: kopf.projekt,
      gesellschaft: { id: kopf.gesellschaft.id, nr: kopf.gesellschaft.nr, name: kopf.gesellschaft.name, anschrift: kopf.gesellschaft.anschrift },
      kaeufer: kaeufer.map((x) => ({ ...x.partner, anteilProzent: x.anteilProzent })),
      einheiten,
      raten: ratenMitStatus,
      anforderungen: anforderungenMitStand,
      eingaenge,
      bautenstand: meldungen,
      fertigeAbschnitte: [...fertig],
      voraussetzungen: { ...voraussetzungen, erfuellt: voraussetzungenErfuellt, anforderungssperre: v.anforderungssperre },
      summen: {
        vertragssumme: vertragssumme.toFixed(2),
        angefordert: angefordert.toFixed(2),
        bezahlt: bezahlt.toFixed(2),
        offen: offen(angefordert, bezahlt).toFixed(2),
        nichtAngefordert: vertragssumme.minus(angefordert).toFixed(2),
      },
    };
  }
}

export type VertragDetail = Awaited<ReturnType<VerkaufService["vertrag"]>>;
