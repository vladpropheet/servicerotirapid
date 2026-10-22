// Cum scrie patronul un preț în editorul de prețuri (o căsuță de text pe celulă), și invers.
//
//   „45” sau „45,5”  → preț fix
//   „45-60”          → interval
//   „20+”            → „de la 20 lei”
//   „?”              → preț stabilit în service
//   „x”              → nu facem
//   gol              → combinația nu există (nu apare la client)
import type { PriceStatus } from "@/domain/enums";
import { formatLeiAmount, leiToBani } from "@/domain/money";

export type CellValue =
  | { kind: "empty" }
  | { kind: "cell"; status: PriceStatus; minBani: number | null; maxBani: number | null; priceIsMinimum: boolean };

export type CellParseResult = { ok: true; value: CellValue } | { ok: false; error: string };

const NUMBER = String.raw`\d{1,6}(?:[.,]\d{1,2})?`;
const RANGE = new RegExp(`^(${NUMBER})\\s*[-–]\\s*(${NUMBER})$`);
const MINIMUM = new RegExp(`^(${NUMBER})\\s*\\+$`);
const FIXED = new RegExp(`^(${NUMBER})$`);

export function parseCellText(raw: string): CellParseResult {
  const text = raw.trim().replace(/\s*lei$/i, "");
  if (text === "") return { ok: true, value: { kind: "empty" } };
  if (text === "?") return { ok: true, value: { kind: "cell", status: "on_request", minBani: null, maxBani: null, priceIsMinimum: false } };
  if (/^x$/i.test(text)) {
    return { ok: true, value: { kind: "cell", status: "not_offered", minBani: null, maxBani: null, priceIsMinimum: false } };
  }

  const fixed = FIXED.exec(text);
  if (fixed) {
    const bani = leiToBani(fixed[1]!);
    return { ok: true, value: { kind: "cell", status: "priced", minBani: bani, maxBani: bani, priceIsMinimum: false } };
  }
  const minimum = MINIMUM.exec(text);
  if (minimum) {
    const bani = leiToBani(minimum[1]!);
    return { ok: true, value: { kind: "cell", status: "priced", minBani: bani, maxBani: bani, priceIsMinimum: true } };
  }
  const range = RANGE.exec(text);
  if (range) {
    const min = leiToBani(range[1]!);
    const max = leiToBani(range[2]!);
    if (max < min) return { ok: false, error: `„${raw.trim()}”: al doilea preț trebuie să fie mai mare.` };
    return { ok: true, value: { kind: "cell", status: "priced", minBani: min, maxBani: max, priceIsMinimum: false } };
  }
  return { ok: false, error: `„${raw.trim()}” nu e un preț. Scrie de ex. 45, 45-60, 20+, ? sau x.` };
}

export function cellText(cell: {
  status: PriceStatus;
  minBani: number | null;
  maxBani: number | null;
  priceIsMinimum: boolean;
}): string {
  if (cell.status === "on_request") return "?";
  if (cell.status === "not_offered") return "x";
  if (cell.minBani === null || cell.maxBani === null) return "?";
  const min = formatLeiAmount(cell.minBani).replace(/\./g, "");
  if (cell.priceIsMinimum) return `${min}+`;
  if (cell.minBani === cell.maxBani) return min;
  return `${min}-${formatLeiAmount(cell.maxBani).replace(/\./g, "")}`;
}
