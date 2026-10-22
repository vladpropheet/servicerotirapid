import { describe, expect, it } from "vitest";
import {
  availableSlots,
  groupSlotsByDay,
  isSlotAvailable,
  maxConcurrent,
  type AvailabilityInput,
  type WeeklyInterval,
} from "@/domain/availability";
import { estimate } from "@/domain/pricing";
import { rotiRapidPricingCatalog } from "../helpers/pricing-catalog";

const TZ = "Europe/Bucharest";
const at = (isoUtc: string) => Date.parse(isoUtc);

/** Programul lui Roți Rapid: luni–vineri 08–18, sâmbătă 08–17, duminică închis. */
const ROTI_RAPID_HOURS: WeeklyInterval[] = [
  ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, opensAt: "08:00", closesAt: "18:00" })),
  { weekday: 6, opensAt: "08:00", closesAt: "17:00" },
];

// Joi, 22.10.2026, ora 10:07 la București (ora de vară, UTC+3).
const NOW = at("2026-10-22T07:07:00Z");

function input(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    timeZone: TZ,
    now: NOW,
    onlineCapacity: 1,
    slotStepMin: 15,
    minLeadMin: 120,
    maxDaysAhead: 30,
    businessHours: ROTI_RAPID_HOURS,
    closures: [],
    holds: [],
    durationMin: 60,
    ...overrides,
  };
}

/** Orele locale libere dintr-o zi. */
function timesOn(day: string, overrides: Partial<AvailabilityInput> = {}): string[] {
  return availableSlots(input({ ...overrides, onlyDate: day })).map((s) => s.localTime);
}

describe("program, timp minim înainte, limită de zile", () => {
  it("azi: primul interval e la cel puțin 2 ore de acum, rotunjit la 15 minute", () => {
    const today = timesOn("2026-10-22");
    expect(today[0]).toBe("12:15");
    expect(today.at(-1)).toBe("17:00");
    expect(today).toHaveLength(20);
  });

  it("o zi întreagă: de la deschidere până la ultima oră care se termină la închidere", () => {
    const friday = timesOn("2026-10-23");
    expect(friday[0]).toBe("08:00");
    expect(friday.at(-1)).toBe("17:00");
    expect(friday).toHaveLength(37);
  });

  it("sâmbăta se închide la 17:00, deci o programare de o oră începe cel târziu la 16:00", () => {
    expect(timesOn("2026-10-24").at(-1)).toBe("16:00");
    expect(timesOn("2026-10-24", { durationMin: 45 }).at(-1)).toBe("16:15");
  });

  it("duminica e închis", () => {
    expect(timesOn("2026-10-25")).toEqual([]);
  });

  it("se poate programa cel mult 30 de zile înainte", () => {
    const days = groupSlotsByDay(availableSlots(input())).map((d) => d.localDate);
    expect(days[0]).toBe("2026-10-22");
    expect(days.at(-1)).toBe("2026-11-21");
    expect(timesOn("2026-11-23")).toEqual([]);
  });

  it("cu 0 zile înainte, doar azi", () => {
    const days = groupSlotsByDay(availableSlots(input({ maxDaysAhead: 0 }))).map((d) => d.localDate);
    expect(days).toEqual(["2026-10-22"]);
  });

  it("nimic în trecut și nimic mai devreme de timpul minim", () => {
    const slots = availableSlots(input());
    expect(slots.every((s) => s.startsAt >= NOW + 120 * 60_000)).toBe(true);
  });

  it("pasul de 30 de minute dă doar ore fixe și jumătăți", () => {
    const friday = timesOn("2026-10-23", { slotStepMin: 30 });
    expect(friday.slice(0, 3)).toEqual(["08:00", "08:30", "09:00"]);
    expect(friday.every((t) => t.endsWith(":00") || t.endsWith(":30"))).toBe(true);
  });

  it("o deschidere care nu e pe grilă începe la următorul pas", () => {
    const hours = [{ weekday: 5, opensAt: "08:10", closesAt: "12:00" }];
    expect(timesOn("2026-10-23", { businessHours: hours })[0]).toBe("08:15");
  });

  it("fără capacitate sau fără durată nu există intervale", () => {
    expect(availableSlots(input({ onlineCapacity: 0 }))).toEqual([]);
    expect(availableSlots(input({ durationMin: 0 }))).toEqual([]);
  });
});

