import { join } from "node:path";
import type { NextConfig } from "next";

// Die Weboberfläche ruft die API serverseitig über API_URL auf (siehe lib/api.ts).
// /api/* bleibt frei für die spätere Anmeldung (Auth.js).
const config: NextConfig = {
  // Eigenständiger Server für das Docker-Image (inkl. benötigter Workspace-Pakete)
  output: "standalone",
  outputFileTracingRoot: join(import.meta.dirname, "../.."),
  // Dokument-Uploads bis 25 MB laufen über Server Actions
  experimental: { serverActions: { bodySizeLimit: "26mb" } },
  // PDF-Erzeugung der Schreiben über Chromium (lib/pdf.ts)
  serverExternalPackages: ["playwright-core", "pdf-lib"],
};

export default config;
