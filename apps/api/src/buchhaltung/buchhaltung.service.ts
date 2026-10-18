import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { schema, type DbOderTx } from "@bt/db";
import { extfBuchungsstapel, journalAbgleich, journalSoll, kontierungFuer, money, type JournalIst, type JournalPosten, type JournalQuellen, type QuelleTyp } from "@bt/domain";
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { KontextService } from "../common/kontext.service.js";
import { protokollieren } from "../common/protokoll.js";
import { DB, type Db } from "../db.provider.js";

const {
  buchung: b,
  gesellschaft: g,
  projekt: p,
  kaufvertrag: kv,
  kaufvertragKaeufer: kk,
  zahlungsanforderung: zan,
  zahlungseingang: ze,
  eingangsrechnung: er,
  handwerkervertrag: hv,
  gewerk: gw,
  zahlungsausgang: za,
  bauabzugAnmeldung: ba,
  geschaeftspartner: gp,
} = schema;
const heute = () => new Date().toISOString().slice(0, 10);

export interface JournalFilter {
  von?: string;
  bis?: string;
  status?: "alle" | "neu" | "exportiert";
  quelle?: string;
}

@Injectable()
export class BuchhaltungService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
  ) {}

  async gesellschaft(id: string) {
    const [ges] = await this.db.select().from(g).where(and(eq(g.id, id), eq(g.mandantId, await this.kontext.mandantId())));
    if (!ges) throw new NotFoundException("Gesellschaft nicht gefunden");
    return ges;
  }

  /** Buchungsrelevante Vorgänge der Gesellschaft mit Personenkonto, Name und Kostenstelle; dazu die Verweise für Links. */
  async quellen(tx: DbOderTx, gesellschaftId: string) {
    const kostenstelle = sql<string>`coalesce(nullif(${p.kostenstelle}, ''), ${p.nr}::text)`;
    // Debitor: abweichender Rechnungsempfänger, sonst erster Käufer (niedrigste Partnernummer)
    const debitorId = sql<string | null>`coalesce(${kv.zahlungsanforderungAn}, (select ${kk.partnerId} from ${kk} join ${gp} on ${gp.id} = ${kk.partnerId} where ${kk.kaufvertragId} = ${kv.id} order by ${gp.nr} limit 1))`;
    const [anf, ein, rech, aus, abf] = await Promise.all([
      tx
        .select({ id: zan.id, rechnungsnr: zan.rechnungsnr, angefordertAm: zan.angefordertAm, betrag: zan.betrag, debitorId, kostenstelle, kaufvertragId: kv.id })
        .from(zan)
        .innerJoin(kv, eq(zan.kaufvertragId, kv.id))
        .innerJoin(p, eq(kv.projektId, p.id))
        .where(eq(p.gesellschaftId, gesellschaftId)),
      tx
        .select({ id: ze.id, datum: ze.datum, betrag: ze.betrag, rechnungsnr: zan.rechnungsnr, debitorId, kostenstelle, kaufvertragId: kv.id })
        .from(ze)
        .innerJoin(kv, eq(ze.kaufvertragId, kv.id))
        .innerJoin(p, eq(kv.projektId, p.id))
        .leftJoin(zan, eq(ze.zahlungsanforderungId, zan.id))
        .where(eq(p.gesellschaftId, gesellschaftId)),
      tx
        .select({ id: er.id, rechnungsnr: er.rechnungsnr, rechnungsdatum: er.rechnungsdatum, betrag: sql<string>`${er.pruefergebnis}->>'faellig'`, kreditorId: hv.handwerkerId, kostenstelle })
        .from(er)
        .innerJoin(hv, eq(er.handwerkervertragId, hv.id))
        .innerJoin(gw, eq(hv.gewerkId, gw.id))
        .innerJoin(p, eq(gw.projektId, p.id))
        .where(and(eq(p.gesellschaftId, gesellschaftId), inArray(er.status, ["freigegeben", "bezahlt"]), sql`${er.pruefergebnis}->>'faellig' is not null`)),
      tx
        .select({ id: za.id, datum: za.datum, betrag: za.betrag, skonto: za.skonto, bauabzugsteuer: za.bauabzugsteuer, rechnungsnr: er.rechnungsnr, kreditorId: hv.handwerkerId, kostenstelle, eingangsrechnungId: er.id })
        .from(za)
        .innerJoin(er, eq(za.eingangsrechnungId, er.id))
        .innerJoin(hv, eq(er.handwerkervertragId, hv.id))
        .innerJoin(gw, eq(hv.gewerkId, gw.id))
        .innerJoin(p, eq(gw.projektId, p.id))
        .where(eq(p.gesellschaftId, gesellschaftId)),
      tx
        .select({ id: ba.id, abgefuehrtAm: ba.abgefuehrtAm, abzugsbetrag: ba.abzugsbetrag, monat: ba.monat, handwerkerId: ba.handwerkerId })
        .from(ba)
        .where(and(eq(ba.gesellschaftId, gesellschaftId), isNotNull(ba.abgefuehrtAm))),
    ]);
    const partnerIds = [...new Set([...anf, ...ein].map((x) => x.debitorId).concat([...rech, ...aus].map((x) => x.kreditorId), abf.map((x) => x.handwerkerId)))].filter((x): x is string => !!x);
    const partner = new Map(
      (partnerIds.length ? await tx.select({ id: gp.id, nr: gp.nr, suchcode: gp.suchcode, firma: gp.firma, nachname: gp.nachname }).from(gp).where(inArray(gp.id, partnerIds)) : []).map((x) => [
        x.id,
        { nr: x.nr, name: x.firma || x.nachname || x.suchcode },
      ]),
    );
    // Vorgänge ohne Geschäftspartner (Vertrag ohne Käufer, Handwerkervertrag ohne Handwerker) können nicht gebucht werden
    const ohnePartner: { typ: QuelleTyp; id: string }[] = [];
    const mit = <T extends { id: string }>(liste: T[], typ: QuelleTyp, pid: (x: T) => string | null) =>
      liste.flatMap((x) => {
        const pa = pid(x) ? partner.get(pid(x)!) : undefined;
        if (!pa) {
          ohnePartner.push({ typ, id: x.id });
          return [];
        }
        return [{ ...x, partner: pa }];
      });
    const q: JournalQuellen = {
      anforderungen: mit(anf, "zahlungsanforderung", (x) => x.debitorId).map((x) => ({ ...x, debitorNr: x.partner.nr, name: x.partner.name })),
      eingaenge: mit(ein, "zahlungseingang", (x) => x.debitorId).map((x) => ({ ...x, debitorNr: x.partner.nr, name: x.partner.name })),
      rechnungen: mit(rech, "eingangsrechnung", (x) => x.kreditorId).map((x) => ({ ...x, kreditorNr: x.partner.nr, name: x.partner.name })),
      ausgaenge: mit(aus, "zahlungsausgang", (x) => x.kreditorId).map((x) => ({ ...x, kreditorNr: x.partner.nr, name: x.partner.name })),
      abfuehrungen: abf.map((x) => ({ id: x.id, abgefuehrtAm: x.abgefuehrtAm!, abzugsbetrag: x.abzugsbetrag, monat: x.monat, name: partner.get(x.handwerkerId)?.name ?? "" })),
    };
    const verweise = new Map<string, string>([
      ...ein.map((x) => [x.id, `/kaufvertraege/${x.kaufvertragId}`] as const),
      ...anf.map((x) => [x.id, `/zahlungsanforderungen/${x.id}`] as const),
      ...rech.map((x) => [x.id, `/eingangsrechnungen/${x.id}`] as const),
      ...aus.map((x) => [x.id, `/eingangsrechnungen/${x.eingangsrechnungId}`] as const),
      ...abf.map((x) => [x.id, "/bauabzug"] as const),
    ]);
    return { q, ohnePartner, verweise };
  }

  /**
   * Gleicht das Journal der Gesellschaft mit den Vorgängen ab (läuft vor jeder Anzeige und jedem Export).
   * Ein Advisory-Lock je Gesellschaft verhindert doppelte Buchungen bei gleichzeitigen Aufrufen.
   */
  async abgleichen(gesellschaftId: string, benutzer: string, stichtag = heute()) {
    const ges = await this.gesellschaft(gesellschaftId);
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`buchung:${gesellschaftId}`}))`);
      const { q, ohnePartner, verweise } = await this.quellen(tx, gesellschaftId);
      const soll = journalSoll(q, kontierungFuer(ges));
      const ist = (await tx
        .select({ id: b.id, quelleTyp: b.quelleTyp, quelleId: b.quelleId, belegdatum: b.belegdatum, belegnr: b.belegnr, konto: b.konto, gegenkonto: b.gegenkonto, betrag: b.betrag, sollHaben: b.sollHaben, steuerschluessel: b.steuerschluessel, buchungstext: b.buchungstext, kostenstelle: b.kostenstelle, exportiertAm: b.exportiertAm, stornoVon: b.stornoVon })
        .from(b)
        .where(eq(b.gesellschaftId, gesellschaftId))) as JournalIst[];
      const r = journalAbgleich(soll, ist, stichtag);
      const werte = (x: JournalPosten) => ({
        belegdatum: x.belegdatum,
        belegnr: x.belegnr,
        konto: x.konto,
        gegenkonto: x.gegenkonto,
        betrag: x.betrag,
        sollHaben: x.sollHaben,
        steuerschluessel: x.steuerschluessel,
        buchungstext: x.buchungstext,
        kostenstelle: x.kostenstelle,
      });
      if (r.loeschen.length) await tx.delete(b).where(and(inArray(b.id, r.loeschen), isNull(b.exportiertAm)));
      for (const a of r.aendern) await tx.update(b).set({ ...werte(a.werte), geaendertAm: new Date() }).where(and(eq(b.id, a.id), isNull(b.exportiertAm)));
      if (r.neu.length) await tx.insert(b).values(r.neu.map((n) => ({ ...werte(n), gesellschaftId, quelleTyp: n.quelleTyp, quelleId: n.quelleId, stornoVon: n.stornoVon ?? null })));
      const stand = { neu: r.neu.length - r.stornos, geaendert: r.aendern.length, geloescht: r.loeschen.length, storniert: r.stornos };
      if (r.neu.length || r.aendern.length || r.loeschen.length) await protokollieren(tx, { tabelle: "buchung", id: gesellschaftId, aktion: "update", neu: { abgleich: stand }, benutzer });
      return { ...stand, ohnePartner, verweise };
    });
  }

  /** Journal (nach Abgleich) mit Filter, Summen und Verweisen auf die Vorgänge. */
  async journal(gesellschaftId: string, f: JournalFilter, benutzer: string) {
    const ges = await this.gesellschaft(gesellschaftId);
    const abgleich = await this.abgleichen(gesellschaftId, benutzer);
    const bedingung = and(
      eq(b.gesellschaftId, gesellschaftId),
      f.von ? gte(b.belegdatum, f.von) : undefined,
      f.bis ? lte(b.belegdatum, f.bis) : undefined,
      f.status === "neu" ? isNull(b.exportiertAm) : f.status === "exportiert" ? isNotNull(b.exportiertAm) : undefined,
      f.quelle ? sql`split_part(${b.quelleTyp}, '.', 1) = ${f.quelle}` : undefined,
    );
    const zeilen = await this.db.select().from(b).where(bedingung).orderBy(asc(b.belegdatum), asc(b.angelegtAm)).limit(2000);
    const [summen] = await this.db
      .select({
        anzahl: sql<number>`count(*)::int`,
        neu: sql<number>`count(*) filter (where ${b.exportiertAm} is null)::int`,
        summeNeu: sql<string>`coalesce(sum(${b.betrag}) filter (where ${b.exportiertAm} is null), 0)`,
        stornos: sql<number>`count(*) filter (where ${b.stornoVon} is not null)::int`,
      })
      .from(b)
      .where(bedingung);
    const stornoVon = new Set(zeilen.filter((z) => z.stornoVon).map((z) => z.stornoVon!));
    const { verweise, ohnePartner, ...stand } = abgleich;
    return {
      gesellschaft: { id: ges.id, nr: ges.nr, name: ges.name, skr: ges.skr, sachkontenlaenge: ges.sachkontenlaenge, datevBereit: !!(ges.datevBeraternr && ges.datevMandantennr) },
      kontierung: kontierungFuer(ges),
      kontierungGespeichert: !!ges.kontierung,
      abgleich: stand,
      ohnePartner,
      summen: summen!,
      gekuerzt: zeilen.length === 2000,
      zeilen: zeilen.map((z) => ({ ...z, storniert: stornoVon.has(z.id), verweis: verweise.get(z.quelleId) ?? null })),
    };
  }

  /** DATEV-Buchungsstapel (EXTF) erzeugen; die enthaltenen Buchungen werden als exportiert festgeschrieben. */
  async exportieren(e: { gesellschaftId: string; von: string; bis: string; nurNeue: boolean }, benutzer: string) {
    const ges = await this.gesellschaft(e.gesellschaftId);
    if (!ges.datevBeraternr || !ges.datevMandantennr) throw new ConflictException("Bitte zuerst DATEV-Berater- und Mandantennummer bei der Gesellschaft eintragen.");
    await this.abgleichen(e.gesellschaftId, benutzer);
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`buchung:${e.gesellschaftId}`}))`);
      const zeilen = await tx
        .select()
        .from(b)
        .where(and(eq(b.gesellschaftId, e.gesellschaftId), gte(b.belegdatum, e.von), lte(b.belegdatum, e.bis), e.nurNeue ? isNull(b.exportiertAm) : undefined))
        .orderBy(asc(b.belegdatum), asc(b.angelegtAm));
      if (!zeilen.length) throw new ConflictException(e.nurNeue ? "Im Zeitraum gibt es keine noch nicht exportierten Buchungen." : "Im Zeitraum gibt es keine Buchungen.");
      const jetzt = new Date();
      const stapel = `EXTF-${jetzt.toISOString().slice(0, 19).replace(/[-:T]/g, "")}`;
      const datei = extfBuchungsstapel(
        {
          beraternummer: ges.datevBeraternr!,
          mandantennummer: ges.datevMandantennr!,
          wjBeginn: new Date(`${e.von.slice(0, 4)}-01-01T00:00:00`),
          sachkontenlaenge: ges.sachkontenlaenge ?? 4,
          datumVon: new Date(`${e.von}T00:00:00`),
          datumBis: new Date(`${e.bis}T00:00:00`),
          bezeichnung: `Bauträger ${e.von.slice(5)}–${e.bis.slice(5)}`,
          skr: ges.skr ?? "03",
          erzeugtAm: jetzt,
        },
        zeilen.map((z) => ({
          umsatz: money(z.betrag),
          sollHaben: z.sollHaben,
          konto: z.konto,
          gegenkonto: z.gegenkonto,
          buSchluessel: z.steuerschluessel ?? undefined,
          belegdatum: new Date(`${z.belegdatum}T00:00:00`),
          belegfeld1: z.belegnr ?? undefined,
          buchungstext: z.buchungstext ?? undefined,
          kost1: z.kostenstelle ?? undefined,
        })),
      );
      const neu = zeilen.filter((z) => !z.exportiertAm).map((z) => z.id);
      if (neu.length) await tx.update(b).set({ exportiertAm: jetzt, exportStapel: stapel }).where(inArray(b.id, neu));
      await protokollieren(tx, { tabelle: "buchung", id: e.gesellschaftId, aktion: "update", neu: { export: stapel, von: e.von, bis: e.bis, buchungen: zeilen.length, festgeschrieben: neu.length }, benutzer });
      return { datei, dateiname: `${stapel}_${ges.nr}_${e.von}_${e.bis}.csv`, anzahl: zeilen.length };
    });
  }
}
