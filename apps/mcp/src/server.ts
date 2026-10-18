import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Db } from "@bt/db";
import { schema } from "@bt/db";
import {
  MABV_ABSCHNITTE,
  STANDARD_7_RATEN,
  formatDe,
  money,
  pruefkette,
  ratenplanBerechnen,
  type MabvAbschnitt,
} from "@bt/domain";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

const abschnittKeys = MABV_ABSCHNITTE.map((a) => a.key) as [MabvAbschnitt, ...MabvAbschnitt[]];

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const json = (v: unknown) => text(JSON.stringify(v, null, 2));

/**
 * MCP-Server der Bauträger-Plattform.
 * Lesende Tools liefern Daten; schreibende Tools (folgen) erzeugen nur Entwürfe.
 */
export function erstelleServer(db?: Db) {
  const server = new McpServer({ name: "bautraeger-plattform", version: "0.1.0" });

  server.registerTool(
    "mabv_ratenplan_berechnen",
    {
      title: "MaBV-Ratenplan berechnen",
      description:
        "Berechnet Prozentsätze und Beträge eines Ratenplans nach § 3 Abs. 2 MaBV. Ohne Angabe von Raten wird der Standardplan mit 7 Raten verwendet.",
      inputSchema: {
        vertragssumme: z.string().describe("Vertragssumme brutto in EUR, z. B. \"324930.00\""),
        erbbaurecht: z.boolean().optional(),
        raten: z
          .array(z.object({ bezeichnung: z.string().optional(), abschnitte: z.array(z.enum(abschnittKeys)).min(1) }))
          .optional()
          .describe("Raten mit den jeweils enthaltenen Bauabschnitten"),
      },
    },
    async ({ vertragssumme, erbbaurecht, raten }) => {
      const plan = ratenplanBerechnen(money(vertragssumme), raten ?? STANDARD_7_RATEN, { erbbaurecht });
      return json(
        plan.map((r) => ({ rate: r.nr, prozent: r.prozent.toFixed(2), betrag: formatDe(r.betrag), text: r.bezeichnung })),
      );
    },
  );

  server.registerTool(
    "handwerker_pruefkette",
    {
      title: "Handwerkerrechnung prüfen",
      description:
        "Rechnet eine Handwerker-Abschlags- oder Schlussrechnung durch: Nachlass, Umlagen, Sicherheitseinbehalt, Skonto, Bauabzugsteuer (§ 48 EStG) und Auszahlungsbetrag.",
      inputSchema: {
        geprueftKumuliert: z.string().describe("Kumuliert geprüfter Betrag brutto in EUR"),
        nachlassProzent: z.number().optional(),
        umlagenProzent: z.number().optional(),
        einbehaltProzent: z.number().optional(),
        bisherAbgegolten: z.string().optional().describe("Bisher gezahlt inkl. Skonto und Bauabzugsteuer"),
        skontoProzent: z.number().optional(),
        freistellungGueltig: z.boolean().describe("Liegt eine gültige Freistellungsbescheinigung vor?"),
      },
    },
    async (e) => {
      const r = pruefkette({
        ...e,
        geprueftKumuliert: money(e.geprueftKumuliert),
        bisherAbgegolten: e.bisherAbgegolten ? money(e.bisherAbgegolten) : undefined,
      });
      return json(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, formatDe(v)])));
    },
  );

  if (!db) return server;

  server.registerTool(
    "projekte_auflisten",
    {
      title: "Projekte auflisten",
      description: "Listet Projekte mit Nummer, Suchcode, Ort und Gesellschaft. Optional nur laufende Projekte.",
      inputSchema: { nurLaufende: z.boolean().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ nurLaufende }) => {
      const rows = await db
        .select({
          nr: schema.projekt.nr,
          suchcode: schema.projekt.suchcode,
          ort: schema.projekt.ort,
          art: schema.projekt.art,
          gesellschaft: schema.gesellschaft.name,
          abgeschlossen: schema.projekt.abgeschlossen,
        })
        .from(schema.projekt)
        .innerJoin(schema.gesellschaft, eq(schema.projekt.gesellschaftId, schema.gesellschaft.id))
        .where(nurLaufende ? eq(schema.projekt.abgeschlossen, false) : undefined)
        .orderBy(asc(schema.projekt.nr));
      return json(rows);
    },
  );

  server.registerTool(
    "offene_zahlungsanforderungen",
    {
      title: "Offene Zahlungsanforderungen",
      description:
        "Zeigt angeforderte, aber noch nicht vollständig bezahlte Raten – optional für ein Projekt (Projektnummer) und nur überfällige.",
      inputSchema: { projektNr: z.number().int().optional(), nurUeberfaellig: z.boolean().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ projektNr, nurUeberfaellig }) => {
      const za = schema.zahlungsanforderung;
      const bezahlt = sql<string>`coalesce((select sum(${schema.zahlungseingang.betrag}) from ${schema.zahlungseingang} where ${schema.zahlungseingang.zahlungsanforderungId} = ${za.id}), 0)`;
      const rows = await db
        .select({
          projekt: schema.projekt.nr,
          kaufvertrag: schema.kaufvertrag.nr,
          rechnungsnr: za.rechnungsnr,
          rate: schema.rate.nr,
          faelligAm: za.faelligAm,
          betrag: za.betrag,
          bezahlt,
          mahnstufe: za.mahnstufe,
        })
        .from(za)
        .innerJoin(schema.rate, eq(za.rateId, schema.rate.id))
        .innerJoin(schema.kaufvertrag, eq(schema.rate.kaufvertragId, schema.kaufvertrag.id))
        .innerJoin(schema.projekt, eq(schema.kaufvertrag.projektId, schema.projekt.id))
        .where(
          and(
            projektNr !== undefined ? eq(schema.projekt.nr, projektNr) : undefined,
            nurUeberfaellig ? sql`${za.faelligAm} < current_date` : undefined,
            sql`${za.betrag} > ${bezahlt}`,
          ),
        )
        .orderBy(asc(za.faelligAm));
      return json(
        rows.map((r) => ({ ...r, offen: formatDe(money(r.betrag).minus(r.bezahlt)), betrag: formatDe(money(r.betrag)) })),
      );
    },
  );

  return server;
}
