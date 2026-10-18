import { eRechnungLesen, rechnungsdatenZusammenfuehren, rechnungstextLesen, type Rechnungsdaten } from "@bt/domain";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFString, PDFHexString, decodePDFRawStream } from "pdf-lib";

const istXml = (name: string, inhalt: Buffer) => /\.xml$/i.test(name) || /^\s*(<\?xml|<[A-Za-z:]*(Invoice|CrossIndustryInvoice))/.test(inhalt.subarray(0, 300).toString("utf8"));
export const istPdf = (inhalt: Buffer) => inhalt.subarray(0, 5).toString("latin1") === "%PDF-";
export const istBeleg = (name: string, inhalt: Buffer) => istPdf(inhalt) || istXml(name, inhalt);

/** In ZUGFeRD/Factur-X-PDFs eingebettete Rechnungs-XML (EmbeddedFiles im Namensbaum). */
export async function eingebettetesXml(pdf: Buffer): Promise<string | null> {
  try {
    const doc = await PDFDocument.load(pdf, { ignoreEncryption: true, updateMetadata: false });
    const names = doc.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
    const ef = names?.lookupMaybe(PDFName.of("EmbeddedFiles"), PDFDict);
    if (!ef) return null;
    const dateien: { name: string; spec: PDFDict }[] = [];
    const sammeln = (knoten: PDFDict) => {
      const n = knoten.lookupMaybe(PDFName.of("Names"), PDFArray);
      if (n)
        for (let i = 0; i + 1 < n.size(); i += 2) {
          const name = n.lookup(i);
          const spec = n.lookup(i + 1);
          if (spec instanceof PDFDict) dateien.push({ name: name instanceof PDFString || name instanceof PDFHexString ? name.decodeText() : String(name), spec });
        }
      const kids = knoten.lookupMaybe(PDFName.of("Kids"), PDFArray);
      if (kids) for (let i = 0; i < kids.size(); i++) {
        const k = kids.lookup(i);
        if (k instanceof PDFDict) sammeln(k);
      }
    };
    sammeln(ef);
    const bevorzugt = ["factur-x.xml", "zugferd-invoice.xml", "xrechnung.xml", "zugferd_invoice.xml"];
    dateien.sort((a, b) => Number(!bevorzugt.includes(a.name.toLowerCase())) - Number(!bevorzugt.includes(b.name.toLowerCase())));
    for (const d of dateien) {
      if (!/\.xml$/i.test(d.name)) continue;
      const stream = d.spec.lookupMaybe(PDFName.of("EF"), PDFDict)?.lookup(PDFName.of("F"));
      if (stream instanceof PDFRawStream) return Buffer.from(decodePDFRawStream(stream).decode()).toString("utf8");
    }
  } catch {
    /* kein lesbares PDF */
  }
  return null;
}

/** Text eines PDFs (alle Seiten, max. 30 000 Zeichen). */
export async function pdfText(pdf: Buffer): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const dok = await getDocumentProxy(new Uint8Array(pdf));
    const { text } = await extractText(dok, { mergePages: false });
    return (Array.isArray(text) ? text.join("\n") : String(text)).slice(0, 30_000);
  } catch {
    return "";
  }
}

/** Rechnungsdaten aus PDF (eingebettete E-Rechnung + Text) bzw. XML; optional mit separat gelieferter XML. */
export async function belegLesen(name: string, inhalt: Buffer, zusatzXml?: string | null): Promise<{ daten: Rechnungsdaten; text: string }> {
  if (!istPdf(inhalt) && istXml(name, inhalt)) {
    const daten = rechnungsdatenZusammenfuehren(eRechnungLesen(inhalt.toString("utf8")), null);
    return { daten, text: "" };
  }
  const [xml, text] = await Promise.all([zusatzXml ? Promise.resolve(zusatzXml) : eingebettetesXml(inhalt), pdfText(inhalt)]);
  return { daten: rechnungsdatenZusammenfuehren(xml ? eRechnungLesen(xml) : null, text ? rechnungstextLesen(text) : null), text };
}
