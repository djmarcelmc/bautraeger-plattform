import { Controller, Get, Inject, Optional } from "@nestjs/common";
import { schema } from "@bt/db";
import { basiszinsFehlt, inbetriebnahmePruefen } from "@bt/domain";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { NachrichtenService } from "../benachrichtigung/nachrichten.service.js";
import { KontextService } from "../common/kontext.service.js";
import { anmeldungAktiv } from "../common/rechte.guard.js";
import { DB, type Db } from "../db.provider.js";
import { POSTFACH, type Postfach } from "../rechnungseingang/postfach.js";

const { gesellschaft: g, geschaeftspartner: gp, projekt: p, einheit: e, kaufvertrag: kv, handwerkervertrag: hv, gewerk: gw, buchung: b, bankimport: bi, buergschaft: bu } = schema;

/** Inbetriebnahme-Assistent: Checkliste aus docs/inbetriebnahme.md gegen den Datenstand. */
@Controller("inbetriebnahme")
export class InbetriebnahmeController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
    @Inject(NachrichtenService) private readonly nachrichten: NachrichtenService,
    @Optional() @Inject(POSTFACH) private readonly postfach: Postfach | null,
  ) {}

  @Get()
  async pruefen() {
    const mandantId = await this.kontext.mandantId();
    const heute = new Date().toISOString().slice(0, 10);
    const zahl = sql<number>`count(*)::int`;
    const [stammdaten, exporte, importe, saetze, [vorlagen], [partner], projekte, [kvs], [hvs], [bus]] = await Promise.all([
      this.db
        .select({
          id: g.id,
          nr: g.nr,
          name: g.name,
          anschrift: sql<boolean>`coalesce(${g.anschrift}, '') <> ''`,
          steuernummer: sql<boolean>`coalesce(${g.steuernummer}, '') <> ''`,
          datev: sql<boolean>`${g.datevBeraternr} is not null and ${g.datevMandantennr} is not null`,
          iban: sql<boolean>`coalesce(${g.iban}, '') <> ''`,
          briefbogen: sql<boolean>`coalesce(${g.briefbogen}->>'dokumentId', '') <> ''`,
          kontierungEingestellt: sql<boolean>`${g.kontierung} is not null`,
        })
        .from(g)
        .where(eq(g.mandantId, mandantId))
        .orderBy(asc(g.nr)),
      this.db
        .select({ id: b.gesellschaftId, anzahl: sql<number>`count(distinct ${b.exportStapel})::int` })
        .from(b)
        .innerJoin(g, eq(b.gesellschaftId, g.id))
        .where(and(eq(g.mandantId, mandantId), isNotNull(b.exportStapel)))
        .groupBy(b.gesellschaftId),
      this.db.select({ id: bi.gesellschaftId, anzahl: zahl }).from(bi).innerJoin(g, eq(bi.gesellschaftId, g.id)).where(eq(g.mandantId, mandantId)).groupBy(bi.gesellschaftId),
      this.db.select({ gueltigAb: schema.basiszins.gueltigAb }).from(schema.basiszins),
      this.db.select({ anzahl: zahl }).from(schema.mangelvorlage).where(eq(schema.mangelvorlage.mandantId, mandantId)),
      this.db
        .select({
          gesamt: zahl,
          handwerker: sql<number>`count(*) filter (where 'handwerker' = any(${gp.rollen}))::int`,
          handwerkerOhneIban: sql<number>`count(*) filter (where 'handwerker' = any(${gp.rollen}) and coalesce(${gp.iban}, '') = '')::int`,
          handwerkerOhneFreistellung: sql<number>`count(*) filter (where 'handwerker' = any(${gp.rollen}) and (${gp.freistellungGueltigBis} is null or ${gp.freistellungGueltigBis} < ${heute}))::int`,
          kaeufer: sql<number>`count(*) filter (where 'kunde' = any(${gp.rollen}))::int`,
          kaeuferOhneAnschrift: sql<number>`count(*) filter (where 'kunde' = any(${gp.rollen}) and (coalesce(${gp.strasse}, '') = '' or coalesce(${gp.ort}, '') = ''))::int`,
          kaeuferOhneEmail: sql<number>`count(*) filter (where 'kunde' = any(${gp.rollen}) and coalesce(${gp.email}, '') = '')::int`,
        })
        .from(gp)
        .where(eq(gp.mandantId, mandantId)),
      this.db
        .select({ id: p.id, nr: p.nr, suchcode: p.suchcode, einheiten: sql<number>`count(${e.id})::int`, meaSumme: sql<string | null>`sum(${e.miteigentumTsd})::text` })
        .from(p)
        .innerJoin(g, eq(p.gesellschaftId, g.id))
        .leftJoin(e, eq(e.projektId, p.id))
        .where(and(eq(g.mandantId, mandantId), eq(p.abgeschlossen, false)))
        .groupBy(p.id, p.nr, p.suchcode)
        .orderBy(asc(p.nr)),
      this.db.select({ anzahl: zahl }).from(kv).innerJoin(p, eq(kv.projektId, p.id)).innerJoin(g, eq(p.gesellschaftId, g.id)).where(eq(g.mandantId, mandantId)),
      this.db.select({ anzahl: zahl }).from(hv).innerJoin(gw, eq(hv.gewerkId, gw.id)).innerJoin(p, eq(gw.projektId, p.id)).innerJoin(g, eq(p.gesellschaftId, g.id)).where(eq(g.mandantId, mandantId)),
      // Bürgschaften hängen am Handwerker- oder Kaufvertrag
      this.db
        .select({ anzahl: zahl })
        .from(bu)
        .leftJoin(hv, eq(bu.handwerkervertragId, hv.id))
        .leftJoin(gw, eq(hv.gewerkId, gw.id))
        .leftJoin(kv, eq(bu.kaufvertragId, kv.id))
        .innerJoin(p, eq(p.id, sql`coalesce(${gw.projektId}, ${kv.projektId})`))
        .innerJoin(g, eq(p.gesellschaftId, g.id))
        .where(eq(g.mandantId, mandantId)),
    ]);
    const ergebnis = inbetriebnahmePruefen({
      system: { anmeldungAktiv: anmeldungAktiv(), mailVersand: this.nachrichten.versand.name, rechnungspostfach: this.postfach?.adresse ?? null },
      gesellschaften: stammdaten.map((x) => ({ ...x, datevExporte: exporte.find((y) => y.id === x.id)?.anzahl ?? 0, bankimporte: importe.find((y) => y.id === x.id)?.anzahl ?? 0 })),
      basiszinsFehlt: basiszinsFehlt(saetze, heute),
      mangelvorlagen: vorlagen?.anzahl ?? 0,
      partner: partner!,
      projekte,
      vorgaenge: { kaufvertraege: kvs?.anzahl ?? 0, handwerkervertraege: hvs?.anzahl ?? 0, buergschaften: bus?.anzahl ?? 0 },
    });
    return { stichtag: heute, ...ergebnis };
  }
}
