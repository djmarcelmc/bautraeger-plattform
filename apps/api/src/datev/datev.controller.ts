import { Controller, Get, Header, Inject, NotFoundException, Query, StreamableFile } from "@nestjs/common";
import { schema } from "@bt/db";
import { extfBuchungsstapel, money } from "@bt/domain";
import { and, asc, between, eq } from "drizzle-orm";
import { DB, type Db } from "../db.provider.js";

@Controller("datev")
export class DatevController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Buchungsstapel einer Gesellschaft für einen Zeitraum als EXTF-Datei. */
  @Get("extf")
  @Header("Content-Type", "text/csv; charset=windows-1252")
  async extf(@Query("gesellschaft") gesellschaftNr: string, @Query("von") von: string, @Query("bis") bis: string) {
    const [g] = await this.db.select().from(schema.gesellschaft).where(eq(schema.gesellschaft.nr, Number(gesellschaftNr)));
    if (!g || !g.datevBeraternr || !g.datevMandantennr)
      throw new NotFoundException("Gesellschaft oder DATEV-Berater-/Mandantennummer fehlt");
    const buchungen = await this.db
      .select()
      .from(schema.buchung)
      .where(and(eq(schema.buchung.gesellschaftId, g.id), between(schema.buchung.belegdatum, von, bis)))
      .orderBy(asc(schema.buchung.belegdatum));
    const datei = extfBuchungsstapel(
      {
        beraternummer: g.datevBeraternr,
        mandantennummer: g.datevMandantennr,
        wjBeginn: new Date(`${von.slice(0, 4)}-01-01`),
        sachkontenlaenge: g.sachkontenlaenge ?? 4,
        datumVon: new Date(von),
        datumBis: new Date(bis),
        bezeichnung: `Buchungen ${von} – ${bis}`.slice(0, 30),
        skr: g.skr ?? "03",
      },
      buchungen.map((b) => ({
        umsatz: money(b.betrag),
        sollHaben: b.sollHaben,
        konto: b.konto,
        gegenkonto: b.gegenkonto,
        buSchluessel: b.steuerschluessel ?? undefined,
        belegdatum: new Date(b.belegdatum),
        belegfeld1: b.belegnr ?? undefined,
        buchungstext: b.buchungstext ?? undefined,
        kost1: b.kostenstelle ?? undefined,
      })),
    );
    return new StreamableFile(datei, { disposition: `attachment; filename="EXTF_Buchungsstapel_${von}_${bis}.csv"` });
  }
}
