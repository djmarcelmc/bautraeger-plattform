import { Body, Controller, Delete, Get, Header, Inject, Param, ParseUUIDPipe, Post, Put, Query, StreamableFile } from "@nestjs/common";
import { schema } from "@bt/db";
import { DatevExportEingabe, KontierungEingabe, kontierungFuer } from "@bt/domain";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { Benutzer, pruefe } from "../common/eingabe.js";
import { protokollieren } from "../common/protokoll.js";
import { DB, type Db } from "../db.provider.js";
import { BuchhaltungService, type JournalFilter } from "./buchhaltung.service.js";

const datum = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);

@Controller("buchhaltung")
export class BuchhaltungController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(BuchhaltungService) private readonly buchhaltung: BuchhaltungService,
  ) {}

  /** Journal einer Gesellschaft; vorher werden neue und geänderte Vorgänge automatisch gebucht. */
  @Get("journal")
  journal(
    @Query("gesellschaftId", ParseUUIDPipe) gesellschaftId: string,
    @Query("von") von: string | undefined,
    @Query("bis") bis: string | undefined,
    @Query("status") status: string | undefined,
    @Query("quelle") quelle: string | undefined,
    @Benutzer() benutzer: string,
  ) {
    const f: JournalFilter = {
      von: datum(von),
      bis: datum(bis),
      status: status === "neu" || status === "exportiert" ? status : "alle",
      quelle: quelle && /^[a-z_]+$/.test(quelle) ? quelle : undefined,
    };
    return this.buchhaltung.journal(gesellschaftId, f, benutzer);
  }

  @Post("abgleich")
  async abgleich(@Body() body: unknown, @Benutzer() benutzer: string) {
    const { gesellschaftId } = pruefe(z.object({ gesellschaftId: z.uuid("Gesellschaft wählen") }), body);
    const { verweise: _, ...r } = await this.buchhaltung.abgleichen(gesellschaftId, benutzer);
    return r;
  }

  @Post("export")
  @Header("Content-Type", "text/csv; charset=windows-1252")
  async export(@Body() body: unknown, @Benutzer() benutzer: string) {
    const e = pruefe(DatevExportEingabe, body);
    const r = await this.buchhaltung.exportieren(e, benutzer);
    return new StreamableFile(r.datei, { disposition: `attachment; filename="${r.dateiname}"` });
  }

  @Get("kontierung/:gesellschaftId")
  async kontierung(@Param("gesellschaftId", ParseUUIDPipe) id: string) {
    const ges = await this.buchhaltung.gesellschaft(id);
    return { kontierung: kontierungFuer(ges), gespeichert: !!ges.kontierung, skr: ges.skr ?? "03", sachkontenlaenge: ges.sachkontenlaenge ?? 4 };
  }

  /** Kontenzuordnung speichern; nicht exportierte Buchungen werden beim nächsten Abgleich angepasst. */
  @Put("kontierung/:gesellschaftId")
  async kontierungSpeichern(@Param("gesellschaftId", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const ges = await this.buchhaltung.gesellschaft(id);
    const k = pruefe(KontierungEingabe, body);
    await this.db.transaction(async (tx) => {
      await tx.update(schema.gesellschaft).set({ kontierung: k, geaendertAm: new Date() }).where(eq(schema.gesellschaft.id, id));
      await protokollieren(tx, { tabelle: "gesellschaft", id, aktion: "update", alt: { kontierung: ges.kontierung }, neu: { kontierung: k }, benutzer });
    });
    return this.kontierung(id);
  }

  @Delete("kontierung/:gesellschaftId")
  async kontierungZuruecksetzen(@Param("gesellschaftId", ParseUUIDPipe) id: string, @Benutzer() benutzer: string) {
    const ges = await this.buchhaltung.gesellschaft(id);
    await this.db.transaction(async (tx) => {
      await tx.update(schema.gesellschaft).set({ kontierung: null, geaendertAm: new Date() }).where(eq(schema.gesellschaft.id, id));
      await protokollieren(tx, { tabelle: "gesellschaft", id, aktion: "update", alt: { kontierung: ges.kontierung }, neu: { kontierung: null }, benutzer });
    });
    return this.kontierung(id);
  }
}
