import { apiRoh } from "@/lib/api";

/** Excel-Importvorlage (Proxy zur API). */
export async function GET(_: Request, { params }: { params: Promise<{ art: string }> }) {
  const { art } = await params;
  if (!/^(partner|einheiten)$/.test(art)) return new Response("Unbekannte Vorlage", { status: 404 });
  const res = await apiRoh(`/import/${art}/vorlage`);
  if (!res.ok) return new Response("Vorlage nicht verfügbar", { status: res.status });
  const kopf = new Headers();
  for (const k of ["content-type", "content-disposition"]) {
    const v = res.headers.get(k);
    if (v) kopf.set(k, v);
  }
  return new Response(res.body, { headers: kopf });
}
