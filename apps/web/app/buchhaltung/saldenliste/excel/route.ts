import { apiRoh } from "@/lib/api";

const weiter = async (res: Response) => {
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    return new Response(d?.message ?? "Export fehlgeschlagen", { status: res.status, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const kopf = new Headers();
  for (const k of ["content-type", "content-disposition"]) {
    const v = res.headers.get(k);
    if (v) kopf.set(k, v);
  }
  return new Response(res.body, { headers: kopf });
};

/** Saldenliste als Excel (ohne DATEV-Vergleich). */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const g = u.searchParams.get("g") ?? "";
  const stichtag = u.searchParams.get("stichtag") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(g)) return new Response("Gesellschaft fehlt", { status: 400 });
  return weiter(await apiRoh(`/buchhaltung/saldenliste?gesellschaftId=${g}&stichtag=${encodeURIComponent(stichtag)}&format=xlsx`));
}

/** Saldenliste als Excel mit DATEV-Vergleich (die CSV wird erneut mitgeschickt, gespeichert wird nichts). */
export async function POST(req: Request) {
  const fd = await req.formData();
  const ziel = new FormData();
  for (const k of ["gesellschaftId", "stichtag"]) ziel.set(k, String(fd.get(k) ?? ""));
  ziel.set("format", "xlsx");
  const datei = fd.get("datei");
  if (datei instanceof File) ziel.set("datei", datei, datei.name);
  return weiter(await apiRoh("/buchhaltung/saldenliste", { method: "POST", body: ziel }));
}
