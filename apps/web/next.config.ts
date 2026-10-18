import type { NextConfig } from "next";

// Die Weboberfläche ruft die API serverseitig über API_URL auf (siehe lib/api.ts).
// /api/* bleibt frei für die spätere Anmeldung (Auth.js).
const config: NextConfig = {
  // Dokument-Uploads bis 25 MB laufen über Server Actions
  experimental: { serverActions: { bodySizeLimit: "26mb" } },
};

export default config;
