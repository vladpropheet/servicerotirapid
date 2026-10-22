import { readFileSync } from "node:fs";

/** Catalogul real de pornire, citit proaspăt la fiecare apel (testele îl pot modifica). */
export function loadCatalog(): Record<string, unknown> {
  return JSON.parse(readFileSync("data/seed/catalog-servicii.json", "utf8")) as Record<string, unknown>;
}
