import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { schema } from "@bt/db";
import { briefAnrede, EINHEIT_TYP_TEXT, MAHNSTUFEN, mailAusText, money, SCHREIBEN_ARTEN, SchreibenVersandEingabe, schreibenVorlage, type SchreibenArt, type SchreibenDaten } from "@bt/domain";
import { eq } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { memoryStorage } from "multer";
import { Benutzer, pruefe } from "../common/eingabe.js";
import { KontextService } from "../common/kontext.service.js";
import { protokollieren } from "../common/protokoll.js";
import { DB, type Db } from "../db.provider.js";
import { SPEICHER, type Speicher } from "../dokumente/speicher.js";
import { NachrichtenService } from "../benachrichtigung/nachrichten.service.js";
import { VerkaufService } from "../verkauf/verkauf.service.js";

const MAX_PDF = 10 * 1024 * 1024;

/** Schreiben an Käufer als PDF per E-Mail; das PDF wird am Kaufvertrag abgelegt (Ordner „Schriftverkehr“). */
@Controller("schreiben")
export class SchreibenController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
    @Inject(VerkaufService) private readonly verkauf: VerkaufService,
    @Inject(NachrichtenService) private readonly nachrichten: NachrichtenService,
    @Inject(SPEICHER) private readonly speicher: Speicher,
  ) {}

  /** Kaufvertrag und Daten für die Mailvorlage zu einem Schreiben (inkl. Mandantenprüfung). */
  private async aufloesen(artText: string, id: string) {
    if (!(SCHREIBEN_ARTEN as readonly string[]).includes(artText)) throw new NotFoundException("Unbekannte Schreibenart");
    const art = artText as SchreibenArt;
    let kaufvertragId: string;
    let teil: Pick<SchreibenDaten, "nummer" | "betrag" | "frist" | "titel" | "gutschrift" | "nurSonderleistungen">;
    if (art === "zahlungsanforderung") {
      const [a] = await this.db.select().from(schema.zahlungsanforderung).where(eq(schema.zahlungsanforderung.id, id));
      if (!a) throw new NotFoundException("Zahlungsanforderung nicht gefunden");
      kaufvertragId = a.kaufvertragId;
      const raten = await this.db.select({ typ: schema.rate.typ }).from(schema.rate).where(eq(schema.rate.zahlungsanforderungId, id));
      teil = { nummer: a.rechnungsnr, betrag: a.betrag, frist: a.faelligAm, nurSonderleistungen: raten.length > 0 && raten.every((r) => r.typ !== "mabv") };
    } else if (art === "mahnung") {
      const [m] = await this.db
        .select({ m: schema.mahnung, a: schema.zahlungsanforderung })
        .from(schema.mahnung)
        .innerJoin(schema.zahlungsanforderung, eq(schema.mahnung.zahlungsanforderungId, schema.zahlungsanforderung.id))
        .where(eq(schema.mahnung.id, id));
      if (!m) throw new NotFoundException("Mahnung nicht gefunden");
      kaufvertragId = m.a.kaufvertragId;
      const gesamt = money(m.m.offenerBetrag).plus(m.m.verzugszinsen).plus(m.m.mahngebuehr).toFixed(2);
      teil = { nummer: m.a.rechnungsnr, betrag: gesamt, frist: m.m.fristBis, titel: MAHNSTUFEN[m.m.stufe - 1]?.titel };
    } else {
      const [s] = await this.db.select().from(schema.sonderwunsch).where(eq(schema.sonderwunsch.id, id));
      if (!s) throw new NotFoundException("Sonderwunsch nicht gefunden");
      kaufvertragId = s.kaufvertragId;
      teil = { nummer: "", betrag: s.betragBrutto, frist: s.status === "angebot" ? s.gueltigBis : null, titel: s.bezeichnung, gutschrift: s.art === "gutschrift" };
      teil.nummer = String(s.nr);
    }
    const v = await this.verkauf.vertrag(kaufvertragId);
    if (art === "sonderwunsch") teil.nummer = `${v.nr}-${teil.nummer}`;
    const empfaenger = v.kaeufer.find((k) => k.id === v.zahlungsanforderungAn) ?? v.kaeufer[0];
    const objekt = `${v.projekt.suchcode}, ${v.einheiten.map((e) => `${EINHEIT_TYP_TEXT[e.typ as keyof typeof EINHEIT_TYP_TEXT] ?? e.typ} ${e.nr}`).join(", ")}`;
    const daten: SchreibenDaten = { bautraeger: v.gesellschaft.name, anrede: briefAnrede(empfaenger), objekt, ...teil };
    return { art, v, daten };
  }

  /** Mehrere Schreiben einer Art (z. B. Mahnlauf, Sammelanforderung) mit Empfängern und Versandstand. */
  @Get(":art")
  async sammel(@Param("art") art: string, @Query("ids") ids?: string) {
    const liste = [...new Set((ids ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/.test(x)))];
    if (!liste.length || liste.length > 100) throw new BadRequestException({ message: "Eingabe ungültig", fehler: ["1 bis 100 Schreiben angeben."] });
    const ergebnis = [];
    for (const id of liste) {
      const { art: a, v, daten } = await this.aufloesen(art, id);
      const vorlage = schreibenVorlage(a, daten);
      ergebnis.push({
        id,
        nummer: daten.nummer,
        titel: daten.titel ?? null,
        betrag: daten.betrag,
        dateiname: vorlage.dateiname,
        betreff: vorlage.betreff,
        kaufvertrag: { id: v.id, nr: v.nr },
        kaeufer: v.kaeufer.map((k) => [k.vorname, k.nachname].filter(Boolean).join(" ") || k.firma || k.suchcode).join(", "),
        an: [...new Set(v.kaeufer.map((k) => k.email).filter((e): e is string => !!e))],
        vermerke: await this.nachrichten.zuBezug(id),
      });
    }
    return { art, versandweg: { art: this.nachrichten.versand.name, beschreibung: this.nachrichten.versand.beschreibung }, schreiben: ergebnis };
  }

  /** Versand mit dem vorgeschlagenen Text (für den Sammelversand). */
  @Post(":art/:id/versenden-standard")
  @UseInterceptors(FileInterceptor("datei", { storage: memoryStorage(), limits: { fileSize: MAX_PDF } }))
  async versendenStandard(@Param("art") art: string, @Param("id", ParseUUIDPipe) id: string, @UploadedFile() datei: Express.Multer.File | undefined, @Benutzer() benutzer: string) {
    const v = await this.vorlage(art, id);
    if (!v.an.length) throw new BadRequestException({ message: "Eingabe ungültig", fehler: ["Für diesen Kaufvertrag ist keine E-Mail-Adresse hinterlegt."] });
    return this.versenden(art, id, datei, { an: v.an.join(", "), betreff: v.betreff, text: v.text }, benutzer);
  }

  @Get(":art/:id")
  async vorlage(@Param("art") art: string, @Param("id", ParseUUIDPipe) id: string) {
    const { art: a, v, daten } = await this.aufloesen(art, id);
    return {
      ...schreibenVorlage(a, daten),
      an: [...new Set(v.kaeufer.map((k) => k.email).filter((e): e is string => !!e))],
      ohneEmail: v.kaeufer.filter((k) => !k.email).map((k) => [k.vorname, k.nachname].filter(Boolean).join(" ") || k.firma || k.suchcode),
      kaufvertrag: { id: v.id, nr: v.nr },
      versandweg: { art: this.nachrichten.versand.name, beschreibung: this.nachrichten.versand.beschreibung },
      vermerke: await this.nachrichten.zuBezug(id),
    };
  }

  @Post(":art/:id/versenden")
  @UseInterceptors(FileInterceptor("datei", { storage: memoryStorage(), limits: { fileSize: MAX_PDF } }))
  async versenden(@Param("art") art: string, @Param("id", ParseUUIDPipe) id: string, @UploadedFile() datei: Express.Multer.File | undefined, @Body() body: unknown, @Benutzer() benutzer: string) {
    const w = pruefe(SchreibenVersandEingabe, body);
    if (!datei || !datei.buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new BadRequestException({ message: "Eingabe ungültig", fehler: ["Das Schreiben konnte nicht als PDF erzeugt werden."] });
    const { art: a, v, daten } = await this.aufloesen(art, id);
    const { dateiname } = schreibenVorlage(a, daten);
    const mandantId = await this.kontext.mandantId();
    const speicherKey = `${mandantId}/${new Date().getFullYear()}/${randomUUID()}`;
    await this.speicher.speichern(speicherKey, datei.buffer);
    return this.db.transaction(async (tx) => {
      const [dok] = await tx
        .insert(schema.dokument)
        .values({
          mandantId,
          objektTyp: "kaufvertrag",
          objektId: v.id,
          ordner: "Schriftverkehr",
          beschreibung: `per E-Mail an ${w.an.join(", ")}`.slice(0, 300),
          dateiname,
          mimeType: "application/pdf",
          groesse: datei.size,
          speicherKey,
          sha256: createHash("sha256").update(datei.buffer).digest("hex"),
          hochgeladenVon: benutzer,
        })
        .returning();
      const nachrichtId = await this.nachrichten.einreihen(
        { an: w.an, mail: mailAusText(w.betreff, w.text, `${v.gesellschaft.name} · ${daten.objekt}`), anlass: `schreiben_${a}`, bezugId: id, mandantId, anhaenge: [{ dokumentId: dok!.id, dateiname }] },
        tx,
      );
      await protokollieren(tx, { tabelle: "dokument", id: dok!.id, aktion: "insert", neu: { dateiname, kaufvertrag: v.nr, versandAn: w.an, betreff: w.betreff }, benutzer });
      return { nachrichtId, dokumentId: dok!.id, dateiname };
    });
  }
}
