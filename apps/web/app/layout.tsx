import { headers } from "next/headers";
import type { ReactNode } from "react";
import { Navigation } from "@/components/Navigation";
import "./globals.css";

export const metadata = { title: "Bauträger-Plattform" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const portal = (await headers()).get("x-pfad")?.startsWith("/portal");
  return (
    <html lang="de">
      <body>
        {portal ? (
          <main className="portal">{children}</main>
        ) : (
          <div className="layout">
            <Navigation />
            <main>{children}</main>
          </div>
        )}
      </body>
    </html>
  );
}
