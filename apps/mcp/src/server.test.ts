import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { erstelleServer } from "./server.js";

async function verbinde(apiUrl?: string) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([erstelleServer(undefined, apiUrl).connect(a), client.connect(b)]);
  return client;
}

afterEach(() => vi.unstubAllGlobals());

describe("MCP-Server", () => {
  it("bietet die Rechen-Tools an", async () => {
    const client = await verbinde();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["mabv_ratenplan_berechnen", "handwerker_pruefkette"]);
  });

  it("berechnet einen MaBV-Ratenplan", async () => {
    const client = await verbinde();
    const res = await client.callTool({ name: "mabv_ratenplan_berechnen", arguments: { vertragssumme: "324930.00" } });
    const plan = JSON.parse((res.content as { text: string }[])[0]!.text);
    expect(plan[0]).toMatchObject({ rate: 1, prozent: "30.00", betrag: "97.479,00" });
    expect(plan).toHaveLength(7);
  });

  it("listet anforderbare Raten über die API", async () => {
    const antworten: Record<string, unknown> = {
      "/kaufvertraege": [{ id: "k1" }],
      "/kaufvertraege/k1": {
        nr: "KV-101-001",
        projekt: { nr: 101, suchcode: "LINDENWEG" },
        kaeufer: [{ firma: null, vorname: "Erika", nachname: "Muster" }],
        raten: [
          { nr: 1, betrag: "97479.00", status: "bezahlt", text: "Erdarbeiten" },
          { nr: 2, betrag: "90980.40", status: "anforderbar", text: "Rohbau" },
        ],
        voraussetzungen: { vertragWirksam: true, vormerkungEingetragen: true, lastenfreistellungGesichert: true, buergschaftNach7: false, anforderungssperre: false },
      },
    };
    vi.stubGlobal("fetch", async (url: string) => {
      const pfad = new URL(url).pathname.replace("/api", "");
      return new Response(JSON.stringify(antworten[pfad]), { status: 200 });
    });
    const client = await verbinde("http://api.test");
    const res = await client.callTool({ name: "anforderbare_raten", arguments: {} });
    const daten = JSON.parse((res.content as { text: string }[])[0]!.text);
    expect(daten[0]).toMatchObject({ kaufvertrag: "KV-101-001", kaeufer: "Erika Muster", summeAnforderbar: "90.980,40", fehlendeVoraussetzungen: [] });
    expect(daten[0].anforderbar).toEqual([{ rate: 2, betrag: "90.980,40", bauabschnitt: "Rohbau" }]);
  });

  it("fasst den Kostenstand eines Projekts zusammen", async () => {
    const stand = { geschaetzt: "493200", vergeben: "100000", nachtraege: "5000", summeVergeben: "105000", berechnet: "38500", bezahlt: "34917.57", trend: "105000", abweichung: "388200" };
    const antworten: Record<string, unknown> = {
      "/projekte": [{ id: "p1", nr: 101, suchcode: "LINDENWEG" }],
      "/projekte/p1/kosten": {
        summe: stand,
        gewerke: [
          { nr: 300, bezeichnung: "Rohbau", stand, vertraege: [{ handwerker: { firma: "Rohbau Muster KG", nachname: null, suchcode: "ROHBAU" } }] },
          { nr: 311, bezeichnung: "Erdarbeiten", stand, vertraege: [] },
        ],
      },
      "/eingangsrechnungen": [{ rechnungsnr: "AR-2", status: "rechnerisch_geprueft", handwerker: "Rohbau Muster KG", gewerk: "Rohbau", betragBrutto: "60000", geprueftKumuliert: "58000", eingangAm: "2026-11-01" }],
    };
    vi.stubGlobal("fetch", async (url: string) => new Response(JSON.stringify(antworten[new URL(url).pathname.replace("/api", "")]), { status: 200 }));
    const client = await verbinde("http://api.test");
    const res = await client.callTool({ name: "kostenstand", arguments: { projektNr: 101 } });
    const d = JSON.parse((res.content as { text: string }[])[0]!.text);
    expect(d.summe.abweichung).toBe("388.200,00 €");
    expect(d.vergebeneGewerke).toHaveLength(1);
    expect(d.vergebeneGewerke[0]).toMatchObject({ gewerk: "300 Rohbau", vertragspartner: "Rohbau Muster KG" });
    expect(d.offeneRechnungen[0]).toMatchObject({ rechnung: "AR-2", schritt: "freizugeben", betragKumuliert: "58.000,00 €" });
  });

  it("listet offene Mängel mit Status und Frist", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      const u = new URL(url);
      expect(u.searchParams.get("status")).toBe("ueberfaellig");
      return new Response(
        JSON.stringify([{ nr: 1, projektNr: 382, projekt: "HANSEATEN-21", titel: "Entwässerung Dach", ort: "Dach", einheit: null, handwerker: "Flaschnerei Beispiel", status: "ueberfaellig", ruegen: 3, fristBis: "2025-07-15", einbehalt: true }]),
        { status: 200 },
      );
    });
    const client = await verbinde("http://api.test");
    const res = await client.callTool({ name: "maengel_offen", arguments: { nurUeberfaellig: true } });
    const d = JSON.parse((res.content as { text: string }[])[0]!.text);
    expect(d[0]).toMatchObject({ mangel: "382-1", einheit: "Gemeinschaft", status: "Frist überschritten", ruegen: 3 });
  });

  it("liefert die Liquiditätsbetrachtung je Projekt", async () => {
    const b = (t: string, a: string, z: string, o: string) => ({ trend: t, angefordert: a, bezahlt: z, offen: o });
    const zeile = { erloese: b("330000", "93000", "50000", "43000"), kosten: b("180000", "50000", "50000", "0"), saldo: b("150000", "43000", "0", "43000") };
    vi.stubGlobal("fetch", async (url: string) => {
      expect(new URL(url).searchParams.get("projekte")).toBe("alle");
      return new Response(
        JSON.stringify({ gesellschaften: [{ gesellschaft: { name: "Muster Wohnbau GmbH" }, projekte: [{ projekt: { nr: 101, suchcode: "LINDENWEG" }, ...zeile }], summe: zeile }], gesamt: zeile, stand: "2026-10-18" }),
        { status: 200 },
      );
    });
    const client = await verbinde("http://api.test");
    const res = await client.callTool({ name: "liquiditaet", arguments: { alleProjekte: true } });
    const d = JSON.parse((res.content as { text: string }[])[0]!.text);
    expect(d.gesellschaften[0].projekte[0]).toMatchObject({ projekt: "101 LINDENWEG", saldo: { trend: "150.000,00 €" } });
    expect(d.gesamt.erloese.offen).toBe("43.000,00 €");
  });

  it("liefert den Liquiditätsplan nach Kalenderwochen", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      const u = new URL(url);
      if (u.pathname.endsWith("/projekte")) return new Response(JSON.stringify([{ id: "p1", nr: 101 }]), { status: 200 });
      expect(u.searchParams.get("projektId")).toBe("p1");
      expect(u.searchParams.get("anfangsbestand")).toBe("100000.00");
      return new Response(
        JSON.stringify({
          stichtag: "2026-10-19",
          projekte: [{ nr: 101, suchcode: "LINDENWEG", hatPlan: true }],
          artText: { ein: { angefordert: "Angeforderte Raten" }, aus: { bauleistung: "Leistungen nach Bauzeitenplan" } },
          wochen: [{ jahr: 2026, woche: 43, ein: { angefordert: "43000" }, aus: { bauleistung: "8125" }, einSumme: "43000", ausSumme: "8125", bestand: "134875" }],
          summe: { ein: "43000", aus: "8125", endbestand: "134875" },
          tiefstand: { bestand: "100000", woche: null },
          ueberfaellig: { ein: "43000", aus: "0" },
          spaeter: { ein: "0", aus: "0" },
          ohneTermin: { ein: "0", aus: "0" },
          skonto: true,
          einbehalte: { skontoErsparnis: "1878.3", einbehaltenBisher: "3920", gewaehrleistung: "4900" },
        }),
        { status: 200 },
      );
    });
    const client = await verbinde("http://api.test");
    const res = await client.callTool({ name: "liquiditaetsplan", arguments: { projektNr: 101, anfangsbestand: 100000 } });
    const d = JSON.parse((res.content as { text: string }[])[0]!.text);
    expect(d.wochen[0]).toMatchObject({ kw: "KW 43/2026", einnahmen: { "Angeforderte Raten": "43.000,00 €" }, bestand: "134.875,00 €" });
    expect(d.summe.endbestand).toBe("134.875,00 €");
    expect(d.einbehalte).toEqual({ vertragserfuellungDerzeit: "3.920,00 €", gewaehrleistungGesamt: "4.900,00 €", skontoertragEingerechnet: "1.878,30 €" });
  });

  it("listet Bürgschaften mit Handlungsbedarf", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      expect(new URL(url).searchParams.get("status")).toBe("handlung");
      return new Response(
        JSON.stringify({
          buergschaften: [{ artText: "Gewährleistungsbürgschaft", richtung: "erhalten", projekt: { nr: 101, suchcode: "LINDENWEG" }, bezug: "300 Rohbau – Rohbau KG", buerge: "Sparkasse", nr: "GB-1", betrag: "2500", gueltigBis: null, rueckgabeFaelligAb: "2025-01-15", status: "rueckgabe_faellig" }],
          summen: { erhalten: "2500", ausgegeben: "0", handlungsbedarf: 1 },
        }),
        { status: 200 },
      );
    });
    const client = await verbinde("http://api.test");
    const res = await client.callTool({ name: "buergschaften", arguments: {} });
    const d = JSON.parse((res.content as { text: string }[])[0]!.text);
    expect(d.buergschaften[0]).toMatchObject({ projekt: "101 LINDENWEG", betrag: "2.500,00 €", status: "Rückgabe fällig" });
    expect(d.summen.handlungsbedarf).toBe(1);
  });

  it("zeigt die Bauabzugsteuer je Monat und Handwerker", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      expect(new URL(url).searchParams.get("monate")).toBe("12");
      return new Response(
        JSON.stringify({
          monate: [{ monatText: "Oktober 2026", faelligAm: "2026-11-10", ueberfaellig: false, summe: { abzugsbetrag: "1800" }, zeilen: [{ handwerkerId: "h1", gegenleistung: "12000", abzugsbetrag: "1800", status: "offen", anmeldung: null }] }],
          handwerker: [{ id: "h1", suchcode: "ROHBAU", firma: "Rohbau KG", nachname: null, finanzamt: "Stuttgart II" }],
        }),
        { status: 200 },
      );
    });
    const client = await verbinde("http://api.test");
    const res = await client.callTool({ name: "bauabzugsteuer", arguments: {} });
    const d = JSON.parse((res.content as { text: string }[])[0]!.text);
    expect(d[0]).toMatchObject({ monat: "Oktober 2026", termin: "2026-11-10", abzugGesamt: "1.800,00 €" });
    expect(d[0].handwerker[0]).toMatchObject({ name: "Rohbau KG", finanzamt: "Stuttgart II", abzug: "1.800,00 €", stand: "anzumelden" });
  });

  it("fasst den MaBV-Prüfbericht mit Feststellungen zusammen", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      const u = new URL(url);
      expect(u.searchParams.get("von")).toBe("2026-01-01");
      return new Response(
        JSON.stringify({
          gesellschaft: { name: "Muster Wohnbau GmbH" },
          zeitraum: { von: "2026-01-01", bis: "2026-12-31" },
          summen: { vertraege: 2, vertragssumme: "792400", angefordertImZeitraum: "237720", eingegangenImZeitraum: "120000", anforderungen: 2, verstoesse: 1, hinweise: 0 },
          vertraege: [{ nr: "KV-101-002", kaeufer: ["Max Beispiel"], sicherung: { art: "§ 3" }, verstoesse: 1, feststellungen: [{ art: "bautenstand", schwere: "verstoss", text: "zu früh", rechnungsnr: "ZA-2026-00002" }] }],
        }),
        { status: 200 },
      );
    });
    const client = await verbinde("http://api.test");
    const res = await client.callTool({ name: "mabv_pruefbericht", arguments: { jahr: 2026 } });
    const d = JSON.parse((res.content as { text: string }[])[0]!.text);
    expect(d.summen.vertragssumme).toBe("792.400,00 €");
    expect(d.feststellungen[0]).toMatchObject({ kaufvertrag: "KV-101-002", rechnungsnr: "ZA-2026-00002", schwere: "verstoss" });
  });

  it("liefert die Aufgaben aus dem Cockpit", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(
        JSON.stringify({
          stichtag: "2026-10-18",
          anzahl: { hoch: 1, mittel: 1, info: 0 },
          kennzahlen: {},
          aufgaben: [
            { bereich: "verkauf", dringlichkeit: "hoch", titel: "Zahlung überfällig: ZA-2026-00002", text: "seit 68 Tagen", betrag: "121680", projekt: "101 LINDENWEG" },
            { bereich: "bau", dringlichkeit: "mittel", titel: "3 Vorgänge über Plan-Ende", text: "…" },
          ],
        }),
        { status: 200 },
      ),
    );
    const client = await verbinde("http://api.test");
    const res = await client.callTool({ name: "aufgaben", arguments: { nurDringend: true } });
    const d = JSON.parse((res.content as { text: string }[])[0]!.text);
    expect(d.aufgaben).toHaveLength(1);
    expect(d.aufgaben[0]).toMatchObject({ titel: "Zahlung überfällig: ZA-2026-00002", betrag: "121.680,00 €" });
  });
});
