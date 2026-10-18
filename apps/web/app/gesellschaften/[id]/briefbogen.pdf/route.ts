import { apiRoh } from "@/lib/api";

/** Hinterlegter Briefbogen als PDF (Vorschau in den Einstellungen). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Nicht gefunden", { status: 404 });
  const res = await apiRoh(`/gesellschaften/${id}/briefbogen/datei`);
  if (!res.ok) return new Response("Kein Briefbogen hinterlegt", { status: 404 });
  return new Response(res.body, { headers: { "content-type": "application/pdf", "cache-control": "private, no-store" } });
}
