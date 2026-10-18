import { defineConfig } from "vitest/config";

// Integrationstests teilen sich eine Test-Datenbank und laufen daher nacheinander.
export default defineConfig({ test: { fileParallelism: false } });
