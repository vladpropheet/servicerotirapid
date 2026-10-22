// Calculul intervalelor libere pentru programările online. Funcție pură.
// Regulile sunt descrise în planul Fazei 0, secțiunea „Algoritmul intervalelor libere”.
//
// Toate momentele sunt în milisecunde UTC (EpochMs). Programul de lucru e în ora locală
// a service-ului și se convertește zi de zi, ca trecerile la ora de vară/iarnă să fie corecte.
import type { ClosureKind } from "@/domain/enums";
import {
  ceilToLocalGrid,
  localDateOf,
  localTimeLabel,
  localTimeToEpochMs,
  MINUTE_MS,
  Temporal,
  type EpochMs,
} from "@/domain/time";

/** Un interval de program dintr-o zi a săptămânii (1 = luni … 7 = duminică), ore locale „HH:mm”. */
export type WeeklyInterval = { weekday: number; opensAt: string; closesAt: string };

/** Zile întregi (date locale „YYYY-MM-DD”, inclusiv) sau un interval exact. */
export type Closure =
  | { kind: ClosureKind; dateFrom: string; dateTo: string }
  | { kind: ClosureKind; startsAt: EpochMs; endsAt: EpochMs };

/** O programare care ocupă un loc din capacitatea online. */
export type CapacityHold = { startsAt: EpochMs; endsAt: EpochMs };

export type AvailabilityInput = {
  timeZone: string;
  now: EpochMs;
  onlineCapacity: number;
  slotStepMin: number;
  minLeadMin: number;
  maxDaysAhead: number;
  businessHours: WeeklyInterval[];
  closures: Closure[];
  /** Doar programările care ocupă capacitatea online (nu cele anulate, nu cele manuale care nu o ocupă). */
  holds: CapacityHold[];
  /** Durata rezervată (deja rotunjită la pas). */
  durationMin: number;
  /** Calculează doar pentru această zi locală „YYYY-MM-DD” (folosit la reverificare). */
  onlyDate?: string;
};

export type Slot = {
  /** Ziua locală, „YYYY-MM-DD”. */
  localDate: string;
  /** Ora locală de început, „HH:mm”. */
  localTime: string;
  startsAt: EpochMs;
  endsAt: EpochMs;
  /**
   * Ora locală apare a doua oară în aceeași zi (trecerea la ora de iarnă, 03:00–03:59).
   * Interfața o poate marca, de ex. „03:30 (ora de iarnă)”.
   */
  repeatedLocalTime: boolean;
};

type Range = { start: EpochMs; end: EpochMs };

export function availableSlots(input: AvailabilityInput): Slot[] {
  const { timeZone, slotStepMin } = input;
  const durationMs = input.durationMin * MINUTE_MS;
  if (input.durationMin <= 0 || input.onlineCapacity <= 0) return [];

  const earliest = input.now + input.minLeadMin * MINUTE_MS;
  const today = localDateOf(input.now, timeZone);
  const lastDay = today.add({ days: input.maxDaysAhead });

  let days: Temporal.PlainDate[];
  if (input.onlyDate !== undefined) {
    const only = Temporal.PlainDate.from(input.onlyDate);
    const inRange =
      Temporal.PlainDate.compare(only, today) >= 0 && Temporal.PlainDate.compare(only, lastDay) <= 0;
    days = inRange ? [only] : [];
  } else {
    days = [];
    for (let d = today; Temporal.PlainDate.compare(d, lastDay) <= 0; d = d.add({ days: 1 })) {
      days.push(d);
    }
  }

  const dayClosures = input.closures.filter((c): c is Extract<Closure, { dateFrom: string }> => "dateFrom" in c);
  const rangeClosures: Range[] = input.closures
    .filter((c): c is Extract<Closure, { startsAt: EpochMs }> => "startsAt" in c)
    .map((c) => ({ start: c.startsAt, end: c.endsAt }));

  const slots: Slot[] = [];
  for (const day of days) {
    const dayText = day.toString();
    if (dayClosures.some((c) => c.dateFrom <= dayText && dayText <= c.dateTo)) continue;

    const open = mergeRanges(
      input.businessHours
        .filter((h) => h.weekday === day.dayOfWeek)
        .map((h) => ({
          start: localTimeToEpochMs(day, Temporal.PlainTime.from(h.opensAt), timeZone),
          end: localTimeToEpochMs(day, Temporal.PlainTime.from(h.closesAt), timeZone),
        }))
        .filter((r) => r.end > r.start),
    );
    const free = subtractRanges(open, rangeClosures);

    const labels = new Set<string>();
    for (const range of free) {
      let start = ceilToLocalGrid(Math.max(range.start, earliest), timeZone, slotStepMin);
      while (start + durationMs <= range.end) {
        const end = start + durationMs;
        if (maxConcurrent(input.holds, start, end) < input.onlineCapacity) {
          const localTime = localTimeLabel(start, timeZone);
          slots.push({
            localDate: dayText,
            localTime,
            startsAt: start,
            endsAt: end,
            repeatedLocalTime: labels.has(localTime),
          });
          labels.add(localTime);
        }
        start += slotStepMin * MINUTE_MS;
      }
    }
  }
  return slots;
}

/**
 * Reverificarea de la confirmare: intervalul cerut e încă liber?
 * Rulează exact aceeași regulă ca afișarea, dar doar pentru ziua intervalului.
 */
export function isSlotAvailable(input: Omit<AvailabilityInput, "onlyDate">, startsAt: EpochMs): boolean {
  const onlyDate = localDateOf(startsAt, input.timeZone).toString();
  return availableSlots({ ...input, onlyDate }).some((slot) => slot.startsAt === startsAt);
}

/**
 * Câte programări se suprapun în același timp, în cel mai aglomerat moment din [start, end).
 * Intervalele sunt închise la început și deschise la sfârșit: 10:00–11:00 și 11:00–12:00 nu se suprapun.
 */
export function maxConcurrent(holds: CapacityHold[], start: EpochMs, end: EpochMs): number {
  const events: { at: EpochMs; delta: 1 | -1 }[] = [];
  for (const hold of holds) {
    if (hold.startsAt < end && hold.endsAt > start) {
      events.push({ at: Math.max(hold.startsAt, start), delta: 1 });
      events.push({ at: Math.min(hold.endsAt, end), delta: -1 });
    }
  }
  // La același moment, întâi se eliberează un loc, apoi se ocupă.
  events.sort((a, b) => a.at - b.at || a.delta - b.delta);

  let current = 0;
  let max = 0;
  for (const event of events) {
    current += event.delta;
    max = Math.max(max, current);
  }
  return max;
}

/** Grupează intervalele pe zile, pentru afișare. */
export function groupSlotsByDay(slots: Slot[]): { localDate: string; slots: Slot[] }[] {
  const days = new Map<string, Slot[]>();
  for (const slot of slots) {
    const list = days.get(slot.localDate) ?? [];
    list.push(slot);
    days.set(slot.localDate, list);
  }
  return [...days].map(([localDate, daySlots]) => ({ localDate, slots: daySlots }));
}

function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: Range[] = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function subtractRanges(base: Range[], cuts: Range[]): Range[] {
  let result = base;
  for (const cut of cuts) {
    const next: Range[] = [];
    for (const range of result) {
      if (cut.end <= range.start || cut.start >= range.end) {
        next.push(range);
        continue;
      }
      if (cut.start > range.start) next.push({ start: range.start, end: cut.start });
      if (cut.end < range.end) next.push({ start: cut.end, end: range.end });
    }
    result = next;
  }
  return result;
}
