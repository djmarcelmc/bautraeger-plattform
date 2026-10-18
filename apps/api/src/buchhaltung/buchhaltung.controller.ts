import { BadRequestException, Body, Controller, Delete, Get, Header, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res, StreamableFile, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { schema } from "@bt/db";
import { DatevExportEingabe, KontierungEingabe, kontierungFuer } from "@bt/domain";
import { z } from "zod";
import { and, eq, gte, isNotNull, lte } from "drizzle-orm";
import { Benutzer, pruefe } from "../common/eingabe.js";
import { protokollieren } from "../common/protokoll.js";
import { DB, type Db } from "../db.provider.js";
import { BuchhaltungService, type JournalFilter } from "./buchhaltung.service.js";
import { XLSX, excelDatei, type Abschnitt } from "../auswertungen/excel.js";

type Saldenliste = Awaited<ReturnType<BuchhaltungService["saldenliste"]>>;

/** Saldenliste als Excel: je Gruppe Konten mit Salden, darunter die offenen Posten. */
async function saldenlisteExcel(d: Saldenliste) {
  const de = (iso: string) => iso.split("-").reverse().join(".");
  const zahl = (v: string | null) => (v === null ? null : Number(v));
  const sh = (v: string) => (Number(v) > 0 ? "S" : Number(v) < 0 ? "H" : "");
  const abschnitte: Abschnitt[] = [];
  for (const [art, titel] of [
    ["debitor", "Debitoren (Käufer)"],
    ["kreditor", "Kreditoren (Handwerker)"],
  ] as const) {
    const zeilen = d.zeilen.filter((z) => z.art === art);
    const s = d.summen[art]!;
    abschnitte.push({
      titel: `${titel} – Saldo Soll positiv, Haben negativ`,
      spalten: [
        { titel: "Konto", breite: 10 },
        { titel: "Name", breite: 30 },
        { titel: "Saldo Journal", art: "euro", breite: 15 },
        { titel: "S/H", breite: 5 },
        { titel: "Offene Posten", art: "euro", breite: 15 },
        { titel: "Differenz", art: "euro", breite: 13 },
        ...(d.mitDatev ? [{ titel: "Saldo DATEV", art: "euro" as const, breite: 15 }, { titel: "Differenz DATEV", art: "euro" as const, breite: 15 }] : []),
      ],
      zeilen: [
        ...zeilen.map((z) => [z.konto, z.name, zahl(z.journal), sh(z.journal), zahl(z.op), zahl(z.differenzOp), ...(d.mitDatev ? [zahl(z.datev), zahl(z.differenzDatev)] : [])]),
        ["Summe", `${s.abweichungen} Abweichung(en)`, zahl(s.journal), sh(s.journal), zahl(s.op), null, ...(d.mitDatev ? [zahl(s.datev), null] : [])],
      ],
      fett: [zeilen.length],
    });
  }
  const posten = d.zeilen.flatMap((z) => z.posten.map((p) => [p.konto, p.name, p.beleg, zahl(p.offen)]));
  if (posten.length)
    abschnitte.push({
      titel: "Offene Posten",
      spalten: [
        { titel: "Konto", breite: 10 },
        { titel: "Name", breite: 30 },
        { titel: "Beleg", breite: 22 },
        { titel: "offen", art: "euro", breite: 15 },
      ],
      zeilen: posten,
    });
  const titel = `Saldenliste Personenkonten ${d.gesellschaft.nr} ${d.gesellschaft.name}, Stichtag ${de(d.stichtag)}${d.mitDatev ? " – mit DATEV-Vergleich" : ""}`;
  return new StreamableFile(await excelDatei("Saldenliste", titel, abschnitte), { type: XLSX, disposition: `attachment; filename="Saldenliste-${d.gesellschaft.nr}-${d.stichtag}.xlsx"` });
}

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

  @Get("saldenliste")
  async saldenliste(@Query("gesellschaftId", ParseUUIDPipe) gesellschaftId: string, @Query("stichtag") stichtag: string | undefined, @Query("format") format: string | undefined, @Benutzer() benutzer: string) {
    const d = await this.buchhaltung.saldenliste(gesellschaftId, datum(stichtag) ?? new Date().toISOString().slice(0, 10), benutzer);
    return format === "xlsx" ? saldenlisteExcel(d) : d;
  }

  /** Saldenliste mit Vergleich gegen eine DATEV-Saldenliste (CSV). */
  @Post("saldenliste")
  @UseInterceptors(FileInterceptor("datei", { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async saldenlisteVergleich(@UploadedFile() datei: Express.Multer.File | undefined, @Body() body: { gesellschaftId?: string; stichtag?: string; format?: string }, @Benutzer() benutzer: string) {
    if (!datei?.size) throw new BadRequestException("Bitte die Saldenliste aus DATEV (CSV) auswählen.");
    if (!/^[0-9a-f-]{36}$/.test(body?.gesellschaftId ?? "")) throw new BadRequestException("Gesellschaft wählen");
    const d = await this.buchhaltung.saldenliste(body.gesellschaftId!, datum(body.stichtag) ?? new Date().toISOString().slice(0, 10), benutzer, new Uint8Array(datei.buffer));
    return body.format === "xlsx" ? saldenlisteExcel(d) : d;
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
