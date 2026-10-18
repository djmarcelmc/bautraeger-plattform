/** Integrationstests Briefbogen je Gesellschaft (nur mit TEST_DATABASE_URL; die Datenbank wird geleert!). */
import "reflect-metadata";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { migrieren, verbinden } from "@bt/db";
import { sql } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

async function pdf(seiten: number, groesse: [number, number] = [595.28, 841.89]) {
  const d = await PDFDocument.create();
  for (let i = 0; i < seiten; i++) d.addPage(groesse);
  return Buffer.from(await d.save());
}

describe.skipIf(!url)("Briefbogen (Integration)", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const als = (r: request.Test) => r.set("x-benutzer", "gf@example.com");
  let id: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.DOKUMENTE_PFAD = mkdtempSync(join(tmpdir(), "briefbogen-"));
    await migrieren(url);
    await verbinden(url).execute(sql`truncate mandant cascade; truncate aenderungsprotokoll`);
    const { AppModule } = await import("./app.module.js");
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
    http = request(app.getHttpServer());
    id = (await als(http.post("/api/gesellschaften")).send({ nr: 1, name: "OSWA „Planen und Bauen“ GmbH" })).body.id;
  });

  afterAll(async () => app?.close());

  it("startet ohne Briefbogen mit Standard-Satzspiegel", async () => {
    expect((await http.get(`/api/gesellschaften/${id}/briefbogen`)).body).toMatchObject({ aktiv: false, einstellung: { randObenErsteSeite: 45, randLinks: 25 } });
    expect((await http.get(`/api/gesellschaften/${id}/briefbogen/datei`)).status).toBe(404);
  });

  it("nimmt nur A4-PDFs an und merkt sich Seitenzahl und Datei", async () => {
    const u = `/api/gesellschaften/${id}/briefbogen`;
    const kein = await als(http.post(u)).attach("datei", Buffer.from("<docx>"), "Briefbogen.docx");
    expect(kein.body.fehler[0]).toMatch(/PDF-Datei/);
    const a5 = await als(http.post(u)).attach("datei", await pdf(1, [419.5, 595.3]), "a5.pdf");
    expect(a5.body.fehler[0]).toMatch(/DIN A4 hochkant sein \(erkannt: 148 × 210 mm\)/);
    const ok = await als(http.post(u)).attach("datei", await pdf(3), "Briefbogen OSWA.pdf");
    expect(ok.status).toBe(201);
    expect(ok.body).toEqual({ aktiv: true, dateiname: "Briefbogen OSWA.pdf", seiten: 2 });
    const d = await http.get(`${u}/datei`).buffer(true);
    expect(d.headers["content-type"]).toBe("application/pdf");
    expect((await http.get(`/api/dokumente?objektTyp=gesellschaft&objektId=${id}`)).body[0]).toMatchObject({ ordner: "Briefbogen" });
  });

  it("speichert den Satzspiegel, prüft Eingaben und lässt sich entfernen", async () => {
    const u = `/api/gesellschaften/${id}/briefbogen`;
    expect((await als(http.put(u)).send({ datumX: "159" })).status).toBe(400);
    const r = await als(http.put(u)).send({ randObenErsteSeite: "45", randObenFolgeseiten: "35", randLinks: "28,7", textAb: "108", datumX: "159", datumY: "102", zeichenX: "123,7", zeichenY: "102", zeichenText: "MD", absenderzeileAusblenden: "on" });
    expect(r.status).toBe(200);
    expect((await http.get(u)).body).toMatchObject({ aktiv: true, einstellung: { randLinks: 28.7, textAb: 108, zeichenText: "MD" } });
    // Stammdaten ändern lässt den Briefbogen unberührt
    await als(http.put(`/api/gesellschaften/${id}`)).send({ nr: 1, name: "OSWA „Planen und Bauen“ GmbH", anschrift: "Freiberger Str. 17, 74379 Ingersheim" });
    expect((await http.get(u)).body.aktiv).toBe(true);
    await als(http.delete(u));
    expect((await http.get(u)).body).toMatchObject({ aktiv: false, einstellung: { randLinks: 28.7 } });
  });
});
