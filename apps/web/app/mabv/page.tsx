import { STANDARD_7_RATEN, formatDe, money, ratenplanBerechnen } from "@bt/domain";

export default async function MabvRechner({ searchParams }: { searchParams: Promise<{ summe?: string; erbbau?: string }> }) {
  const { summe = "324930.00", erbbau } = await searchParams;
  const gueltig = /^\d+([.,]\d{1,2})?$/.test(summe);
  const raten = gueltig
    ? ratenplanBerechnen(money(summe.replace(",", ".")), STANDARD_7_RATEN, { erbbaurecht: erbbau === "1" })
    : [];
  return (
    <>
      <h1>MaBV-Ratenrechner</h1>
      <form>
        <label>
          Vertragssumme brutto (EUR)
          <input name="summe" defaultValue={summe} inputMode="decimal" />
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" name="erbbau" value="1" defaultChecked={erbbau === "1"} /> Erbbaurecht
        </label>
        <button type="submit">Berechnen</button>
      </form>
      {!gueltig && <p className="hint">Bitte einen Betrag wie 324930,00 eingeben.</p>}
      {gueltig && (
        <table>
          <thead>
            <tr><th className="num">Rate</th><th className="num">%</th><th className="num">Betrag €</th><th>Bauabschnitt</th></tr>
          </thead>
          <tbody>
            {raten.map((r) => (
              <tr key={r.nr}>
                <td className="num">{r.nr}</td>
                <td className="num">{r.prozent.toFixed(2).replace(".", ",")}</td>
                <td className="num">{formatDe(r.betrag)}</td>
                <td>{r.bezeichnung}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="hint">Standardplan mit 7 Raten nach § 3 Abs. 2 MaBV. Rundungsdifferenzen trägt die letzte Rate.</p>
    </>
  );
}
