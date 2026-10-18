/** Integrationstests Bankabgleich (nur mit TEST_DATABASE_URL; die Datenbank wird geleert!). */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { migrieren, verbinden } from "@bt/db";
import { sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const heute = new Date().toISOString().slice(0, 10);
const morgen = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
const KONTO = "DE89370400440532013000";

/** Minimaler CAMT.053-Auszug */
function camt(eintraege: { betrag: string; haben: boolean; zweck: string; name: string; e2e?: string; ref: string }[], iban = KONTO) {
  const ntry = eintraege
    .map(
      (e) => `<Ntry><Amt Ccy="EUR">${e.betrag}</Amt><CdtDbtInd>${e.haben ? "CRDT" : "DBIT"}</CdtDbtInd><Sts><Cd>BOOK</Cd></Sts><BookgDt><Dt>${heute}</Dt></BookgDt><ValDt><Dt>${heute}</Dt></ValDt><AcctSvcrRef>${e.ref}</AcctSvcrRef>
      <NtryDtls><TxDtls><Refs><EndToEndId>${e.e2e ?? "NOTPROVIDED"}</EndToEndId></Refs><RltdPties><${e.haben ? "Dbtr" : "Cdtr"}><Pty><Nm>${e.name}</Nm></Pty></${e.haben ? "Dbtr" : "Cdtr"}></RltdPties><RmtInf><Ustrd>${e.zweck}</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>`,
    )
    .join("");
  return Buffer.from(`<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08"><BkToCstmrStmt><Stmt><Acct><Id><IBAN>${iban}</IBAN></Id></Acct>${ntry}</Stmt></BkToCstmrStmt></Document>`);
}

describe.skipIf(!url)("Bankabgleich (Integration)", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const als = (r: request.Test) => r.set("x-benutzer", "buchhaltung@example.com");
  const ids: Record<string, string> = {};
  const nr: Record<string, string> = {};
  const liste = async (status = "offen") => (await http.get(`/api/bankabgleich?gesellschaftId=${ids.g}&status=${status}`)).body;
  const hochladen = (datei: Buffer, name = "auszug.xml", gesellschaftId?: string) => {
    const r = als(http.post("/api/bankabgleich/import")).attach("datei", datei, name);
    return gesellschaftId ? r.field("gesellschaftId", gesellschaftId) : r;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    await migrieren(url);
    await verbinden(url).execute(sql`truncate mandant cascade; truncate aenderungsprotokoll`);
    const { AppModule } = await import("./app.module.js");
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
    http = request(app.getHttpServer());

    ids.g = (await als(http.post("/api/gesellschaften")).send({ nr: 1, name: "Muster Wohnbau GmbH", iban: "DE89 3704 0044 0532 0130 00" })).body.id;
    ids.g2 = (await als(http.post("/api/gesellschaften")).send({ nr: 2, name: "Andere GmbH" })).body.id;
    ids.p = (await als(http.post("/api/projekte")).send({ gesellschaftId: ids.g, nr: 101, suchcode: "LINDENWEG" })).body.id;
    const k = (await als(http.post("/api/partner")).send({ nr: 17, suchcode: "mustermann", vorname: "Max", nachname: "Mustermann", rollen: ["kunde"] })).body.id;
    const we = (await als(http.post(`/api/projekte/${ids.p}/einheiten`)).send({ nr: "W01", typ: "wohnung", vkBrutto: "300000" })).body.id;
    ids.v = (await als(http.post("/api/kaufvertraege")).send({ projektId: ids.p, datum: heute, zahlungsanforderungAn: k, kaeufer: [{ partnerId: k, anteilProzent: "100" }], einheiten: [{ einheitId: we, vkBrutto: "300000" }] })).body.id;
    await als(http.put(`/api/kaufvertraege/${ids.v}/konditionen`)).send({ zahlungsanforderungAn: k, vertragWirksam: true, vormerkungEingetragenAm: heute, lastenfreistellungGesichert: true, zahlungszielTage: 10 });
    await als(http.post(`/api/projekte/${ids.p}/bautenstand`)).send({ einheitIds: [we], abschnitt: "erdarbeiten", fertigAm: heute });
    const v = (await http.get(`/api/kaufvertraege/${ids.v}`)).body;
    const za = (await als(http.post("/api/zahlungsanforderungen")).send({ rateIds: [v.raten[0].id], datum: heute })).body;
    ids.za = za.id;
    nr.za = za.rechnungsnr;

    const hw = (await als(http.post("/api/partner")).send({ nr: 70001, suchcode: "rohbau", firma: "Rohbau KG", rollen: ["handwerker"], iban: "DE02120300000000202051", freistellungGueltigBis: "2099-12-31" })).body.id;
    const gw = (await als(http.post(`/api/projekte/${ids.p}/gewerke`)).send({ nr: 300, bezeichnung: "Rohbau" })).body.id;
    const hv = (await als(http.post("/api/handwerkervertraege")).send({ gewerkId: gw, handwerkerId: hw, vertragBrutto: "50000" })).body.id;
    const r = (await als(http.post("/api/eingangsrechnungen")).send({ handwerkervertragId: hv, rechnungsnr: "AR-1", rechnungsdatum: heute, eingangAm: heute, betragBrutto: "10000" })).body.id;
    await als(http.post(`/api/eingangsrechnungen/${r}/pruefen`)).send({ geprueftKumuliert: "10000" });
    await als(http.post(`/api/eingangsrechnungen/${r}/freigeben`));
    const lauf = await als(http.post("/api/zahlungslaeufe")).send({ rechnungIds: [r], ausfuehrungAm: morgen });
    expect(lauf.status).toBe(201);
    ids.lauf = lauf.body.id;
    nr.lauf = lauf.body.nr;
  });

  afterAll(async () => app?.close());

  it("liest den Auszug ein, ordnet die Gesellschaft über die IBAN zu und überspringt Doppelte", async () => {
    const datei = camt([
      { betrag: "60000.00", haben: true, zweck: `Rate 1 ${nr.za} Teilzahlung`, name: "Max Mustermann", ref: "R1" },
      { betrag: "30000.00", haben: true, zweck: "Restzahlung Rate", name: "MUSTERMANN MAX", ref: "R2" },
      { betrag: "10000.00", haben: false, zweck: `Sammler ${nr.lauf}`, name: "Rohbau KG", e2e: `${nr.lauf}-AR-1`, ref: "R3" },
      { betrag: "12.50", haben: false, zweck: "Kontofuehrung", name: "Bank", ref: "R4" },
    ]);
    const r = await hochladen(datei);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ neu: 4, doppelt: 0, gesellschaft: { nr: 1 } });
    expect((await hochladen(datei)).body).toMatchObject({ neu: 0, doppelt: 4 });
    // falsche Gesellschaft bzw. unbekanntes Konto
    expect((await hochladen(datei, "a.xml", ids.g2)).body.message).toMatch(/gehört zum Konto von „Muster Wohnbau GmbH“/);
    expect((await hochladen(camt([{ betrag: "1.00", haben: true, zweck: "x", name: "y", ref: "Z" }], "DE02500105170137075030"))).body.message).toMatch(/keiner Gesellschaft zugeordnet/);
    expect((await hochladen(Buffer.from("Datum;Betrag"), "x.csv")).body.message).toMatch(/Unbekanntes Dateiformat/);
  });

  it("macht Vorschläge und übernimmt die sicheren", async () => {
    const l = await liste();
    expect(l.summen).toMatchObject({ offen: 4, offenEingang: "90000.00" });
    const v = Object.fromEntries(l.umsaetze.map((u: { bankreferenz: string; vorschlag: unknown }) => [u.bankreferenz, u.vorschlag]));
    expect(v.R1).toMatchObject({ art: "anforderung", sicherheit: "sicher", posten: [{ id: ids.za, betrag: "60000.00" }] });
    expect(v.R2).toBeNull(); // 30.000 passt (noch) nicht zum offenen Betrag von 90.000
    expect(v.R3).toMatchObject({ art: "zahlungsausgang", sicherheit: "sicher" });
    expect(v.R4).toBeNull();
    const u = await als(http.post("/api/bankabgleich/vorschlaege")).send({ gesellschaftId: ids.g });
    expect(u.body).toMatchObject({ uebernommen: 2 });
    // nach der Teilzahlung passt die Restzahlung jetzt über Betrag + Name
    const r2 = (await liste()).umsaetze.find((x: { bankreferenz: string }) => x.bankreferenz === "R2");
    expect(r2.vorschlag).toMatchObject({ sicherheit: "wahrscheinlich", posten: [{ id: ids.za, betrag: "30000.00" }] });
    const ok = await als(http.post(`/api/bankabgleich/umsaetze/${r2.id}/zuordnen`)).send({ art: "anforderung", posten: [{ id: ids.za, betrag: "30000,00" }] });
    expect(ok.status).toBe(201);
    const vertrag = (await http.get(`/api/kaufvertraege/${ids.v}`)).body;
    expect(vertrag.anforderungen[0]).toMatchObject({ offen: "0.00" });
    const zu = (await liste("zugeordnet")).umsaetze;
    expect(zu).toHaveLength(3);
    expect(zu.find((x: { bankreferenz: string }) => x.bankreferenz === "R1").zuordnung.eingaenge[0]).toMatchObject({ rechnungsnr: nr.za, betrag: "60000.00" });
  });

  it("prüft Zuordnungen und erlaubt Ignorieren und Zurücksetzen", async () => {
    const r4 = (await liste()).umsaetze.find((x: { bankreferenz: string }) => x.bankreferenz === "R4");
    expect((await als(http.post(`/api/bankabgleich/umsaetze/${r4.id}/zuordnen`)).send({ art: "anforderung", posten: [{ id: ids.za, betrag: "12.50" }] })).status).toBe(400);
    expect((await als(http.post(`/api/bankabgleich/umsaetze/${r4.id}/zuordnen`)).send({ art: "zahlungslauf", id: ids.lauf })).status).toBe(409); // Zahlung des Laufs ist schon zugeordnet
    expect((await als(http.post(`/api/bankabgleich/umsaetze/${r4.id}/ignorieren`)).send({ bemerkung: "Bankgebühr" })).body.status).toBe("ignoriert");

    const r1 = (await liste("zugeordnet")).umsaetze.find((x: { bankreferenz: string }) => x.bankreferenz === "R1");
    expect((await als(http.post(`/api/bankabgleich/umsaetze/${r1.id}/zuruecksetzen`))).body.status).toBe("offen");
    expect((await http.get(`/api/kaufvertraege/${ids.v}`)).body.anforderungen[0]).toMatchObject({ offen: "60000.00" });
    // erneut zuordnen
    expect((await als(http.post(`/api/bankabgleich/umsaetze/${r1.id}/zuordnen`)).send({ art: "anforderung", posten: [{ id: ids.za, betrag: "50000" }] })).status).toBe(400); // Summe ≠ Umsatz
    expect((await als(http.post(`/api/bankabgleich/umsaetze/${r1.id}/zuordnen`)).send({ art: "anforderung", posten: [{ id: ids.za, betrag: "60000" }] })).status).toBe(201);
    expect((await liste()).summen.offen).toBe(0);
  });

  it("die Zahlungseingänge erscheinen im Buchungsjournal", async () => {
    const j = (await als(http.get(`/api/buchhaltung/journal?gesellschaftId=${ids.g}&quelle=zahlungseingang`))).body;
    expect(j.zeilen.map((z: { betrag: string }) => z.betrag).sort()).toEqual(["30000.00", "60000.00"]);
  });
});
