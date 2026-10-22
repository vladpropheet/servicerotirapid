// Banii se țin în bani întregi (1 leu = 100 bani), niciodată ca numere cu zecimale.
// Ex.: 2,5 lei = 250 bani. Așa nu apar erori de rotunjire (0,1 + 0,2 ≠ 0,3).

export type Bani = number;

const LEI_PATTERN = /^(\d{1,7})(?:[.,](\d{1,2}))?$/;

/**
 * Transformă un preț în lei („2,5”, „2.50”, 40 sau 2.5) în bani întregi.
 * Aruncă eroare pentru valori negative, cu mai mult de 2 zecimale sau care nu sunt numere.
 */
export function leiToBani(value: number | string): Bani {
  const text = typeof value === "number" ? String(value) : value.trim();
  const match = LEI_PATTERN.exec(text);
  if (!match) {
    throw new Error(`Preț invalid: „${text}”`);
  }
  const lei = Number(match[1]);
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return lei * 100 + Number(fraction);
}

const leiFormatter = new Intl.NumberFormat("ro-RO", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** 25000 → „250 lei”, 250 → „2,5 lei”. */
export function formatBani(bani: Bani): string {
  return `${leiFormatter.format(bani / 100)} lei`;
}
