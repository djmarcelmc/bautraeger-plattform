import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { schema } from "@bt/db";
import { angebotAbgelaufen, SonderwunschEingabe, SonderwunschEntscheidung, sonderwunschRate, sonderwunschSummen, type SonderwunschArt } from "@bt/domain";
import { and, asc, eq, max } from "drizzle-orm";
import { Benutzer, pruefe } from "../common/eingabe.js";
import { KontextService } from "../common/kontext.service.js";
import { differenz, protokollieren } from "../common/protokoll.js";
import { DB, type Db } from "../db.provider.js";
import { VerkaufService } from "../verkauf/verkauf.service.js";

const { sonderwunsch: sw, kaufvertrag: k, projekt: p, gesellschaft: g, rate, gewerk } = schema;
const heute = () => new Date().toISOString().slice(0, 10);

@Controller()
export class SonderwuenscheController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
    @Inject(VerkaufService) private readonly verkauf: VerkaufService,
  ) {}

  /** Sonderwunsch mit Mandantenprüfung. */
  private async laden(id: string) {
    const [r] = await this.db
      .select({ sw, projektId: k.projektId })
      .from(sw)
      .innerJoin(k, eq(sw.kaufvertragId, k.id))
      .innerJoin(p, eq(k.projektId, p.id))
      .innerJoin(g, eq(p.gesellschaftId, g.id))
      .where(and(eq(sw.id, id), eq(g.mandantId, await this.kontext.mandantId())));
    if (!r) throw new NotFoundException("Sonderwunsch nicht gefunden");
    return r;
  }

  private async gewerkPruefen(projektId: string, gewerkId: string | null | undefined) {
    if (!gewerkId) return;
    const [x] = await this.db.select({ id: gewerk.id }).from(gewerk).where(and(eq(gewerk.id, gewerkId), eq(gewerk.projektId, projektId)));
    if (!x) throw new BadRequestException({ message: "Eingabe ungültig", fehler: ["Das Gewerk gehört nicht zu diesem Projekt."] });
  }

  @Get("sonderwuensche")
  async liste(@Query("projektId") projektId?: string, @Query("status") status?: string) {
    const rows = await this.db
      .select({ sw, vertrag: { id: k.id, nr: k.nr }, projekt: { id: p.id, nr: p.nr, suchcode: p.suchcode } })
      .from(sw)
      .innerJoin(k, eq(sw.kaufvertragId, k.id))
      .innerJoin(p, eq(k.projektId, p.id))
      .innerJoin(g, eq(p.gesellschaftId, g.id))
      .where(
        and(
          eq(g.mandantId, await this.kontext.mandantId()),
          projektId && /^[0-9a-f-]{36}$/.test(projektId) ? eq(p.id, projektId) : undefined,
          status === "angebot" || status === "beauftragt" || status === "abgelehnt" ? eq(sw.status, status) : undefined,
        ),
      )
      .orderBy(asc(p.nr), asc(k.nr), asc(sw.nr));
    const stichtag = heute();
    const liste = rows.map((r) => ({ ...r.sw, vertrag: r.vertrag, projekt: r.projekt, abgelaufen: angebotAbgelaufen(r.sw, stichtag) }));
    return { sonderwuensche: liste, summen: sonderwunschSummen(liste) };
  }

  /** Einzelner Sonderwunsch mit Vertragsdaten (auch für das Angebotsschreiben). */
  @Get("sonderwuensche/:id")
  async eins(@Param("id", ParseUUIDPipe) id: string) {
    const { sw: s } = await this.laden(id);
    const v = await this.verkauf.vertrag(s.kaufvertragId);
    const empfaenger = v.kaeufer.find((x) => x.id === v.zahlungsanforderungAn) ?? v.kaeufer[0] ?? null;
    const r = v.raten.find((x) => x.id === s.rateId) ?? null;
    return {
      ...s,
      abgelaufen: angebotAbgelaufen(s, heute()),
      rate: r ? { nr: r.nr, status: r.status, rechnungsnr: r.rechnungsnr } : null,
      vertrag: { id: v.id, nr: v.nr, urkundennr: v.urkundennr, datum: v.datum, einheiten: v.einheiten },
      projekt: v.projekt,
      gesellschaft: v.gesellschaft,
      kaeufer: v.kaeufer,
      empfaenger,
    };
  }

  @Post("kaufvertraege/:id/sonderwuensche")
  async anlegen(@Param("id", ParseUUIDPipe) kaufvertragId: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const w = pruefe(SonderwunschEingabe, body);
    const v = await this.verkauf.vertrag(kaufvertragId);
    await this.gewerkPruefen(v.projekt.id, w.gewerkId);
    return this.db.transaction(async (tx) => {
      const [m] = await tx.select({ m: max(sw.nr) }).from(sw).where(eq(sw.kaufvertragId, kaufvertragId));
      const werte = { ...w, betragBrutto: w.betragBrutto!, kaufvertragId, nr: (m?.m ?? 0) + 1, angebotAm: w.angebotAm ?? heute() };
      const [neu] = await tx.insert(sw).values(werte).returning();
      await protokollieren(tx, { tabelle: "sonderwunsch", id: neu!.id, aktion: "insert", neu: werte, benutzer });
      return neu;
    });
  }

  @Put("sonderwuensche/:id")
  async aendern(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const w = pruefe(SonderwunschEingabe, body);
    const { sw: alt, projektId } = await this.laden(id);
    if (alt.status !== "angebot") throw new ConflictException("Nur Angebote können geändert werden – bei Bedarf erst zurücksetzen.");
    await this.gewerkPruefen(projektId, w.gewerkId);
    return this.db.transaction(async (tx) => {
      const [neu] = await tx.update(sw).set({ ...w, betragBrutto: w.betragBrutto!, geaendertAm: new Date() }).where(eq(sw.id, id)).returning();
      const d = differenz(alt, neu!);
      if (d.geaendert) await protokollieren(tx, { tabelle: "sonderwunsch", id, aktion: "update", ...d, benutzer });
      return neu;
    });
  }

  /** Beauftragung durch den Käufer: legt die Rate im Ratenplan an. */
  @Post("sonderwuensche/:id/beauftragen")
  async beauftragen(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const { datum } = pruefe(SonderwunschEntscheidung, body);
    const { sw: s } = await this.laden(id);
    if (s.status !== "angebot") throw new ConflictException(`Sonderwunsch Nr. ${s.nr} ist bereits ${s.status}.`);
    return this.db.transaction(async (tx) => {
      const [m] = await tx.select({ m: max(rate.nr) }).from(rate).where(eq(rate.kaufvertragId, s.kaufvertragId));
      const werte = sonderwunschRate({ ...s, art: s.art as SonderwunschArt }, (m?.m ?? 0) + 1);
      const [r] = await tx.insert(rate).values({ ...werte, kaufvertragId: s.kaufvertragId }).returning();
      const [neu] = await tx.update(sw).set({ status: "beauftragt", entschiedenAm: datum!, rateId: r!.id, geaendertAm: new Date() }).where(eq(sw.id, id)).returning();
      await protokollieren(tx, { tabelle: "sonderwunsch", id, aktion: "update", alt: { status: s.status }, neu: { status: "beauftragt", entschiedenAm: datum, rate: werte.nr, betrag: werte.betrag }, benutzer });
      return neu;
    });
  }

  @Post("sonderwuensche/:id/ablehnen")
  async ablehnen(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const { datum } = pruefe(SonderwunschEntscheidung, body);
    const { sw: s } = await this.laden(id);
    if (s.status !== "angebot") throw new ConflictException(`Sonderwunsch Nr. ${s.nr} ist bereits ${s.status}.`);
    return this.db.transaction(async (tx) => {
      const [neu] = await tx.update(sw).set({ status: "abgelehnt", entschiedenAm: datum!, geaendertAm: new Date() }).where(eq(sw.id, id)).returning();
      await protokollieren(tx, { tabelle: "sonderwunsch", id, aktion: "update", alt: { status: s.status }, neu: { status: "abgelehnt", entschiedenAm: datum }, benutzer });
      return neu;
    });
  }

  /** Zurück zum Angebot – bei Beauftragung nur, solange die Rate noch nicht angefordert ist. */
  @Post("sonderwuensche/:id/zuruecksetzen")
  async zuruecksetzen(@Param("id", ParseUUIDPipe) id: string, @Benutzer() benutzer: string) {
    const { sw: s } = await this.laden(id);
    if (s.status === "angebot") return s;
    if (s.rateId) {
      const [r] = await this.db.select().from(rate).where(eq(rate.id, s.rateId));
      if (r?.zahlungsanforderungId) throw new ConflictException("Die Rate ist bereits angefordert – der Sonderwunsch kann nicht mehr zurückgesetzt werden. Bitte eine Gutschrift anlegen.");
    }
    return this.db.transaction(async (tx) => {
      const [neu] = await tx.update(sw).set({ status: "angebot", entschiedenAm: null, rateId: null, geaendertAm: new Date() }).where(eq(sw.id, id)).returning();
      if (s.rateId) await tx.delete(rate).where(eq(rate.id, s.rateId));
      await protokollieren(tx, { tabelle: "sonderwunsch", id, aktion: "update", alt: { status: s.status, rateId: s.rateId }, neu: { status: "angebot" }, benutzer });
      return neu;
    });
  }

  @Delete("sonderwuensche/:id")
  async loeschen(@Param("id", ParseUUIDPipe) id: string, @Benutzer() benutzer: string) {
    const { sw: s } = await this.laden(id);
    if (s.status === "beauftragt") throw new ConflictException("Beauftragte Sonderwünsche können nicht gelöscht werden – erst zurücksetzen.");
    await this.db.transaction(async (tx) => {
      await tx.delete(sw).where(eq(sw.id, id));
      await protokollieren(tx, { tabelle: "sonderwunsch", id, aktion: "delete", alt: s, benutzer });
    });
    return { geloescht: true };
  }
}
