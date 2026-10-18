/** Integrationstests Datenimport (nur mit TEST_DATABASE_URL; die Datenbank wird geleert!). */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { migrieren, verbinden } from "@bt/db";
import { sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Datenimport (Integration)", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const als = (r: request.Test) => r.set("x-benutzer", "test@example.com");
  let projektId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    await migrieren(url);
    const db = verbinden(url);
    await db.execute(sql`truncate mandant cascade; truncate aenderungsprotokoll`);
    const { AppModule } = await import("./app.module.js");
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
    http = request(app.getHttpServer());
    const ges = await als(http.post("/api/gesellschaften")).send({ nr: 1, name: "Import GmbH" });
    const prj = await als(http.post("/api/projekte")).send({ gesellschaftId: ges.body.id, nr: 101, suchcode: "IMPORT" });
    projektId = prj.body.id;
  });

  afterAll(async () => app?.close());

  const csv = (text: string, enc: BufferEncoding = "utf8") => Buffer.from(text, enc);

  it("liefert Excel-Vorlagen", async () => {
    const r = await http.get("/api/import/einheiten/vorlage").buffer(true).parse((res, cb) => {
      const teile: Buffer[] = [];
      res.on("data", (c: Buffer) => teile.push(c));
      res.on("end", () => cb(null, Buffer.concat(teile)));
    });
    expect(r.status).toBe(200);
    expect(r.headers["content-disposition"]).toMatch(/Importvorlage-Einheiten\.xlsx/);
    const mappe = new ExcelJS.Workbook();
    await mappe.xlsx.load(r.body);
    expect(mappe.worksheets.map((w) => w.name)).toEqual(["Einheiten", "Hinweise"]);
    expect(mappe.worksheets[0]!.getCell("B1").value).toBe("Typ *");
  });

  it("prüft Partner aus CSV (Windows-1252) ohne zu speichern und übernimmt sie danach", async () => {
    const datei = csv("Firma;Nachname;Rolle;E-Mail\r\nDach Müller GmbH;;Handwerker;info@dach.de\r\n;Schäfer;Kunde;\r\n", "latin1");
    const p = await als(http.post("/api/import/partner/pruefen")).attach("datei", datei, "partner.csv");
    expect(p.status).toBe(201);
    expect(p.body).toMatchObject({ bereit: true, anzahl: { neu: 2, fehler: 0 } });
    expect(p.body.zeilen[0]).toMatchObject({ schluessel: "10001", bezeichnung: "Dach Müller GmbH" });
    expect(p.body.zeilen[0].werte).toBeUndefined();
    expect((await http.get("/api/partner")).body).toHaveLength(0);

    const a = await als(http.post("/api/import/partner/ausfuehren")).attach("datei", datei, "partner.csv");
    expect(a.status).toBe(201);
    expect(a.body).toEqual({ angelegt: 2, aktualisiert: 0, unveraendert: 0 });
    const liste = (await http.get("/api/partner")).body as { id: string; nr: number; suchcode: string }[];
    expect(liste.map((x) => [x.nr, x.suchcode]).sort()).toEqual([[10001, "DACHMUELLER"], [10002, "SCHAEFER"]]);
    const prot = await http.get(`/api/protokoll/${liste[0]!.id}`);
    expect(prot.body[0]).toMatchObject({ aktion: "insert", benutzer: "test@example.com (Import)" });
  });

  it("lehnt fehlerhafte Dateien und Dubletten ab, aktualisiert nur auf Wunsch", async () => {
    const datei = csv("Nr.;Firma;Rollen\n10001;Dach Müller GmbH & Co;Handwerker\n");
    const ohne = await als(http.post("/api/import/partner/ausfuehren")).attach("datei", datei, "p.csv");
    expect(ohne.status).toBe(422);
    expect(ohne.body.fehler[0]).toMatch(/Zeile 2: Nr\. 10001 ist bereits vorhanden/);
    const mit = await als(http.post("/api/import/partner/ausfuehren")).field("aktualisieren", "true").attach("datei", datei, "p.csv");
    expect(mit.body).toEqual({ angelegt: 0, aktualisiert: 1, unveraendert: 0 });
    // Suchcode war leer → neu gebildet; erneuter Import ist unverändert und damit nicht „bereit“
    const nochmal = await als(http.post("/api/import/partner/pruefen")).field("aktualisieren", "true").attach("datei", datei, "p.csv");
    expect(nochmal.body.anzahl.unveraendert).toBe(1);
    const xls = await als(http.post("/api/import/partner/pruefen")).attach("datei", Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0]), "alt.xls");
    expect(xls.status).toBe(400);
    expect(xls.body.message).toMatch(/\.xls/);
  });

  it("übernimmt Einheiten aus Excel samt Zugehörigkeit", async () => {
    const mappe = new ExcelJS.Workbook();
    const b = mappe.addWorksheet("Liste");
    b.addRow(["WE-Nr", "Typ", "Etage", "Wohnfläche", "MEA", "Kaufpreis", "Gehört zu Nr."]);
    b.addRow(["TG01", "Stellplatz", "TG", null, 5.5, 25000, "W01"]);
    b.addRow(["W01", "Wohnung", "EG", 84.5, 92.125, 498550, null]);
    const datei = Buffer.from(await mappe.xlsx.writeBuffer());
    const ohneProjekt = await als(http.post("/api/import/einheiten/pruefen")).attach("datei", datei, "e.xlsx");
    expect(ohneProjekt.status).toBe(400);
    const a = await als(http.post("/api/import/einheiten/ausfuehren")).field("projektId", projektId).attach("datei", datei, "e.xlsx");
    expect(a.status).toBe(201);
    expect(a.body.angelegt).toBe(2);
    const liste = (await http.get(`/api/projekte/${projektId}`)).body.einheiten as { id: string; nr: string }[];
    const w = (await http.get(`/api/einheiten/${liste.find((x) => x.nr === "W01")!.id}`)).body;
    const tg = (await http.get(`/api/einheiten/${liste.find((x) => x.nr === "TG01")!.id}`)).body;
    expect(w).toMatchObject({ miteigentumTsd: "92.125", wohnflaeche: "84.50", vkBrutto: "498550.00" });
    expect(tg.zugehoerigZuEinheitId).toBe(w.id);
  });
});
