import { BadRequestException, Body, Controller, Get, Inject, Injectable, Param, ParseUUIDPipe, Post, Query, UploadedFiles, UseInterceptors, type OnModuleDestroy } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { EingangsrechnungEingabe } from "@bt/domain";
import { memoryStorage } from "multer";
import { Benutzer, pruefe } from "../common/eingabe.js";
import { RechnungseingangService } from "./rechnungseingang.service.js";

const MAX = 20 * 1024 * 1024;

@Controller("rechnungseingang")
export class RechnungseingangController {
  constructor(@Inject(RechnungseingangService) private readonly eingang: RechnungseingangService) {}

  @Get()
  liste(@Query("status") status?: string) {
    return this.eingang.liste(status === "erfasst" || status === "verworfen" || status === "alle" ? status : "neu");
  }

  /** Rechnungen hochladen (PDF, ZUGFeRD/Factur-X oder XRechnung-XML; mehrere Dateien). */
  @Post()
  @UseInterceptors(FilesInterceptor("dateien", 20, { storage: memoryStorage(), limits: { fileSize: MAX } }))
  async hochladen(@UploadedFiles() dateien: Express.Multer.File[] | undefined, @Benutzer() benutzer: string) {
    if (!dateien?.length) throw new BadRequestException("Bitte mindestens eine Rechnung auswählen.");
    const r = await this.eingang.aufnehmen({ quelle: "upload", dateien: dateien.map((d) => ({ name: Buffer.from(d.originalname, "latin1").toString("utf8"), inhalt: d.buffer, typ: d.mimetype })) }, benutzer);
    if (!r.angelegt.length) throw new BadRequestException("Keine Rechnung erkannt – bitte PDF- oder XRechnung-Dateien hochladen.");
    return r;
  }

  @Post("abrufen")
  abrufen(@Benutzer() benutzer: string) {
    return this.eingang.abrufen(benutzer);
  }

  @Post(":id/erfassen")
  erfassen(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    return this.eingang.erfassen(id, pruefe(EingangsrechnungEingabe, body), benutzer);
  }

  @Post(":id/verwerfen")
  verwerfen(@Param("id", ParseUUIDPipe) id: string, @Body() body: { bemerkung?: string }, @Benutzer() benutzer: string) {
    return this.eingang.verwerfen(id, (typeof body?.bemerkung === "string" ? body.bemerkung.trim().slice(0, 300) : "") || null, benutzer);
  }

  @Post(":id/wiederherstellen")
  wiederherstellen(@Param("id", ParseUUIDPipe) id: string, @Benutzer() benutzer: string) {
    return this.eingang.wiederherstellen(id, benutzer);
  }
}

/** Hintergrundlauf: Rechnungspostfach alle 10 Minuten abholen (nur wenn eingerichtet). */
@Injectable()
export class Abruflauf implements OnModuleDestroy {
  private takt?: NodeJS.Timeout;
  private laeuft = false;

  constructor(@Inject(RechnungseingangService) private readonly eingang: RechnungseingangService) {}

  starten(intervallMs = 10 * 60_000) {
    if (!this.eingang.postfach) return;
    this.takt = setInterval(() => void this.runde(), intervallMs);
    void this.runde();
  }

  async runde() {
    if (this.laeuft) return;
    this.laeuft = true;
    try {
      await this.eingang.abrufen("Rechnungspostfach");
    } catch (e) {
      console.error("Rechnungspostfach:", (e as Error).message);
    } finally {
      this.laeuft = false;
    }
  }

  onModuleDestroy() {
    if (this.takt) clearInterval(this.takt);
  }
}
