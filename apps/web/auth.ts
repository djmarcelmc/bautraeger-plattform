import { rollenAus } from "@bt/domain";
import NextAuth, { type DefaultSession } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

declare module "next-auth" {
  interface Session {
    user: { rollen: string[] } & DefaultSession["user"];
  }
}

/**
 * Microsoft-Anmeldung ist aktiv, sobald die Entra-Daten gesetzt sind (siehe docs/microsoft-entra-app-registrierung.md).
 * Ohne sie läuft die Plattform wie bisher hinter dem Passwortschutz von Caddy.
 */
export const authAktiv = Boolean(process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET && process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: authAktiv
    ? [
        MicrosoftEntraID({
          clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
          clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
          issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
        }),
      ]
    : [],
  session: { strategy: "jwt", maxAge: 10 * 60 * 60 },
  pages: { signIn: "/anmelden", error: "/anmelden" },
  trustHost: true,
  callbacks: {
    /** App-Rollen kommen als Claim „roles“ im ID-Token (nur bekannte Rollen werden übernommen). */
    jwt({ token, profile }) {
      if (profile) {
        token.rollen = rollenAus((profile as { roles?: unknown }).roles);
        token.email = (profile.email ?? (profile as { preferred_username?: string }).preferred_username ?? token.email) as string;
      }
      return token;
    },
    session({ session, token }) {
      session.user.rollen = rollenAus(token.rollen);
      return session;
    },
  },
});
