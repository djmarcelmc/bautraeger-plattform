import { apiRoh } from "@/lib/api";

/** DATEV-Export (Proxy zur API): liefert die EXTF-Datei oder die Fehlermeldung als Text. */
export async function POST(req: Request) {
  const fd = await req.formData();
  const res = await apiRoh("/buchhaltung/export", {
    method: "POST",
    body: { gesellschaftId: fd.get("gesellschaftId"), von: fd.get("von"), bis: fd.get("bis"), nurNeue: fd.get("nurNeue") === "on" },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    const text = d?.fehler?.join(" ") ?? (typeof d?.message === "string" ? d.message : `Export fehlgeschlagen (${res.status})`);
    return new Response(text, { status: res.status, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const kopf = new Headers();
  for (const k of ["content-type", "content-disposition"]) {
    const v = res.headers.get(k);
    if (v) kopf.set(k, v);
  }
  return new Response(res.body, { headers: kopf });
}
