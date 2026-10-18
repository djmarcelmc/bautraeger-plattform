import { api } from "@/lib/api";
import { deDatum } from "@/lib/format";
import type { Gesellschaft } from "@/lib/typen";
import type { Saldenliste } from "./aktionen";
import { SaldenTabelle } from "./SaldenTabelle";

export const dynamic = "force-dynamic";

export default async function SaldenlisteSeite({ searchParams }: { searchParams: Promise<{ g?: string; stichtag?: string }> }) {
  const sp = await searchParams;
  const gesellschaften = await api<Gesellschaft[]>("/gesellschaften");
  const gid = gesellschaften.some((g) => g.id === sp.g) ? sp.g! : gesellschaften[0]?.id;
  if (!gid) return <p className="leer">Bitte zuerst eine Gesellschaft anlegen.</p>;
  const stichtag = /^\d{4}-\d{2}-\d{2}$/.test(sp.stichtag ?? "") ? sp.stichtag! : new Date().toISOString().slice(0, 10);
  const d = await api<Saldenliste>(`/buchhaltung/saldenliste?gesellschaftId=${gid}&stichtag=${stichtag}`);
  return (
    <>
      <p className="brotkrumen">
        <a href={`/buchhaltung?g=${gid}`}>Buchhaltung</a> ›
      </p>
      <div className="seitenkopf">
        <div>
          <h1>Saldenliste &amp; OP-Abgleich</h1>
          <p className="untertitel">
            {d.gesellschaft.nr} {d.gesellschaft.name} · Stichtag {deDatum(stichtag)} · Saldo je Personenkonto aus dem Buchungsjournal gegen die offenen Posten aus Verkauf und Kosten
          </p>
        </div>
      </div>
      <form className="filterleiste">
        <select name="g" defaultValue={gid} aria-label="Gesellschaft">
          {gesellschaften.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nr} {g.name}
            </option>
          ))}
        </select>
        <label>
          <span>Stichtag</span>
          <input type="date" name="stichtag" defaultValue={stichtag} />
        </label>
        <button type="submit" className="zweitrangig">
          Anzeigen
        </button>
      </form>
      <SaldenTabelle key={`${gid}-${stichtag}`} start={d} />
      <p className="hint">
        Abweichungen zwischen Journal und offenen Posten entstehen z. B. durch Korrekturen nach dem Stichtag (Storno zum Korrekturdatum) oder Vorgänge ohne Geschäftspartner. Abweichungen zu
        DATEV deuten auf dort zusätzlich oder anders gebuchte Vorgänge hin – Konto anklicken, um die offenen Posten zu sehen.
      </p>
    </>
  );
}
