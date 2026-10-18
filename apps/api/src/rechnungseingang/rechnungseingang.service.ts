import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { schema } from "@bt/db";
import { auftragsrahmen, eingangVorschlag, gewerkVorschlag, neuerHandwerker, projektVorschlag, type EingangsrechnungEingabe, type HandwerkerKandidat, type Rechnungsdaten, type VertragKandidat } from "@bt/domain";
import { and, desc, eq, sql } from "drizzle-orm";
import { KontextService } from "../common/kontext.service.js";
import { protokollieren } from "../common/protokoll.js";
import { DB, type Db } from "../db.provider.js";
import { SPEICHER, type Speicher } from "../dokumente/speicher.js";
import { KostenService } from "../kosten/kosten.service.js";
import { belegLesen, istBeleg, istPdf } from "./beleg-lesen.js";
import { POSTFACH, type Postfach } from "./postfach.js";

const { belegeingang: be, dokument: dok, geschaeftspartner: gp, handwerkervertrag: hv, gewerk: gw, projekt: p, gesellschaft: g, eingangsrechnung: er } = schema;

export interface EingangsDatei {
  name: string;
  inhalt: Buffer;
  typ?: string;
}

@Injectable()
export class RechnungseingangService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
    @Inject(SPEICHER) private readonly speicher: Speicher,
    @Inject(KostenService) private readonly kosten: KostenService,
    @Optional() @Inject(POSTFACH) readonly postfach: Postfach | null,
  ) {}

  /**
   * Belege einer Mail bzw. eines Uploads aufnehmen. Kommt eine PDF zusammen mit genau einer XML (E-Rechnung), werden
   * beide zu einem Eingang zusammengefasst; sonst wird jede PDF/XML ein eigener Eingang. Andere Dateien werden ignoriert.
   */
  async aufnehmen(e: { quelle: "mail" | "upload"; herkunft?: string; absender?: string | null; betreff?: string | null; empfangenAm?: Date; dateien: EingangsDatei[] }, benutzer: string) {
    const belege = e.dateien.filter((d) => istBeleg(d.name, d.inhalt));
    const pdfs = belege.filter((d) => istPdf(d.inhalt));
    const xmls = belege.filter((d) => !istPdf(d.inhalt));
    const paare: { haupt: EingangsDatei; xml: string | null }[] =
      pdfs.length === 1 && xmls.length === 1 ? [{ haupt: pdfs[0]!, xml: xmls[0]!.inhalt.toString("utf8") }] : belege.map((d) => ({ haupt: d, xml: null }));
    const mandantId = await this.kontext.mandantId();
    const angelegt: string[] = [];
    let doppelt = 0;
    for (const { haupt, xml } of paare) {
      const herkunft = e.herkunft ? `${e.herkunft}|${haupt.name}` : null;
      if (herkunft) {
        const [schon] = await this.db.select({ id: be.id }).from(be).where(and(eq(be.mandantId, mandantId), eq(be.herkunft, herkunft)));
        if (schon) {
          doppelt++;
          continue;
        }
      }
      const { daten, text } = await belegLesen(haupt.name, haupt.inhalt, xml);
      const id = randomUUID();
      const speicherKey = `${mandantId}/${new Date().getFullYear()}/${randomUUID()}`;
      await this.speicher.speichern(speicherKey, haupt.inhalt);
      await this.db.transaction(async (tx) => {
        const [d] = await tx
          .insert(dok)
          .values({
            mandantId,
            objektTyp: "belegeingang",
            objektId: id,
            ordner: "Rechnungen",
            dateiname: haupt.name.slice(0, 200),
            mimeType: istPdf(haupt.inhalt) ? "application/pdf" : "application/xml",
            groesse: haupt.inhalt.length,
            speicherKey,
            sha256: createHash("sha256").update(haupt.inhalt).digest("hex"),
            beschreibung: e.quelle === "mail" ? `per E-Mail von ${e.absender ?? "unbekannt"}` : "hochgeladen",
            hochgeladenVon: benutzer,
          })
          .returning({ id: dok.id });
        await tx.insert(be).values({
          id,
          mandantId,
          quelle: e.quelle,
          herkunft,
          absender: e.absender ?? null,
          betreff: e.betreff?.slice(0, 300) ?? null,
          empfangenAm: e.empfangenAm ?? new Date(),
          dokumentId: d!.id,
          dateiname: haupt.name.slice(0, 200),
          daten: daten as unknown as Record<string, unknown>,
          text: text.slice(0, 20_000) || null,
        });
        await protokollieren(tx, { tabelle: "belegeingang", id, aktion: "insert", neu: { quelle: e.quelle, dateiname: haupt.name, absender: e.absender, erkannt: daten.quelle }, benutzer });
      });
      angelegt.push(id);
    }
    return { angelegt, doppelt, ignoriert: e.dateien.length - belege.length };
  }

  /** Neue Mails aus dem Rechnungspostfach abholen. */
  async abrufen(benutzer: string) {
    if (!this.postfach) throw new ConflictException("Kein Rechnungspostfach eingerichtet (RECHNUNGEN_POSTFACH und Microsoft-Graph-Zugang).");
    const mails = await this.postfach.neueMails();
    let neu = 0;
    let ohneBeleg = 0;
    for (const m of mails) {
      const r = await this.aufnehmen({ quelle: "mail", herkunft: m.internetMessageId || m.id, absender: m.absender, betreff: m.betreff, empfangenAm: new Date(m.empfangenAm), dateien: m.anhaenge.map((a) => ({ name: a.name, inhalt: a.inhalt, typ: a.typ })) }, benutzer);
      neu += r.angelegt.length;
      if (!r.angelegt.length && !r.doppelt) ohneBeleg++;
      await this.postfach.alsVerarbeitetMarkieren(m.id);
    }
    return { mails: mails.length, neu, ohneBeleg };
  }

  /** Handwerker und offene Verträge als Grundlage für Vorschläge und Auswahl. */
  async kandidaten() {
    const mandantId = await this.kontext.mandantId();
    const [handwerker, vertraege, gewerke] = await Promise.all([
      this.db
        .select({ id: gp.id, name: sql<string>`coalesce(${gp.firma}, concat_ws(' ', ${gp.vorname}, ${gp.nachname}), ${gp.suchcode})`, email: gp.email, iban: gp.iban, steuernummer: gp.steuernummer })
        .from(gp)
        .where(and(eq(gp.mandantId, mandantId), sql`('handwerker' = any(${gp.rollen}) or 'lieferant' = any(${gp.rollen}))`)),
      this.db
        .select({
          id: hv.id,
          handwerkerId: hv.handwerkerId,
          nrIntern: hv.nrIntern,
          projektNr: p.nr,
          projektSuchcode: p.suchcode,
          projektOrt: p.ort,
          gewerk: sql<string>`${gw.nr} || ' ' || ${gw.bezeichnung}`,
          gesellschaft: g.name,
          abgeschlossen: sql<boolean>`exists (select 1 from ${er} where ${er.handwerkervertragId} = ${hv.id} and ${er.schlussrechnung})`,
          offeneRechnung: sql<boolean>`exists (select 1 from ${er} where ${er.handwerkervertragId} = ${hv.id} and ${er.status} <> 'bezahlt')`,
          vertragBrutto: hv.vertragBrutto,
          nachtraege: sql<{ betragBrutto: string; status: string }[]>`(select coalesce(json_agg(json_build_object('betragBrutto', ${schema.nachtrag.betragBrutto}::text, 'status', ${schema.nachtrag.status})), '[]') from ${schema.nachtrag} where ${schema.nachtrag.handwerkervertragId} = ${hv.id})`,
        })
        .from(hv)
        .innerJoin(gw, eq(hv.gewerkId, gw.id))
        .innerJoin(p, eq(gw.projektId, p.id))
        .innerJoin(g, eq(p.gesellschaftId, g.id))
        .where(and(eq(g.mandantId, mandantId), eq(p.abgeschlossen, false)))
        .orderBy(p.nr, gw.nr),
      this.db
        .select({ id: gw.id, nr: gw.nr, bezeichnung: gw.bezeichnung, projektId: p.id, projektNr: p.nr, projektSuchcode: p.suchcode, projektOrt: p.ort })
        .from(gw)
        .innerJoin(p, eq(gw.projektId, p.id))
        .innerJoin(g, eq(p.gesellschaftId, g.id))
        .where(and(eq(g.mandantId, mandantId), eq(p.abgeschlossen, false)))
        .orderBy(p.nr, gw.nr),
    ]);
    return { handwerker: handwerker as HandwerkerKandidat[], vertraege: vertraege as (VertragKandidat & { nrIntern: string | null; gesellschaft: string; vertragBrutto: string; nachtraege: { betragBrutto: string; status: string }[] })[], gewerke };
  }

  async liste(status: "neu" | "erfasst" | "verworfen" | "alle") {
    const mandantId = await this.kontext.mandantId();
    const [zeilen, k, [anzahl]] = await Promise.all([
      this.db
        .select()
        .from(be)
        .where(and(eq(be.mandantId, mandantId), status === "alle" ? undefined : eq(be.status, status)))
        .orderBy(status === "neu" ? be.empfangenAm : desc(be.empfangenAm))
        .limit(200),
      this.kandidaten(),
      this.db
        .select({ neu: sql<number>`count(*) filter (where ${be.status} = 'neu')::int`, erfasst: sql<number>`count(*) filter (where ${be.status} = 'erfasst')::int`, verworfen: sql<number>`count(*) filter (where ${be.status} = 'verworfen')::int` })
        .from(be)
        .where(eq(be.mandantId, mandantId)),
    ]);
    return {
      postfach: this.postfach ? { adresse: this.postfach.adresse } : null,
      anzahl: anzahl!,
      ...k,
      eingaenge: zeilen.map(({ text, ...z }) => {
        const daten = z.daten as unknown as Rechnungsdaten;
        const neu = z.status === "neu";
        const projekte = [...new Map(k.gewerke.map((x) => [x.projektId, { id: x.projektId, nr: x.projektNr, suchcode: x.projektSuchcode, ort: x.projektOrt }])).values()];
        const projektId = neu ? projektVorschlag(daten, text ?? "", projekte) : null;
        const vorschlag = neu ? eingangVorschlag(daten, text ?? "", z.absender, k.handwerker, k.vertraege) : null;
        const vertrag = vorschlag?.handwerkervertragId ? k.vertraege.find((v) => v.id === vorschlag.handwerkervertragId) : undefined;
        return {
          ...z,
          daten,
          vorschlag,
          // Rechnung (kumuliert) gegen Auftrag inkl. beauftragter Nachträge des vorgeschlagenen Vertrags
          auftragsrahmen: vertrag && daten.betragBrutto ? auftragsrahmen(daten.betragBrutto, vertrag.vertragBrutto, vertrag.nachtraege, daten.schlussrechnung) : null,
          // für „Handwerker anlegen“ / „Vertrag anlegen“
          neuerHandwerker: neu ? neuerHandwerker(daten, z.absender) : null,
          projektId,
          gewerkId: neu ? gewerkVorschlag(k.gewerke.filter((x) => !projektId || x.projektId === projektId), `${daten.verkaeufer ?? ""} ${z.betreff ?? ""} ${z.dateiname}`, text ?? "") : null,
        };
      }),
    };
  }

  private async eingang(id: string) {
    const [x] = await this.db.select().from(be).where(and(eq(be.id, id), eq(be.mandantId, await this.kontext.mandantId())));
    if (!x) throw new NotFoundException("Eingang nicht gefunden");
    return x;
  }

  /** Als Eingangsrechnung erfassen; die Datei hängt danach an der Rechnung (Ordner „Rechnungen“). */
  async erfassen(id: string, werte: EingangsrechnungEingabe, benutzer: string) {
    const x = await this.eingang(id);
    if (x.status !== "neu") throw new ConflictException("Dieser Eingang ist bereits erledigt.");
    return this.db.transaction(async (tx) => {
      const r = await this.kosten.rechnungAnlegen(tx, werte, benutzer);
      await tx.update(dok).set({ objektTyp: "eingangsrechnung", objektId: r.id, geaendertAm: new Date() }).where(eq(dok.id, x.dokumentId));
      const [neu] = await tx
        .update(be)
        .set({ status: "erfasst", eingangsrechnungId: r.id, erledigtVon: benutzer, erledigtAm: new Date(), geaendertAm: new Date() })
        .where(and(eq(be.id, id), eq(be.status, "neu")))
        .returning({ id: be.id });
      if (!neu) throw new ConflictException("Dieser Eingang wurde gerade von jemand anderem bearbeitet.");
      await protokollieren(tx, { tabelle: "belegeingang", id, aktion: "update", alt: { status: "neu" }, neu: { status: "erfasst", eingangsrechnung: r.id, rechnungsnr: r.rechnungsnr }, benutzer });
      return { eingangsrechnungId: r.id };
    });
  }

  async verwerfen(id: string, bemerkung: string | null, benutzer: string) {
    const x = await this.eingang(id);
    if (x.status !== "neu") throw new ConflictException("Dieser Eingang ist bereits erledigt.");
    if (!bemerkung) throw new BadRequestException("Bitte einen Grund angeben (z. B. Werbung, Duplikat, keine Rechnung).");
    await this.db.transaction(async (tx) => {
      await tx.update(be).set({ status: "verworfen", bemerkung, erledigtVon: benutzer, erledigtAm: new Date(), geaendertAm: new Date() }).where(eq(be.id, id));
      await protokollieren(tx, { tabelle: "belegeingang", id, aktion: "update", alt: { status: "neu" }, neu: { status: "verworfen", bemerkung }, benutzer });
    });
    return { id, status: "verworfen" };
  }

  async wiederherstellen(id: string, benutzer: string) {
    const x = await this.eingang(id);
    if (x.status !== "verworfen") throw new ConflictException("Nur verworfene Eingänge können wiederhergestellt werden.");
    await this.db.transaction(async (tx) => {
      await tx.update(be).set({ status: "neu", bemerkung: null, erledigtVon: null, erledigtAm: null, geaendertAm: new Date() }).where(eq(be.id, id));
      await protokollieren(tx, { tabelle: "belegeingang", id, aktion: "update", alt: { status: "verworfen" }, neu: { status: "neu" }, benutzer });
    });
    return { id, status: "neu" };
  }
}
