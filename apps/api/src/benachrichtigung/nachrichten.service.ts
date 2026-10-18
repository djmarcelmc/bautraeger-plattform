import { Inject, Injectable } from "@nestjs/common";
import { schema, type DbOderTx } from "@bt/db";
import {
  BENACHRICHTIGUNG_STANDARD,
  BenachrichtigungEinstellung,
  WIEDERHOLUNG_MINUTEN,
  mailAufgaben,
  mailMangelEingang,
  mailMangelGemeldet,
  mailMangelStatus,
  portalStatus,
  type Mail,
  type MangelMailDaten,
  type PortalStatus,
} from "@bt/domain";
import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { KontextService } from "../common/kontext.service.js";
import { DB, type Db } from "../db.provider.js";
import { MAIL_VERSAND, type MailVersand } from "./versand.js";

const { nachricht: n, einstellung: es, mangel: m } = schema;
const BENACHRICHTIGUNG = "benachrichtigung";
const AUFGABEN_GESENDET = "aufgaben.letzterVersand";
export const basisUrl = () => (process.env.PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
const berlin = () => {
  const teile = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(new Date());
  const t = (typ: string) => teile.find((x) => x.type === typ)!.value;
  return { datum: `${t("year")}-${t("month")}-${t("day")}`, stunde: Number(t("hour")) };
};

@Injectable()
export class NachrichtenService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
    @Inject(MAIL_VERSAND) readonly versand: MailVersand,
  ) {}

  // ---------------------------------------------------------------- Einstellungen

  private async wert<T>(schluessel: string, mandantId?: string): Promise<T | undefined> {
    const [x] = await this.db.select({ wert: es.wert }).from(es).where(and(eq(es.mandantId, mandantId ?? (await this.kontext.mandantId())), eq(es.schluessel, schluessel)));
    return x?.wert as T | undefined;
  }

  private async setzen(schluessel: string, wert: unknown, mandantId?: string) {
    const mid = mandantId ?? (await this.kontext.mandantId());
    await this.db
      .insert(es)
      .values({ mandantId: mid, schluessel, wert })
      .onConflictDoUpdate({ target: [es.mandantId, es.schluessel], set: { wert, geaendertAm: new Date() } });
  }

  async einstellungen(mandantId?: string): Promise<BenachrichtigungEinstellung> {
    return { ...BENACHRICHTIGUNG_STANDARD, ...((await this.wert<BenachrichtigungEinstellung>(BENACHRICHTIGUNG, mandantId)) ?? {}) };
  }

  async einstellungenSpeichern(w: BenachrichtigungEinstellung) {
    await this.setzen(BENACHRICHTIGUNG, w);
    return this.einstellungen();
  }

  // ---------------------------------------------------------------- Postausgang

  async einreihen(e: { an: string[]; mail: Mail; anlass: string; bezugId?: string | null; mandantId?: string }, db: DbOderTx = this.db) {
    const an = [...new Set(e.an.map((x) => x.trim()).filter(Boolean))];
    if (!an.length) return null;
    const [x] = await db
      .insert(n)
      .values({ mandantId: e.mandantId ?? (await this.kontext.mandantId()), an, betreff: e.mail.betreff, text: e.mail.text, html: e.mail.html, anlass: e.anlass, bezugId: e.bezugId ?? null })
      .returning({ id: n.id });
    return x!.id;
  }

  async postausgang(limit = 50) {
    return this.db
      .select({ id: n.id, an: n.an, betreff: n.betreff, anlass: n.anlass, status: n.status, versuche: n.versuche, fehler: n.fehler, gesendetAm: n.gesendetAm, angelegtAm: n.angelegtAm, naechsterVersuchAm: n.naechsterVersuchAm })
      .from(n)
      .where(eq(n.mandantId, await this.kontext.mandantId()))
      .orderBy(desc(n.angelegtAm))
      .limit(limit);
  }

  async erneut(id: string) {
    await this.db
      .update(n)
      .set({ status: "wartend", versuche: 0, naechsterVersuchAm: new Date(), fehler: null, geaendertAm: new Date() })
      .where(and(eq(n.id, id), eq(n.mandantId, await this.kontext.mandantId())));
  }

  /** Versendet fällige Nachrichten; Fehler werden mit wachsendem Abstand wiederholt (5 Versuche). */
  async versendeAusstehende(limit = 20) {
    const faellig = await this.db
      .select()
      .from(n)
      .where(and(eq(n.status, "wartend"), lte(n.naechsterVersuchAm, new Date())))
      .orderBy(asc(n.naechsterVersuchAm))
      .limit(limit);
    let gesendet = 0;
    for (const x of faellig) {
      try {
        const echt = await this.versand.senden({ an: x.an, betreff: x.betreff, text: x.text, html: x.html });
        await this.db.update(n).set({ status: echt ? "gesendet" : "protokolliert", gesendetAm: new Date(), versuche: x.versuche + 1, fehler: null, geaendertAm: new Date() }).where(eq(n.id, x.id));
        gesendet++;
      } catch (e) {
        const versuche = x.versuche + 1;
        const warte = WIEDERHOLUNG_MINUTEN[versuche - 1];
        await this.db
          .update(n)
          .set({
            versuche,
            fehler: (e as Error).message.slice(0, 500),
            status: warte === undefined ? "fehler" : "wartend",
            naechsterVersuchAm: new Date(Date.now() + (warte ?? 0) * 60_000),
            geaendertAm: new Date(),
          })
          .where(eq(n.id, x.id));
      }
    }
    return { geprueft: faellig.length, gesendet };
  }

  // ---------------------------------------------------------------- Anlässe: Mängel aus dem Käuferportal

  /** Daten eines Portal-Mangels inkl. Käufer-E-Mail und Anrede; null, wenn kein Portal-Mangel. */
  private async mangelDaten(mangelId: string) {
    const [x] = await this.db
      .select({
        mangel: m,
        projekt: sql<string>`${schema.projekt.nr} || ' ' || ${schema.projekt.suchcode}`,
        projektNr: schema.projekt.nr,
        bautraeger: schema.gesellschaft.name,
        mandantId: schema.gesellschaft.mandantId,
        einheit: schema.einheit.nr,
        empfaengerId: schema.kaufvertrag.zahlungsanforderungAn,
      })
      .from(m)
      .innerJoin(schema.projekt, eq(m.projektId, schema.projekt.id))
      .innerJoin(schema.gesellschaft, eq(schema.projekt.gesellschaftId, schema.gesellschaft.id))
      .leftJoin(schema.einheit, eq(m.einheitId, schema.einheit.id))
      .leftJoin(schema.kaufvertrag, eq(m.kaufvertragId, schema.kaufvertrag.id))
      .where(eq(m.id, mangelId));
    if (!x || x.mangel.festgestelltDurch !== "Käuferportal" || !x.mangel.kaufvertragId) return null;
    const kaeufer = await this.db
      .select({ id: schema.geschaeftspartner.id, anrede: schema.geschaeftspartner.anrede, vorname: schema.geschaeftspartner.vorname, nachname: schema.geschaeftspartner.nachname, firma: schema.geschaeftspartner.firma, email: schema.geschaeftspartner.email })
      .from(schema.kaufvertragKaeufer)
      .innerJoin(schema.geschaeftspartner, eq(schema.kaufvertragKaeufer.partnerId, schema.geschaeftspartner.id))
      .where(eq(schema.kaufvertragKaeufer.kaufvertragId, x.mangel.kaufvertragId));
    const empfaenger = kaeufer.find((k) => k.id === x.empfaengerId && k.email) ?? kaeufer.find((k) => k.email);
    const anrede = empfaenger?.anrede === "Frau" ? `Sehr geehrte Frau ${empfaenger.nachname}` : empfaenger?.anrede === "Herr" ? `Sehr geehrter Herr ${empfaenger.nachname}` : "Guten Tag";
    const daten: MangelMailDaten = {
      bautraeger: x.bautraeger,
      projekt: x.projekt,
      nr: `${x.projektNr}-${x.mangel.nr}`,
      titel: x.mangel.titel,
      ort: x.mangel.ort,
      einheit: x.einheit,
      beschreibung: x.mangel.beschreibung,
      kaeufer: kaeufer.map((k) => k.firma ?? [k.vorname, k.nachname].filter(Boolean).join(" ")).join(", "),
    };
    return { daten, mangel: x.mangel, mandantId: x.mandantId, kaeuferEmail: empfaenger?.email ?? null, anrede };
  }

  /** Neue Mängelanzeige: Bauleitung informieren, Käufer erhält eine Eingangsbestätigung. */
  async mangelGemeldet(mangelId: string, fotos = 0) {
    const d = await this.mangelDaten(mangelId);
    if (!d) return;
    const e = await this.einstellungen(d.mandantId);
    await this.einreihen({ an: e.maengelAn, mail: mailMangelGemeldet({ ...d.daten, fotos }, `${basisUrl()}/maengel/${mangelId}`), anlass: "mangel_gemeldet", bezugId: mangelId, mandantId: d.mandantId });
    if (e.kaeuferInformieren && d.kaeuferEmail) await this.einreihen({ an: [d.kaeuferEmail], mail: mailMangelEingang(d.daten, d.anrede), anlass: "mangel_eingang", bezugId: mangelId, mandantId: d.mandantId });
  }

  /** Für Käufer sichtbarer Status eines Mangels (für den Vorher/Nachher-Vergleich). */
  async portalStatusVon(mangelId: string): Promise<PortalStatus | null> {
    const [x] = await this.db.select({ erledigtAm: m.erledigtAm, handwerkerId: m.handwerkerId, festgestelltDurch: m.festgestelltDurch }).from(m).where(eq(m.id, mangelId));
    if (!x || x.festgestelltDurch !== "Käuferportal") return null;
    const [r] = await this.db.select({ n: sql<number>`count(*)::int` }).from(schema.ruege).where(eq(schema.ruege.mangelId, mangelId));
    return portalStatus(x, r!.n);
  }

  /** Käufer bei Statuswechsel informieren (in Bearbeitung, erledigt). */
  async mangelStatusGeaendert(mangelId: string, vorher: PortalStatus | null) {
    if (!vorher) return;
    const nachher = await this.portalStatusVon(mangelId);
    if (!nachher || nachher === vorher || nachher === "eingegangen") return;
    const d = await this.mangelDaten(mangelId);
    if (!d?.kaeuferEmail || !(await this.einstellungen(d.mandantId)).kaeuferInformieren) return;
    await this.einreihen({ an: [d.kaeuferEmail], mail: mailMangelStatus(d.daten, d.anrede, nachher, d.mangel.erledigtAm), anlass: "mangel_status", bezugId: mangelId, mandantId: d.mandantId });
  }

  // ---------------------------------------------------------------- Tägliche Aufgabenübersicht

  /** Reiht die Tagesübersicht ein (einmal je Tag ab 7 Uhr, oder sofort mit jetzt=true). */
  async aufgabenUebersicht(aufgaben: () => Promise<{ aufgaben: Parameters<typeof mailAufgaben>[0] }>, jetzt = false) {
    const { datum, stunde } = berlin();
    if (!jetzt && (stunde < 7 || (await this.wert<string>(AUFGABEN_GESENDET)) === datum)) return { eingereiht: false };
    const e = await this.einstellungen();
    if (!e.aufgabenAn.length) return { eingereiht: false, grund: "keine Empfänger" };
    const mail = mailAufgaben((await aufgaben()).aufgaben, basisUrl(), datum);
    // Auch ein manueller Versand zählt als Tagesübersicht – so geht sie nicht zweimal am Tag raus.
    if (!jetzt || mail) await this.setzen(AUFGABEN_GESENDET, datum);
    if (!mail) return { eingereiht: false, grund: "keine Aufgaben" };
    await this.einreihen({ an: e.aufgabenAn, mail, anlass: "aufgaben" });
    return { eingereiht: true };
  }

  /** Anzahl je Status (für die Einstellungsseite). */
  async statistik() {
    const zeilen = await this.db
      .select({ status: n.status, anzahl: sql<number>`count(*)::int` })
      .from(n)
      .where(and(eq(n.mandantId, await this.kontext.mandantId()), inArray(n.status, ["wartend", "fehler"])))
      .groupBy(n.status);
    return Object.fromEntries(zeilen.map((z) => [z.status, z.anzahl])) as Partial<Record<"wartend" | "fehler", number>>;
  }
}
