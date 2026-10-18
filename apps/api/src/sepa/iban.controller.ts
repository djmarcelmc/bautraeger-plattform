import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { Benutzer } from "../common/eingabe.js";
import { IbanService } from "./iban.service.js";

@Controller("partner/:id/iban")
export class IbanController {
  constructor(@Inject(IbanService) private readonly iban: IbanService) {}

  @Get()
  status(@Param("id", ParseUUIDPipe) id: string) {
    return this.iban.status(id);
  }

  @Post("rueckruf")
  rueckruf(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    return this.iban.bestaetigen(id, body, benutzer);
  }
}