describe("pauza de prânz", () => {
  const withLunch = [
    { weekday: 5, opensAt: "08:00", closesAt: "12:00" },
    { weekday: 5, opensAt: "13:00", closesAt: "18:00" },
  ];

  it("o programare nu trece peste pauză", () => {
    const friday = timesOn("2026-10-23", { businessHours: withLunch });
    expect(friday).toContain("11:00");
    expect(friday).not.toContain("11:15");
    expect(friday).not.toContain("12:00");
    expect(friday).not.toContain("12:30");
    expect(friday).toContain("13:00");
  });

  it("o programare lungă se termină înainte de pauză", () => {
    const friday = timesOn("2026-10-23", { businessHours: withLunch, durationMin: 105 });
    expect(friday.filter((t) => t < "12:00").at(-1)).toBe("10:15");
  });

  it("intervalele care se ating (08–12 și 12–18) sunt o singură zi continuă", () => {
    const touching = [
      { weekday: 5, opensAt: "08:00", closesAt: "12:00" },
      { weekday: 5, opensAt: "12:00", closesAt: "18:00" },
    ];
    expect(timesOn("2026-10-23", { businessHours: touching })).toContain("11:30");
  });
});

describe("zile libere și intervale blocate", () => {
  it("zi liberă (concediu)", () => {
    const closures = [{ kind: "closed" as const, dateFrom: "2026-10-23", dateTo: "2026-10-27" }];
    expect(timesOn("2026-10-23", { closures })).toEqual([]);
    expect(timesOn("2026-10-27", { closures })).toEqual([]);
    expect(timesOn("2026-10-28", { closures })).not.toEqual([]);
  });

  it("„azi nu mai iau programări online după 15:00”", () => {
    const closures = [
      {
        kind: "online_block" as const,
        startsAt: at("2026-10-23T12:00:00Z"), // 15:00 local
        endsAt: at("2026-10-23T15:00:00Z"), // 18:00 local
      },
    ];
    const friday = timesOn("2026-10-23", { closures });
    expect(friday.at(-1)).toBe("14:00");
    expect(friday).not.toContain("14:15");
  });

  it("un interval blocat la mijlocul zilei taie ziua în două", () => {
    const closures = [
      { kind: "closed" as const, startsAt: at("2026-10-23T08:00:00Z"), endsAt: at("2026-10-23T09:30:00Z") },
    ];
    const friday = timesOn("2026-10-23", { closures }); // blocat 11:00–12:30
    expect(friday).toContain("10:00");
    expect(friday).not.toContain("10:15");
    expect(friday).not.toContain("12:15");
    expect(friday).toContain("12:30");
  });
});

