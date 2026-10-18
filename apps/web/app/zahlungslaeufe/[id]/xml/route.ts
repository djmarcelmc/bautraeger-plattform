import { apiRoh } from "@/lib/api";

/** Download der SEPA-Datei (Proxy zur API). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Nicht gefunden", { status: 404 });
  const res = await apiRoh(`/zahlungslaeufe/${id}/xml`);
  if (!res.ok) return new Response("Download fehlgeschlagen", { status: res.status });
  const kopf = new Headers();
  for (const k of ["content-type", "content-disposition"]) {
    const v = res.headers.get(k);
    if (v) kopf.set(k, v);
  }
  return new Response(res.body, { headers: kopf });
}
