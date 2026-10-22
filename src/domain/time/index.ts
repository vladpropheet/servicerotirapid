// Conversii între ora locală a service-ului (ex. Europe/Bucharest) și momente exacte (UTC).
// Folosim API-ul standard Temporal (prin polyfill), care știe regulile orei de vară/iarnă.
import { Temporal } from "temporal-polyfill";

export { Temporal };

/** Un moment exact, în milisecunde de la 1970 (UTC). Ușor de comparat și de adunat. */
export type EpochMs = number;

export const MINUTE_MS = 60_000;

/**
 * Momentul exact al unei ore locale dintr-o zi.
 *
 * - Ora există o singură dată: momentul ei.
 * - Ora cade în golul de la trecerea la ora de vară (ex. 03:30, când ceasul sare de la 03:00 la 04:00):
 *   momentul trecerii (04:00 ora nouă). Regula implicită a Temporal ar da 04:30, adică o oră de program în plus pierdută.
 * - Ora apare de două ori la trecerea la ora de iarnă (ex. 03:30): prima apariție.
 */
export function localTimeToEpochMs(
  date: Temporal.PlainDate,
  time: Temporal.PlainTime,
  timeZone: string,
): EpochMs {
  const fields = {
    year: date.year,
    month: date.month,
    day: date.day,
    hour: time.hour,
    minute: time.minute,
    second: time.second,
    timeZone,
  };
  const earlier = Temporal.ZonedDateTime.from(fields, { disambiguation: "earlier" });
  if (Temporal.PlainTime.compare(earlier.toPlainTime(), time) === 0) {
    return earlier.epochMilliseconds;
  }
  // Ora nu există: e în golul de la trecerea la ora de vară.
  const transition = earlier.getTimeZoneTransition("next");
  if (!transition) {
    throw new Error(`Nu pot rezolva ora ${time.toString()} din ${date.toString()} (${timeZone}).`);
  }
  return transition.epochMilliseconds;
}

/** Ziua calendaristică locală a unui moment. */
export function localDateOf(epochMs: EpochMs, timeZone: string): Temporal.PlainDate {
  return Temporal.Instant.fromEpochMilliseconds(epochMs).toZonedDateTimeISO(timeZone).toPlainDate();
}

/** Ora locală „HH:mm” a unui moment. */
export function localTimeLabel(epochMs: EpochMs, timeZone: string): string {
  const zdt = Temporal.Instant.fromEpochMilliseconds(epochMs).toZonedDateTimeISO(timeZone);
  return `${String(zdt.hour).padStart(2, "0")}:${String(zdt.minute).padStart(2, "0")}`;
}

/**
 * Rotunjește în sus la grila locală de `stepMin` minute (ex. 08:07 → 08:15 la pas de 15).
 * Pasul trebuie să dividă 60 (5, 10, 15, 20, 30, 60).
 */
export function ceilToLocalGrid(epochMs: EpochMs, timeZone: string, stepMin: number): EpochMs {
  if (stepMin <= 0 || 60 % stepMin !== 0) {
    throw new Error(`Pas invalid: ${stepMin} minute (trebuie să dividă 60).`);
  }
  const zdt = Temporal.Instant.fromEpochMilliseconds(epochMs).toZonedDateTimeISO(timeZone);
  const rounded =
    stepMin === 60
      ? zdt.round({ smallestUnit: "hour", roundingMode: "ceil" })
      : zdt.round({ smallestUnit: "minute", roundingIncrement: stepMin, roundingMode: "ceil" });
  return rounded.epochMilliseconds;
}

/** Rotunjește o durată în sus la pas: 58 min cu pas de 15 → 60 min. */
export function roundUpToStep(minutes: number, stepMin: number): number {
  if (minutes <= 0) return 0;
  return Math.ceil(minutes / stepMin) * stepMin;
}
