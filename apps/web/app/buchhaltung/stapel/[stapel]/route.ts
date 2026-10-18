import { apiRoh } from "@/lib/api";
import { datevPaket } from "@/lib/datev-paket";

export const maxDuration = 300;

/** Früheren Exportstapel erneut herunterladen – als EXTF-Datei oder mit `?belege=1` als ZIP mit Belegen. */
export async function GET(req: Request, { params }: { params: Promise<{ stapel: string }> }) {
  const { stapel } = await params;
  const u = new URL(req.url);
  const g = u.searchParams.get("g") ?? "";
  if (!/^EXTF-\d{14}$/.test(stapel) || !/^[0-9a-f-]{36}$/.test(g)) return new Response("Exportstapel nicht gefunden", { status: 404 });
  const res = await apiRoh(`/buchhaltung/stapel/${stapel}?gesellschaftId=${g}`);
  if (!res.ok) return new Response("Exportstapel nicht gefunden", { status: res.status });
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? `${stapel}.csv`;
  if (u.searchParams.get("belege") !== "1") return new Response(res.body, { headers: { "content-type": "text/csv; charset=windows-1252", "content-disposition": `attachment; filename="${name}"` } });
  const belege = await apiRoh(`/buchhaltung/belege?gesellschaftId=${g}&stapel=${stapel}`);
  const { zip } = await datevPaket({ name, daten: new Uint8Array(await res.arrayBuffer()) }, belege.ok ? await belege.json() : []);
  return new Response(Buffer.from(zip), { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${name.replace(/\.csv$/, ".zip")}"` } });
}
