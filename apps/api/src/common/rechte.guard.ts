import { ForbiddenException, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { RECHTE, RECHTE_JE_ROLLE, ROLLEN, benoetigtesRecht, darf, rollenAus } from "@bt/domain";

/** Anmeldung aktiv? Dann kommen Benutzer und Rollen von der Weboberfläche (Microsoft-Anmeldung). */
export const anmeldungAktiv = () => process.env.AUTH_AKTIV === "true";

/**
 * Prüft bei aktiver Anmeldung jeden Aufruf gegen die Rollen aus dem Header `x-rollen`.
 * Die API ist nur im internen Docker-Netz erreichbar; Header setzt ausschließlich die Weboberfläche bzw. der MCP-Server.
 * Ausgenommen: Käuferportal (eigener Token) und Health-Check.
 */
@Injectable()
export class RechteGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    if (!anmeldungAktiv()) return true;
    const req = ctx.switchToHttp().getRequest<{ method: string; path: string; headers: Record<string, string | undefined> }>();
    const pfad = req.path.replace(/^\/api/, "");
    if (pfad.startsWith("/portal/") || pfad === "/health") return true;
    const rollen = rollenAus(req.headers["x-rollen"]);
    if (!req.headers["x-benutzer"] || !rollen.length) throw new UnauthorizedException("Nicht angemeldet oder keine Rolle zugewiesen.");
    const recht = benoetigtesRecht(req.method, pfad);
    if (!darf(rollen, recht))
      throw new ForbiddenException(
        `Keine Berechtigung: „${RECHTE[recht]}“ ist ${RECHTE_JE_ROLLE[recht]
          .filter((r) => r !== "System.Lesen")
          .map((r) => ROLLEN[r])
          .join(", ")} vorbehalten.`,
      );
    return true;
  }
}
