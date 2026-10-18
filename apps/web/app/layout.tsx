import type { ReactNode } from "react";
import { Navigation } from "@/components/Navigation";
import "./globals.css";

export const metadata = { title: "Bauträger-Plattform" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body>
        <div className="layout">
          <Navigation />
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
