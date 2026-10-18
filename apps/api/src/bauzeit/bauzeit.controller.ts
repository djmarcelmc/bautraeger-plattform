import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Post, Put, Query, StreamableFile } from "@nestjs/common";
import { schema, type DbOderTx } from "@bt/db";
import {
  BauzeitenplanEingabe,
  VerschiebenEingabe,
  VorgangEingabe,
  bauzeitenplanAusVorlage,
  datumPlusTage,
  mindestAbstand,
  nachfolgerAnpassen,
  zirkelbezug,
  type Abhaengigkeit,
  type VorgangEingabe as VorgangWerte,
} from "@bt/domain";
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
    const { nr: _nr, vorgaengerIds: _v, ...rest } = w;
    return { ...rest, gewerkIds: [...new Set(w.gewerkIds)], mabvAbschnitt: w.mabvAbschnitt ?? null, endeIst: w.endeIst ?? null };
  }

  /**
   * Vorgänger → Abhängigkeiten. Bestehende Abstände bleiben erhalten; neue erhalten den Mindestabstand aus den
   * aktuellen Terminen (Überlappung bzw. Wochenende). Prüft Projektzugehörigkeit und Zirkelbezüge.
   */
  private abhaengigkeiten(alle: (typeof vg.$inferSelect)[], id: string | null, w: VorgangWerte, bisher: Abhaengigkeit[] = []): Abhaengigkeit[] {
    const ids = [...new Set(w.vorgaengerIds)];
    if (id && ids.includes(id)) throw new BadRequestException("Ein Vorgang kann nicht sein eigener Vorgänger sein.");
    const jeId = new Map(alle.map((v) => [v.id, v]));
    if (ids.some((x) => !jeId.has(x))) throw new BadRequestException("Mindestens ein Vorgänger gehört nicht zu diesem Projekt.");
    const neu = ids.map((x) => bisher.find((a) => a.vorgangId === x) ?? { vorgangId: x, abstandTage: mindestAbstand(jeId.get(x)!.endeIst ?? jeId.get(x)!.ende, w.beginn) });
    const pruefen = [...alle.filter((v) => v.id !== id).map((v) => ({ id: v.id, abhaengigkeiten: v.abhaengigkeiten })), { id: id ?? "neu", abhaengigkeiten: neu }];
    const zirkel = zirkelbezug(pruefen);
    if (zirkel) {
      const name = (z: string) => `„${jeId.get(z)?.bezeichnung ?? w.bezeichnung}“`;
      throw new BadRequestException(`Zirkelbezug – ${name(zirkel[0]!)} würde auf sich selbst warten: ${[...zirkel, zirkel[0]!].map(name).join(" wartet auf ")}.`);
    }
    return neu;
  }

  /** Schiebt Nachfolger der geänderten Vorgänge nach hinten und protokolliert jede Verschiebung. */
  private async nachfolgerSchieben(tx: DbOderTx, projektId: string, geaendert: string[], benutzer: string) {
    const alle = await tx.select().from(vg).where(eq(vg.projektId, projektId));
    const aenderungen = nachfolgerAnpassen(alle, geaendert);
    for (const a of aenderungen) {
      const alt = alle.find((v) => v.id === a.id)!;
      await tx.update(vg).set({ beginn: a.beginn, ende: a.ende, geaendertAm: new Date() }).where(eq(vg.id, a.id));
      await protokollieren(tx, { tabelle: "vorgang", id: a.id, aktion: "update", alt: { beginn: alt.beginn, ende: alt.ende }, neu: { beginn: a.beginn, ende: a.ende, grund: "Vorgänger verschoben" }, benutzer });
    }
    return aenderungen.map((a) => ({ id: a.id, bezeichnung: alle.find((v) => v.id === a.id)!.bezeichnung, tage: a.tage }));
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
    const vorlage = bauzeitenplanAusVorlage(baubeginn);
    const plan = vorlage.map(({ gewerkNrs, nach: _nach, ...v }) => ({
      ...v,
      projektId,
      gewerkIds: gewerkNrs.map((n) => jeNr.get(n)).filter((x): x is string => !!x),
    }));
    await this.db.transaction(async (tx) => {
      const ids = (await tx.insert(vg).values(plan).returning({ id: vg.id })).map((x) => x.id);
      for (const [i, v] of vorlage.entries())
        if (v.nach.length)
          await tx
            .update(vg)
            .set({ abhaengigkeiten: v.nach.map((n) => ({ vorgangId: ids[n]!, abstandTage: mindestAbstand(vorlage[n]!.ende, v.beginn) })) })
            .where(eq(vg.id, ids[i]!));
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
      const nachfolger = tage > 0 ? await this.nachfolgerSchieben(tx, projektId, betroffen.map((v) => v.id), benutzer) : [];
      return { verschoben: betroffen.length + nachfolger.length };
    });
  }

  @Post("projekte/:id/vorgaenge")
  async anlegen(@Param("id", ParseUUIDPipe) projektId: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const w = pruefe(VorgangEingabe, body);
    await this.verkauf.projekt(projektId);
    await this.gewerkePruefen(projektId, w.gewerkIds);
    const alle = await this.bauzeit.vorgaenge(projektId);
    const abhaengigkeiten = this.abhaengigkeiten(alle, null, w);
    return this.db.transaction(async (tx) => {
      const [m] = await tx.select({ nr: max(vg.nr) }).from(vg).where(eq(vg.projektId, projektId));
      const werte = { ...this.werte(w), abhaengigkeiten, nr: w.nr ?? (m?.nr ?? 0) + 10, projektId };
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
    const abhaengigkeiten = this.abhaengigkeiten(await this.bauzeit.vorgaenge(alt.projektId), id, w, alt.abhaengigkeiten);
    return this.db.transaction(async (tx) => {
      const [neu] = await tx
        .update(vg)
        .set({ ...this.werte(w), abhaengigkeiten, nr: w.nr ?? alt.nr, geaendertAm: new Date() })
        .where(eq(vg.id, id))
        .returning();
      const d = differenz(alt, neu!);
      if (d.geaendert) await protokollieren(tx, { tabelle: "vorgang", id, aktion: "update", ...d, benutzer });
      const nachfolgerVerschoben = await this.nachfolgerSchieben(tx, alt.projektId, [id], benutzer);
      return { ...neu!, nachfolgerVerschoben };
    });
  }

  @Delete("vorgaenge/:id")
  async loeschen(@Param("id", ParseUUIDPipe) id: string, @Benutzer() benutzer: string) {
    const alt = await this.bauzeit.vorgang(id);
    await this.db.transaction(async (tx) => {
      await tx
        .update(vg)
        .set({ abhaengigkeiten: sql`coalesce((select jsonb_agg(e) from jsonb_array_elements(${vg.abhaengigkeiten}) e where e->>'vorgangId' <> ${id}), '[]'::jsonb)` })
        .where(and(eq(vg.projektId, alt.projektId), sql`${vg.abhaengigkeiten} @> ${JSON.stringify([{ vorgangId: id }])}::jsonb`));
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
