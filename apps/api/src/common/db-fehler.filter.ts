import { type ArgumentsHost, Catch, ConflictException, type ExceptionFilter, HttpException } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";

interface PgFehler {
  code?: string;
  constraint_name?: string;
  cause?: PgFehler;
}

const MELDUNGEN: Record<string, string> = {
  projekt_nr_je_gesellschaft: "Diese Projektnummer ist in der Gesellschaft bereits vergeben.",
  einheit_nr_je_projekt: "Diese Einheitennummer ist im Projekt bereits vergeben.",
  partner_nr_je_mandant: "Diese Geschäftspartnernummer ist bereits vergeben.",
  partner_debitor_je_mandant: "Dieses Debitorenkonto ist bereits einem anderen Geschäftspartner zugeordnet.",
  partner_kreditor_je_mandant: "Dieses Kreditorenkonto ist bereits einem anderen Geschäftspartner zugeordnet.",
  gesellschaft_nr_je_mandant: "Diese Gesellschaftsnummer ist bereits vergeben.",
  einheit_nur_ein_kaufvertrag: "Mindestens eine Einheit ist bereits verkauft.",
  mahnung_stufe_je_anforderung: "Diese Mahnstufe wurde bereits erstellt.",
  mangel_nr_je_projekt: "Die Mängelnummer wurde gleichzeitig vergeben – bitte erneut speichern.",
  ruege_stufe_je_mangel: "Diese Rüge wurde gleichzeitig erfasst – bitte Seite neu laden.",
  gewerk_nr_je_projekt: "Diese Gewerknummer ist im Projekt bereits vergeben.",
  vorgang_abschnitt_je_projekt: "Dieser MaBV-Bauabschnitt ist bereits einem anderen Vorgang zugeordnet.",
  abnahme_nr_je_projekt: "Die Abnahmenummer wurde gleichzeitig vergeben – bitte erneut speichern.",
  kaufvertrag_nr_je_projekt: "Diese Kaufvertragsnummer ist im Projekt bereits vergeben.",
};

/** Übersetzt PostgreSQL-Fehler (eindeutig / noch referenziert) in verständliche 409-Antworten. */
@Catch()
export class DbFehlerFilter extends BaseExceptionFilter implements ExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost) {
    if (!(exception instanceof HttpException)) {
      const e = exception as PgFehler;
      const pg = e?.code ? e : e?.cause;
      if (pg?.code === "23505")
        return super.catch(new ConflictException(MELDUNGEN[pg.constraint_name ?? ""] ?? "Eintrag existiert bereits."), host);
      if (pg?.code === "23503")
        return super.catch(new ConflictException("Der Datensatz wird noch verwendet und kann nicht gelöscht werden."), host);
    }
    return super.catch(exception, host);
  }
}
