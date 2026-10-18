import { BadRequestException, Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { z } from "zod";
import { Benutzer, pruefe } from "../common/eingabe.js";
import { BankabgleichService } from "./bankabgleich.service.js";

const MAX = 10 * 1024 * 1024;
const betrag = z.preprocess((v) => (typeof v === "string" ? v.trim().replace(/\./g, "").replace(",", ".") : v), z.coerce.number("Betrag angeben").positive("Betrag > 0").transform((n) => n.toFixed(2)));
const ZuordnungEingabe = z.discriminatedUnion("art", [
  z.object({ art: z.literal("anforderung"), posten: z.array(z.object({ id: z.uuid(), betrag })).min(1, "Bitte eine Zahlungsanforderung wählen") }),
  z.object({ art: z.literal("zahlungslauf"), id: z.uuid("Zahlungslauf wählen") }),
  z.object({ art: z.literal("zahlungsausgang"), id: z.uuid("Zahlung wählen") }),
]);

@Controller("bankabgleich")
export class BankabgleichController {
  constructor(@Inject(BankabgleichService) private readonly bank: BankabgleichService) {}

  @Get()
  liste(@Query("gesellschaftId", ParseUUIDPipe) gesellschaftId: string, @Query("status") status?: string) {
    return this.bank.liste(gesellschaftId, status === "zugeordnet" || status === "ignoriert" || status === "alle" ? status : "offen");
  }

  /** Kontoauszug (CAMT.053/052/054 oder MT940) einlesen. */
  @Post("import")
  @UseInterceptors(FileInterceptor("datei", { storage: memoryStorage(), limits: { fileSize: MAX } }))
  importieren(@UploadedFile() datei: Express.Multer.File | undefined, @Body() body: { gesellschaftId?: string }, @Benutzer() benutzer: string) {
    if (!datei?.size) throw new BadRequestException("Bitte eine Kontoauszugsdatei auswählen.");
    const gid = body?.gesellschaftId || undefined;
    if (gid && !/^[0-9a-f-]{36}$/.test(gid)) throw new BadRequestException("Ungültige Gesellschaft");
    return this.bank.importieren(datei, gid, benutzer);
  }

  @Post("vorschlaege")
  vorschlaege(@Body() body: unknown, @Benutzer() benutzer: string) {
    const { gesellschaftId } = pruefe(z.object({ gesellschaftId: z.uuid("Gesellschaft wählen") }), body);
    return this.bank.vorschlaegeUebernehmen(gesellschaftId, benutzer);
  }

  @Post("umsaetze/:id/zuordnen")
  zuordnen(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    return this.bank.zuordnen(id, pruefe(ZuordnungEingabe, body), benutzer);
  }

  @Post("umsaetze/:id/ignorieren")
  ignorieren(@Param("id", ParseUUIDPipe) id: string, @Body() body: { bemerkung?: string }, @Benutzer() benutzer: string) {
    return this.bank.ignorieren(id, (typeof body?.bemerkung === "string" ? body.bemerkung.trim().slice(0, 300) : "") || null, benutzer);
  }

  @Post("umsaetze/:id/zuruecksetzen")
  zuruecksetzen(@Param("id", ParseUUIDPipe) id: string, @Benutzer() benutzer: string) {
    return this.bank.zuruecksetzen(id, benutzer);
  }
}
