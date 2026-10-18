import { api } from "@/lib/api";
import type { Gesellschaft } from "@/lib/typen";

/** Filter für gesellschaftsweite Auswertungen. */
export async function GesellschaftFilter({ gesellschaft, projekte }: { gesellschaft?: string; projekte?: string }) {
  const liste = await api<Gesellschaft[]>("/gesellschaften");
  return (
    <form className="filterleiste">
      <select name="gesellschaft" defaultValue={gesellschaft ?? ""}>
        <option value="">Alle Gesellschaften</option>
        {liste.map((g) => (
          <option key={g.id} value={g.id}>
            {g.nr} · {g.name}
          </option>
        ))}
      </select>
      <div className="segment">
        <label>
          <input type="radio" name="projekte" value="laufend" defaultChecked={projekte !== "alle"} />
          <span>Laufende Projekte</span>
        </label>
        <label>
          <input type="radio" name="projekte" value="alle" defaultChecked={projekte === "alle"} />
          <span>Alle Projekte</span>
        </label>
      </div>
      <button type="submit" className="zweitrangig">
        Anzeigen
      </button>
    </form>
  );
}

export const filterQuery = (gesellschaft?: string, projekte?: string) =>
  new URLSearchParams({ ...(gesellschaft ? { gesellschaftId: gesellschaft } : {}), ...(projekte === "alle" ? { projekte: "alle" } : {}) }).toString();
