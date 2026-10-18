import { Controller, Get, Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { DbFehlerFilter } from "./common/db-fehler.filter.js";
import { KontextService } from "./common/kontext.service.js";
import { dbProvider } from "./db.provider.js";
import { AuswertungenController } from "./auswertungen/auswertungen.controller.js";
import { AuswertungenService } from "./auswertungen/auswertungen.service.js";
import { MabvPruefberichtService } from "./auswertungen/mabv-pruefbericht.service.js";
import { BauzeitController } from "./bauzeit/bauzeit.controller.js";
import { BauzeitService } from "./bauzeit/bauzeit.service.js";
import { BuergschaftenController } from "./sepa/buergschaften.controller.js";
import { ZahlungslaufController } from "./sepa/zahlungslauf.controller.js";
import { AbnahmenController } from "./abnahme/abnahmen.controller.js";
import { MangelvorlagenController } from "./abnahme/mangelvorlagen.controller.js";
import { DatevController } from "./datev/datev.controller.js";
import { DokumenteController } from "./dokumente/dokumente.controller.js";
import { LokalerSpeicher, SPEICHER } from "./dokumente/speicher.js";
import { KaufvertraegeController } from "./verkauf/kaufvertraege.controller.js";
import { VerkaufService } from "./verkauf/verkauf.service.js";
import { ZahlungenController } from "./verkauf/zahlungen.controller.js";
import { EinheitenController } from "./einheiten/einheiten.controller.js";
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
    ProtokollController,
    DokumenteController,
    KaufvertraegeController,
    ZahlungenController,
    KostenController,
    MaengelController,
    MahnwesenController,
    AuswertungenController,
    BauzeitController,
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
    { provide: SPEICHER, useFactory: () => new LokalerSpeicher() },
    { provide: APP_FILTER, useClass: DbFehlerFilter },
  ],
})
export class AppModule {}
