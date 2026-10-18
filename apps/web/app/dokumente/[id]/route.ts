import { apiRoh } from "@/lib/api";

/** Liefert eine Dokumentdatei aus (Proxy zur API, die nicht öffentlich erreichbar sein muss). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await apiRoh(`/dokumente/${id}/datei`);
  if (!res.ok) return new Response("Dokument nicht gefunden", { status: res.status });
  const kopf = new Headers();
  for (const k of ["content-type", "content-disposition", "content-length"]) {
    const v = res.headers.get(k);
    if (v) kopf.set(k, v);
  }
  return new Response(res.body, { headers: kopf });
}
