import { describe, expect, it } from "vitest";
import { GraphVersand, ProtokollVersand, SmtpVersand, versandAusUmgebung } from "./versand.js";

describe("Versandwege", () => {
  it("wählt den Versandweg aus der Umgebung", () => {
    expect(versandAusUmgebung({})).toBeInstanceOf(ProtokollVersand);
    expect(versandAusUmgebung({ MAIL_SMTP_URL: "smtp://u:p@mail.example.de:587", MAIL_ABSENDER: "bau@x.de" })).toBeInstanceOf(SmtpVersand);
    const g = versandAusUmgebung({ MAIL_GRAPH_TENANT: "t", MAIL_GRAPH_CLIENT_ID: "c", MAIL_GRAPH_SECRET: "s", MAIL_ABSENDER: "bau@x.de", MAIL_SMTP_URL: "smtp://x" });
    expect(g).toBeInstanceOf(GraphVersand);
    expect(g.beschreibung).toBe("Microsoft 365 (Outlook) als bau@x.de");
  });

  it("sendet über Microsoft Graph und nutzt das Token mehrfach", async () => {
    const aufrufe: { url: string; init: RequestInit }[] = [];
    const holen = (async (url: string, init: RequestInit) => {
      aufrufe.push({ url, init });
      if (url.includes("/oauth2/")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
      return new Response(null, { status: 202 });
    }) as unknown as typeof fetch;
    const v = new GraphVersand("mandant-id", "client", "geheim", "bautraeger@muster.de", holen);
    expect(await v.senden({ an: ["a@x.de", "b@x.de"], betreff: "Test", text: "t", html: "<p>t</p>" })).toBe(true);
    await v.senden({ an: ["a@x.de"], betreff: "Zwei", text: "t" });
    expect(aufrufe.filter((a) => a.url.includes("/oauth2/"))).toHaveLength(1);
    const senden = aufrufe.find((a) => a.url.includes("/sendMail"))!;
    expect(senden.url).toBe("https://graph.microsoft.com/v1.0/users/bautraeger%40muster.de/sendMail");
    expect((senden.init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    const body = JSON.parse(String(senden.init.body));
    expect(body.message.toRecipients).toEqual([{ emailAddress: { address: "a@x.de" } }, { emailAddress: { address: "b@x.de" } }]);
    expect(body.message.body).toEqual({ contentType: "HTML", content: "<p>t</p>" });
    expect(body.message.attachments).toBeUndefined();
    await v.senden({ an: ["a@x.de"], betreff: "Mit Anhang", text: "t", anhaenge: [{ dateiname: "ZA-2026-00003.pdf", typ: "application/pdf", inhalt: Buffer.from("%PDF-1.7") }] });
    const mitAnhang = JSON.parse(String(aufrufe.at(-1)!.init.body));
    expect(mitAnhang.message.attachments).toEqual([{ "@odata.type": "#microsoft.graph.fileAttachment", name: "ZA-2026-00003.pdf", contentType: "application/pdf", contentBytes: Buffer.from("%PDF-1.7").toString("base64") }]);
  });

  it("meldet Fehler von Microsoft verständlich", async () => {
    const holen = (async (url: string) =>
      url.includes("/oauth2/")
        ? new Response(JSON.stringify({ access_token: "tok" }), { status: 200 })
        : new Response(JSON.stringify({ error: { message: "Access is denied." } }), { status: 403 })) as unknown as typeof fetch;
    await expect(new GraphVersand("t", "c", "s", "a@x.de", holen).senden({ an: ["b@x.de"], betreff: "x", text: "x" })).rejects.toThrow("Microsoft Graph: Access is denied.");
  });
});
