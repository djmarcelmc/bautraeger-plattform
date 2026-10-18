import { House, LogIn, TriangleAlert } from "lucide-react";
import { redirect } from "next/navigation";
import { authAktiv, signIn } from "@/auth";
import { aktuellerBenutzer } from "@/lib/benutzer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Anmelden – Bauträger-Plattform" };

const FEHLER: Record<string, string> = {
  AccessDenied: "Kein Zugang – bitte bei der Administration eine Rolle für die Bauträger-Plattform zuweisen lassen.",
  Configuration: "Die Anmeldung ist nicht vollständig eingerichtet. Bitte die Administration informieren.",
};

/** Rücksprungziel nur innerhalb der Plattform zulassen. */
const sicheresZiel = (z?: string) => (z && z.startsWith("/") && !z.startsWith("//") ? z : "/");

export default async function Anmelden({ searchParams }: { searchParams: Promise<{ ziel?: string; error?: string }> }) {
  const { ziel, error } = await searchParams;
  if (authAktiv && (await aktuellerBenutzer())) redirect(sicheresZiel(ziel));
  return (
    <div className="portal-karte anmelden">
      <div className="portal-marke">
        <House size={20} /> Bauträger-Plattform
      </div>
      <h1>Anmelden</h1>
      {error ? (
        <div className="portal-hinweis fehler" role="alert">
          <TriangleAlert size={18} /> {FEHLER[error] ?? "Die Anmeldung ist fehlgeschlagen. Bitte erneut versuchen."}
        </div>
      ) : null}
      {authAktiv ? (
        <form
          action={async () => {
            "use server";
            await signIn("microsoft-entra-id", { redirectTo: sicheresZiel(ziel) });
          }}
        >
          <p className="portal-klein">Mit Ihrem Microsoft-365-Konto der Firma anmelden. Ihre Rechte richten sich nach der zugewiesenen Rolle.</p>
          <button type="submit">
            <LogIn size={16} /> Mit Microsoft anmelden
          </button>
        </form>
      ) : (
        <p className="portal-klein">
          Die Microsoft-Anmeldung ist noch nicht eingerichtet. Der Zugang ist derzeit über das gemeinsame Passwort geschützt. <a href="/">Zur Übersicht</a>
        </p>
      )}
    </div>
  );
}
