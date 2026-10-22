// Textul prețului afișat clientului.
import { formatBani, formatLeiAmount, type Bani } from "@/domain/money";
import type { Estimate, EstimateLine } from "./types";

export const FINAL_PRICE_NOTE = "Prețul final se stabilește în service.";

const ON_REQUEST = "Preț stabilit în service";
const PART_ON_REQUEST = "unele lucrări: preț stabilit în service";

function amountText(min: Bani, max: Bani, minimumOnly: boolean): string {
  if (minimumOnly) return `De la ${formatBani(min)}`;
  if (min === max) return formatBani(min);
  return `Între ${formatLeiAmount(min)} și ${formatBani(max)}`;
}

/** „120 lei”, „Între 200 și 360 lei”, „De la 20 lei”, „Preț stabilit în service”. */
export function describeLine(line: EstimateLine): string {
  if (line.lineMinBani === null || line.lineMaxBani === null) return ON_REQUEST;
  const text = amountText(line.lineMinBani, line.lineMaxBani, line.priceIsMinimum);
  return line.partlyOnRequest ? `${text} (pentru unele mărimi: preț stabilit în service)` : text;
}

/** Totalul programării, ex. „Între 510 și 670 lei + unele lucrări: preț stabilit în service”. */
export function describeTotal(estimate: Estimate): string {
  const anyPriced = estimate.lines.some((line) => line.lineMinBani !== null);
  if (!anyPriced) return ON_REQUEST;
  const text = amountText(estimate.totalMinBani, estimate.totalMaxBani, estimate.hasMinimumOnly);
  return estimate.hasUnpriced ? `${text} + ${PART_ON_REQUEST}` : text;
}
