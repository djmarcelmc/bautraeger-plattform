const BASIS = process.env.API_URL ?? "http://localhost:3001";

/** Mängelanzeige aus dem Käuferportal (klassisches Formular, keine Server Action) → API, danach zurück zur Portalseite. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const zurueck = (q: Record<string, string>) => new Response(null, { status: 303, headers: { location: `/portal/${encodeURIComponent(token)}?${new URLSearchParams(q)}` } });
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return new Response("Nicht gefunden", { status: 404 });
  let daten: FormData;
  try {
    daten = await req.formData();
  } catch {
    return zurueck({ fehler: "Die Meldung konnte nicht gelesen werden – sind die Fotos zu groß (zusammen höchstens 25 MB)?" });
  }
  const weiter = new FormData();
  for (const [k, v] of daten.entries()) {
    if (k === "fotos") {
      if (typeof v !== "string" && v.size > 0) weiter.append("fotos", v, v.name);
    } else if (typeof v === "string") weiter.append(k, v);
  }
  const res = await fetch(`${BASIS}/api/portal/${encodeURIComponent(token)}/maengel`, { method: "POST", body: weiter, cache: "no-store" });
  const antwort = await res.json().catch(() => null);
  if (!res.ok) {
    const text = antwort?.fehler?.join(" ") ?? (typeof antwort?.message === "string" ? antwort.message : "Die Meldung konnte nicht gespeichert werden.");
    return zurueck({ fehler: res.status === 404 ? "Der Link ist ungültig oder abgelaufen." : text });
  }
  return zurueck({ gemeldet: String(antwort.nr) });
}
