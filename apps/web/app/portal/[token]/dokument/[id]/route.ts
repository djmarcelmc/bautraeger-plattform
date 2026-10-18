const BASIS = process.env.API_URL ?? "http://localhost:3001";

/** Download einer freigegebenen Unterlage aus dem Käuferportal (Proxy zur API, nur mit gültigem Link). */
export async function GET(_: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token) || !/^[0-9a-f-]{36}$/.test(id)) return new Response("Nicht gefunden", { status: 404 });
  const res = await fetch(`${BASIS}/api/portal/${encodeURIComponent(token)}/dokumente/${id}`, { cache: "no-store" });
  if (!res.ok) return new Response("Nicht gefunden", { status: 404 });
  const kopf = new Headers({ "cache-control": "private, no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" });
  for (const k of ["content-type", "content-disposition", "content-length"]) {
    const v = res.headers.get(k);
    if (v) kopf.set(k, v);
  }
  return new Response(res.body, { headers: kopf });
}
