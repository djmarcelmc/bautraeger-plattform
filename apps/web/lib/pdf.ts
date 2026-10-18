import "server-only";
import { cookies } from "next/headers";
import { apiRoh } from "./api";

/** Druckansichten, die als PDF erzeugt werden dürfen. */
const ERLAUBT = [
  /^\/zahlungsanforderungen\/[0-9a-f-]{36}$/,
  /^\/mahnungen\/druck\?ids=[0-9a-f-]{36}(,[0-9a-f-]{36})*$/,
  /^\/sonderwuensche\/[0-9a-f-]{36}$/,
  /^\/bauabzug\/beleg\?gesellschaftId=[0-9a-f-]{36}&handwerkerId=[0-9a-f-]{36}&monat=\d{4}-\d{2}$/,
  /^\/maengel\/[0-9a-f-]{36}\/ruege\/[1-3]$/,
  /^\/gesellschaften\/[0-9a-f-]{36}\/musterbrief$/,
];

/**
 * Legt den Briefbogen (Vektor-PDF) unter jede Seite: Seite 1 → Briefbogen-Seite 1, weitere → Seite 2.
 * Hat der Briefbogen nur eine Seite, zeigen Folgeseiten nur Kopf und Fußzeile (Textbereich wird abgedeckt).
 */
async function mitBriefbogen(inhalt: Uint8Array, briefbogen: Uint8Array, folgeseite: { oben: number; unten: number }): Promise<Buffer> {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const ziel = await PDFDocument.create();
  const vorlage = await PDFDocument.load(briefbogen, { ignoreEncryption: true });
  const quelle = await PDFDocument.load(inhalt);
  const hintergrund = await ziel.embedPdf(vorlage, vorlage.getPageIndices().slice(0, 2));
  const seiten = await ziel.embedPdf(quelle, quelle.getPageIndices());
  const pt = (mm: number) => (mm / 25.4) * 72;
  seiten.forEach((s, i) => {
    const seite = ziel.addPage([s.width, s.height]);
    seite.drawPage(hintergrund[Math.min(i === 0 ? 0 : 1, hintergrund.length - 1)]!, { x: 0, y: 0, width: s.width, height: s.height });
    if (i > 0 && hintergrund.length === 1) {
      const y = pt(folgeseite.unten);
      seite.drawRectangle({ x: 0, y, width: s.width, height: s.height - pt(folgeseite.oben) - y, color: rgb(1, 1, 1) });
    }
    seite.drawPage(s, { x: 0, y: 0 });
  });
  return Buffer.from(await ziel.save());
}

/**
 * Rendert Druckansichten der eigenen Oberfläche mit Chromium als PDF (A4, Druck-CSS) –
 * im Namen des angemeldeten Benutzers (dessen Sitzungs-Cookies werden übernommen). Ein Browser für alle Seiten.
 */
export async function seitenAlsPdf(pfade: string[]): Promise<Buffer[]> {
  for (const pfad of pfade) if (!ERLAUBT.some((r) => r.test(pfad))) throw new Error("Für diese Seite ist keine PDF-Erzeugung vorgesehen.");
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PFAD || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const basis = `http://localhost:${process.env.PORT ?? 3000}`;
    const kontext = await browser.newContext({ locale: "de-DE", timezoneId: "Europe/Berlin" });
    const vorhanden = (await cookies()).getAll();
    if (vorhanden.length)
      await kontext.addCookies(vorhanden.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/", secure: c.name.startsWith("__Secure-") || c.name.startsWith("__Host-"), httpOnly: true, sameSite: "Lax" as const })));
    const seite = await kontext.newPage();
    await seite.emulateMedia({ media: "print" });
    const ergebnis: Buffer[] = [];
    for (const pfad of pfade) {
      const antwort = await seite.goto(basis + pfad, { waitUntil: "networkidle", timeout: 30_000 });
      if (!antwort?.ok()) throw new Error(`Die Druckansicht konnte nicht geladen werden (${antwort?.status() ?? "keine Antwort"}).`);
      // Umleitung (z. B. zur Anmeldung) darf nicht als Schreiben verschickt werden
      if (new URL(seite.url()).pathname !== pfad.split("?")[0]) throw new Error("Die Druckansicht wurde umgeleitet – bitte neu anmelden.");
      const pdf = await seite.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
      // Briefbogen der Gesellschaft hinterlegen, wenn die Druckansicht einen angibt
      const gesellschaftId = await seite.locator('meta[name="briefbogen"]').first().getAttribute("content", { timeout: 500 }).catch(() => null);
      const vorlage = gesellschaftId && /^[0-9a-f-]{36}$/.test(gesellschaftId) ? await apiRoh(`/gesellschaften/${gesellschaftId}/briefbogen/datei`) : null;
      if (vorlage?.ok) {
        const e = (await (await apiRoh(`/gesellschaften/${gesellschaftId}/briefbogen`)).json()) as { einstellung: { randObenFolgeseiten: number; randUnten: number } };
        ergebnis.push(await mitBriefbogen(pdf, new Uint8Array(await vorlage.arrayBuffer()), { oben: e.einstellung.randObenFolgeseiten - 2, unten: e.einstellung.randUnten - 2 }));
      } else ergebnis.push(pdf);
    }
    return ergebnis;
  } finally {
    await browser.close();
  }
}

export const seiteAlsPdf = async (pfad: string) => (await seitenAlsPdf([pfad]))[0]!;
