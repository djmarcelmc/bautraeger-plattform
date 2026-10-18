"use client";

import {
  ArrowLeftRight,
  BarChart3,
  Briefcase,
  Scale,
  ShieldCheck as Pruefung,
  BookOpenCheck,
  Building2,
  Banknote,
  Landmark,
  ShieldCheck,
  Calculator,
  ClipboardList,
  FolderKanban,
  HandCoins,
  Inbox,
  ListChecks,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";

const BEREICHE: { titel: string; eintraege: { href: string; text: string; icon: LucideIcon; bald?: boolean }[] }[] = [
  {
    titel: "Stammdaten",
    eintraege: [
      { href: "/", text: "Übersicht", icon: LayoutDashboard },
      { href: "/projekte", text: "Projekte", icon: FolderKanban },
      { href: "/partner", text: "Geschäftspartner", icon: Users },
      { href: "/gesellschaften", text: "Gesellschaften", icon: Building2 },
    ],
  },
  {
    titel: "Abwicklung",
    eintraege: [
      { href: "/verkauf", text: "Verkauf", icon: HandCoins },
      { href: "/kosten", text: "Kosten", icon: ClipboardList },
      { href: "/rechnungseingang", text: "Rechnungseingang", icon: Inbox },
      { href: "/zahlungslaeufe", text: "Zahlungsläufe", icon: Banknote },
      { href: "/bankabgleich", text: "Bankabgleich", icon: ArrowLeftRight },
      { href: "/bauabzug", text: "Bauabzugsteuer", icon: Landmark },
      { href: "/buchhaltung", text: "Buchhaltung", icon: BookOpenCheck },
      { href: "/buergschaften", text: "Bürgschaften", icon: ShieldCheck },
      { href: "/maengel", text: "Mängel", icon: Wrench },
      { href: "/auswertungen", text: "Auswertungen", icon: BarChart3 },
    ],
  },
  {
    titel: "Werkzeuge",
    eintraege: [
      { href: "/mabv", text: "MaBV-Rechner", icon: Calculator },
      { href: "/steuerberater", text: "Steuerberater-Sicht", icon: Briefcase },
      { href: "/inbetriebnahme", text: "Inbetriebnahme", icon: ListChecks },
      { href: "/einstellungen", text: "Einstellungen", icon: Settings },
    ],
  },
];

/** Reduzierte Navigation für den reinen Steuerberater-Zugang. */
const STEUERBERATER: typeof BEREICHE = [
  {
    titel: "Steuerberater",
    eintraege: [
      { href: "/steuerberater", text: "Übersicht", icon: Briefcase },
      { href: "/buchhaltung", text: "Buchhaltung & DATEV", icon: BookOpenCheck },
      { href: "/buchhaltung/saldenliste", text: "Saldenliste", icon: Scale },
      { href: "/bauabzug", text: "Bauabzugsteuer", icon: Landmark },
      { href: "/auswertungen/mabv-pruefbericht", text: "MaBV-Prüfbericht", icon: Pruefung },
    ],
  },
];
const FACHLICH = ["Bautraeger.Admin", "Bautraeger.Geschaeftsfuehrung", "Bautraeger.Buchhaltung", "Bautraeger.Vertrieb", "Bautraeger.Bauleitung"];

export function Navigation({
  benutzer,
  abmelden,
}: {
  benutzer: { name: string; email: string; rollen: string[]; rollenText: string } | null;
  abmelden: () => Promise<void>;
}) {
  const verwaltung = !benutzer || benutzer.rollen.some((r) => r === "Bautraeger.Admin" || r === "Bautraeger.Geschaeftsfuehrung");
  const pfad = usePathname();
  const nurSteuerberater = !!benutzer && benutzer.rollen.includes("Bautraeger.Steuerberater") && !benutzer.rollen.some((r) => FACHLICH.includes(r));
  const bereiche = nurSteuerberater ? STEUERBERATER : BEREICHE;
  const aktiv = (href: string) =>
    href === "/"
      ? pfad === "/"
      : href === "/verkauf"
        ? ["/verkauf", "/kaufvertraege", "/zahlungsanforderungen", "/mahnungen"].some((x) => pfad.startsWith(x))
        : href === "/kosten"
          ? ["/kosten", "/gewerke", "/handwerkervertraege", "/eingangsrechnungen"].some((x) => pfad.startsWith(x))
          : href === "/buchhaltung"
            ? pfad.startsWith("/buchhaltung") && !pfad.startsWith("/buchhaltung/saldenliste")
            : pfad.startsWith(href);
  return (
    <aside className="seitenleiste">
      <a href="/" className="marke">
        <span className="logo">BT</span>
        <span>
          Bauträger
          <small>Plattform</small>
        </span>
      </a>
      {bereiche.map((b) => (
        <div key={b.titel} className="navgruppe">
          <div className="navtitel">{b.titel}</div>
          {b.eintraege.filter((e) => (e.href !== "/einstellungen" && e.href !== "/inbetriebnahme") || verwaltung).map(({ href, text, icon: Icon, bald }) =>
            bald ? (
              <span key={text} className="navlink deaktiviert" title="Folgt in Phase 1">
                <Icon size={18} /> {text} <em>bald</em>
              </span>
            ) : (
              <a key={text} href={href} className={`navlink${aktiv(href) ? " aktiv" : ""}`}>
                <Icon size={18} /> {text}
              </a>
            ),
          )}
        </div>
      ))}
      {benutzer ? (
        <div className="benutzer">
          <span className="avatar">{benutzer.name.split(/\s+/).map((t) => t[0]).join("").slice(0, 2).toUpperCase()}</span>
          <span>
            {benutzer.name}
            <small title={benutzer.email}>{benutzer.rollenText}</small>
          </span>
          <form action={abmelden}>
            <button type="submit" className="abmelden" title="Abmelden" aria-label="Abmelden">
              <LogOut size={16} />
            </button>
          </form>
        </div>
      ) : (
        <div className="benutzer">
          <span className="avatar">?</span>
          <span>
            Gemeinsamer Zugang
            <small>Microsoft-Anmeldung vorbereitet</small>
          </span>
        </div>
      )}
    </aside>
  );
}
