import { BadRequestException, Body, Controller, Get, Post } from "@nestjs/common";
import { MABV_ABSCHNITTE, MabvFehler, STANDARD_7_RATEN, money, ratenplanBerechnen } from "@bt/domain";
import { z } from "zod";

const RatenplanAnfrage = z.object({
  vertragssumme: z.string().regex(/^\d+(\.\d{1,2})?$/),
  erbbaurecht: z.boolean().optional(),
  raten: z
    .array(z.object({ bezeichnung: z.string().optional(), abschnitte: z.array(z.enum(MABV_ABSCHNITTE.map((a) => a.key) as [string, ...string[]])) }))
    .optional(),
});

@Controller("mabv")
export class MabvController {
  @Get("abschnitte")
  abschnitte() {
    return MABV_ABSCHNITTE;
  }

  @Post("ratenplan")
  ratenplan(@Body() body: unknown) {
    const anfrage = RatenplanAnfrage.safeParse(body);
    if (!anfrage.success) throw new BadRequestException(anfrage.error.issues);
    const { vertragssumme, erbbaurecht, raten } = anfrage.data;
    try {
      return ratenplanBerechnen(money(vertragssumme), (raten as typeof STANDARD_7_RATEN) ?? STANDARD_7_RATEN, { erbbaurecht }).map(
        (r) => ({ ...r, prozent: r.prozent.toFixed(2), betrag: r.betrag.toFixed(2) }),
      );
    } catch (e) {
      if (e instanceof MabvFehler) throw new BadRequestException(e.message);
      throw e;
    }
  }
}
