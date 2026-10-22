// Fișiere CSV care se deschid corect în Excel în română:
// separator „;”, BOM UTF-8 (ca diacriticele să apară corect) și rânduri terminate cu CRLF.

export type CsvValue = string | number | null | undefined;

/** Un text care începe cu unul dintre aceste caractere poate fi interpretat de Excel ca formulă. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * O celulă sigură. Textele care ar putea fi formule (ex. „=HYPERLINK(...)” scris de un client
 * în câmpul de nume) primesc un apostrof în față, ca Excel să le arate ca text (CSV injection).
 */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && FORMULA_START.test(text)) text = `'${text}`;
  if (/[;"\r\n]/.test(text)) text = `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function toCsv(header: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** 12050 → „120,50” (fără separator de mii, ca Excel să-l citească drept număr). */
export function csvLei(bani: number | null): string {
  if (bani === null) return "";
  return (bani / 100).toFixed(2).replace(".", ",");
}
