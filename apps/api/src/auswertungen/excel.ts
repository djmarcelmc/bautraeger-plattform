import ExcelJS from "exceljs";

export interface Spalte {
  titel: string;
  breite?: number;
  art?: "text" | "euro" | "prozent" | "zahl";
}

export interface Abschnitt {
  titel?: string;
  spalten: Spalte[];
  zeilen: (string | number | null)[][];
  /** Zeilenindizes (0-basiert), die fett gesetzt werden (z. B. Summen). */
  fett?: number[];
}

/** Erzeugt eine Excel-Arbeitsmappe mit einem Blatt; Beträge als echte Zahlen mit Euro-Format. */
export async function excelDatei(blattname: string, ueberschrift: string, abschnitte: Abschnitt[]): Promise<Buffer> {
  const mappe = new ExcelJS.Workbook();
  mappe.creator = "Bauträger-Plattform";
  mappe.created = new Date();
  const blatt = mappe.addWorksheet(blattname.slice(0, 31), { pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  blatt.addRow([ueberschrift]).font = { bold: true, size: 14 };
  blatt.addRow([`Stand: ${new Date().toLocaleDateString("de-DE")}`]).font = { color: { argb: "FF666666" } };
  const maxSpalten = Math.max(...abschnitte.map((a) => a.spalten.length));
  for (let i = 0; i < maxSpalten; i++) blatt.getColumn(i + 1).width = Math.max(...abschnitte.map((a) => a.spalten[i]?.breite ?? 14));
  for (const a of abschnitte) {
    blatt.addRow([]);
    if (a.titel) blatt.addRow([a.titel]).font = { bold: true, size: 12 };
    const kopf = blatt.addRow(a.spalten.map((s) => s.titel));
    kopf.font = { bold: true };
    kopf.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF1FE" } };
      c.border = { bottom: { style: "thin" } };
    });
    a.zeilen.forEach((werte, idx) => {
      const zeile = blatt.addRow(
        werte.map((w, i) => {
          const art = a.spalten[i]?.art ?? "text";
          if (w === null || w === "") return null;
          return art === "text" ? w : Number(w);
        }),
      );
      a.spalten.forEach((s, i) => {
        const zelle = zeile.getCell(i + 1);
        if (s.art === "euro") zelle.numFmt = '#,##0.00 "€";[Red]-#,##0.00 "€"';
        if (s.art === "prozent") zelle.numFmt = '0.0 "%"';
      });
      if (a.fett?.includes(idx)) zeile.font = { bold: true };
    });
  }
  return Buffer.from(await mappe.xlsx.writeBuffer());
}

export const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
