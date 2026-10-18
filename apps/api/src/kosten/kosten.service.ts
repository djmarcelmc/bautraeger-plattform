import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { schema, type DbOderTx } from "@bt/db";
import {
  auftragsrahmen,
  type EingangsrechnungEingabe,
  freistellungGueltig,
  kostenstand,
  kostenstandSumme,
  money,
  pruefkette,
  skontoMoeglich,
  summe,
  umlagenSumme,
  datumPlusTage,
  type VertragKosten,
} from "@bt/domain";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { KontextService } from "../common/kontext.service.js";
import { protokollieren } from "../common/protokoll.js";
import { DB, type Db } from "../db.provider.js";

const { gewerk: gw, handwerkervertrag: hv, projekt: p, gesellschaft: g, eingangsrechnung: er, zahlungsausgang: za, nachtrag: nt } = schema;

const heute = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class KostenService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
  ) {}

  async gewerk(id: string) {
    const [r] = await this.db
      .select({ gewerk: gw, projekt: { id: p.id, nr: p.nr, suchcode: p.suchcode } })
      .from(gw)
      .innerJoin(p, eq(gw.projektId, p.id))
      .innerJoin(g, eq(p.gesellschaftId, g.id))
      .where(and(eq(gw.id, id), eq(g.mandantId, await this.kontext.mandantId())));
    if (!r) throw new NotFoundException("Gewerk nicht gefunden");
    return r;
  }

  /** Kennzahlen je Vertrag für die Kostenkontrolle. */
  async vertragsKennzahlen(vertragIds: string[], db: DbOderTx = this.db) {
    if (!vertragIds.length) return new Map<string, VertragKosten & { offeneRechnungen: number }>();
    const [nachtraege, rechnungen, zahlungen] = await Promise.all([
      db.select().from(nt).where(inArray(nt.handwerkervertragId, vertragIds)),
      db.select().from(er).where(inArray(er.handwerkervertragId, vertragIds)).orderBy(asc(er.eingangAm), asc(er.angelegtAm)),
      db
        .select({ vertragId: er.handwerkervertragId, betrag: za.betrag, skonto: za.skonto, bauabzugsteuer: za.bauabzugsteuer })
        .from(za)
        .innerJoin(er, eq(za.eingangsrechnungId, er.id))
        .where(inArray(er.handwerkervertragId, vertragIds)),
    ]);
    const m = new Map<string, VertragKosten & { offeneRechnungen: number }>();
    for (const id of vertragIds) {
      const r = rechnungen.filter((x) => x.handwerkervertragId === id);
      const geprueft = r.filter((x) => x.geprueftKumuliert !== null);
      m.set(id, {
        vertragBrutto: "0",
        nachtraege: nachtraege.filter((x) => x.handwerkervertragId === id),
        berechnet: geprueft.at(-1)?.geprueftKumuliert ?? "0",
        abgegolten: summe(
          zahlungen.filter((z) => z.vertragId === id).map((z) => money(z.betrag).plus(z.skonto).plus(z.bauabzugsteuer)),
        ).toFixed(2),
        offeneRechnungen: r.filter((x) => x.status !== "bezahlt").length,
      });
    }
    return m;
  }

  /** Kostenkontrolle eines Projekts: je Gewerk Schätzung, Vergabe, Nachträge, berechnet, bezahlt, Trend. */
  async kostenkontrolle(projektId: string) {
    const gewerke = await this.db.select().from(gw).where(eq(gw.projektId, projektId)).orderBy(asc(gw.nr));
    const vertraege = gewerke.length
      ? await this.db
          .select({ vertrag: hv, handwerker: { id: schema.geschaeftspartner.id, suchcode: schema.geschaeftspartner.suchcode, firma: schema.geschaeftspartner.firma, nachname: schema.geschaeftspartner.nachname } })
          .from(hv)
          .leftJoin(schema.geschaeftspartner, eq(hv.handwerkerId, schema.geschaeftspartner.id))
          .where(inArray(hv.gewerkId, gewerke.map((x) => x.id)))
      : [];
    const kennzahlen = await this.vertragsKennzahlen(vertraege.map((v) => v.vertrag.id));
    const zeilen = gewerke.map((x) => {
      const eigene = vertraege.filter((v) => v.vertrag.gewerkId === x.id);
      const stand = kostenstand(
        x.geschaetztBrutto,
        eigene.map((v) => ({ ...kennzahlen.get(v.vertrag.id)!, vertragBrutto: v.vertrag.vertragBrutto })),
      );
      return {
        ...x,
        stand,
        vertraege: eigene.map((v) => ({
          id: v.vertrag.id,
          nrIntern: v.vertrag.nrIntern,
          vertragBrutto: v.vertrag.vertragBrutto,
          handwerker: v.handwerker,
          offeneRechnungen: kennzahlen.get(v.vertrag.id)!.offeneRechnungen,
        })),
      };
    });
    return { gewerke: zeilen, summe: kostenstandSumme(zeilen.map((z) => z.stand)) };
  }

  /** Vertrag mit Gewerk, Handwerker, Nachträgen, Rechnungen, Zahlungen und Summen. */
  async vertrag(id: string, db: DbOderTx = this.db) {
    const [r] = await db
      .select({ vertrag: hv, gewerk: gw, projekt: { id: p.id, nr: p.nr, suchcode: p.suchcode }, handwerker: schema.geschaeftspartner })
      .from(hv)
      .innerJoin(gw, eq(hv.gewerkId, gw.id))
      .innerJoin(p, eq(gw.projektId, p.id))
      .innerJoin(g, eq(p.gesellschaftId, g.id))
      .leftJoin(schema.geschaeftspartner, eq(hv.handwerkerId, schema.geschaeftspartner.id))
      .where(and(eq(hv.id, id), eq(g.mandantId, await this.kontext.mandantId())));
    if (!r) throw new NotFoundException("Handwerkervertrag nicht gefunden");
    const [nachtraege, rechnungen, zahlungen] = await Promise.all([
      db.select().from(nt).where(eq(nt.handwerkervertragId, id)).orderBy(asc(nt.nr)),
      db.select().from(er).where(eq(er.handwerkervertragId, id)).orderBy(asc(er.eingangAm), asc(er.angelegtAm)),
      db
        .select({ zahlung: za, rechnungsnr: er.rechnungsnr })
        .from(za)
        .innerJoin(er, eq(za.eingangsrechnungId, er.id))
        .where(eq(er.handwerkervertragId, id))
        .orderBy(asc(za.datum)),
    ]);
    const k = (await this.vertragsKennzahlen([id], db)).get(id)!;
    const [maengel] = await db
      .select({
        offen: sql<number>`count(*) filter (where ${schema.mangel.erledigtAm} is null)::int`,
        einbehalt: sql<string>`coalesce(sum(${schema.mangel.wertHandwerkerBrutto}) filter (where ${schema.mangel.erledigtAm} is null and ${schema.mangel.einbehalt}), 0)::text`,
      })
      .from(schema.mangel)
      .where(eq(schema.mangel.handwerkervertragId, id));
    const stand = kostenstand("0", [{ ...k, vertragBrutto: r.vertrag.vertragBrutto }]);
    const ausgezahlt = summe(zahlungen.map((z) => money(z.zahlung.betrag)));
    const bauabzug = summe(zahlungen.map((z) => money(z.zahlung.bauabzugsteuer)));
    const skonto = summe(zahlungen.map((z) => money(z.zahlung.skonto)));
    return {
      ...r.vertrag,
      gewerk: r.gewerk,
      projekt: r.projekt,
      handwerker: r.handwerker,
      nachtraege,
      rechnungen,
      zahlungen: zahlungen.map((z) => ({ ...z.zahlung, rechnungsnr: z.rechnungsnr })),
      maengel: { offen: maengel?.offen ?? 0, einbehalt: maengel?.einbehalt ?? "0" },
      summen: {
        vertrag: stand.vergeben,
        nachtraege: stand.nachtraege,
        auftrag: stand.summeVergeben,
        berechnet: stand.berechnet,
        abgegolten: stand.bezahlt,
        ausgezahlt: ausgezahlt.toFixed(2),
        skonto: skonto.toFixed(2),
        bauabzugsteuer: bauabzug.toFixed(2),
        /** Noch nicht abgegolten vom geprüften Stand (enthält Einbehalte und Umlagen). */
        restBerechnet: money(stand.berechnet).minus(stand.bezahlt).toFixed(2),
      },
    };
  }

  /** Rechnung mit Vertrag und Vorschau der Prüfkette (mit/ohne Skonto) zum gewünschten Zahlungstag. */
  async rechnung(id: string, zahlungsdatum = heute()) {
    const [x] = await this.db.select().from(er).where(eq(er.id, id));
    if (!x) throw new NotFoundException("Rechnung nicht gefunden");
    const v = await this.vertrag(x.handwerkervertragId);
    const zahlung = v.zahlungen.find((z) => z.eingangsrechnungId === id);
    const vorher = v.zahlungen.filter((z) => z.eingangsrechnungId !== id);
    const bisherAbgegolten = summe(vorher.map((z) => money(z.betrag).plus(z.skonto).plus(z.bauabzugsteuer)));
    const datum = zahlung?.datum ?? zahlungsdatum;
    const einbehaltProzent = Number((x.schlussrechnung ? v.einbehaltGewaehrleistungProzent : v.einbehaltVertragserfuellungProzent) ?? 0);
    const basis = {
      geprueftKumuliert: money(x.geprueftKumuliert ?? x.betragBrutto),
      nachlassProzent: Number(v.nachlassProzent ?? 0),
      umlagenProzent: umlagenSumme(v.umlagen ?? {}),
      einbehaltProzent,
      bisherAbgegolten,
      freistellungGueltig: freistellungGueltig(v.handwerker?.freistellungGueltigBis, datum),
    };
    const alsText = (e: ReturnType<typeof pruefkette>) => Object.fromEntries(Object.entries(e).map(([k2, m]) => [k2, m.toFixed(2)]));
    const skontoFristBis = v.skontoFristTage !== null && v.skontoFristTage !== undefined ? datumPlusTage(x.eingangAm, v.skontoFristTage) : null;
    return {
      auftragsrahmen: auftragsrahmen(x.geprueftKumuliert ?? x.betragBrutto, v.vertragBrutto, v.nachtraege, x.schlussrechnung),
      ...x,
      maengel: v.maengel,
      vertrag: { id: v.id, nrIntern: v.nrIntern, projekt: v.projekt, gewerk: { id: v.gewerk.id, nr: v.gewerk.nr, bezeichnung: v.gewerk.bezeichnung }, handwerker: v.handwerker, skontoProzent: v.skontoProzent, zahlungsfristTage: v.zahlungsfristTage },
      zahlung: zahlung ?? null,
      vorschau: {
        zahlungsdatum: datum,
        skontoFristBis,
        skontoMoeglich: skontoMoeglich(x.eingangAm, v.skontoFristTage, datum),
        freistellungGueltig: basis.freistellungGueltig,
        einbehaltProzent,
        umlagenProzent: basis.umlagenProzent,
        nachlassProzent: basis.nachlassProzent,
        ohneSkonto: alsText(pruefkette({ ...basis, skontoProzent: 0 })),
        mitSkonto: alsText(pruefkette({ ...basis, skontoProzent: Number(v.skontoProzent ?? 0) })),
      },
      faelligAm: v.zahlungsfristTage !== null && v.zahlungsfristTage !== undefined ? datumPlusTage(x.eingangAm, v.zahlungsfristTage) : null,
    };
  }

  /** Neue Rechnung – nur, wenn alle vorherigen Rechnungen des Vertrags bezahlt sind (kumulierte Abrechnung). */
  async rechnungAnlegen(tx: DbOderTx, werte: EingangsrechnungEingabe, benutzer: string) {
    const v = await this.vertrag(werte.handwerkervertragId);
    const offen = v.rechnungen.find((r) => r.status !== "bezahlt");
    if (offen) throw new ConflictException(`Rechnung ${offen.rechnungsnr} dieses Vertrags ist noch nicht bezahlt. Abschlagsrechnungen werden nacheinander abgerechnet.`);
    if (v.rechnungen.some((r) => r.schlussrechnung)) throw new ConflictException("Für diesen Vertrag liegt bereits eine Schlussrechnung vor.");
    const [neu] = await tx.insert(er).values({ ...werte, betragBrutto: werte.betragBrutto!, rechnungsdatum: werte.rechnungsdatum!, eingangAm: werte.eingangAm! }).returning();
    await protokollieren(tx, { tabelle: "eingangsrechnung", id: neu!.id, aktion: "insert", neu: werte, benutzer });
    return neu!;
  }

  /** Zahlbetrag einer freigegebenen Rechnung am Zahlungstag (Skonto nur in der Frist, Bauabzugsteuer ohne gültige Freistellung). */
  async zahlbetrag(id: string, datum: string) {
    const r = await this.rechnung(id, datum);
    if (r.status !== "freigegeben") throw new ConflictException(`Rechnung ${r.rechnungsnr}: nur freigegebene Rechnungen können bezahlt werden.`);
    const e = r.vorschau.skontoMoeglich ? r.vorschau.mitSkonto : r.vorschau.ohneSkonto;
    if (money(e.faellig!).lte(0)) throw new ConflictException(`Rechnung ${r.rechnungsnr}: kein Zahlbetrag offen (durch frühere Zahlungen abgegolten).`);
    return { r, e };
  }

  /** Verbucht die Zahlung (Zahlungsausgang, Status „bezahlt“, Protokoll). */
  async zahlungBuchen(tx: DbOderTx, z: Awaited<ReturnType<KostenService["zahlbetrag"]>>, datum: string, benutzer: string, zahlungslaufId?: string, empfaengerIban?: string | null) {
    const { r, e } = z;
    await tx.insert(za).values({ eingangsrechnungId: r.id, datum, betrag: e.auszahlung!, skonto: e.skonto!, bauabzugsteuer: e.bauabzugsteuer!, zahlungslaufId, empfaengerIban: empfaengerIban ?? null });
    await tx.update(er).set({ status: "bezahlt", pruefergebnis: e, geaendertAm: new Date() }).where(eq(er.id, r.id));
    await protokollieren(tx, {
      tabelle: "eingangsrechnung",
      id: r.id,
      aktion: "update",
      alt: { status: r.status },
      neu: { status: "bezahlt", datum, auszahlung: e.auszahlung, skonto: e.skonto, bauabzugsteuer: e.bauabzugsteuer, ...(zahlungslaufId ? { zahlungslaufId } : {}) },
      benutzer,
    });
  }
}
