import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Post, Put, Query, StreamableFile } from "@nestjs/common";
import { schema } from "@bt/db";
import { BauzeitenplanEingabe, VerschiebenEingabe, VorgangEingabe, bauzeitenplanAusVorlage, datumPlusTage, type VorgangEingabe as VorgangWerte } from "@bt/domain";
import { and, eq, gte, inArray, isNull, max, sql } from "drizzle-orm";
import { XLSX, excelDatei } from "../auswertungen/excel.js";
import { Benutzer, pruefe } from "../common/eingabe.js";
import { differenz, protokollieren } from "../common/protokoll.js";
import { DB, type Db } from "../db.provider.js";
import { VerkaufService } from "../verkauf/verkauf.service.js";
import { BauzeitService } from "./bauzeit.service.js";

const { vorgang: vg, gewerk: gw } = schema;
const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/.test(v) ? v : undefined);

@Controller()
export class BauzeitController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(VerkaufService) private readonly verkauf: VerkaufService,
    @Inject(BauzeitService) private readonly bauzeit: BauzeitService,
  ) {}

  /** Gewerke müssen zum Projekt gehören. */
  private async gewerkePruefen(projektId: string, ids: string[]) {
    if (!ids.length) return;
    const gefunden = await this.db.select({ id: gw.id }).from(gw).where(and(eq(gw.projektId, projektId), inArray(gw.id, ids)));
    if (gefunden.length !== new Set(ids).size) throw new BadRequestException("Mindestens ein Gewerk gehört nicht zum Projekt.");
  }

  private werte(w: VorgangWerte) {
    const { nr: _nr, ...rest } = w;
    return { ...rest, gewerkIds: [...new Set(w.gewerkIds)], mabvAbschnitt: w.mabvAbschnitt ?? null, endeIst: w.endeIst ?? null };
  }

  @Get("projekte/:id/bauzeitenplan")
  async plan(@Param("id", ParseUUIDPipe) projektId: string) {
    await this.verkauf.projekt(projektId);
    return this.bauzeit.bauzeitenplan(projektId);
  }

  /** Legt den Bauzeitenplan aus der Vorlage an und verknüpft die Gewerke über ihre Nummer. */
  @Post("projekte/:id/bauzeitenplan")
  async ausVorlage(@Param("id", ParseUUIDPipe) projektId: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const { baubeginn } = pruefe(BauzeitenplanEingabe, body);
    await this.verkauf.projekt(projektId);
    const [vorhanden] = await this.db.select({ n: sql<number>`count(*)::int` }).from(vg).where(eq(vg.projektId, projektId));
    if (vorhanden!.n > 0) throw new ConflictException("Das Projekt hat bereits einen Bauzeitenplan.");
    const gewerke = await this.db.select({ id: gw.id, nr: gw.nr }).from(gw).where(eq(gw.projektId, projektId));
    const jeNr = new Map(gewerke.map((x) => [x.nr, x.id]));
    const plan = bauzeitenplanAusVorlage(baubeginn).map(({ gewerkNrs, ...v }) => ({
      ...v,
      projektId,
      gewerkIds: gewerkNrs.map((n) => jeNr.get(n)).filter((x): x is string => !!x),
    }));
    await this.db.transaction(async (tx) => {
      await tx.insert(vg).values(plan);
      await protokollieren(tx, { tabelle: "projekt", id: projektId, aktion: "update", neu: { bauzeitenplan: `${plan.length} Vorgänge aus Vorlage`, baubeginn }, benutzer });
    });
    return { angelegt: plan.length };
  }

  /** Verschiebt alle noch nicht beendeten Vorgänge (optional ab einer Nummer) um n Tage. */
  @Post("projekte/:id/bauzeitenplan/verschieben")
  async verschieben(@Param("id", ParseUUIDPipe) projektId: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const { tage, abNr } = pruefe(VerschiebenEingabe, body);
    await this.verkauf.projekt(projektId);
    return this.db.transaction(async (tx) => {
      const betroffen = await tx
        .select()
        .from(vg)
        .where(and(eq(vg.projektId, projektId), isNull(vg.endeIst), abNr ? gte(vg.nr, abNr) : undefined));
      for (const v of betroffen) {
        const neu = { beginn: datumPlusTage(v.beginn, tage), ende: datumPlusTage(v.ende, tage) };
        await tx.update(vg).set({ ...neu, geaendertAm: new Date() }).where(eq(vg.id, v.id));
        await protokollieren(tx, { tabelle: "vorgang", id: v.id, aktion: "update", alt: { beginn: v.beginn, ende: v.ende }, neu, benutzer });
      }
      return { verschoben: betroffen.length };
    });
  }

  @Post("projekte/:id/vorgaenge")
  async anlegen(@Param("id", ParseUUIDPipe) projektId: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const w = pruefe(VorgangEingabe, body);
    await this.verkauf.projekt(projektId);
    await this.gewerkePruefen(projektId, w.gewerkIds);
    return this.db.transaction(async (tx) => {
      const [m] = await tx.select({ nr: max(vg.nr) }).from(vg).where(eq(vg.projektId, projektId));
      const werte = { ...this.werte(w), nr: w.nr ?? (m?.nr ?? 0) + 10, projektId };
      const [neu] = await tx.insert(vg).values(werte).returning();
      await protokollieren(tx, { tabelle: "vorgang", id: neu!.id, aktion: "insert", neu: werte, benutzer });
      return neu;
    });
  }

  @Put("vorgaenge/:id")
  async aendern(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const w = pruefe(VorgangEingabe, body);
    const alt = await this.bauzeit.vorgang(id);
    await this.gewerkePruefen(alt.projektId, w.gewerkIds);
    return this.db.transaction(async (tx) => {
      const [neu] = await tx
        .update(vg)
        .set({ ...this.werte(w), nr: w.nr ?? alt.nr, geaendertAm: new Date() })
        .where(eq(vg.id, id))
        .returning();
      const d = differenz(alt, neu!);
      if (d.geaendert) await protokollieren(tx, { tabelle: "vorgang", id, aktion: "update", ...d, benutzer });
      return neu;
    });
  }

  @Delete("vorgaenge/:id")
  async loeschen(@Param("id", ParseUUIDPipe) id: string, @Benutzer() benutzer: string) {
    const alt = await this.bauzeit.vorgang(id);
    await this.db.transaction(async (tx) => {
      await tx.delete(vg).where(eq(vg.id, id));
      await protokollieren(tx, { tabelle: "vorgang", id, aktion: "delete", alt, benutzer });
    });
    return { geloescht: true };
  }

  @Get("auswertungen/liquiditaetsplan")
  async liquiditaetsplan(
    @Query("projektId") projektId?: string,
    @Query("gesellschaftId") gesellschaftId?: string,
    @Query("projekte") projekte?: string,
    @Query("wochen") wochen?: string,
    @Query("anfangsbestand") anfangsbestand?: string,
    @Query("unverkauft") unverkauft?: string,
    @Query("stichtag") stichtag?: string,
    @Query("format") format?: string,
  ) {
    const bestand = anfangsbestand?.replace(/\./g, "").replace(",", ".");
    const d = await this.bauzeit.liquiditaetsplan({
      projektId: uuid(projektId),
      gesellschaftId: uuid(gesellschaftId),
      nurLaufende: projekte !== "alle",
      wochen: Math.min(Math.max(Number(wochen) || 26, 4), 104),
      anfangsbestand: bestand && /^-?\d+(\.\d{1,2})?$/.test(bestand) ? bestand : "0",
      unverkauft: unverkauft === "1",
      stichtag: stichtag && /^\d{4}-\d{2}-\d{2}$/.test(stichtag) ? stichtag : undefined,
    });
    if (format !== "xlsx") return d;
    const e = "euro" as const;
    const ein = d.arten.ein;
    const aus = d.arten.aus;
    const titel = d.projekte.length === 1 ? `Liquiditätsplan ${d.projekte[0]!.nr} ${d.projekte[0]!.suchcode}` : "Liquiditätsplan";
    const inhalt = await excelDatei("Liquiditätsplan", `${titel} nach Kalenderwochen (brutto), Anfangsbestand ${d.anfangsbestand} €`, [
      {
        spalten: [
          { titel: "KW", breite: 10 },
          { titel: "von", breite: 11 },
          ...ein.map((a) => ({ titel: `+ ${d.artText.ein[a] ?? a}`, art: e, breite: 18 })),
          ...aus.map((a) => ({ titel: `− ${d.artText.aus[a] ?? a}`, art: e, breite: 18 })),
          { titel: "Einnahmen", art: e, breite: 15 },
          { titel: "Ausgaben", art: e, breite: 15 },
          { titel: "Saldo", art: e, breite: 15 },
          { titel: "Bestand", art: e, breite: 16 },
        ],
        zeilen: d.wochen.map((w) => [
          `KW ${w.woche}/${w.jahr}`,
          w.von.split("-").reverse().join("."),
          ...ein.map((a) => w.ein[a] ?? "0"),
          ...aus.map((a) => w.aus[a] ?? "0"),
          w.einSumme,
          w.ausSumme,
          w.saldo,
          w.bestand,
        ]),
      },
      {
        titel: "Außerhalb des Zeitraums",
        spalten: [{ titel: "", breite: 30 }, { titel: "Einnahmen", art: e, breite: 15 }, { titel: "Ausgaben", art: e, breite: 15 }],
        zeilen: [
          ["davon überfällig (in erster Woche)", d.ueberfaellig.ein, d.ueberfaellig.aus],
          ["nach dem Planungszeitraum", d.spaeter.ein, d.spaeter.aus],
          ["ohne Termin", d.ohneTermin.ein, d.ohneTermin.aus],
        ],
      },
    ]);
    return new StreamableFile(inhalt, { type: XLSX, disposition: `attachment; filename="Liquiditaetsplan-${d.stichtag}.xlsx"` });
  }
}
