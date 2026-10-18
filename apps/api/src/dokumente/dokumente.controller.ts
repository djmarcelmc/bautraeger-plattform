import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { schema } from "@bt/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import { memoryStorage } from "multer";
import { z } from "zod";
import { Benutzer, pruefe } from "../common/eingabe.js";
import { KontextService } from "../common/kontext.service.js";
import { protokollieren } from "../common/protokoll.js";
import { DB, type Db } from "../db.provider.js";
import { KostenService } from "../kosten/kosten.service.js";
import { MaengelService } from "../maengel/maengel.service.js";
import { SPEICHER, type Speicher } from "./speicher.js";

const d = schema.dokument;
export const MAX_GROESSE = 25 * 1024 * 1024;
const OBJEKT_TYPEN = ["projekt", "einheit", "geschaeftspartner", "kaufvertrag", "gesellschaft", "handwerkervertrag", "eingangsrechnung", "mangel"] as const;

const Metadaten = z.object({
  objektTyp: z.enum(OBJEKT_TYPEN),
  objektId: z.uuid(),
  ordner: z.string().trim().max(100).optional(),
  beschreibung: z.string().trim().max(300).optional(),
});

@Controller("dokumente")
export class DokumenteController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
    @Inject(SPEICHER) private readonly speicher: Speicher,
    @Inject(KostenService) private readonly kosten: KostenService,
    @Inject(MaengelService) private readonly maengel: MaengelService,
  ) {}

  /** Prüft, dass das Objekt existiert und zum Mandanten gehört. */
  private async objektPruefen(typ: (typeof OBJEKT_TYPEN)[number], id: string, mandantId: string) {
    const { projekt: p, gesellschaft: g, einheit: e, kaufvertrag: k, geschaeftspartner: gp } = schema;
    const abfragen = {
      gesellschaft: () => this.db.select({ id: g.id }).from(g).where(and(eq(g.id, id), eq(g.mandantId, mandantId))),
      geschaeftspartner: () => this.db.select({ id: gp.id }).from(gp).where(and(eq(gp.id, id), eq(gp.mandantId, mandantId))),
      projekt: () =>
        this.db.select({ id: p.id }).from(p).innerJoin(g, eq(p.gesellschaftId, g.id)).where(and(eq(p.id, id), eq(g.mandantId, mandantId))),
      einheit: () =>
        this.db
          .select({ id: e.id })
          .from(e)
          .innerJoin(p, eq(e.projektId, p.id))
          .innerJoin(g, eq(p.gesellschaftId, g.id))
          .where(and(eq(e.id, id), eq(g.mandantId, mandantId))),
      kaufvertrag: () =>
        this.db
          .select({ id: k.id })
          .from(k)
          .innerJoin(p, eq(k.projektId, p.id))
          .innerJoin(g, eq(p.gesellschaftId, g.id))
          .where(and(eq(k.id, id), eq(g.mandantId, mandantId))),
    };
    if (typ === "handwerkervertrag") return void (await this.kosten.vertrag(id));
    if (typ === "eingangsrechnung") return void (await this.kosten.rechnung(id));
    if (typ === "mangel") return void (await this.maengel.mangel(id));
    const [x] = await abfragen[typ]();
    if (!x) throw new NotFoundException("Objekt nicht gefunden");
  }

  @Get()
  async liste(@Query("objektTyp") objektTyp: string, @Query("objektId", ParseUUIDPipe) objektId: string) {
    const mandantId = await this.kontext.mandantId();
    return this.db
      .select({
        id: d.id,
        dateiname: d.dateiname,
        mimeType: d.mimeType,
        groesse: d.groesse,
        ordner: d.ordner,
        beschreibung: d.beschreibung,
        hochgeladenVon: d.hochgeladenVon,
        angelegtAm: d.angelegtAm,
      })
      .from(d)
      .where(and(eq(d.mandantId, mandantId), eq(d.objektTyp, objektTyp), eq(d.objektId, objektId), isNull(d.geloeschtAm)))
      .orderBy(desc(d.angelegtAm));
  }

  @Post()
  @UseInterceptors(FileInterceptor("datei", { storage: memoryStorage(), limits: { fileSize: MAX_GROESSE } }))
  async hochladen(@UploadedFile() datei: Express.Multer.File | undefined, @Body() body: unknown, @Benutzer() benutzer: string) {
    if (!datei) throw new BadRequestException("Keine Datei übermittelt");
    const meta = pruefe(Metadaten, body);
    const mandantId = await this.kontext.mandantId();
    await this.objektPruefen(meta.objektTyp, meta.objektId, mandantId);
    // Dateinamen kommen von multer als latin1 – nach UTF-8 umwandeln
    const dateiname = Buffer.from(datei.originalname, "latin1").toString("utf8").replace(/[/\\]/g, "_").slice(0, 200);
    const sha256 = createHash("sha256").update(datei.buffer).digest("hex");
    const jahr = new Date().getFullYear();
    const speicherKey = `${mandantId}/${jahr}/${randomUUID()}`;
    await this.speicher.speichern(speicherKey, datei.buffer);
    return this.db.transaction(async (tx) => {
      const [neu] = await tx
        .insert(d)
        .values({
          mandantId,
          objektTyp: meta.objektTyp,
          objektId: meta.objektId,
          ordner: meta.ordner || null,
          beschreibung: meta.beschreibung || null,
          dateiname,
          mimeType: datei.mimetype,
          groesse: datei.size,
          speicherKey,
          sha256,
          hochgeladenVon: benutzer,
        })
        .returning();
      await protokollieren(tx, {
        tabelle: "dokument",
        id: neu!.id,
        aktion: "insert",
        neu: { dateiname, sha256, objektTyp: meta.objektTyp, objektId: meta.objektId },
        benutzer,
      });
      return neu;
    });
  }

  private async laden(id: string) {
    const [x] = await this.db
      .select()
      .from(d)
      .where(and(eq(d.id, id), eq(d.mandantId, await this.kontext.mandantId()), isNull(d.geloeschtAm)));
    if (!x) throw new NotFoundException("Dokument nicht gefunden");
    return x;
  }

  @Get(":id/datei")
  async datei(@Param("id", ParseUUIDPipe) id: string) {
    const x = await this.laden(id);
    return new StreamableFile(this.speicher.lesen(x.speicherKey), {
      type: x.mimeType ?? "application/octet-stream",
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(x.dateiname)}`,
      length: x.groesse ?? undefined,
    });
  }

  /** Blendet ein Dokument aus (GoBD: die Datei bleibt erhalten, der Vorgang wird protokolliert). */
  @Delete(":id")
  async loeschen(@Param("id", ParseUUIDPipe) id: string, @Benutzer() benutzer: string) {
    const x = await this.laden(id);
    await this.db.transaction(async (tx) => {
      await tx.update(d).set({ geloeschtAm: new Date(), geloeschtVon: benutzer }).where(eq(d.id, id));
      await protokollieren(tx, { tabelle: "dokument", id, aktion: "delete", alt: { dateiname: x.dateiname, sha256: x.sha256 }, benutzer });
    });
    return { geloescht: true };
  }
}
