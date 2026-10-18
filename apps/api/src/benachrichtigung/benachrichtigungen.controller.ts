import { Body, Controller, Get, Inject, Injectable, Param, ParseUUIDPipe, Post, Put, type OnModuleDestroy } from "@nestjs/common";
import { BenachrichtigungEinstellung, TestmailEingabe } from "@bt/domain";
import { pruefe } from "../common/eingabe.js";
import { CockpitService } from "../cockpit/cockpit.controller.js";
import { NachrichtenService } from "./nachrichten.service.js";

@Controller("benachrichtigungen")
export class BenachrichtigungenController {
  constructor(
    @Inject(NachrichtenService) private readonly nachrichten: NachrichtenService,
    @Inject(CockpitService) private readonly cockpit: CockpitService,
  ) {}

  @Get()
  async uebersicht() {
    return {
      versand: { art: this.nachrichten.versand.name, beschreibung: this.nachrichten.versand.beschreibung },
      einstellungen: await this.nachrichten.einstellungen(),
      statistik: await this.nachrichten.statistik(),
      postausgang: await this.nachrichten.postausgang(),
    };
  }

  @Put("einstellungen")
  async speichern(@Body() body: unknown) {
    return this.nachrichten.einstellungenSpeichern(pruefe(BenachrichtigungEinstellung, body));
  }

  @Post("test")
  async test(@Body() body: unknown) {
    const { an } = pruefe(TestmailEingabe, body);
    const id = await this.nachrichten.einreihen({
      an: [an],
      anlass: "test",
      mail: {
        betreff: "Testnachricht der Bauträger-Plattform",
        text: `Diese Nachricht bestätigt, dass der E-Mail-Versand funktioniert.\nVersandweg: ${this.nachrichten.versand.beschreibung}`,
        html: `<p>Diese Nachricht bestätigt, dass der E-Mail-Versand funktioniert.</p><p>Versandweg: ${this.nachrichten.versand.beschreibung.replace(/</g, "&lt;")}</p>`,
      },
    });
    await this.nachrichten.versendeAusstehende();
    return { id };
  }

  @Post("aufgaben")
  async aufgabenJetzt() {
    const r = await this.nachrichten.aufgabenUebersicht(() => this.cockpit.cockpit(), true);
    await this.nachrichten.versendeAusstehende();
    return r;
  }

  @Post("nachrichten/:id/erneut")
  async erneut(@Param("id", ParseUUIDPipe) id: string) {
    await this.nachrichten.erneut(id);
    await this.nachrichten.versendeAusstehende();
    return { ok: true };
  }
}

/** Hintergrundlauf: Postausgang alle 30 s abarbeiten, Tagesübersicht ab 7 Uhr (nur im Serverbetrieb gestartet). */
@Injectable()
export class Versandlauf implements OnModuleDestroy {
  private takt?: NodeJS.Timeout;
  private laeuft = false;

  constructor(
    @Inject(NachrichtenService) private readonly nachrichten: NachrichtenService,
    @Inject(CockpitService) private readonly cockpit: CockpitService,
  ) {}

  starten(intervallMs = 30_000) {
    this.takt = setInterval(() => void this.runde(), intervallMs);
  }

  async runde() {
    if (this.laeuft) return;
    this.laeuft = true;
    try {
      await this.nachrichten.aufgabenUebersicht(() => this.cockpit.cockpit());
      await this.nachrichten.versendeAusstehende();
    } catch (e) {
      console.error("Versandlauf:", (e as Error).message);
    } finally {
      this.laeuft = false;
    }
  }

  onModuleDestroy() {
    if (this.takt) clearInterval(this.takt);
  }
}
