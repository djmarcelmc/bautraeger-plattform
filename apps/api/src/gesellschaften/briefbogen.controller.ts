import { BadRequestException, Body, Controller, Delete, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Put, StreamableFile, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { schema } from "@bt/db";
import { BRIEFBOGEN_STANDARD, BriefbogenEinstellung } from "@bt/domain";
import { and, eq } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { memoryStorage } from "multer";
import { PDFDocument } from "pdf-lib";
import { Benutzer, pruefe } from "../common/eingabe.js";
import { KontextService } from "../common/kontext.service.js";
import { protokollieren } from "../common/protokoll.js";
import { DB, type Db } from "../db.provider.js";
import { SPEICHER, type Speicher } from "../dokumente/speicher.js";

const g = schema.gesellschaft;
const MAX = 5 * 1024 * 1024;

interface Gespeichert {
  dokumentId?: string;
  dateiname?: string;
  seiten?: number;
  einstellung?: unknown;
}

/** Briefbogen einer Gesellschaft: PDF (1. Seite für die erste Briefseite, ggf. 2. Seite für Folgeseiten) und Satzspiegel. */
@Controller("gesellschaften/:id/briefbogen")
export class BriefbogenController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
    @Inject(SPEICHER) private readonly speicher: Speicher,
  ) {}

  private async laden(id: string) {
    const [x] = await this.db.select({ id: g.id, name: g.name, briefbogen: g.briefbogen }).from(g).where(and(eq(g.id, id), eq(g.mandantId, await this.kontext.mandantId())));
    if (!x) throw new NotFoundException("Gesellschaft nicht gefunden");
    const b = (x.briefbogen ?? {}) as Gespeichert;
    const e = BriefbogenEinstellung.safeParse(b.einstellung ?? {});
    return { gesellschaft: x, gespeichert: b, einstellung: e.success ? e.data : BRIEFBOGEN_STANDARD };
  }

  @Get()
  async abrufen(@Param("id", ParseUUIDPipe) id: string) {
    const { gespeichert: b, einstellung } = await this.laden(id);
    return { aktiv: !!b.dokumentId, dateiname: b.dateiname ?? null, seiten: b.seiten ?? null, einstellung };
  }

  @Get("datei")
  async datei(@Param("id", ParseUUIDPipe) id: string) {
    const { gespeichert: b } = await this.laden(id);
    if (!b.dokumentId) throw new NotFoundException("Kein Briefbogen hinterlegt");
    const [d] = await this.db.select().from(schema.dokument).where(eq(schema.dokument.id, b.dokumentId));
    if (!d) throw new NotFoundException("Briefbogen nicht gefunden");
    return new StreamableFile(this.speicher.lesen(d.speicherKey), { type: "application/pdf", disposition: `inline; filename*=UTF-8''${encodeURIComponent(d.dateiname)}` });
  }

  @Post()
  @UseInterceptors(FileInterceptor("datei", { storage: memoryStorage(), limits: { fileSize: MAX } }))
  async hochladen(@Param("id", ParseUUIDPipe) id: string, @UploadedFile() datei: Express.Multer.File | undefined, @Benutzer() benutzer: string) {
    const { gespeichert } = await this.laden(id);
    const fehler = (text: string) => new BadRequestException({ message: "Eingabe ungültig", fehler: [text] });
    if (!datei) throw fehler("Bitte eine PDF-Datei auswählen.");
    if (!datei.buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw fehler("Der Briefbogen muss eine PDF-Datei sein (z. B. aus Word „Speichern unter → PDF“).");
    let seiten: number;
    try {
      const pdf = await PDFDocument.load(datei.buffer, { ignoreEncryption: true });
      seiten = pdf.getPageCount();
      const { width, height } = pdf.getPage(0).getSize();
      if (Math.abs(width - 595.3) > 6 || Math.abs(height - 841.9) > 6) throw fehler(`Der Briefbogen muss DIN A4 hochkant sein (erkannt: ${Math.round((width / 72) * 25.4)} × ${Math.round((height / 72) * 25.4)} mm).`);
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw fehler("Die PDF-Datei konnte nicht gelesen werden.");
    }
    const mandantId = await this.kontext.mandantId();
    const dateiname = Buffer.from(datei.originalname, "latin1").toString("utf8").replace(/[/\\]/g, "_").slice(0, 200);
    const speicherKey = `${mandantId}/${new Date().getFullYear()}/${randomUUID()}`;
    await this.speicher.speichern(speicherKey, datei.buffer);
    return this.db.transaction(async (tx) => {
      const [dok] = await tx
        .insert(schema.dokument)
        .values({ mandantId, objektTyp: "gesellschaft", objektId: id, ordner: "Briefbogen", beschreibung: "Briefbogen für Schreiben", dateiname, mimeType: "application/pdf", groesse: datei.size, speicherKey, sha256: createHash("sha256").update(datei.buffer).digest("hex"), hochgeladenVon: benutzer })
        .returning();
      const neu: Gespeichert = { ...gespeichert, dokumentId: dok!.id, dateiname, seiten: Math.min(seiten, 2) };
      await tx.update(g).set({ briefbogen: neu as Record<string, unknown>, geaendertAm: new Date() }).where(eq(g.id, id));
      await protokollieren(tx, { tabelle: "gesellschaft", id, aktion: "update", alt: { briefbogen: gespeichert.dateiname ?? null }, neu: { briefbogen: dateiname, seiten }, benutzer });
      return { aktiv: true, dateiname, seiten: neu.seiten };
    });
  }

  @Put()
  async einstellen(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const einstellung = pruefe(BriefbogenEinstellung, body);
    const { gespeichert, einstellung: alt } = await this.laden(id);
    await this.db.transaction(async (tx) => {
      await tx.update(g).set({ briefbogen: { ...gespeichert, einstellung } as Record<string, unknown>, geaendertAm: new Date() }).where(eq(g.id, id));
      await protokollieren(tx, { tabelle: "gesellschaft", id, aktion: "update", alt: { briefbogen: alt }, neu: { briefbogen: einstellung }, benutzer });
    });
    return { einstellung };
  }

  @Delete()
  async entfernen(@Param("id", ParseUUIDPipe) id: string, @Benutzer() benutzer: string) {
    const { gespeichert } = await this.laden(id);
    await this.db.transaction(async (tx) => {
      await tx.update(g).set({ briefbogen: { einstellung: gespeichert.einstellung } as Record<string, unknown>, geaendertAm: new Date() }).where(eq(g.id, id));
      await protokollieren(tx, { tabelle: "gesellschaft", id, aktion: "update", alt: { briefbogen: gespeichert.dateiname ?? null }, neu: { briefbogen: null }, benutzer });
    });
    return { aktiv: false };
  }
}
