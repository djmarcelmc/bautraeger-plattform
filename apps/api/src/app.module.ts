import { Controller, Get, Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { RechteGuard } from "./common/rechte.guard.js";
import { DbFehlerFilter } from "./common/db-fehler.filter.js";
import { KontextService } from "./common/kontext.service.js";
import { dbProvider } from "./db.provider.js";
import { AuswertungenController } from "./auswertungen/auswertungen.controller.js";
import { AuswertungenService } from "./auswertungen/auswertungen.service.js";
import { MabvPruefberichtService } from "./auswertungen/mabv-pruefbericht.service.js";
import { BauzeitController } from "./bauzeit/bauzeit.controller.js";
import { BauzeitService } from "./bauzeit/bauzeit.service.js";
import { BuergschaftenController } from "./sepa/buergschaften.controller.js";
import { BuergschaftenService } from "./sepa/buergschaften.service.js";
import { ZahlungslaufController } from "./sepa/zahlungslauf.controller.js";
import { AbnahmenController } from "./abnahme/abnahmen.controller.js";
import { MangelvorlagenController } from "./abnahme/mangelvorlagen.controller.js";
import { BenachrichtigungenController, Versandlauf } from "./benachrichtigung/benachrichtigungen.controller.js";
import { NachrichtenService } from "./benachrichtigung/nachrichten.service.js";
import { MAIL_VERSAND, versandAusUmgebung } from "./benachrichtigung/versand.js";
import { CockpitController, CockpitService } from "./cockpit/cockpit.controller.js";
import { PortalController, PortalLinkController } from "./portal/portal.controller.js";
import { DatevController } from "./datev/datev.controller.js";
import { DokumenteController } from "./dokumente/dokumente.controller.js";
import { LokalerSpeicher, SPEICHER } from "./dokumente/speicher.js";
import { KaufvertraegeController } from "./verkauf/kaufvertraege.controller.js";
import { VerkaufService } from "./verkauf/verkauf.service.js";
import { ZahlungenController } from "./verkauf/zahlungen.controller.js";
import { EinheitenController } from "./einheiten/einheiten.controller.js";
import { ImportController } from "./import/import.controller.js";
import { BauabzugController } from "./bauabzug/bauabzug.controller.js";
import { SonderwuenscheController } from "./sonderwunsch/sonderwuensche.controller.js";
import { SchreibenController } from "./schreiben/schreiben.controller.js";
import { BauabzugService } from "./bauabzug/bauabzug.service.js";
import { GesellschaftenController } from "./gesellschaften/gesellschaften.controller.js";
import { KostenController } from "./kosten/kosten.controller.js";
import { KostenService } from "./kosten/kosten.service.js";
import { MabvController } from "./mabv/mabv.controller.js";
import { MahnwesenController } from "./mahnwesen/mahnwesen.controller.js";
import { MaengelController } from "./maengel/maengel.controller.js";
import { MaengelService } from "./maengel/maengel.service.js";
import { PartnerController } from "./partner/partner.controller.js";
import { ProjekteController } from "./projekte/projekte.controller.js";
import { ProtokollController } from "./protokoll/protokoll.controller.js";

@Controller()
class HealthController {
  @Get("health")
  health() {
    return { status: "ok" };
  }
}

@Module({
  controllers: [
    HealthController,
    MabvController,
    GesellschaftenController,
    PartnerController,
    ProjekteController,
    EinheitenController,
    ImportController,
    BauabzugController,
    SonderwuenscheController,
    SchreibenController,
    ProtokollController,
    DokumenteController,
    KaufvertraegeController,
    ZahlungenController,
    KostenController,
    MaengelController,
    MahnwesenController,
    AuswertungenController,
    BauzeitController,
    PortalController,
    PortalLinkController,
    CockpitController,
    BenachrichtigungenController,
    AbnahmenController,
    MangelvorlagenController,
    ZahlungslaufController,
    BuergschaftenController,
    DatevController,
  ],
  providers: [
    dbProvider,
    KontextService,
    VerkaufService,
    KostenService,
    MaengelService,
    AuswertungenService,
    MabvPruefberichtService,
    BauzeitService,
    BuergschaftenService,
    CockpitService,
    BauabzugService,
    NachrichtenService,
    Versandlauf,
    { provide: MAIL_VERSAND, useFactory: () => versandAusUmgebung() },
    { provide: SPEICHER, useFactory: () => new LokalerSpeicher() },
    { provide: APP_GUARD, useClass: RechteGuard },
    { provide: APP_FILTER, useClass: DbFehlerFilter },
  ],
})
export class AppModule {}
