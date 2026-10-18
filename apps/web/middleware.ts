import { NextResponse, type NextRequest } from "next/server";
import { nurSteuerberater } from "@bt/domain";
import { auth, authAktiv } from "./auth";

/** Ohne Anmeldung erreichbar: Käuferportal, Anmeldeseite und die Auth.js-Endpunkte. */
const OEFFENTLICH = ["/portal", "/anmelden", "/api/auth"];
const oeffentlich = (pfad: string) => OEFFENTLICH.some((p) => pfad === p || pfad.startsWith(`${p}/`));

/**
 * - Käuferportal: Server Actions sind dort verboten, sonst wären interne Aktionen über diesen Pfad
 *   am Zugangsschutz vorbei erreichbar.
 * - Mit Microsoft-Anmeldung: ohne Sitzung → Anmeldeseite (mit Rücksprung).
 * - Der Pfad wird für das Layout weitergereicht (Portal und Anmeldung ohne interne Navigation).
 */
function weiter(req: NextRequest, angemeldet: boolean, rollen: string[] = []) {
  const pfad = req.nextUrl.pathname;
  // Reiner Steuerberater-Zugang startet auf der eigenen Übersicht
  if (pfad === "/" && nurSteuerberater(rollen)) return NextResponse.redirect(new URL("/steuerberater", req.nextUrl.origin));
  if (pfad.startsWith("/portal") && req.headers.has("next-action")) return new NextResponse("Nicht erlaubt", { status: 403 });
  if (authAktiv && !angemeldet && !oeffentlich(pfad)) {
    const ziel = new URL("/anmelden", req.nextUrl.origin);
    ziel.searchParams.set("ziel", `${pfad}${req.nextUrl.search}`);
    return NextResponse.redirect(ziel);
  }
  const kopf = new Headers(req.headers);
  kopf.set("x-pfad", pfad);
  return NextResponse.next({ request: { headers: kopf } });
}

const mitAnmeldung = auth((req) => weiter(req, !!req.auth?.user, (req.auth?.user as { rollen?: string[] } | undefined)?.rollen ?? []));

export default function middleware(req: NextRequest, ctx: { params: Promise<Record<string, string>> }) {
  return authAktiv ? mitAnmeldung(req, ctx) : weiter(req, false);
}

export const config = { runtime: "nodejs", matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
