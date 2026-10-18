import "reflect-metadata";
import { migrieren } from "@bt/db";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { Versandlauf } from "./benachrichtigung/benachrichtigungen.controller.js";

if (process.env.MIGRATE_ON_START === "true") {
  await migrieren();
  console.log("Datenbank-Migrationen angewendet");
}

const app = await NestFactory.create(AppModule);
app.setGlobalPrefix("api");
if (process.env.MAIL_VERSANDLAUF !== "aus") app.get(Versandlauf).starten();
await app.listen(Number(process.env.API_PORT ?? 3001));
console.log(`API läuft auf http://localhost:${process.env.API_PORT ?? 3001}/api`);
