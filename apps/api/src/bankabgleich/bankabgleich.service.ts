import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { schema, type DbOderTx } from "@bt/db";
import { kontoauszugLesen, money, summe, umsatzSchluesselListe, zuordnungVorschlag, type OffeneAnforderung, type OffenerZahlungsausgang, type OffenerZahlungslauf, type Vorschlag } from "@bt/domain";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { KontextService } from "../common/kontext.service.js";
import { protokollieren } from "../common/protokoll.js";
import { DB, type Db } from "../db.provider.js";

const { bankumsatz: bu, bankimport: bi, gesellschaft: g, zahlungsanforderung: zan, zahlungseingang: ze, kaufvertrag: kv, kaufvertragKaeufer: kk, projekt: p, geschaeftspartner: gp, zahlungslauf: zl, zahlungsausgang: za, eingangsrechnung: er, handwerkervertrag: hv } = schema;
const ibanNorm = (s: string | null | undefined) => (s ?? "").replace(/\s/g, "").toUpperCase();

export type Zuordnung = { art: "anforderung"; posten: { id: string; betrag: string }[] } | { art: "zahlungslauf"; id: string } | { art: "zahlungsausgang"; id: string };

@Injectable()
export class BankabgleichService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
  ) {}

  async gesellschaft(id: string) {
    const [ges] = await this.db.select().from(g).where(and(eq(g.id, id), eq(g.mandantId, await this.kontext.mandantId())));
    if (!ges) throw new NotFoundException("Gesellschaft nicht gefunden");
    return ges;
  }

  /** Kontoauszug einlesen; die Gesellschaft ergibt sich aus der IBAN der Datei (oder wird vorgegeben). Doppelte Umsätze werden übersprungen. */
  async importieren(datei: { originalname: string; buffer: Buffer }, gesellschaftId: string | undefined, benutzer: string) {
    let auszug;
    try {
      auszug = kontoauszugLesen(datei.buffer);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    if (!auszug.umsaetze.length) throw new BadRequestException("Die Datei enthält keine gebuchten Umsätze.");
    const mandantId = await this.kontext.mandantId();
    const alle = await this.db.select().from(g).where(eq(g.mandantId, mandantId));
    const iban = ibanNorm(auszug.kontoIban);
    const perIban = iban ? alle.find((x) => ibanNorm(x.iban) === iban) : undefined;
    const ges = gesellschaftId ? alle.find((x) => x.id === gesellschaftId) : perIban;
    if (!ges) throw new BadRequestException(iban ? `Das Konto ${iban} ist keiner Gesellschaft zugeordnet – bitte IBAN bei der Gesellschaft eintragen oder die Gesellschaft auswählen.` : "Die Datei enthält keine IBAN – bitte die Gesellschaft auswählen.");
    if (iban && perIban && perIban.id !== ges.id) throw new BadRequestException(`Der Auszug gehört zum Konto von „${perIban.name}“.`);
    if (iban && ges.iban && ibanNorm(ges.iban) !== iban) throw new BadRequestException(`Der Auszug ist für das Konto ${iban}, bei „${ges.name}“ ist ${ibanNorm(ges.iban)} hinterlegt.`);
    const schluessel = umsatzSchluesselListe(iban || ges.id, auszug.umsaetze).map((k) => createHash("sha256").update(k).digest("hex"));
    const daten = auszug.umsaetze.map((u) => u.buchungsdatum).sort();
    return this.db.transaction(async (tx) => {
      const vorhanden = new Set((await tx.select({ s: bu.schluessel }).from(bu).where(and(eq(bu.gesellschaftId, ges.id), inArray(bu.schluessel, schluessel)))).map((x) => x.s));
      const neu = auszug.umsaetze.map((u, i) => ({ u, s: schluessel[i]! })).filter((x) => !vorhanden.has(x.s));
      const [imp] = await tx
        .insert(bi)
        .values({ gesellschaftId: ges.id, dateiname: datei.originalname.slice(0, 200), format: auszug.format, kontoIban: iban || null, von: daten[0]!, bis: daten[daten.length - 1]!, anzahl: auszug.umsaetze.length, neu: neu.length, importiertVon: benutzer })
        .returning();
      if (neu.length)
        await tx.insert(bu).values(
          neu.map(({ u, s }) => ({ gesellschaftId: ges.id, bankimportId: imp!.id, schluessel: s, buchungsdatum: u.buchungsdatum, valuta: u.valuta, betrag: u.betrag, waehrung: u.waehrung, name: u.name, iban: u.iban, verwendungszweck: u.verwendungszweck, endToEndId: u.endToEndId, bankreferenz: u.bankreferenz })),
        );
      await protokollieren(tx, { tabelle: "bankimport", id: imp!.id, aktion: "insert", neu: { dateiname: imp!.dateiname, format: auszug.format, anzahl: imp!.anzahl, neu: neu.length }, benutzer });
      return { import: imp!, gesellschaft: { id: ges.id, nr: ges.nr, name: ges.name }, neu: neu.length, doppelt: auszug.umsaetze.length - neu.length };
    });
  }

  /** Offene Zahlungsanforderungen der Gesellschaft mit Namen und IBANs der Käufer. */
  async offeneAnforderungen(tx: DbOderTx, gesellschaftId: string, ids?: string[]): Promise<(OffeneAnforderung & { faelligAm: string })[]> {
    const bezahlt = sql<string>`(select coalesce(sum(${ze.betrag}), 0) from ${ze} where ${ze.zahlungsanforderungId} = ${zan.id})`;
    const zeilen = await tx
      .select({
        id: zan.id,
        rechnungsnr: zan.rechnungsnr,
        faelligAm: zan.faelligAm,
        betrag: zan.betrag,
        bezahlt: sql<string>`${bezahlt}::text`,
        kaufvertragNr: kv.nr,
        partner: sql<{ name: string; iban: string | null }[]>`(select coalesce(json_agg(json_build_object('name', coalesce(${gp.firma}, concat_ws(' ', ${gp.vorname}, ${gp.nachname}), ${gp.suchcode}), 'iban', ${gp.iban})), '[]') from ${gp} where ${gp.id} = ${kv.zahlungsanforderungAn} or ${gp.id} in (select ${kk.partnerId} from ${kk} where ${kk.kaufvertragId} = ${kv.id}))`,
      })
      .from(zan)
      .innerJoin(kv, eq(zan.kaufvertragId, kv.id))
      .innerJoin(p, eq(kv.projektId, p.id))
      .where(and(eq(p.gesellschaftId, gesellschaftId), ids ? inArray(zan.id, ids) : sql`${zan.betrag} > ${bezahlt}`))
      .orderBy(zan.faelligAm);
    return zeilen.map((z) => ({
      id: z.id,
      rechnungsnr: z.rechnungsnr,
      faelligAm: z.faelligAm,
      kaufvertragNr: z.kaufvertragNr,
      offen: money(z.betrag).minus(z.bezahlt).toFixed(2),
      namen: z.partner.map((x) => x.name),
      ibans: z.partner.map((x) => ibanNorm(x.iban)).filter(Boolean),
    }));
  }

  /** Zahlungsläufe und Einzelzahlungen an Handwerker, die noch keinem Bankumsatz zugeordnet sind. */
  async offeneAusgaenge(tx: DbOderTx, gesellschaftId: string) {
    const laeufe: OffenerZahlungslauf[] = await tx
      .select({ id: zl.id, nr: zl.nr, summe: zl.summe, ausfuehrungAm: zl.ausfuehrungAm })
      .from(zl)
      .where(and(eq(zl.gesellschaftId, gesellschaftId), sql`not exists (select 1 from ${bu} where ${bu.zahlungslaufId} = ${zl.id})`, sql`not exists (select 1 from ${bu} join ${za} z2 on z2.id = ${bu.zahlungsausgangId} where z2.zahlungslauf_id = ${zl.id})`))
      .orderBy(zl.ausfuehrungAm);
    const ausgaenge = await tx
      .select({ id: za.id, betrag: za.betrag, datum: za.datum, rechnungsnr: er.rechnungsnr, laufNr: zl.nr, laufId: zl.id, name: sql<string>`coalesce(${gp.firma}, concat_ws(' ', ${gp.vorname}, ${gp.nachname}), '')` })
      .from(za)
      .innerJoin(er, eq(za.eingangsrechnungId, er.id))
      .innerJoin(hv, eq(er.handwerkervertragId, hv.id))
      .innerJoin(schema.gewerk, eq(hv.gewerkId, schema.gewerk.id))
      .innerJoin(p, eq(schema.gewerk.projektId, p.id))
      .leftJoin(zl, eq(za.zahlungslaufId, zl.id))
      .leftJoin(gp, eq(hv.handwerkerId, gp.id))
      .where(and(eq(p.gesellschaftId, gesellschaftId), sql`not exists (select 1 from ${bu} where ${bu.zahlungsausgangId} = ${za.id})`, sql`(${za.zahlungslaufId} is null or not exists (select 1 from ${bu} where ${bu.zahlungslaufId} = ${za.zahlungslaufId}))`))
      .orderBy(za.datum);
    const offeneAusgaenge: (OffenerZahlungsausgang & { datum: string; laufNr: string | null })[] = ausgaenge.map((x) => ({
      id: x.id,
      // wie im Zahlungslauf erzeugt (pain.001)
      endToEndId: x.laufNr ? `${x.laufNr}-${x.rechnungsnr}`.slice(0, 35) : "",
      betrag: x.betrag,
      rechnungsnr: x.rechnungsnr,
      name: x.name,
      datum: x.datum,
      laufNr: x.laufNr,
    }));
    return { laeufe, ausgaenge: offeneAusgaenge };
  }

  async offen(tx: DbOderTx, gesellschaftId: string) {
    const [anforderungen, aus] = await Promise.all([this.offeneAnforderungen(tx, gesellschaftId), this.offeneAusgaenge(tx, gesellschaftId)]);
    return { anforderungen, zahlungslaeufe: aus.laeufe, zahlungsausgaenge: aus.ausgaenge };
  }

  /** Kurzstand fürs Cockpit: offene Umsätze, letzter Auszug, Zahlungsläufe ohne Kontobeleg. */
  async stand(gesellschaftId: string) {
    const [[u], [imp], aus] = await Promise.all([
      this.db
        .select({ offen: sql<number>`count(*)::int`, aeltestes: sql<string | null>`min(${bu.buchungsdatum})::text` })
        .from(bu)
        .where(and(eq(bu.gesellschaftId, gesellschaftId), eq(bu.status, "offen"))),
      this.db.select({ bis: sql<string | null>`max(${bi.bis})::text` }).from(bi).where(eq(bi.gesellschaftId, gesellschaftId)),
      this.offeneAusgaenge(this.db, gesellschaftId),
    ]);
    return { offen: u?.offen ?? 0, aeltestes: u?.aeltestes ?? null, letzterAuszugBis: imp?.bis ?? null, laeufeOhneBeleg: aus.laeufe };
  }

  /** Umsätze mit Vorschlägen (offene) bzw. Zuordnung (erledigte). */
  async liste(gesellschaftId: string, status: "offen" | "zugeordnet" | "ignoriert" | "alle") {
    const ges = await this.gesellschaft(gesellschaftId);
    const [umsaetze, offen, importe, [summen]] = await Promise.all([
      this.db
        .select()
        .from(bu)
        .where(and(eq(bu.gesellschaftId, gesellschaftId), status === "alle" ? undefined : eq(bu.status, status)))
        .orderBy(desc(bu.buchungsdatum), desc(bu.angelegtAm))
        .limit(1000),
      this.offen(this.db, gesellschaftId),
      this.db.select().from(bi).where(eq(bi.gesellschaftId, gesellschaftId)).orderBy(desc(bi.angelegtAm)).limit(10),
      this.db
        .select({
          offen: sql<number>`count(*) filter (where ${bu.status} = 'offen')::int`,
          offenEingang: sql<string>`coalesce(sum(${bu.betrag}) filter (where ${bu.status} = 'offen' and ${bu.betrag} > 0), 0)::text`,
          offenAusgang: sql<string>`coalesce(sum(${bu.betrag}) filter (where ${bu.status} = 'offen' and ${bu.betrag} < 0), 0)::text`,
          zugeordnet: sql<number>`count(*) filter (where ${bu.status} = 'zugeordnet')::int`,
          ignoriert: sql<number>`count(*) filter (where ${bu.status} = 'ignoriert')::int`,
        })
        .from(bu)
        .where(eq(bu.gesellschaftId, gesellschaftId)),
    ]);
    const ids = umsaetze.map((u) => u.id);
    const eingaenge = ids.length
      ? await this.db.select({ bankumsatzId: ze.bankumsatzId, betrag: ze.betrag, rechnungsnr: zan.rechnungsnr, zahlungsanforderungId: zan.id }).from(ze).innerJoin(zan, eq(ze.zahlungsanforderungId, zan.id)).where(inArray(ze.bankumsatzId, ids))
      : [];
    const laeufe = new Map((await this.db.select({ id: zl.id, nr: zl.nr }).from(zl).where(eq(zl.gesellschaftId, gesellschaftId))).map((x) => [x.id, x.nr]));
    const ausgangIds = umsaetze.map((u) => u.zahlungsausgangId).filter((x): x is string => !!x);
    const ausgaenge = new Map(
      (ausgangIds.length ? await this.db.select({ id: za.id, rechnungsnr: er.rechnungsnr, rechnungId: er.id }).from(za).innerJoin(er, eq(za.eingangsrechnungId, er.id)).where(inArray(za.id, ausgangIds)) : []).map((x) => [x.id, x]),
    );
    return {
      gesellschaft: { id: ges.id, nr: ges.nr, name: ges.name, iban: ges.iban },
      summen: summen!,
      importe,
      offen: { anforderungen: offen.anforderungen, zahlungslaeufe: offen.zahlungslaeufe, zahlungsausgaenge: offen.zahlungsausgaenge },
      umsaetze: umsaetze.map((u) => ({
        ...u,
        vorschlag: u.status === "offen" ? zuordnungVorschlag(u, offen) : null,
        zuordnung:
          u.status !== "zugeordnet"
            ? null
            : {
                eingaenge: eingaenge.filter((e) => e.bankumsatzId === u.id),
                zahlungslauf: u.zahlungslaufId ? { id: u.zahlungslaufId, nr: laeufe.get(u.zahlungslaufId) ?? "" } : null,
                zahlungsausgang: u.zahlungsausgangId ? (ausgaenge.get(u.zahlungsausgangId) ?? null) : null,
              },
      })),
    };
  }

  private async umsatz(tx: DbOderTx, id: string) {
    const [u] = await tx
      .select({ u: bu })
      .from(bu)
      .innerJoin(g, eq(bu.gesellschaftId, g.id))
      .where(and(eq(bu.id, id), eq(g.mandantId, await this.kontext.mandantId())))
      .for("update");
    if (!u) throw new NotFoundException("Bankumsatz nicht gefunden");
    return u.u;
  }

  /** Umsatz zuordnen: Gutschrift → Zahlungseingänge auf Anforderungen (Summe = Umsatz), Belastung → Zahlungslauf bzw. Zahlung bestätigen. */
  async zuordnen(id: string, z: Zuordnung, benutzer: string) {
    return this.db.transaction(async (tx) => {
      const u = await this.umsatz(tx, id);
      if (u.status !== "offen") throw new ConflictException("Der Umsatz ist bereits erledigt.");
      const betrag = money(u.betrag);
      if (z.art === "anforderung") {
        if (!betrag.isPositive()) throw new BadRequestException("Belastungen können keiner Zahlungsanforderung zugeordnet werden.");
        const posten = z.posten.filter((x) => money(x.betrag).gt(0));
        if (!posten.length) throw new BadRequestException("Bitte mindestens eine Zahlungsanforderung mit Betrag angeben.");
        if (new Set(posten.map((x) => x.id)).size !== posten.length) throw new BadRequestException("Jede Zahlungsanforderung nur einmal angeben.");
        if (!summe(posten.map((x) => money(x.betrag))).eq(betrag)) throw new BadRequestException(`Die Beträge müssen zusammen dem Umsatz von ${betrag.toFixed(2).replace(".", ",")} € entsprechen.`);
        const offen = new Map((await this.offeneAnforderungen(tx, u.gesellschaftId, posten.map((x) => x.id))).map((a) => [a.id, a]));
        const kv = new Map((await tx.select({ id: zan.id, kaufvertragId: zan.kaufvertragId }).from(zan).where(inArray(zan.id, posten.map((x) => x.id)))).map((x) => [x.id, x.kaufvertragId]));
        for (const x of posten) {
          const a = offen.get(x.id);
          if (!a) throw new BadRequestException("Zahlungsanforderung gehört nicht zu dieser Gesellschaft.");
          if (money(x.betrag).gt(a.offen)) throw new ConflictException(`Für ${a.rechnungsnr} sind nur noch ${money(a.offen).toFixed(2).replace(".", ",")} € offen – Überzahlungen bitte gesondert klären.`);
        }
        const zweck = [u.name, u.verwendungszweck].filter(Boolean).join(": ").slice(0, 300);
        for (const x of posten) {
          const [neu] = await tx.insert(ze).values({ zahlungsanforderungId: x.id, kaufvertragId: kv.get(x.id)!, datum: u.buchungsdatum, betrag: money(x.betrag).toFixed(2), verwendungszweck: zweck, bankumsatzId: u.id }).returning();
          await protokollieren(tx, { tabelle: "zahlungseingang", id: neu!.id, aktion: "insert", neu: { rechnungsnr: offen.get(x.id)!.rechnungsnr, betrag: neu!.betrag, datum: neu!.datum, bankumsatz: u.id }, benutzer });
        }
      } else {
        if (!betrag.isNegative()) throw new BadRequestException("Gutschriften können keiner Zahlung an Handwerker zugeordnet werden.");
        const aus = await this.offeneAusgaenge(tx, u.gesellschaftId);
        if (z.art === "zahlungslauf" && !aus.laeufe.some((l) => l.id === z.id)) throw new ConflictException("Zahlungslauf nicht gefunden oder bereits zugeordnet.");
        if (z.art === "zahlungsausgang" && !aus.ausgaenge.some((l) => l.id === z.id)) throw new ConflictException("Zahlung nicht gefunden oder bereits zugeordnet.");
      }
      const werte = {
        status: "zugeordnet" as const,
        zahlungslaufId: z.art === "zahlungslauf" ? z.id : null,
        zahlungsausgangId: z.art === "zahlungsausgang" ? z.id : null,
        zugeordnetVon: benutzer,
        zugeordnetAm: new Date(),
        geaendertAm: new Date(),
      };
      await tx.update(bu).set(werte).where(eq(bu.id, u.id));
      await protokollieren(tx, { tabelle: "bankumsatz", id: u.id, aktion: "update", alt: { status: "offen" }, neu: { status: "zugeordnet", ...z }, benutzer });
      return { id: u.id, status: "zugeordnet" };
    });
  }

  async ignorieren(id: string, bemerkung: string | null, benutzer: string) {
    return this.db.transaction(async (tx) => {
      const u = await this.umsatz(tx, id);
      if (u.status !== "offen") throw new ConflictException("Der Umsatz ist bereits erledigt.");
      await tx.update(bu).set({ status: "ignoriert", bemerkung, zugeordnetVon: benutzer, zugeordnetAm: new Date(), geaendertAm: new Date() }).where(eq(bu.id, id));
      await protokollieren(tx, { tabelle: "bankumsatz", id, aktion: "update", alt: { status: "offen" }, neu: { status: "ignoriert", bemerkung }, benutzer });
      return { id, status: "ignoriert" };
    });
  }

  /** Zuordnung aufheben; dabei angelegte Zahlungseingänge werden gelöscht (im Journal: Anpassung bzw. Storno). */
  async zuruecksetzen(id: string, benutzer: string) {
    return this.db.transaction(async (tx) => {
      const u = await this.umsatz(tx, id);
      if (u.status === "offen") return { id, status: "offen" };
      const eingaenge = await tx.select().from(ze).where(eq(ze.bankumsatzId, id));
      for (const e of eingaenge) {
        await tx.delete(ze).where(eq(ze.id, e.id));
        await protokollieren(tx, { tabelle: "zahlungseingang", id: e.id, aktion: "delete", alt: e, benutzer });
      }
      await tx.update(bu).set({ status: "offen", zahlungslaufId: null, zahlungsausgangId: null, bemerkung: null, zugeordnetVon: null, zugeordnetAm: null, geaendertAm: new Date() }).where(eq(bu.id, id));
      await protokollieren(tx, { tabelle: "bankumsatz", id, aktion: "update", alt: { status: u.status }, neu: { status: "offen" }, benutzer });
      return { id, status: "offen" };
    });
  }

  /** Alle sicheren Vorschläge übernehmen (nacheinander, damit Teilzahlungen den offenen Betrag mindern). */
  async vorschlaegeUebernehmen(gesellschaftId: string, benutzer: string) {
    await this.gesellschaft(gesellschaftId);
    const offene = await this.db.select().from(bu).where(and(eq(bu.gesellschaftId, gesellschaftId), eq(bu.status, "offen"), isNull(bu.zahlungslaufId))).orderBy(bu.buchungsdatum);
    let uebernommen = 0;
    for (const u of offene) {
      const v: Vorschlag | null = zuordnungVorschlag(u, await this.offen(this.db, gesellschaftId));
      if (!v || v.sicherheit !== "sicher") continue;
      if (v.art === "anforderung" && !v.posten.length) continue;
      await this.zuordnen(u.id, v.art === "anforderung" ? { art: "anforderung", posten: v.posten } : { art: v.art, id: v.id }, benutzer);
      uebernommen++;
    }
    return { uebernommen };
  }
}