describe("capacitate", () => {
  // Vineri 23.10, 13:00–14:00 ora locală.
  const booking = { startsAt: at("2026-10-23T10:00:00Z"), endsAt: at("2026-10-23T11:00:00Z") };

  it("capacitate 1: o programare existentă blochează intervalele care se suprapun", () => {
    const friday = timesOn("2026-10-23", { holds: [booking] });
    expect(friday).toContain("12:00"); // se termină exact când începe cealaltă
    for (const t of ["12:15", "12:30", "12:45", "13:00", "13:30", "13:45"]) {
      expect(friday).not.toContain(t);
    }
    expect(friday).toContain("14:00");
  });

  it("capacitate 2: o singură programare nu blochează nimic", () => {
    expect(timesOn("2026-10-23", { holds: [booking], onlineCapacity: 2 })).toHaveLength(37);
  });

  it("capacitate 2: două programări suprapuse blochează doar momentul plin", () => {
    const second = { startsAt: at("2026-10-23T10:30:00Z"), endsAt: at("2026-10-23T11:30:00Z") }; // 13:30–14:30
    const friday = timesOn("2026-10-23", { holds: [booking, second], onlineCapacity: 2 });
    expect(friday).toContain("12:30"); // 12:30–13:30: cel mult una odată
    expect(friday).not.toContain("12:45"); // între 13:30 și 13:45 sunt două
    expect(friday).not.toContain("13:00");
    expect(friday).not.toContain("13:30"); // între 13:30 și 14:00 sunt două
    expect(friday).toContain("14:00"); // 14:00–15:00: doar a doua, până la 14:30
  });

  it("capacitate 2: programările una după alta nu se adună", () => {
    const holds = [
      { startsAt: at("2026-10-23T07:00:00Z"), endsAt: at("2026-10-23T08:00:00Z") }, // 10:00–11:00
      { startsAt: at("2026-10-23T08:00:00Z"), endsAt: at("2026-10-23T09:00:00Z") }, // 11:00–12:00
    ];
    // 10:30–11:30 atinge ambele, dar niciodată în același timp.
    expect(timesOn("2026-10-23", { holds, onlineCapacity: 2 })).toContain("10:30");
    expect(timesOn("2026-10-23", { holds, onlineCapacity: 1 })).not.toContain("10:30");
  });
});

describe("maxConcurrent", () => {
  const h = (start: number, end: number) => ({ startsAt: start, endsAt: end });

  it.each([
    ["fără programări", [], 0],
    ["una în interval", [h(10, 20)], 1],
    ["una după alta", [h(0, 10), h(10, 20)], 1],
    ["două suprapuse", [h(0, 15), h(10, 20)], 2],
    ["una în alta", [h(0, 100), h(10, 20), h(30, 40)], 2],
    ["toate trei odată", [h(0, 100), h(10, 50), h(20, 30)], 3],
    ["în afara intervalului", [h(-20, 0), h(100, 120)], 0],
  ] as const)("%s → %i", (_name, holds, expected) => {
    expect(maxConcurrent([...holds], 0, 100)).toBe(expected);
  });
});

