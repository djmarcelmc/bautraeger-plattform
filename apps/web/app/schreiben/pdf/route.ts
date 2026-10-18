import { seiteAlsPdf } from "@/lib/pdf";

/** Druckansicht als PDF (mit Briefbogen der Gesellschaft, falls hinterlegt) – zum Ansehen, Speichern oder Drucken. */
export async function GET(req: Request) {
  const pfad = new URL(req.url).searchParams.get("pfad") ?? "";
  try {
    const pdf = await seiteAlsPdf(pfad);
    const name = `${pfad.split("?")[0]!.split("/").filter(Boolean).join("-")}.pdf`;
    return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${name}"`, "cache-control": "private, no-store" } });
  } catch (e) {
    return new Response(`PDF konnte nicht erzeugt werden: ${(e as Error).message}`, { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
}
