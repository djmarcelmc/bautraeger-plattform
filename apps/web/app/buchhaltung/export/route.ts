import { apiRoh } from "@/lib/api";
import { datevPaket } from "@/lib/datev-paket";

export const maxDuration = 300;

const fehlerText = async (res: Response) => {
  const d = await res.json().catch(() => null);
  return d?.fehler?.join(" ") ?? (typeof d?.message === "string" ? d.message : `Export fehlgeschlagen (${res.status})`);
};
const dateiname = (res: Response) => /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "EXTF_Buchungsstapel.csv";

/**
 * DATEV-Export (Proxy zur API): EXTF-Datei oder – mit „Belege beifügen“ – ZIP mit Stapel, Belegen und Belegliste.
 * Bei Fehlern kommt die Meldung als Text zurück.
 */
export async function POST(req: Request) {
  const fd = await req.formData();
  const gesellschaftId = String(fd.get("gesellschaftId") ?? "");
  const von = String(fd.get("von") ?? "");
  const bis = String(fd.get("bis") ?? "");
  const nurNeue = fd.get("nurNeue") === "on";
  const res = await apiRoh("/buchhaltung/export", { method: "POST", body: { gesellschaftId, von, bis, nurNeue } });
  if (!res.ok) return new Response(await fehlerText(res), { status: res.status, headers: { "content-type": "text/plain; charset=utf-8" } });
  if (fd.get("mitBelegen") !== "on") {
    const kopf = new Headers();
    for (const k of ["content-type", "content-disposition"]) {
      const v = res.headers.get(k);
      if (v) kopf.set(k, v);
    }
    return new Response(res.body, { headers: kopf });
  }
  const name = dateiname(res);
  const csv = new Uint8Array(await res.arrayBuffer());
  const stapel = res.headers.get("x-export-stapel") ?? "";
  // nur neue: Belege des neuen Stapels; sonst alle exportierten Buchungen des Zeitraums
  const q = nurNeue && stapel ? `stapel=${stapel}` : `von=${von}&bis=${bis}`;
  const belege = await apiRoh(`/buchhaltung/belege?gesellschaftId=${gesellschaftId}&${q}`);
  const { zip, fehlend } = await datevPaket({ name, daten: csv }, belege.ok ? await belege.json() : []);
  return new Response(Buffer.from(zip), {
    headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${name.replace(/\.csv$/, ".zip")}"`, "x-belege-fehlend": String(fehlend) },
  });
}