describe("ora de vară / ora de iarnă", () => {
  // Un service fictiv deschis duminica noaptea, ca să cadă exact pe trecerile de oră.
  const sundayNight = [{ weekday: 7, opensAt: "00:00", closesAt: "06:00" }];
  const night = (now: string): Partial<AvailabilityInput> => ({
    now: at(now),
    minLeadMin: 0,
    slotStepMin: 60,
    durationMin: 60,
    businessHours: sundayNight,
  });

  it("25.10.2026, trecerea la ora de iarnă: ora 03 apare de două ori, ziua are 7 ore", () => {
    const slots = availableSlots(input({ ...night("2026-10-20T00:00:00Z"), onlyDate: "2026-10-25" }));
    expect(slots.map((s) => s.localTime)).toEqual(["00:00", "01:00", "02:00", "03:00", "03:00", "04:00", "05:00"]);
    expect(slots.map((s) => s.repeatedLocalTime)).toEqual([false, false, false, false, true, false, false]);
    expect(new Date(slots[3]!.startsAt).toISOString()).toBe("2026-10-25T00:00:00.000Z");
    expect(new Date(slots[4]!.startsAt).toISOString()).toBe("2026-10-25T01:00:00.000Z");
  });

  it("28.03.2027, trecerea la ora de vară: ora 03 nu există, ziua are 5 ore", () => {
    const slots = availableSlots(input({ ...night("2027-03-20T00:00:00Z"), onlyDate: "2027-03-28" }));
    expect(slots.map((s) => s.localTime)).toEqual(["00:00", "01:00", "02:00", "04:00", "05:00"]);
    expect(slots.every((s) => s.endsAt - s.startsAt === 60 * 60_000)).toBe(true);
  });

  it("o deschidere în golul orei de vară începe la momentul trecerii", () => {
    const slots = availableSlots(
      input({
        ...night("2027-03-20T00:00:00Z"),
        businessHours: [{ weekday: 7, opensAt: "03:30", closesAt: "06:00" }],
        slotStepMin: 15,
        onlyDate: "2027-03-28",
      }),
    );
    expect(slots[0]?.localTime).toBe("04:00");
    expect(new Date(slots[0]!.startsAt).toISOString()).toBe("2027-03-28T01:00:00.000Z");
  });

  it("o programare care traversează trecerea durează exact cât trebuie", () => {
    const slots = availableSlots(input({ ...night("2026-10-20T00:00:00Z"), onlyDate: "2026-10-25", slotStepMin: 30 }));
    const across = slots.find((s) => s.localTime === "03:30" && !s.repeatedLocalTime)!;
    expect(across.endsAt - across.startsAt).toBe(60 * 60_000);
  });

  it("ora 08:00 e la alt moment UTC înainte și după trecere", () => {
    const before = availableSlots(input({ onlyDate: "2026-10-23" }))[0]!;
    const after = availableSlots(input({ onlyDate: "2026-10-26" }))[0]!;
    expect(new Date(before.startsAt).toISOString()).toBe("2026-10-23T05:00:00.000Z");
    expect(new Date(after.startsAt).toISOString()).toBe("2026-10-26T06:00:00.000Z");
    expect([before.localTime, after.localTime]).toEqual(["08:00", "08:00"]);
  });
});

describe("reverificarea la confirmare", () => {
  const booking = { startsAt: at("2026-10-23T10:00:00Z"), endsAt: at("2026-10-23T11:00:00Z") };

  it("acceptă doar un interval care e încă liber și pe grilă", () => {
    const base = input({ holds: [booking] });
    expect(isSlotAvailable(base, at("2026-10-23T11:00:00Z"))).toBe(true); // 14:00
    expect(isSlotAvailable(base, at("2026-10-23T10:15:00Z"))).toBe(false); // 13:15, ocupat
    expect(isSlotAvailable(base, at("2026-10-23T11:07:00Z"))).toBe(false); // 14:07, nu e pe grilă
    expect(isSlotAvailable(base, at("2026-10-25T08:00:00Z"))).toBe(false); // duminică
    expect(isSlotAvailable(base, at("2026-12-01T08:00:00Z"))).toBe(false); // peste 30 de zile
  });

  it("un interval liber la afișare devine ocupat dacă altcineva l-a luat între timp", () => {
    const slot = at("2026-10-23T11:00:00Z");
    expect(isSlotAvailable(input(), slot)).toBe(true);
    const taken = { startsAt: slot, endsAt: slot + 60 * 60_000 };
    expect(isSlotAvailable(input({ holds: [taken] }), slot)).toBe(false);
  });
});

describe("preț + disponibilitate împreună", () => {
  it("durata din estimare decide ultima oră posibilă", () => {
    const result = estimate(
      rotiRapidPricingCatalog(),
      {
        vehicleTypeId: "suv",
        rimSizeId: null,
        rimTypeId: null,
        wheelCount: 4,
        surchargeIds: [],
        items: [{ serviceId: "pachet_complet" }, { serviceId: "geometrie_fata_spate" }],
      },
      { flow: "online", slotStepMin: 15 },
    );
    if (!result.ok) throw new Error("estimare eșuată");
    expect(result.estimate.bookedDurationMin).toBe(105);

    // Sâmbătă se închide la 17:00: 105 minute înseamnă cel târziu 15:15.
    expect(timesOn("2026-10-24", { durationMin: result.estimate.bookedDurationMin }).at(-1)).toBe("15:15");
  });
});
