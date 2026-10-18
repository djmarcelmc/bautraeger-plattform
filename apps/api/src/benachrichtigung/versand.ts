import nodemailer from "nodemailer";

export interface MailAnhang {
  dateiname: string;
  typ: string;
  inhalt: Buffer;
}

export interface AusgehendeMail {
  an: string[];
  betreff: string;
  text: string;
  html?: string | null;
  anhaenge?: MailAnhang[];
}

/** Versandweg für E-Mails; wird über Umgebungsvariablen gewählt. */
export interface MailVersand {
  readonly name: "protokoll" | "smtp" | "microsoft365";
  readonly beschreibung: string;
  /** true = tatsächlich versendet, false = nur protokolliert. */
  senden(mail: AusgehendeMail): Promise<boolean>;
}

export const MAIL_VERSAND = Symbol("MAIL_VERSAND");

/** Ohne Konfiguration: nichts verschicken, nur im Postausgang festhalten. */
export class ProtokollVersand implements MailVersand {
  readonly name = "protokoll" as const;
  readonly beschreibung = "Nur protokollieren – kein Versand eingerichtet";
  async senden() {
    return false;
  }
}

export class SmtpVersand implements MailVersand {
  readonly name = "smtp" as const;
  readonly beschreibung: string;
  private readonly transport: nodemailer.Transporter;

  constructor(url: string, private readonly absender: string) {
    this.transport = nodemailer.createTransport(url);
    this.beschreibung = `SMTP (${new URL(url).hostname}) als ${absender}`;
  }

  async senden(m: AusgehendeMail) {
    await this.transport.sendMail({
      from: this.absender,
      to: m.an,
      subject: m.betreff,
      text: m.text,
      html: m.html ?? undefined,
      attachments: m.anhaenge?.map((a) => ({ filename: a.dateiname, content: a.inhalt, contentType: a.typ })),
    });
    return true;
  }
}

/**
 * Microsoft 365 über Microsoft Graph (App-Berechtigung Mail.Send, per Application Access Policy
 * auf das Absender-Postfach beschränkt). Gesendete Mails liegen im Ordner „Gesendete Elemente“ des Postfachs.
 */
export class GraphVersand implements MailVersand {
  readonly name = "microsoft365" as const;
  readonly beschreibung: string;
  private token?: { wert: string; bis: number };

  constructor(
    private readonly mandant: string,
    private readonly clientId: string,
    private readonly secret: string,
    private readonly absender: string,
    private readonly holen: typeof fetch = fetch,
  ) {
    this.beschreibung = `Microsoft 365 (Outlook) als ${absender}`;
  }

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

  async senden(m: AusgehendeMail) {
    const res = await this.holen(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.absender)}/sendMail`, {
      method: "POST",
      headers: { authorization: `Bearer ${await this.zugriffstoken()}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: m.betreff,
          body: m.html ? { contentType: "HTML", content: m.html } : { contentType: "Text", content: m.text },
          toRecipients: m.an.map((address) => ({ emailAddress: { address } })),
          ...(m.anhaenge?.length
            ? {
                attachments: m.anhaenge.map((a) => ({
                  "@odata.type": "#microsoft.graph.fileAttachment",
                  name: a.dateiname,
                  contentType: a.typ,
                  contentBytes: a.inhalt.toString("base64"),
                })),
              }
            : {}),
        },
        saveToSentItems: true,
      }),
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(`Microsoft Graph: ${d.error?.message ?? res.status}`);
    }
    return true;
  }
}

/** Wählt den Versandweg: Microsoft 365, wenn konfiguriert, sonst SMTP, sonst nur Protokoll. */
export function versandAusUmgebung(env: NodeJS.ProcessEnv = process.env): MailVersand {
  const absender = env.MAIL_ABSENDER;
  if (env.MAIL_GRAPH_TENANT && env.MAIL_GRAPH_CLIENT_ID && env.MAIL_GRAPH_SECRET && absender) return new GraphVersand(env.MAIL_GRAPH_TENANT, env.MAIL_GRAPH_CLIENT_ID, env.MAIL_GRAPH_SECRET, absender);
  if (env.MAIL_SMTP_URL && absender) return new SmtpVersand(env.MAIL_SMTP_URL, absender);
  return new ProtokollVersand();
}
