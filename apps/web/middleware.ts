import { NextResponse, type NextRequest } from "next/server";

/**
 * - Das Käuferportal (/portal) ist ohne Anmeldung erreichbar. Server Actions dürfen dort nicht aufgerufen werden,
 *   sonst wären interne Aktionen über diesen Pfad am Passwortschutz vorbei erreichbar.
 * - Der Pfad wird für das Layout weitergereicht (Portal ohne interne Navigation).
 */
export function middleware(req: NextRequest) {
  const pfad = req.nextUrl.pathname;
  if (pfad.startsWith("/portal") && req.headers.has("next-action")) return new NextResponse("Nicht erlaubt", { status: 403 });
  const kopf = new Headers(req.headers);
  kopf.set("x-pfad", pfad);
  return NextResponse.next({ request: { headers: kopf } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
