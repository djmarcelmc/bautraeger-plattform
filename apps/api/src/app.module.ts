import { Controller, Get, Module } from "@nestjs/common";
import { dbProvider } from "./db.provider.js";
import { DatevController } from "./datev/datev.controller.js";
import { MabvController } from "./mabv/mabv.controller.js";
import { ProjekteController } from "./projekte/projekte.controller.js";

@Controller()
class HealthController {
  @Get("health")
  health() {
    return { status: "ok" };
  }
}

@Module({
  controllers: [HealthController, MabvController, ProjekteController, DatevController],
  providers: [dbProvider],
})
export class AppModule {}
