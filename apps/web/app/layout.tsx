import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "Bauträger-Plattform" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body>
        <div className="layout">
          <nav>
            <div className="brand">Bauträger-Plattform</div>
            <a href="/">Übersicht</a>
            <a href="/projekte">Projekte</a>
            <a href="/mabv">MaBV-Rechner</a>
          </nav>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
