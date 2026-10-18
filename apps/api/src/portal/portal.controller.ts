import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { schema } from "@bt/db";
import {
  PORTAL_MAX_FOTO_BYTES,
  PORTAL_MAX_FOTOS,
  PORTAL_MAX_MELDUNGEN_TAG,
  PORTAL_ORDNER,
  PORTAL_RATEN_TEXT,
  PORTAL_STATUS_TEXT,
  PortalLinkEingabe,
  PortalMeldung,
  bildformat,
  datumPlusMonate,
  portalRatenStand,
  portalStatus,
  SONDERWUNSCH_STATUS_TEXT,
  type SonderwunschStatus,
} from "@bt/domain";
import { and, asc, desc, eq, gt, inArray, isNull, max, sql } from "drizzle-orm";
import { memoryStorage } from "multer";
import { Benutzer, pruefe } from "../common/eingabe.js";
import { protokollieren } from "../common/protokoll.js";
import { DB, type Db } from "../db.provider.js";
import { SPEICHER, type Speicher } from "../dokumente/speicher.js";
import { NachrichtenService } from "../benachrichtigung/nachrichten.service.js";
import { MaengelService } from "../maengel/maengel.service.js";
import { VerkaufService } from "../verkauf/verkauf.service.js";

const { portalzugang: pz, kaufvertrag: kv, mangel: m, projekt: p, gesellschaft: g } = schema;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const heute = () => new Date().toISOString().slice(0, 10);
const PORTAL = "Käuferportal";

/** Verwaltung der Portal-Links am Kaufvertrag (intern). */
@Controller("kaufvertraege/:id/portal")
export class PortalLinkController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(VerkaufService) private readonly verkauf: VerkaufService,
  ) {}

  @Get()
  async status(@Param("id", ParseUUIDPipe) id: string) {
    await this.verkauf.vertrag(id);
    const [aktiv] = await this.db
      .select({ id: pz.id, gueltigBis: pz.gueltigBis, angelegtAm: pz.angelegtAm, erstelltVon: pz.erstelltVon, letzterZugriffAm: pz.letzterZugriffAm })
      .from(pz)
      .where(and(eq(pz.kaufvertragId, id), isNull(pz.widerrufenAm)))
      .orderBy(desc(pz.angelegtAm))
      .limit(1);
    const [meldungen] = await this.db.select({ n: sql<number>`count(*)::int` }).from(m).where(and(eq(m.kaufvertragId, id), eq(m.festgestelltDurch, PORTAL)));
    return { aktiv: aktiv ? { ...aktiv, abgelaufen: aktiv.gueltigBis < heute() } : null, meldungen: meldungen!.n };
  }

  /** Erzeugt einen neuen Link (der bisherige wird widerrufen). Der Token wird nur jetzt im Klartext geliefert. */
  @Post()
  async erzeugen(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const v = await this.verkauf.vertrag(id);
    const { gueltigBis } = pruefe(PortalLinkEingabe, body ?? {});
    const bis = gueltigBis ?? (v.gewaehrleistungBis && v.gewaehrleistungBis > heute() ? v.gewaehrleistungBis : datumPlusMonate(heute(), 60));
    if (bis <= heute()) throw new BadRequestException("Das Ablaufdatum muss in der Zukunft liegen.");
    const token = randomBytes(24).toString("base64url");
    await this.db.transaction(async (tx) => {
      await tx.update(pz).set({ widerrufenAm: new Date() }).where(and(eq(pz.kaufvertragId, id), isNull(pz.widerrufenAm)));
      const [neu] = await tx.insert(pz).values({ kaufvertragId: id, tokenHash: hash(token), gueltigBis: bis, erstelltVon: benutzer }).returning({ id: pz.id });
      await protokollieren(tx, { tabelle: "kaufvertrag", id, aktion: "update", neu: { portalLink: neu!.id, gueltigBis: bis }, benutzer });
    });
    return { token, gueltigBis: bis };
  }

  @Delete()
  async widerrufen(@Param("id", ParseUUIDPipe) id: string, @Benutzer() benutzer: string) {
    await this.verkauf.vertrag(id);
    await this.db.transaction(async (tx) => {
      await tx.update(pz).set({ widerrufenAm: new Date() }).where(and(eq(pz.kaufvertragId, id), isNull(pz.widerrufenAm)));
      await protokollieren(tx, { tabelle: "kaufvertrag", id, aktion: "update", neu: { portalLink: "widerrufen" }, benutzer });
    });
    return { widerrufen: true };
  }
}

