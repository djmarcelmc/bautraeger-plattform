export const dynamic = "force-dynamic";

interface Projekt {
  id: string;
  nr: number;
  suchcode: string;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  art: string;
  abgeschlossen: boolean;
}

export default async function Projekte() {
  let projekte: Projekt[] = [];
  let fehler: string | undefined;
  try {
    const res = await fetch(`${process.env.API_URL ?? "http://localhost:3001"}/api/projekte`, { cache: "no-store" });
    projekte = await res.json();
  } catch {
    fehler = "API nicht erreichbar – läuft `pnpm dev:api`?";
  }
  return (
    <>
      <h1>Projekte</h1>
      {fehler ? (
        <p className="hint">{fehler}</p>
      ) : (
        <table>
          <thead>
            <tr><th className="num">Nr.</th><th>Suchcode</th><th>Adresse</th><th>Art</th><th>Status</th></tr>
          </thead>
          <tbody>
            {projekte.map((p) => (
              <tr key={p.id}>
                <td className="num">{p.nr}</td>
                <td>{p.suchcode}</td>
                <td>{[p.strasse, [p.plz, p.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</td>
                <td>{p.art}</td>
                <td>{p.abgeschlossen ? "abgeschlossen" : "laufend"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
