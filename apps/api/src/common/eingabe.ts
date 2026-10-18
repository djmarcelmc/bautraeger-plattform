import { BadRequestException, createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { fehlertexte } from "@bt/domain";
import type { z } from "zod";

/** Validiert einen Request-Body; bei Fehlern 400 mit Klartext-Fehlerliste. */
export function pruefe<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException({ message: "Eingabe ungültig", fehler: fehlertexte(r.error) });
  return r.data;
}

/**
 * Angemeldeter Benutzer. Übergangsweise aus dem Header `x-benutzer`;
 * wird durch die Microsoft-Entra-Anmeldung ersetzt.
 */
export const Benutzer = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
  return req.headers["x-benutzer"]?.slice(0, 100) || "unbekannt";
});
