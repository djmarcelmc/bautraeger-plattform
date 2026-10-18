import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { Readable } from "node:stream";

/** Ablage für Dateien. Heute lokal; eine S3-Variante (z. B. Hetzner/MinIO) implementiert dieselbe Schnittstelle. */
export interface Speicher {
  speichern(key: string, inhalt: Buffer): Promise<void>;
  lesen(key: string): Readable;
}

export class LokalerSpeicher implements Speicher {
  private readonly wurzel: string;

  constructor(wurzel = process.env.DOKUMENTE_PFAD ?? "data/dokumente") {
    this.wurzel = resolve(wurzel);
  }

  private pfad(key: string) {
    const p = resolve(this.wurzel, key);
    if (!p.startsWith(this.wurzel + sep)) throw new Error("Ungültiger Speicherschlüssel");
    return p;
  }

  async speichern(key: string, inhalt: Buffer) {
    const p = this.pfad(key);
    await mkdir(dirname(p), { recursive: true });
    // wx: niemals eine bestehende Datei überschreiben (Unveränderbarkeit)
    await writeFile(p, inhalt, { flag: "wx" });
  }

  lesen(key: string) {
    return createReadStream(this.pfad(key));
  }
}

export const SPEICHER = Symbol("SPEICHER");
