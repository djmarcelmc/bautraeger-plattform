import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

const app = await NestFactory.create(AppModule);
app.setGlobalPrefix("api");
app.enableCors();
await app.listen(Number(process.env.API_PORT ?? 3001));
console.log(`API läuft auf http://localhost:${process.env.API_PORT ?? 3001}/api`);
