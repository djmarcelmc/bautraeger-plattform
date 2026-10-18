import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  StreamableFile,
  UnprocessableEntityException,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { schema } from "@bt/db";
import { IMPORT_ARTEN, IMPORT_SPALTEN, csvLesen, importPruefen, textDekodieren, type ImportArt, type ImportPruefung, type Vorhanden } from "@bt/domain";
import { and, eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { memoryStorage } from "multer";
import { z } from "zod";
import { Benutzer, pruefe } from "../common/eingabe.js";
import { KontextService } from "../common/kontext.service.js";
import { differenz, protokollieren } from "../common/protokoll.js";
import { DB, type Db } from "../db.provider.js";

const gp = schema.geschaeftspartner;
const e = schema.einheit;
const p = schema.projekt;
const g = schema.gesellschaft;

const MAX_GROESSE = 5 * 1024 * 1024;
const MAX_ZEILEN = 5000;

const Optionen = z.object({
  projektId: z.uuid("Projekt wählen").optional(),
  aktualisieren: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "on"),
});

/** Zellwert aus Excel als Text; Zahlen im deutschen Format, damit „92.125“ nicht als Tausenderpunkt gelesen wird. */
function zellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return String(v).replace(".", ",");
  if (typeof v === "boolean") return v ? "ja" : "nein";
  if (typeof v === "string") return v;
  if ("richText" in v) return v.richText.map((t) => t.text).join("");
  if ("result" in v) return zellText((v.result ?? null) as ExcelJS.CellValue);
  if ("text" in v) return String(v.text);
  return "";
}

/** Liest .xlsx (erstes Blatt) oder CSV in eine Tabelle aus Texten. */
export async function tabelleLesen(datei: Buffer): Promise<string[][]> {
  if (datei.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])))
    throw new BadRequestException("Das alte Excel-Format (.xls) wird nicht unterstützt – bitte als .xlsx oder CSV speichern.");
  if (datei.subarray(0, 2).toString("latin1") === "PK") {
    const mappe = new ExcelJS.Workbook();
    try {
      await mappe.xlsx.load(datei as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException("Die Excel-Datei konnte nicht gelesen werden.");
    }
    const blatt = mappe.worksheets[0];
    if (!blatt) throw new BadRequestException("Die Excel-Datei enthält kein Tabellenblatt.");
    const zeilen: string[][] = [];
    blatt.eachRow({ includeEmpty: true }, (row, nr) => {
      const werte = row.values as ExcelJS.CellValue[];
      zeilen[nr - 1] = werte.slice(1).map(zellText);
    });
    return Array.from(zeilen, (z) => z ?? []);
  }
  return csvLesen(textDekodieren(new Uint8Array(datei)));
}

