import { Body, Controller, Delete, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { schema } from "@bt/db";
import { BauabzugAnmeldungEingabe, bauabzugFrist, bauabzugUebersicht, monatText } from "@bt/domain";
import { and, eq } from "drizzle-orm";
import { Benutzer, pruefe } from "../common/eingabe.js";
import { KontextService } from "../common/kontext.service.js";
import { differenz, protokollieren } from "../common/protokoll.js";
import { DB, type Db } from "../db.provider.js";
import { BauabzugService } from "./bauabzug.service.js";

const { gesellschaft: g, geschaeftspartner: gp, bauabzugAnmeldung: ba } = schema;
const uuid = /^[0-9a-f-]{36}$/;

@Controller("bauabzug")
export class BauabzugController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
    @Inject(BauabzugService) private readonly bauabzug: BauabzugService,
  ) {}

  @Get()
  uebersicht(@Query("monate") monate?: string) {
    return this.bauabzug.uebersicht(Math.min(Math.max(Number(monate) || 12, 1), 36));
  }

  /** Daten für Abrechnungsbeleg (§ 48a Abs. 2 EStG) und Anmeldung eines Leistenden in einem Monat. */
  @Get("beleg")
  async beleg(@Query("gesellschaftId") gesellschaftId: string, @Query("handwerkerId") handwerkerId: string, @Query("monat") monat: string) {
    if (!uuid.test(gesellschaftId ?? "") || !uuid.test(handwerkerId ?? "") || !/^\d{4}-\d{2}$/.test(monat ?? "")) throw new NotFoundException("Beleg nicht gefunden");
    const mandantId = await this.kontext.mandantId();
    const [ges] = await this.db.select().from(g).where(and(eq(g.id, gesellschaftId), eq(g.mandantId, mandantId)));
    const [hw] = await this.db.select().from(gp).where(and(eq(gp.id, handwerkerId), eq(gp.mandantId, mandantId)));
    if (!ges || !hw) throw new NotFoundException("Beleg nicht gefunden");
    const zahlungen = await this.bauabzug.zahlungen(monat, { gesellschaftId, handwerkerId, monat });
    const [anm] = await this.db.select().from(ba).where(and(eq(ba.gesellschaftId, gesellschaftId), eq(ba.handwerkerId, handwerkerId), eq(ba.monat, monat)));
    const [zeile] = bauabzugUebersicht(zahlungen, anm ? [anm] : [], new Date().toISOString().slice(0, 10))[0]?.zeilen ?? [];
    if (!zeile) throw new NotFoundException("Für diesen Monat gibt es keinen Abzug bei diesem Handwerker");
    return { ...zeile, monatText: monatText(monat), faelligAm: bauabzugFrist(monat), gesellschaft: ges, handwerker: hw };
  }

  /** Anmeldung (und Abführung) erfassen bzw. aktualisieren; der aktuelle Stand wird festgehalten. */
  @Post("anmeldungen")
  async anmelden(@Body() body: unknown, @Benutzer() benutzer: string) {
    const w = pruefe(BauabzugAnmeldungEingabe, body);
    const beleg = await this.beleg(w.gesellschaftId, w.handwerkerId, w.monat);
    const werte = {
      gesellschaftId: w.gesellschaftId,
      handwerkerId: w.handwerkerId,
      monat: w.monat,
      gegenleistung: beleg.gegenleistung,
      abzugsbetrag: beleg.abzugsbetrag,
      angemeldetAm: w.angemeldetAm!,
      abgefuehrtAm: w.abgefuehrtAm ?? null,
      bemerkung: w.bemerkung || null,
      angemeldetVon: benutzer,
    };
    return this.db.transaction(async (tx) => {
      if (beleg.anmeldung) {
        const [alt] = await tx.select().from(ba).where(eq(ba.id, beleg.anmeldung.id));
        const [neu] = await tx.update(ba).set({ ...werte, geaendertAm: new Date() }).where(eq(ba.id, beleg.anmeldung.id)).returning();
        const d = differenz(alt!, neu!);
        if (d.geaendert) await protokollieren(tx, { tabelle: "bauabzug_anmeldung", id: neu!.id, aktion: "update", ...d, benutzer });
        return neu;
      }
      const [neu] = await tx.insert(ba).values(werte).returning();
      await protokollieren(tx, { tabelle: "bauabzug_anmeldung", id: neu!.id, aktion: "insert", neu: werte, benutzer });
      return neu;
    });
  }

  @Delete("anmeldungen/:id")
  async zuruecknehmen(@Param("id", ParseUUIDPipe) id: string, @Benutzer() benutzer: string) {
    const [alt] = await this.db
      .select({ a: ba })
      .from(ba)
      .innerJoin(g, eq(ba.gesellschaftId, g.id))
      .where(and(eq(ba.id, id), eq(g.mandantId, await this.kontext.mandantId())));
    if (!alt) throw new NotFoundException("Anmeldung nicht gefunden");
    await this.db.transaction(async (tx) => {
      await tx.delete(ba).where(eq(ba.id, id));
      await protokollieren(tx, { tabelle: "bauabzug_anmeldung", id, aktion: "delete", alt: alt.a, benutzer });
    });
    return { geloescht: true };
  }
}
