import { Body, Controller, Delete, Get, Header, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res, StreamableFile } from "@nestjs/common";
import { schema } from "@bt/db";
import { DatevExportEingabe, KontierungEingabe, kontierungFuer } from "@bt/domain";
import { z } from "zod";
import { and, eq, gte, isNotNull, lte } from "drizzle-orm";
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
  async export(@Body() body: unknown, @Benutzer() benutzer: string, @Res({ passthrough: true }) res: { setHeader(k: string, v: string): void }) {
    const e = pruefe(DatevExportEingabe, body);
    const r = await this.buchhaltung.exportieren(e, benutzer);
    res.setHeader("X-Export-Stapel", r.stapel);
    return new StreamableFile(r.datei, { disposition: `attachment; filename="${r.dateiname}"` });
  }

  @Get("stapel")
  stapel(@Query("gesellschaftId", ParseUUIDPipe) gesellschaftId: string) {
    return this.buchhaltung.stapelListe(gesellschaftId);
  }

  /** Einen früheren Stapel erneut herunterladen (keine neue Festschreibung). */
  @Get("stapel/:stapel")
  @Header("Content-Type", "text/csv; charset=windows-1252")
  async stapelDatei(@Query("gesellschaftId", ParseUUIDPipe) gesellschaftId: string, @Param("stapel") stapel: string) {
    if (!/^EXTF-\d{14}$/.test(stapel)) throw new NotFoundException("Exportstapel nicht gefunden");
    const r = await this.buchhaltung.stapelErneut(gesellschaftId, stapel);
    return new StreamableFile(r.datei, { disposition: `attachment; filename="${r.dateiname}"` });
  }

  /** Belege zu einem Stapel bzw. zu allen exportierten Buchungen eines Zeitraums. */
  @Get("belege")
  async belege(@Query("gesellschaftId", ParseUUIDPipe) gesellschaftId: string, @Query("stapel") stapel?: string, @Query("von") von?: string, @Query("bis") bis?: string) {
    const ids = await this.db
      .select({ id: schema.buchung.id })
      .from(schema.buchung)
      .where(
        and(
          eq(schema.buchung.gesellschaftId, gesellschaftId),
          stapel ? eq(schema.buchung.exportStapel, stapel) : and(isNotNull(schema.buchung.exportiertAm), datum(von) ? gte(schema.buchung.belegdatum, datum(von)!) : undefined, datum(bis) ? lte(schema.buchung.belegdatum, datum(bis)!) : undefined),
        ),
      );
    return this.buchhaltung.belege(gesellschaftId, ids.map((x) => x.id));
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
