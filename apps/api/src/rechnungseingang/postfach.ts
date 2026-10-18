/**
 * Rechnungspostfach in Microsoft 365 (Graph, App-Berechtigung Mail.ReadWrite – per Application Access Policy auf
 * das Postfach beschränken). Abgeholt werden ungelesene Mails mit Anhängen im Posteingang; danach werden sie als
 * gelesen markiert und mit der Kategorie „Bauträger-Plattform“ versehen.
 */
export interface PostfachMail {
  id: string;
  internetMessageId: string;
  betreff: string;
  absender: string | null;
  empfangenAm: string;
  anhaenge: { name: string; typ: string; inhalt: Buffer }[];
}

export interface Postfach {
  readonly adresse: string;
  neueMails(max?: number): Promise<PostfachMail[]>;
  alsVerarbeitetMarkieren(id: string): Promise<void>;
}

export const POSTFACH = Symbol("POSTFACH");

export class GraphPostfach implements Postfach {
  private token?: { wert: string; bis: number };

  constructor(
    private readonly mandant: string,
    private readonly clientId: string,
    private readonly secret: string,
    readonly adresse: string,
    private readonly holen: typeof fetch = fetch,
  ) {}

  private async zugriffstoken() {
    if (this.token && this.token.bis > Date.now() + 60_000) return this.token.wert;
    const res = await this.holen(`https://login.microsoftonline.com/${encodeURIComponent(this.mandant)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.clientId, client_secret: this.secret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
    });
    const d = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!res.ok || !d.access_token) throw new Error(`Anmeldung bei Microsoft fehlgeschlagen: ${d.error_description ?? res.status}`);
    this.token = { wert: d.access_token, bis: Date.now() + (d.expires_in ?? 3600) * 1000 };
    return this.token.wert;
  }

  private async graph<T>(pfad: string, init: RequestInit = {}): Promise<T> {
    const res = await this.holen(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.adresse)}${pfad}`, {
      ...init,
      headers: { authorization: `Bearer ${await this.zugriffstoken()}`, "content-type": "application/json", ...(init.headers ?? {}) },
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(`Microsoft Graph: ${d.error?.message ?? res.status}`);
    }
    return (res.status === 204 ? null : await res.json()) as T;
  }

  async neueMails(max = 25): Promise<PostfachMail[]> {
    const q = new URLSearchParams({ $filter: "isRead eq false and hasAttachments eq true", $top: String(max), $select: "id,internetMessageId,subject,from,receivedDateTime", $orderby: "receivedDateTime asc" });
    const liste = await this.graph<{ value: { id: string; internetMessageId: string; subject: string; from?: { emailAddress?: { address?: string } }; receivedDateTime: string }[] }>(`/mailFolders/inbox/messages?${q}`);
    const mails: PostfachMail[] = [];
    for (const m of liste.value) {
      const a = await this.graph<{ value: { "@odata.type": string; name: string; contentType: string; contentBytes?: string; isInline?: boolean }[] }>(`/messages/${m.id}/attachments`);
      mails.push({
        id: m.id,
        internetMessageId: m.internetMessageId,
        betreff: m.subject ?? "",
        absender: m.from?.emailAddress?.address ?? null,
        empfangenAm: m.receivedDateTime,
        anhaenge: a.value
          .filter((x) => x["@odata.type"] === "#microsoft.graph.fileAttachment" && x.contentBytes && !x.isInline)
          .map((x) => ({ name: x.name, typ: x.contentType, inhalt: Buffer.from(x.contentBytes!, "base64") })),
      });
    }
    return mails;
  }

  async alsVerarbeitetMarkieren(id: string) {
    await this.graph(`/messages/${id}`, { method: "PATCH", body: JSON.stringify({ isRead: true, categories: ["Bauträger-Plattform"] }) });
  }
}

/** Postfach aus der Umgebung: RECHNUNGEN_POSTFACH + Zugangsdaten der Graph-App (wie beim Versand). */
export function postfachAusUmgebung(env: NodeJS.ProcessEnv = process.env): Postfach | null {
  const adresse = env.RECHNUNGEN_POSTFACH;
  if (adresse && env.MAIL_GRAPH_TENANT && env.MAIL_GRAPH_CLIENT_ID && env.MAIL_GRAPH_SECRET) return new GraphPostfach(env.MAIL_GRAPH_TENANT, env.MAIL_GRAPH_CLIENT_ID, env.MAIL_GRAPH_SECRET, adresse);
  return null;
}
