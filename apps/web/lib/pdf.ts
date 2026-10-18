import "server-only";
import { cookies } from "next/headers";

/** Druckansichten, die als PDF erzeugt werden dürfen. */
const ERLAUBT = [/^\/zahlungsanforderungen\/[0-9a-f-]{36}$/, /^\/mahnungen\/druck\?ids=[0-9a-f-]{36}$/, /^\/sonderwuensche\/[0-9a-f-]{36}$/];

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
      ergebnis.push(await seite.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true }));
    }
    return ergebnis;
  } finally {
    await browser.close();
  }
}

export const seiteAlsPdf = async (pfad: string) => (await seitenAlsPdf([pfad]))[0]!;
