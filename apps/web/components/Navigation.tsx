"use client";

import {
  BarChart3,
  Building2,
  Calculator,
  ClipboardList,
  FolderKanban,
  HandCoins,
  LayoutDashboard,
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
      { href: "/maengel", text: "Mängel", icon: Wrench },
      { href: "#", text: "Auswertungen", icon: BarChart3, bald: true },
    ],
  },
  { titel: "Werkzeuge", eintraege: [{ href: "/mabv", text: "MaBV-Rechner", icon: Calculator }] },
];

export function Navigation() {
  const pfad = usePathname();
  const aktiv = (href: string) =>
    href === "/"
      ? pfad === "/"
      : href === "/verkauf"
        ? ["/verkauf", "/kaufvertraege", "/zahlungsanforderungen"].some((x) => pfad.startsWith(x))
        : href === "/kosten"
          ? ["/kosten", "/gewerke", "/handwerkervertraege", "/eingangsrechnungen"].some((x) => pfad.startsWith(x))
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
      {BEREICHE.map((b) => (
        <div key={b.titel} className="navgruppe">
          <div className="navtitel">{b.titel}</div>
          {b.eintraege.map(({ href, text, icon: Icon, bald }) =>
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
      <div className="benutzer">
        <span className="avatar">?</span>
        <span>
          Nicht angemeldet
          <small>Microsoft-Anmeldung folgt</small>
        </span>
      </div>
    </aside>
  );
}