/** Öffentliche Endpunkte für Käufer – Zugriff ausschließlich über den Token. */
@Controller("portal")
export class PortalController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(SPEICHER) private readonly speicher: Speicher,
    @Inject(MaengelService) private readonly maengel: MaengelService,
    @Inject(NachrichtenService) private readonly nachrichten: NachrichtenService,
    @Inject(VerkaufService) private readonly verkauf: VerkaufService,
  ) {}

  /** Dokumente, die Käufer sehen dürfen: versendete Schreiben und ausdrücklich freigegebene Unterlagen. */
  private dokumenteDesVertrags(kaufvertragId: string, mandantId: string) {
    const d = schema.dokument;
    return this.db
      .select({ id: d.id, dateiname: d.dateiname, ordner: d.ordner, beschreibung: d.beschreibung, groesse: d.groesse, angelegtAm: d.angelegtAm, speicherKey: d.speicherKey, mimeType: d.mimeType })
      .from(d)
      .where(and(eq(d.mandantId, mandantId), eq(d.objektTyp, "kaufvertrag"), eq(d.objektId, kaufvertragId), isNull(d.geloeschtAm), inArray(d.ordner, [...PORTAL_ORDNER])))
      .orderBy(desc(d.angelegtAm));
  }

  /** Gültiger Zugang → Kaufvertrag samt Mandant; sonst 404 (keine Unterscheidung, um nichts preiszugeben). */
  private async zugang(token: string) {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new NotFoundException("Link ungültig oder abgelaufen");
    const [z] = await this.db
      .select({ zugang: pz, kaufvertragId: kv.id, kvNr: kv.nr, projektId: kv.projektId, gewaehrleistungBis: kv.gewaehrleistungBis, mandantId: g.mandantId })
      .from(pz)
      .innerJoin(kv, eq(pz.kaufvertragId, kv.id))
      .innerJoin(p, eq(kv.projektId, p.id))
      .innerJoin(g, eq(p.gesellschaftId, g.id))
      .where(and(eq(pz.tokenHash, hash(token)), isNull(pz.widerrufenAm)));
    if (!z || z.zugang.gueltigBis < heute()) throw new NotFoundException("Link ungültig oder abgelaufen");
    return z;
  }

  @Get(":token")
  async ansicht(@Param("token") token: string) {
    const z = await this.zugang(token);
    await this.db.update(pz).set({ letzterZugriffAm: new Date() }).where(eq(pz.id, z.zugang.id));
    const [kopf] = await this.db
      .select({ strasse: p.strasse, plz: p.plz, ort: p.ort, suchcode: p.suchcode, gesellschaft: g.name, anschrift: g.anschrift })
      .from(p)
      .innerJoin(g, eq(p.gesellschaftId, g.id))
      .where(eq(p.id, z.projektId));
    const einheiten = await this.db
      .select({ id: schema.einheit.id, nr: schema.einheit.nr, typ: schema.einheit.typ, art: schema.einheit.art, etage: schema.einheit.etage })
      .from(schema.kaufvertragEinheit)
      .innerJoin(schema.einheit, eq(schema.kaufvertragEinheit.einheitId, schema.einheit.id))
      .where(eq(schema.kaufvertragEinheit.kaufvertragId, z.kaufvertragId))
      .orderBy(asc(schema.einheit.nr));
    const kaeufer = await this.db
      .select({ anrede: schema.geschaeftspartner.anrede, vorname: schema.geschaeftspartner.vorname, nachname: schema.geschaeftspartner.nachname, firma: schema.geschaeftspartner.firma })
      .from(schema.kaufvertragKaeufer)
      .innerJoin(schema.geschaeftspartner, eq(schema.kaufvertragKaeufer.partnerId, schema.geschaeftspartner.id))
      .where(eq(schema.kaufvertragKaeufer.kaufvertragId, z.kaufvertragId));
    const liste = await this.db
      .select({ id: m.id, nr: m.nr, titel: m.titel, ort: m.ort, festgestelltAm: m.festgestelltAm, erledigtAm: m.erledigtAm, handwerkerId: m.handwerkerId, eigentum: m.eigentum })
      .from(m)
      .where(eq(m.kaufvertragId, z.kaufvertragId))
      .orderBy(desc(m.festgestelltAm), desc(m.nr));
    const ruegen = await this.maengel.ruegen(liste.map((x) => x.id));
    const v = await this.verkauf.vertrag(z.kaufvertragId);
    const stichtag = heute();
    const offeneAnforderungen = v.anforderungen.filter((a) => Number(a.offen) > 0);
    const dokumente = await this.dokumenteDesVertrags(z.kaufvertragId, z.mandantId);
    return {
      objekt: { strasse: kopf!.strasse, plz: kopf!.plz, ort: kopf!.ort, bezeichnung: kopf!.suchcode },
      bautraeger: { name: kopf!.gesellschaft, anschrift: kopf!.anschrift },
      kaufvertrag: z.kvNr,
      kaeufer: kaeufer.map((k) => k.firma ?? [k.anrede, k.vorname, k.nachname].filter(Boolean).join(" ")),
      einheiten,
      gewaehrleistungBis: z.gewaehrleistungBis,
      linkGueltigBis: z.zugang.gueltigBis,
      maengel: liste.map((x) => {
        const status = portalStatus(x, ruegen.get(x.id)?.length ?? 0);
        return { nr: x.nr, titel: x.titel, ort: x.ort, gemeldetAm: x.festgestelltAm, erledigtAm: x.erledigtAm, gemeinschaft: x.eigentum === "gemeinschaft", status, statusText: PORTAL_STATUS_TEXT[status] };
      }),
      maxFotos: PORTAL_MAX_FOTOS,
      zahlungen: {
        kaufpreis: v.summen.vertragssumme,
        sonderwuensche: v.summen.sonderwuensche,
        gesamt: v.summen.gesamt,
        angefordert: v.summen.angefordert,
        bezahlt: v.summen.bezahlt,
        offen: v.summen.offen,
        ueberfaellig: offeneAnforderungen.filter((a) => a.faelligAm < stichtag).reduce((s, a) => s + Number(a.offen), 0).toFixed(2),
        naechsteFaelligkeit: offeneAnforderungen.map((a) => a.faelligAm).sort()[0] ?? null,
      },
      offeneRechnungen: offeneAnforderungen.map((a) => ({ rechnungsnr: a.rechnungsnr, angefordertAm: a.angefordertAm, faelligAm: a.faelligAm, betrag: a.betrag, offen: a.offen, ueberfaellig: a.faelligAm < stichtag })),
      raten: v.raten.map((r) => {
        const stand = portalRatenStand(r, stichtag);
        return { nr: r.nr, text: r.text, prozent: r.prozent, betrag: r.betrag, bezahlt: r.bezahlt, rechnungsnr: r.rechnungsnr, faelligAm: r.faelligAm, sonderwunsch: r.typ !== "mabv", stand, standText: PORTAL_RATEN_TEXT[stand] };
      }),
      sonderwuensche: v.sonderwuensche.map((s) => ({
        nr: s.nr,
        bezeichnung: s.bezeichnung,
        beschreibung: s.beschreibung,
        gutschrift: s.art === "gutschrift",
        betrag: s.betragBrutto,
        status: s.status,
        statusText: SONDERWUNSCH_STATUS_TEXT[s.status as SonderwunschStatus],
        gueltigBis: s.status === "angebot" ? s.gueltigBis : null,
      })),
      dokumente: dokumente.map(({ speicherKey: _k, mimeType: _m, ...d }) => (void _k, void _m, d)),
    };
  }

  /** Download eines freigegebenen Dokuments (nur mit gültigem Link). */
  @Get(":token/dokumente/:id")
  async dokument(@Param("token") token: string, @Param("id", ParseUUIDPipe) id: string) {
    const z = await this.zugang(token);
    const x = (await this.dokumenteDesVertrags(z.kaufvertragId, z.mandantId)).find((d) => d.id === id);
    if (!x) throw new NotFoundException("Dokument nicht gefunden");
    return new StreamableFile(this.speicher.lesen(x.speicherKey), {
      type: x.mimeType ?? "application/octet-stream",
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(x.dateiname)}`,
      length: x.groesse ?? undefined,
    });
  }

  /** Mängelanzeige mit bis zu fünf Fotos. */
  @Post(":token/maengel")
  @UseInterceptors(FilesInterceptor("fotos", PORTAL_MAX_FOTOS, { storage: memoryStorage(), limits: { fileSize: PORTAL_MAX_FOTO_BYTES, files: PORTAL_MAX_FOTOS } }))
  async melden(@Param("token") token: string, @UploadedFiles() fotos: Express.Multer.File[] | undefined, @Body() body: unknown) {
    const z = await this.zugang(token);
    const w = pruefe(PortalMeldung, body);
    const [einheit] = await this.db
      .select({ id: schema.kaufvertragEinheit.einheitId })
      .from(schema.kaufvertragEinheit)
      .where(and(eq(schema.kaufvertragEinheit.kaufvertragId, z.kaufvertragId), eq(schema.kaufvertragEinheit.einheitId, w.einheitId)));
    if (!einheit) throw new ForbiddenException("Die Einheit gehört nicht zu Ihrem Kaufvertrag.");
    const [anzahl] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(m)
      .where(and(eq(m.kaufvertragId, z.kaufvertragId), eq(m.festgestelltDurch, PORTAL), gt(m.angelegtAm, new Date(Date.now() - 86_400_000))));
    if (anzahl!.n >= PORTAL_MAX_MELDUNGEN_TAG) throw new HttpException("Zu viele Meldungen in kurzer Zeit – bitte morgen erneut versuchen oder den Bauträger direkt kontaktieren.", HttpStatus.TOO_MANY_REQUESTS);
    const bilder = (fotos ?? []).filter((f) => f.size > 0).map((f) => ({ f, typ: bildformat(f.buffer.subarray(0, 16)) }));
    const ungueltig = bilder.filter((b) => !b.typ);
    if (ungueltig.length) throw new BadRequestException("Bitte nur Fotos hochladen (JPEG, PNG, WebP oder HEIC).");
    const benutzer = `${PORTAL} (${z.kvNr})`;
    const beschreibung = [w.beschreibung, w.kontakt ? `Erreichbarkeit: ${w.kontakt}` : null].filter(Boolean).join("\n\n") || null;
    const gespeichert = await Promise.all(
      bilder.map(async (b) => {
        const speicherKey = `${z.mandantId}/${new Date().getFullYear()}/${randomUUID()}`;
        await this.speicher.speichern(speicherKey, b.f.buffer);
        return { ...b, speicherKey, sha256: createHash("sha256").update(b.f.buffer).digest("hex") };
      }),
    );
    const ergebnis = await this.db.transaction(async (tx) => {
      const [x] = await tx.select({ n: max(m.nr) }).from(m).where(eq(m.projektId, z.projektId));
      const werte = {
        projektId: z.projektId,
        nr: (x?.n ?? 0) + 1,
        kaufvertragId: z.kaufvertragId,
        einheitId: w.einheitId,
        eigentum: w.bereich,
        festgestelltAm: heute(),
        festgestelltDurch: PORTAL,
        mangelart: "Kundenreklamation",
        titel: w.titel,
        ort: w.ort ?? null,
        beschreibung,
      };
      const [neu] = await tx.insert(m).values(werte).returning({ id: m.id, nr: m.nr });
      await protokollieren(tx, { tabelle: "mangel", id: neu!.id, aktion: "insert", neu: werte, benutzer });
      for (const [i, b] of gespeichert.entries()) {
        const endung = b.typ!.split("/")[1]!.replace("jpeg", "jpg");
        const [d] = await tx
          .insert(schema.dokument)
          .values({ mandantId: z.mandantId, objektTyp: "mangel", objektId: neu!.id, ordner: "Fotos", dateiname: `Foto-${neu!.nr}-${i + 1}.${endung}`, mimeType: b.typ, groesse: b.f.size, speicherKey: b.speicherKey, sha256: b.sha256, hochgeladenVon: benutzer })
          .returning({ id: schema.dokument.id });
        await protokollieren(tx, { tabelle: "dokument", id: d!.id, aktion: "insert", neu: { sha256: b.sha256, objektTyp: "mangel", objektId: neu!.id }, benutzer });
      }
      return { id: neu!.id, nr: neu!.nr, fotos: gespeichert.length };
    });
    // Benachrichtigung darf die Meldung nie scheitern lassen
    await this.nachrichten.mangelGemeldet(ergebnis.id, ergebnis.fotos).catch((e: Error) => console.error("Benachrichtigung:", e.message));
    return { nr: ergebnis.nr, fotos: ergebnis.fotos };
  }
}
