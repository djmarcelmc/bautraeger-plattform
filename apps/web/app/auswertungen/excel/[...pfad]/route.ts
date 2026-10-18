import { apiRoh } from "@/lib/api";

const ERLAUBT = /^(liquiditaet|liquiditaetsplan|controlling|kostenreport\/[0-9a-f-]{36}|projektbericht\/[0-9a-f-]{36})$/;

/** Excel-Download einer Auswertung (Proxy zur API). */
export async function GET(req: Request, { params }: { params: Promise<{ pfad: string[] }> }) {
  const pfad = (await params).pfad.join("/");
  if (!ERLAUBT.test(pfad)) return new Response("Unbekannte Auswertung", { status: 404 });
  const q = new URL(req.url).searchParams;
  q.set("format", "xlsx");
  const res = await apiRoh(`/auswertungen/${pfad}?${q}`);
  if (!res.ok) return new Response("Export fehlgeschlagen", { status: res.status });
  const kopf = new Headers();
  for (const k of ["content-type", "content-disposition"]) {
    const v = res.headers.get(k);
    if (v) kopf.set(k, v);
  }
  return new Response(res.body, { headers: kopf });
}
