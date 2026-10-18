import { Decimal } from "decimal.js";

/**
 * Geldbeträge werden ausschließlich als Decimal geführt – nie als JS-number.
 * Kaufmännische Rundung (ROUND_HALF_UP) auf 2 Nachkommastellen.
 */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Money = InstanceType<typeof D>;

export const money = (v: Decimal.Value): Money => new D(v);
export const ZERO = money(0);

/** Rundet auf Cent. */
export const cent = (v: Money): Money => v.toDecimalPlaces(2, D.ROUND_HALF_UP);

/** Prozentsatz anwenden: betrag × prozent / 100, auf Cent gerundet. */
export const prozentVon = (betrag: Money, prozent: Decimal.Value): Money =>
  cent(betrag.times(prozent).dividedBy(100));

export const summe = (werte: Money[]): Money => werte.reduce((a, b) => a.plus(b), ZERO);

/** Deutsche Darstellung, z. B. 1.234,56 */
export const formatDe = (v: Money): string => {
  const [ganz, nach] = cent(v).abs().toFixed(2).split(".");
  const mitPunkten = ganz!.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${v.isNegative() ? "-" : ""}${mitPunkten},${nach}`;
};
