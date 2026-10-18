import { Controller, Get, Inject } from "@nestjs/common";
import { schema } from "@bt/db";
import { bauabzugFrist } from "@bt/domain";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { BauabzugService } from "../bauabzug/bauabzug.service.js";
import { BuchhaltungService } from "../buchhaltung/buchhaltung.service.js";
import { KontextService } from "../common/kontext.service.js";
import { DB, type Db } from "../db.provider.js";

const { gesellschaft: g, eingangsrechnung: er, handwerkervertrag: hv, gewerk: gw, projekt: p, dokument: d } = schema;
const heute = () => new Date().toISOString().slice(0, 10);

/** Startseite für den Steuerberater: Stand von DATEV-Export, Bauabzugsteuer und Belegen je Gesellschaft. */
@Controller("steuerberater")
export class SteuerberaterController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
    @Inject(BuchhaltungService) private readonly buchhaltung: BuchhaltungService,
    @Inject(BauabzugService) private readonly bauabzug: BauabzugService,
  ) {}

  @Get()
  async uebersicht() {
    const stichtag = heute();
    const gesellschaften = await this.db.select({ id: g.id, nr: g.nr, name: g.name, steuernummer: g.steuernummer, skr: g.skr }).from(g).where(eq(g.mandantId, await this.kontext.mandantId())).orderBy(asc(g.nr));
    const bauabzug = await this.bauabzug.uebersicht(12, stichtag);
    const ohneScan = gesellschaften.length
      ? await this.db
          .select({ gesellschaftId: p.gesellschaftId, anzahl: sql<number>`count(*)::int` })
          .from(er)
          .innerJoin(hv, eq(er.handwerkervertragId, hv.id))
          .innerJoin(gw, eq(hv.gewerkId, gw.id))
          .innerJoin(p, eq(gw.projektId, p.id))
          .where(
            and(
              inArray(p.gesellschaftId, gesellschaften.map((x) => x.id)),
              inArray(er.status, ["freigegeben", "bezahlt"]),
              sql`not exists (select 1 from ${d} where ${d.objektTyp} = 'eingangsrechnung' and ${d.objektId} = ${er.id} and ${d.geloeschtAm} is null)`,
            ),
          )
          .groupBy(p.gesellschaftId)
      : [];
    const liste = [];
    for (const ges of gesellschaften) {
      const [stand, stapel] = await Promise.all([this.buchhaltung.nichtExportiert(ges.id, stichtag), this.buchhaltung.stapelListe(ges.id)]);
      const monate = bauabzug.monate
        .map((m) => ({ ...m, zeilen: m.zeilen.filter((z) => z.gesellschaftId === ges.id) }))
        .filter((m) => m.zeilen.length)
        .map((m) => ({
          monat: m.monat,
          monatText: m.monatText,
          faelligAm: bauabzugFrist(m.monat),
          offen: m.zeilen.filter((z) => z.status === "offen" || z.status === "abweichung").length,
          nichtAbgefuehrt: m.zeilen.filter((z) => z.status !== "abgefuehrt").length,
          abzugsbetrag: m.zeilen.reduce((s, z) => s + Number(z.abzugsbetrag), 0).toFixed(2),
        }));
      liste.push({
        gesellschaft: ges,
        datev: { bereit: stand.datevBereit, nichtExportiert: stand.anzahl, aeltestes: stand.aeltestes, letzteExporte: stapel.slice(0, 3) },
        bauabzug: monate.slice(0, 3),
        rechnungenOhneScan: ohneScan.find((x) => x.gesellschaftId === ges.id)?.anzahl ?? 0,
      });
    }
    return { stichtag, gesellschaften: liste };
  }
}
