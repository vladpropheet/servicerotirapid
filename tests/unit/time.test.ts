import { describe, expect, it } from "vitest";
import {
  ceilToLocalGrid,
  localDateOf,
  localTimeLabel,
  localTimeToEpochMs,
  roundUpToStep,
  Temporal,
} from "@/domain/time";

const TZ = "Europe/Bucharest";
const iso = (ms: number) => new Date(ms).toISOString();
const date = (text: string) => Temporal.PlainDate.from(text);
const time = (text: string) => Temporal.PlainTime.from(text);

describe("localTimeToEpochMs", () => {
  it("ora de vară (EEST, UTC+3) și ora de iarnă (EET, UTC+2)", () => {
    expect(iso(localTimeToEpochMs(date("2026-10-23"), time("08:00"), TZ))).toBe("2026-10-23T05:00:00.000Z");
    expect(iso(localTimeToEpochMs(date("2026-10-26"), time("08:00"), TZ))).toBe("2026-10-26T06:00:00.000Z");
  });

  it("o oră din golul de la trecerea la ora de vară devine momentul trecerii", () => {
    // 28.03.2027: la 03:00 ceasul sare la 04:00, deci 03:30 nu există.
    expect(iso(localTimeToEpochMs(date("2027-03-28"), time("03:30"), TZ))).toBe("2027-03-28T01:00:00.000Z");
    expect(iso(localTimeToEpochMs(date("2027-03-28"), time("03:00"), TZ))).toBe("2027-03-28T01:00:00.000Z");
    expect(iso(localTimeToEpochMs(date("2027-03-28"), time("04:00"), TZ))).toBe("2027-03-28T01:00:00.000Z");
  });

  it("o oră care apare de două ori la trecerea la ora de iarnă ia prima apariție", () => {
    // 25.10.2026: la 04:00 ceasul revine la 03:00, deci 03:30 apare de două ori.
    expect(iso(localTimeToEpochMs(date("2026-10-25"), time("03:30"), TZ))).toBe("2026-10-25T00:30:00.000Z");
  });
});

describe("localDateOf / localTimeLabel", () => {
  it("lucrează în ora României, nu în UTC", () => {
    const lateEvening = Date.parse("2026-10-22T22:30:00Z"); // 23.10, 01:30 la București
    expect(localDateOf(lateEvening, TZ).toString()).toBe("2026-10-23");
    expect(localTimeLabel(lateEvening, TZ)).toBe("01:30");
  });
});

describe("ceilToLocalGrid", () => {
  it("rotunjește în sus la pas", () => {
    expect(iso(ceilToLocalGrid(Date.parse("2026-10-22T05:07:31Z"), TZ, 15))).toBe("2026-10-22T05:15:00.000Z");
    expect(iso(ceilToLocalGrid(Date.parse("2026-10-22T05:15:00Z"), TZ, 15))).toBe("2026-10-22T05:15:00.000Z");
    expect(iso(ceilToLocalGrid(Date.parse("2026-10-22T05:31:00Z"), TZ, 30))).toBe("2026-10-22T06:00:00.000Z");
    expect(iso(ceilToLocalGrid(Date.parse("2026-10-22T05:01:00Z"), TZ, 60))).toBe("2026-10-22T06:00:00.000Z");
  });

  it("refuză un pas care nu divide ora", () => {
    expect(() => ceilToLocalGrid(0, TZ, 7)).toThrow();
    expect(() => ceilToLocalGrid(0, TZ, 0)).toThrow();
  });
});

describe("roundUpToStep", () => {
  it.each([
    [58, 60],
    [60, 60],
    [1, 15],
    [103, 105],
    [0, 0],
  ])("%i min → %i min", (minutes, expected) => {
    expect(roundUpToStep(minutes, 15)).toBe(expected);
  });
});
