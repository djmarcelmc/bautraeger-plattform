import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { schema, type DbOderTx } from "@bt/db";
import { datevSaldenLesen, extfBuchungsstapel, journalAbgleich, journalSoll, kontensalden, kontierungFuer, money, offenePosten, saldenAbgleich, summe, type JournalIst, type JournalPosten, type JournalQuellen, type QuelleTyp } from "@bt/domain";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
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
    const [anf, ein, rech, aus, abf, ueb] = await Promise.all([
      tx
        .select({ id: zan.id, rechnungsnr: zan.rechnungsnr, angefordertAm: zan.angefordertAm, betrag: zan.betrag, debitorId, kostenstelle, kaufvertragId: kv.id })
        .from(zan)
        .innerJoin(kv, eq(zan.kaufvertragId, kv.id))
        .innerJoin(p, eq(kv.projektId, p.id))
        .where(eq(p.gesellschaftId, gesellschaftId)),
      tx
        .select({ id: ze.id, zahlungsanforderungId: ze.zahlungsanforderungId, datum: ze.datum, betrag: ze.betrag, rechnungsnr: zan.rechnungsnr, debitorId, kostenstelle, kaufvertragId: kv.id })
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
      tx
        .select({ id: kv.id, nr: kv.nr, datum: sql<string>`to_char(${kv.uebergabeIst} at time zone 'Europe/Berlin', 'YYYY-MM-DD')`, debitorId, kostenstelle })
        .from(kv)
        .innerJoin(p, eq(kv.projektId, p.id))
        .where(and(eq(p.gesellschaftId, gesellschaftId), isNotNull(kv.uebergabeIst))),
    ]);
    const partnerIds = [...new Set([...anf, ...ein, ...ueb].map((x) => x.debitorId).concat([...rech, ...aus].map((x) => x.kreditorId), abf.map((x) => x.handwerkerId)))].filter((x): x is string => !!x);
    const partner = new Map(
      (partnerIds.length ? await tx.select({ id: gp.id, nr: gp.nr, suchcode: gp.suchcode, firma: gp.firma, nachname: gp.nachname, debitorKonto: gp.debitorKonto, kreditorKonto: gp.kreditorKonto }).from(gp).where(inArray(gp.id, partnerIds)) : []).map((x) => [
        x.id,
        { nr: x.nr, name: x.firma || x.nachname || x.suchcode, debitorKonto: x.debitorKonto, kreditorKonto: x.kreditorKonto },
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
      anforderungen: mit(anf, "zahlungsanforderung", (x) => x.debitorId).map((x) => ({ ...x, debitorNr: x.partner.nr, debitorKonto: x.partner.debitorKonto, name: x.partner.name })),
      uebergaben: mit(ueb, "uebergabe", (x) => x.debitorId).map((x) => ({ kaufvertragId: x.id, datum: x.datum, vertragNr: x.nr, name: x.partner.name, kostenstelle: x.kostenstelle })),
      eingaenge: mit(ein, "zahlungseingang", (x) => x.debitorId).map((x) => ({ ...x, debitorNr: x.partner.nr, debitorKonto: x.partner.debitorKonto, name: x.partner.name })),
      rechnungen: mit(rech, "eingangsrechnung", (x) => x.kreditorId).map((x) => ({ ...x, kreditorNr: x.partner.nr, kreditorKonto: x.partner.kreditorKonto, name: x.partner.name })),
      ausgaenge: mit(aus, "zahlungsausgang", (x) => x.kreditorId).map((x) => ({ ...x, kreditorNr: x.partner.nr, kreditorKonto: x.partner.kreditorKonto, name: x.partner.name })),
      abfuehrungen: abf.map((x) => ({ id: x.id, abgefuehrtAm: x.abgefuehrtAm!, abzugsbetrag: x.abzugsbetrag, monat: x.monat, name: partner.get(x.handwerkerId)?.name ?? "" })),
    };
    const verweise = new Map<string, string>([
      ...ein.map((x) => [x.id, `/kaufvertraege/${x.kaufvertragId}`] as const),
      ...ueb.map((x) => [x.id, `/kaufvertraege/${x.id}`] as const),
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

  /**
   * Saldenliste der Personenkonten zum Stichtag: Journal-Saldo, offene Posten aus Verkauf/Kosten und optional der
   * Saldo aus einer DATEV-Saldenliste (CSV). Vorher wird das Journal abgeglichen.
   */
  async saldenliste(gesellschaftId: string, stichtag: string, benutzer: string, datevDatei?: Uint8Array) {
    const ges = await this.gesellschaft(gesellschaftId);
    await this.abgleichen(gesellschaftId, benutzer);
    const k = kontierungFuer(ges);
    const [{ q }, buchungen] = await Promise.all([
      this.quellen(this.db, gesellschaftId),
      this.db.select({ konto: b.konto, gegenkonto: b.gegenkonto, betrag: b.betrag, sollHaben: b.sollHaben, belegdatum: b.belegdatum }).from(b).where(and(eq(b.gesellschaftId, gesellschaftId), lte(b.belegdatum, stichtag))),
    ]);
    const datev = datevDatei ? datevSaldenLesen(datevDatei) : null;
    if (datev?.fehler) throw new BadRequestException(`DATEV-Saldenliste: ${datev.fehler}`);
    const namen = new Map<string, string>(datev?.namen ?? []);
    const posten = offenePosten(q, k, stichtag);
    for (const p of posten) namen.set(p.konto, p.name);
    const zeilen = saldenAbgleich(kontensalden(buchungen, stichtag), posten, { sachkontenlaenge: ges.sachkontenlaenge ?? 4, kreditorBasis: k.kreditorBasis, namen, datev: datev?.salden });
    const sum = (f: (z: (typeof zeilen)[number]) => string | null, art: string) => summe(zeilen.filter((z) => z.art === art).map((z) => money(f(z) ?? "0"))).toFixed(2);
    return {
      gesellschaft: { id: ges.id, nr: ges.nr, name: ges.name },
      stichtag,
      mitDatev: !!datev,
      zeilen,
      summen: Object.fromEntries(
        (["debitor", "kreditor"] as const).map((art) => [art, { journal: sum((z) => z.journal, art), op: sum((z) => z.op, art), datev: datev ? sum((z) => z.datev, art) : null, abweichungen: zeilen.filter((z) => z.art === art && (!money(z.differenzOp).isZero() || (z.differenzDatev !== null && !money(z.differenzDatev).isZero()))).length }]),
      ),
    };
  }

  /** Wie viele Buchungen wären nach dem Abgleich noch nicht exportiert? (nur lesend, z. B. fürs Cockpit) */
  async nichtExportiert(gesellschaftId: string, stichtag = heute()) {
    const ges = await this.gesellschaft(gesellschaftId);
    const { q } = await this.quellen(this.db, gesellschaftId);
    const ist = (await this.db
      .select({ id: b.id, quelleTyp: b.quelleTyp, quelleId: b.quelleId, belegdatum: b.belegdatum, belegnr: b.belegnr, konto: b.konto, gegenkonto: b.gegenkonto, betrag: b.betrag, sollHaben: b.sollHaben, steuerschluessel: b.steuerschluessel, buchungstext: b.buchungstext, kostenstelle: b.kostenstelle, exportiertAm: b.exportiertAm, stornoVon: b.stornoVon })
      .from(b)
      .where(eq(b.gesellschaftId, gesellschaftId))) as JournalIst[];
    const r = journalAbgleich(journalSoll(q, kontierungFuer(ges)), ist, stichtag);
    const weg = new Set([...r.loeschen, ...r.aendern.map((x) => x.id)]);
    const daten = [...ist.filter((x) => !x.exportiertAm && !weg.has(x.id)).map((x) => x.belegdatum), ...r.aendern.map((x) => x.werte.belegdatum), ...r.neu.map((x) => x.belegdatum)].sort();
    return { anzahl: daten.length, aeltestes: daten[0] ?? null, datevBereit: !!(ges.datevBeraternr && ges.datevMandantennr) };
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

  private extfDatei(ges: typeof g.$inferSelect, zeilen: (typeof b.$inferSelect)[], von: string, bis: string, erzeugtAm: Date) {
    return extfBuchungsstapel(
      {
        beraternummer: ges.datevBeraternr!,
        mandantennummer: ges.datevMandantennr!,
        wjBeginn: new Date(`${von.slice(0, 4)}-01-01T00:00:00`),
        sachkontenlaenge: ges.sachkontenlaenge ?? 4,
        datumVon: new Date(`${von}T00:00:00`),
        datumBis: new Date(`${bis}T00:00:00`),
        bezeichnung: `Bauträger ${von.slice(5)}–${bis.slice(5)}`,
        skr: ges.skr ?? "03",
        erzeugtAm,
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
      const datei = this.extfDatei(ges, zeilen, e.von, e.bis, jetzt);
      const neu = zeilen.filter((z) => !z.exportiertAm).map((z) => z.id);
      if (neu.length) await tx.update(b).set({ exportiertAm: jetzt, exportStapel: stapel }).where(inArray(b.id, neu));
      await protokollieren(tx, { tabelle: "buchung", id: e.gesellschaftId, aktion: "update", neu: { export: stapel, von: e.von, bis: e.bis, buchungen: zeilen.length, festgeschrieben: neu.length }, benutzer });
      return { datei, stapel, dateiname: `${stapel}_${ges.nr}_${e.von}_${e.bis}.csv`, anzahl: zeilen.length, buchungIds: zeilen.map((z) => z.id) };
    });
  }

  /** Bisherige Exporte (Stapel) einer Gesellschaft. */
  async stapelListe(gesellschaftId: string) {
    await this.gesellschaft(gesellschaftId);
    return this.db
      .select({
        stapel: sql<string>`${b.exportStapel}`,
        exportiertAm: sql<string>`max(${b.exportiertAm})`,
        anzahl: sql<number>`count(*)::int`,
        von: sql<string>`min(${b.belegdatum})::text`,
        bis: sql<string>`max(${b.belegdatum})::text`,
      })
      .from(b)
      .where(and(eq(b.gesellschaftId, gesellschaftId), sql`${b.exportStapel} is not null`))
      .groupBy(b.exportStapel)
      .orderBy(desc(sql`max(${b.exportiertAm})`))
      .limit(24);
  }

  /** Stapel erneut erzeugen (gleiche Buchungen, keine neue Festschreibung). */
  async stapelErneut(gesellschaftId: string, stapel: string) {
    const ges = await this.gesellschaft(gesellschaftId);
    if (!ges.datevBeraternr || !ges.datevMandantennr) throw new ConflictException("Bitte zuerst DATEV-Berater- und Mandantennummer bei der Gesellschaft eintragen.");
    const zeilen = await this.db.select().from(b).where(and(eq(b.gesellschaftId, gesellschaftId), eq(b.exportStapel, stapel))).orderBy(asc(b.belegdatum), asc(b.angelegtAm));
    if (!zeilen.length) throw new NotFoundException("Exportstapel nicht gefunden");
    const von = zeilen[0]!.belegdatum;
    const bis = zeilen[zeilen.length - 1]!.belegdatum;
    const datei = this.extfDatei(ges, zeilen, von, bis, zeilen[0]!.exportiertAm ?? new Date());
    return { datei, stapel, dateiname: `${stapel}_${ges.nr}_${von}_${bis}.csv`, anzahl: zeilen.length, buchungIds: zeilen.map((z) => z.id) };
  }

  /**
   * Belege zu Buchungen: gespeicherte Dateien (versandte Zahlungsanforderung, Rechnungsscans an der Eingangsrechnung)
   * und Seiten, aus denen das PDF erzeugt werden kann (Zahlungsanforderung, Bauabzug-Abrechnungsbeleg).
   * Je Belegnummer ein Eintrag; Zahlungseingänge und Übergaben haben keinen eigenen Beleg (Kontoauszug bzw. Protokoll).
   */
  async belege(gesellschaftId: string, buchungIds: string[]) {
    await this.gesellschaft(gesellschaftId);
    if (!buchungIds.length) return [];
    const zeilen = await this.db.select().from(b).where(and(eq(b.gesellschaftId, gesellschaftId), inArray(b.id, buchungIds), isNull(b.stornoVon))).orderBy(asc(b.belegdatum));
    const art = (q: string) => q.split(".")[0]!;
    const zaIds = [...new Set(zeilen.filter((z) => art(z.quelleTyp) === "zahlungsanforderung").map((z) => z.quelleId))];
    const ausgangIds = [...new Set(zeilen.filter((z) => art(z.quelleTyp) === "zahlungsausgang").map((z) => z.quelleId))];
    const abfIds = [...new Set(zeilen.filter((z) => z.quelleTyp === "bauabzug_abfuehrung").map((z) => z.quelleId))];
    const [ausgaenge, anmeldungen, versandt] = await Promise.all([
      ausgangIds.length ? this.db.select({ id: za.id, rechnungId: za.eingangsrechnungId }).from(za).where(inArray(za.id, ausgangIds)) : [],
      abfIds.length ? this.db.select().from(ba).where(inArray(ba.id, abfIds)) : [],
      zaIds.length
        ? this.db
            .select({ bezugId: schema.nachricht.bezugId, anhaenge: schema.nachricht.anhaenge, angelegtAm: schema.nachricht.angelegtAm })
            .from(schema.nachricht)
            .where(and(eq(schema.nachricht.anlass, "schreiben_zahlungsanforderung"), inArray(schema.nachricht.bezugId, zaIds)))
            .orderBy(desc(schema.nachricht.angelegtAm))
        : [],
    ]);
    const rechnungVon = new Map(ausgaenge.map((x) => [x.id, x.rechnungId]));
    const rechnungIds = [...new Set([...zeilen.filter((z) => z.quelleTyp === "eingangsrechnung").map((z) => z.quelleId), ...ausgaenge.map((x) => x.rechnungId)])];
    const versandDok = new Map<string, string>();
    for (const n of versandt) if (n.bezugId && !versandDok.has(n.bezugId) && n.anhaenge[0]) versandDok.set(n.bezugId, n.anhaenge[0].dokumentId);
    const dokIds = [...versandDok.values()];
    const dokumente = await this.db
      .select({ id: schema.dokument.id, objektTyp: schema.dokument.objektTyp, objektId: schema.dokument.objektId, dateiname: schema.dokument.dateiname, mimeType: schema.dokument.mimeType })
      .from(schema.dokument)
      .where(
        and(
          isNull(schema.dokument.geloeschtAm),
          eq(schema.dokument.mandantId, await this.kontext.mandantId()),
          sql`(${rechnungIds.length ? sql`(${schema.dokument.objektTyp} = 'eingangsrechnung' and ${inArray(schema.dokument.objektId, rechnungIds)})` : sql`false`} or ${dokIds.length ? inArray(schema.dokument.id, dokIds) : sql`false`})`,
        ),
      )
      .orderBy(asc(schema.dokument.angelegtAm));
    type Beleg = { belegnr: string; art: string; id: string; datum: string; betrag: string; text: string; dokumente: { id: string; dateiname: string; mimeType: string | null }[]; pfad: string | null };
    const belege = new Map<string, Beleg>();
    for (const z of zeilen) {
      const a = art(z.quelleTyp);
      let beleg: Omit<Beleg, "belegnr" | "datum" | "betrag" | "text"> | null = null;
      if (a === "zahlungsanforderung") {
        const d = dokumente.find((x) => x.id === versandDok.get(z.quelleId));
        beleg = { art: "Zahlungsanforderung", id: z.quelleId, dokumente: d ? [d] : [], pfad: d ? null : `/zahlungsanforderungen/${z.quelleId}` };
      } else if (a === "eingangsrechnung" || a === "zahlungsausgang") {
        const rid = a === "eingangsrechnung" ? z.quelleId : rechnungVon.get(z.quelleId);
        if (rid) beleg = { art: "Eingangsrechnung", id: rid, dokumente: dokumente.filter((x) => x.objektTyp === "eingangsrechnung" && x.objektId === rid), pfad: null };
      } else if (z.quelleTyp === "bauabzug_abfuehrung") {
        const an = anmeldungen.find((x) => x.id === z.quelleId);
        if (an) beleg = { art: "Bauabzugsteuer-Abrechnungsbeleg", id: an.id, dokumente: [], pfad: `/bauabzug/beleg?gesellschaftId=${an.gesellschaftId}&handwerkerId=${an.handwerkerId}&monat=${an.monat}` };
      }
      if (!beleg) continue;
      const nr = z.belegnr ?? beleg.id.slice(0, 8);
      const key = `${beleg.art}|${beleg.id}`;
      if (!belege.has(key)) belege.set(key, { ...beleg, belegnr: nr, datum: z.belegdatum, betrag: z.betrag, text: z.buchungstext ?? "" });
    }
    return [...belege.values()];
  }
}