@Controller("import")
export class ImportController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
  ) {}

  private art(art: string): ImportArt {
    if (!(IMPORT_ARTEN as readonly string[]).includes(art)) throw new NotFoundException("Unbekannte Importart");
    return art as ImportArt;
  }

  private async projektPruefen(projektId: string | undefined) {
    if (!projektId) throw new BadRequestException({ message: "Eingabe ungültig", fehler: ["Bitte ein Projekt wählen."] });
    const [x] = await this.db
      .select({ id: p.id })
      .from(p)
      .innerJoin(g, eq(p.gesellschaftId, g.id))
      .where(and(eq(p.id, projektId), eq(g.mandantId, await this.kontext.mandantId())));
    if (!x) throw new NotFoundException("Projekt nicht gefunden");
    return projektId;
  }

  private async bestand(art: ImportArt, projektId?: string): Promise<Vorhanden> {
    if (art === "partner") {
      const rows = await this.db.select().from(gp).where(eq(gp.mandantId, await this.kontext.mandantId()));
      return { schluessel: new Map(rows.map((r) => [String(r.nr), r])), hoechsteNr: Math.max(10000, ...rows.map((r) => r.nr)) };
    }
    const rows = await this.db.select().from(e).where(eq(e.projektId, projektId!));
    const nrVon = new Map(rows.map((r) => [r.id, r.nr]));
    return { schluessel: new Map(rows.map((r) => [r.nr, { ...r, zugehoerigZu: r.zugehoerigZuEinheitId ? nrVon.get(r.zugehoerigZuEinheitId) : null }])) };
  }

  private async pruefung(artText: string, datei: Express.Multer.File | undefined, body: unknown): Promise<ImportPruefung & { projektId?: string }> {
    const art = this.art(artText);
    if (!datei) throw new BadRequestException({ message: "Eingabe ungültig", fehler: ["Bitte eine Datei auswählen."] });
    const opt = pruefe(Optionen, body);
    const projektId = art === "einheiten" ? await this.projektPruefen(opt.projektId) : undefined;
    const tabelle = await tabelleLesen(datei.buffer);
    if (tabelle.length < 2) throw new BadRequestException({ message: "Eingabe ungültig", fehler: ["Die Datei enthält keine Datenzeilen (erste Zeile = Spaltenüberschriften)."] });
    if (tabelle.length > MAX_ZEILEN + 1) throw new BadRequestException({ message: "Eingabe ungültig", fehler: [`Höchstens ${MAX_ZEILEN} Zeilen je Import.`] });
    return { ...importPruefen(art, tabelle, await this.bestand(art, projektId), { aktualisieren: opt.aktualisieren }), projektId };
  }

  /** Leere Excel-Vorlage mit allen Spalten und einem Blatt „Hinweise“. */
  @Get(":art/vorlage")
  async vorlage(@Param("art") artText: string) {
    const art = this.art(artText);
    const spalten = IMPORT_SPALTEN[art];
    const mappe = new ExcelJS.Workbook();
    mappe.creator = "Bauträger-Plattform";
    const blatt = mappe.addWorksheet(art === "partner" ? "Geschäftspartner" : "Einheiten", { views: [{ state: "frozen", ySplit: 1 }] });
    blatt.columns = spalten.map((s) => ({ header: s.titel, width: Math.max(12, s.titel.length + 4, s.beispiel.length + 2) }));
    const kopf = blatt.getRow(1);
    kopf.font = { bold: true, color: { argb: "FFFFFFFF" } };
    kopf.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    spalten.forEach((s, i) => {
      if (s.pflicht) blatt.getCell(1, i + 1).value = `${s.titel} *`;
      if (s.hinweis) blatt.getCell(1, i + 1).note = s.hinweis;
      if (s.auswahl)
        for (let r = 2; r <= 1000; r++)
          blatt.getCell(r, i + 1).dataValidation = { type: "list", allowBlank: true, formulae: [`"${s.auswahl.join(",")}"`], showErrorMessage: true, error: `Bitte wählen: ${s.auswahl.join(", ")}` };
    });
    // Textformat für Spalten, in denen führende Nullen zählen
    for (const k of ["nr", "plz", "telefon", "iban"]) {
      const i = spalten.findIndex((s) => s.schluessel === k);
      if (i >= 0 && !(art === "partner" && k === "nr")) blatt.getColumn(i + 1).numFmt = "@";
    }
    const hinweise = mappe.addWorksheet("Hinweise");
    hinweise.columns = [
      { header: "Spalte", width: 26 },
      { header: "Pflicht", width: 9 },
      { header: "Beispiel", width: 26 },
      { header: "Hinweis", width: 70 },
    ];
    hinweise.getRow(1).font = { bold: true };
    for (const s of spalten) hinweise.addRow([s.titel, s.pflicht ? "ja" : "", s.beispiel, s.hinweis ?? ""]);
    hinweise.addRow([]);
    hinweise.addRow(["Die erste Zeile im ersten Blatt enthält die Spaltenüberschriften. Spalten dürfen fehlen, umsortiert sein oder anders heißen (gängige Bezeichnungen werden erkannt)."]);
    hinweise.addRow(["Zahlen dürfen im deutschen Format stehen (1.234,56). Datumsangaben als TT.MM.JJJJ oder als Excel-Datum."]);
    const datei = Buffer.from(await mappe.xlsx.writeBuffer());
    const name = art === "partner" ? "Importvorlage-Geschaeftspartner.xlsx" : "Importvorlage-Einheiten.xlsx";
    return new StreamableFile(datei, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", disposition: `attachment; filename="${name}"` });
  }

  /** Prüflauf: liest die Datei und zeigt, was übernommen würde – ohne zu speichern. */
  @Post(":art/pruefen")
  @UseInterceptors(FileInterceptor("datei", { storage: memoryStorage(), limits: { fileSize: MAX_GROESSE } }))
  async pruefen(@Param("art") art: string, @UploadedFile() datei: Express.Multer.File | undefined, @Body() body: unknown) {
    const { projektId: _p, ...r } = await this.pruefung(art, datei, body);
    void _p;
    return { ...r, zeilen: r.zeilen.map(({ werte: _w, ...z }) => (void _w, z)) };
  }

  /** Übernahme: nur wenn die Prüfung fehlerfrei ist, alles in einer Transaktion. */
  @Post(":art/ausfuehren")
  @UseInterceptors(FileInterceptor("datei", { storage: memoryStorage(), limits: { fileSize: MAX_GROESSE } }))
  async ausfuehren(@Param("art") artText: string, @UploadedFile() datei: Express.Multer.File | undefined, @Body() body: unknown, @Benutzer() benutzer: string) {
    const r = await this.pruefung(artText, datei, body);
    if (!r.bereit) {
      const fehler = [
        ...r.zuordnung.fehlendePflicht.map((s) => `Pflichtspalte „${s}“ fehlt`),
        ...r.zeilen.filter((z) => z.status === "fehler").flatMap((z) => z.fehler.map((f) => `Zeile ${z.zeile}: ${f}`)),
      ];
      throw new UnprocessableEntityException({ message: "Import nicht möglich", fehler: fehler.length ? fehler.slice(0, 50) : ["Keine neuen oder geänderten Datensätze in der Datei."] });
    }
    const zuSpeichern = r.zeilen.filter((z) => z.status === "neu" || z.status === "aktualisieren");
    const wer = `${benutzer} (Import)`;
    const mandantId = await this.kontext.mandantId();

    await this.db.transaction(async (tx) => {
      if (r.art === "partner") {
        for (const z of zuSpeichern) {
          const werte = z.werte as typeof gp.$inferInsert;
          if (z.status === "neu") {
            const [neu] = await tx.insert(gp).values({ ...werte, mandantId }).returning();
            await protokollieren(tx, { tabelle: "geschaeftspartner", id: neu!.id, aktion: "insert", neu: werte, benutzer: wer });
          } else {
            const [alt] = await tx.select().from(gp).where(and(eq(gp.mandantId, mandantId), eq(gp.nr, werte.nr)));
            const [neu] = await tx.update(gp).set({ ...werte, geaendertAm: new Date() }).where(eq(gp.id, alt!.id)).returning();
            const d = differenz(alt!, neu!);
            if (d.geaendert) await protokollieren(tx, { tabelle: "geschaeftspartner", id: alt!.id, aktion: "update", ...d, benutzer: wer });
          }
        }
        return;
      }
      const projektId = r.projektId!;
      for (const z of zuSpeichern) {
        const werte = z.werte as Omit<typeof e.$inferInsert, "projektId">;
        if (z.status === "neu") {
          const [neu] = await tx.insert(e).values({ ...werte, projektId }).returning();
          await protokollieren(tx, { tabelle: "einheit", id: neu!.id, aktion: "insert", neu: werte, benutzer: wer });
        } else {
          const [alt] = await tx.select().from(e).where(and(eq(e.projektId, projektId), eq(e.nr, werte.nr)));
          const [neu] = await tx.update(e).set({ ...werte, geaendertAm: new Date() }).where(eq(e.id, alt!.id)).returning();
          const d = differenz(alt!, neu!);
          if (d.geaendert) await protokollieren(tx, { tabelle: "einheit", id: alt!.id, aktion: "update", ...d, benutzer: wer });
        }
      }
      // Zugehörigkeiten erst jetzt setzen, da sich Einheiten in der Datei gegenseitig referenzieren können
      const nrn = zuSpeichern.map((z) => z.schluessel);
      const alle = await tx.select({ id: e.id, nr: e.nr, zu: e.zugehoerigZuEinheitId }).from(e).where(eq(e.projektId, projektId));
      const idVon = new Map(alle.map((x) => [x.nr, x.id]));
      for (const x of alle.filter((x) => nrn.includes(x.nr))) {
        const ziel = zuSpeichern.find((z) => z.schluessel === x.nr)!.zugehoerigZu;
        const zielId = ziel ? idVon.get(ziel)! : null;
        if (zielId !== x.zu) await tx.update(e).set({ zugehoerigZuEinheitId: zielId }).where(eq(e.id, x.id));
      }
    });
    return { angelegt: r.anzahl.neu, aktualisiert: r.anzahl.aktualisieren, unveraendert: r.anzahl.unveraendert };
  }
}
