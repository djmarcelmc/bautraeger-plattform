import { headers } from "next/headers";
import type { ReactNode } from "react";
import { rollenText } from "@bt/domain";
import { signOut } from "@/auth";
import { Navigation } from "@/components/Navigation";
import { aktuellerBenutzer } from "@/lib/benutzer";
import "./globals.css";

export const metadata = { title: "Bauträger-Plattform" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const pfad = (await headers()).get("x-pfad") ?? "";
  const portal = pfad.startsWith("/portal") || pfad.startsWith("/anmelden");
  const b = portal ? null : await aktuellerBenutzer();
  const benutzer = b ? { name: b.name, email: b.email, rollen: b.rollen, rollenText: rollenText(b.rollen) || "keine Rolle" } : null;
  async function abmelden() {
    "use server";
    await signOut({ redirectTo: "/anmelden" });
  }
  return (
    <html lang="de">
      <body>
        {portal ? (
          <main className="portal">{children}</main>
        ) : (
          <div className="layout">
            <Navigation benutzer={benutzer} abmelden={abmelden} />
            <main>{children}</main>
          </div>
        )}
      </body>
    </html>
  );
}
