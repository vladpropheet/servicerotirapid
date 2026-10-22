import { describe, expect, it } from "vitest";
import {
  describeLine,
  describeTotal,
  estimate,
  type Estimate,
  type EstimateErrorCode,
  type EstimateResult,
  type PricingCatalog,
  type PricingFlow,
  type PricingSelection,
} from "@/domain/pricing";
import { rotiRapidPricingCatalog } from "../helpers/pricing-catalog";

const STEP = 15;

function select(overrides: Partial<PricingSelection> & Pick<PricingSelection, "items">): PricingSelection {
  return {
    vehicleTypeId: "autoturism",
    rimSizeId: "12-16",
    rimTypeId: "aliaj",
    wheelCount: 4,
    surchargeIds: [],
    ...overrides,
  };
}

function run(
  selection: PricingSelection,
  catalog: PricingCatalog = rotiRapidPricingCatalog(),
  flow: PricingFlow = "online",
): EstimateResult {
  return estimate(catalog, selection, { flow, slotStepMin: STEP });
}

function ok(selection: PricingSelection, catalog?: PricingCatalog, flow?: PricingFlow): Estimate {
  const result = run(selection, catalog, flow);
  if (!result.ok) throw new Error(`Eroare neașteptată: ${JSON.stringify(result.error)}`);
  return result.estimate;
}

function line(e: Estimate, code: string) {
  const found = e.lines.find((l) => l.code === code);
  if (!found) throw new Error(`Lipsește linia ${code}`);
  return found;
}

describe("exemplul din plan", () => {
  it("SUV, mărime și tip jantă „nu știu”, 4 roți, Runflat, pachet complet + geometrie față+spate", () => {
    const e = ok(
      select({
        vehicleTypeId: "suv",
        rimSizeId: null,
        rimTypeId: null,
        surchargeIds: ["runflat"],
        items: [{ serviceId: "pachet_complet" }, { serviceId: "geometrie_fata_spate" }],
      }),
    );

    expect(line(e, "pachet_complet")).toMatchObject({ quantity: 4, lineMinBani: 20000, lineMaxBani: 36000 });
    expect(line(e, "geometrie_fata_spate")).toMatchObject({ quantity: 1, lineMinBani: 27000, lineMaxBani: 27000 });
    expect(line(e, "runflat")).toMatchObject({ kind: "surcharge", quantity: 4, lineMinBani: 4000 });
    expect(e).toMatchObject({
      totalMinBani: 51000,
      totalMaxBani: 67000,
      hasUnpriced: false,
      workDurationMin: 103,
      bookedDurationMin: 105,
      rimSizeUnknown: true,
      rimTypeUnknown: true,
    });
    expect(describeTotal(e)).toBe("Între 510 și 670 lei");
  });
});

describe("prețul unui serviciu", () => {
  it("combinație exactă din matrice", () => {
    const e = ok(select({ items: [{ serviceId: "pachet_complet" }] }));
    expect(e).toMatchObject({ totalMinBani: 18000, totalMaxBani: 18000, bookedDurationMin: 60 });
    expect(describeTotal(e)).toBe("180 lei");
  });

  it("preț fix", () => {
    const e = ok(select({ items: [{ serviceId: "geometrie_off_road" }] }));
    expect(e).toMatchObject({ totalMinBani: 18000, totalMaxBani: 18000, bookedDurationMin: 45 });
  });

  it("preț după vehicul", () => {
    const e = ok(select({ vehicleTypeId: "autoutilitara", items: [{ serviceId: "geometrie_punte_fata" }] }));
    expect(e.totalMinBani).toBe(18000);
  });

  it("interval de preț, pe bucată", () => {
    const one = ok(select({ items: [{ serviceId: "indreptat_janta_aliaj" }] }));
    expect(one).toMatchObject({ totalMinBani: 10000, totalMaxBani: 15000, bookedDurationMin: 60 });
    expect(describeTotal(one)).toBe("Între 100 și 150 lei");

    const two = ok(select({ items: [{ serviceId: "indreptat_janta_aliaj", quantity: 2 }] }));
    expect(two).toMatchObject({ totalMinBani: 20000, totalMaxBani: 30000, bookedDurationMin: 120 });
  });

  it("numărul de roți schimbă prețul și durata", () => {
    const e = ok(select({ wheelCount: 2, items: [{ serviceId: "montat_demontat_roata" }] }));
    expect(e).toMatchObject({ totalMinBani: 4000, workDurationMin: 20, bookedDurationMin: 30 });
  });

  it("echilibrat depinde doar de vehicul și tipul jantei", () => {
    const aliaj = ok(select({ rimSizeId: "19", items: [{ serviceId: "echilibrat" }] }));
    expect(aliaj.totalMinBani).toBe(8000);
    const unknownType = ok(select({ rimTypeId: null, items: [{ serviceId: "echilibrat" }] }));
    expect(unknownType).toMatchObject({ totalMinBani: 6000, totalMaxBani: 8000 });
  });

  it("sumele sunt mereu bani întregi", () => {
    const e = ok(select({ vehicleTypeId: "autoutilitara", rimSizeId: null, items: [{ serviceId: "pachet_complet" }] }));
    expect(Number.isInteger(e.totalMinBani)).toBe(true);
    expect(Number.isInteger(e.totalMaxBani)).toBe(true);
  });
});

describe("„nu știu” și celulele lipsă", () => {
  it("combinația care nu există în tabel → „preț stabilit în service”", () => {
    const e = ok(select({ rimSizeId: "17", rimTypeId: "tabla", items: [{ serviceId: "pachet_complet" }] }));
    expect(line(e, "pachet_complet")).toMatchObject({ priceStatus: "on_request", lineMinBani: null });
    expect(e).toMatchObject({ totalMinBani: 0, hasUnpriced: true, bookedDurationMin: 60 });
    expect(describeTotal(e)).toBe("Preț stabilit în service");
  });

  it("celula goală pe afiș → „preț stabilit în service”", () => {
    const e = ok(
      select({ vehicleTypeId: "autoutilitara", rimSizeId: "20", items: [{ serviceId: "pachet_complet" }] }),
    );
    expect(line(e, "pachet_complet").priceStatus).toBe("on_request");
  });

  it("„nu știu mărimea” dă intervalul pe mărimile cu preț și semnalează restul", () => {
    const e = ok(
      select({ vehicleTypeId: "autoutilitara", rimSizeId: null, items: [{ serviceId: "pachet_complet" }] }),
    );
    const pachet = line(e, "pachet_complet");
    expect(pachet).toMatchObject({
      priceStatus: "priced",
      unitMinBani: 6000,
      unitMaxBani: 6500,
      lineMinBani: 24000,
      lineMaxBani: 26000,
      partlyOnRequest: true,
    });
    expect(e.hasUnpriced).toBe(true);
    expect(describeLine(pachet)).toBe("Între 240 și 260 lei (pentru unele mărimi: preț stabilit în service)");
    expect(describeTotal(e)).toBe("Între 240 și 260 lei + unele lucrări: preț stabilit în service");
  });

  it("„nu știu” ignoră combinațiile care nu există (jantă tablă 17\"+)", () => {
    const e = ok(select({ rimSizeId: null, rimTypeId: "tabla", items: [{ serviceId: "pachet_complet" }] }));
    expect(line(e, "pachet_complet")).toMatchObject({ unitMinBani: 4000, unitMaxBani: 4000, partlyOnRequest: false });
  });

  it("„nu știu” folosește doar mărimile active", () => {
    const catalog = rotiRapidPricingCatalog();
    catalog.activeRimSizeIds = catalog.activeRimSizeIds.filter((id) => id !== "22");
    const e = ok(select({ vehicleTypeId: "suv", rimSizeId: null, rimTypeId: null, items: [{ serviceId: "pachet_complet" }] }), catalog);
    expect(line(e, "pachet_complet").unitMaxBani).toBe(8500);
  });

  it("combinația marcată „nu facem” blochează serviciul, dar nu și „nu știu”", () => {
    const catalog = rotiRapidPricingCatalog();
    const pachet = catalog.services.find((s) => s.id === "pachet_complet")!;
    const cell = pachet.prices.find((c) => c.vehicleTypeId === "autoturism" && c.rimSizeId === "17")!;
    Object.assign(cell, { status: "not_offered", minBani: null, maxBani: null });

    expect(run(select({ rimSizeId: "17", items: [{ serviceId: "pachet_complet" }] }), catalog)).toEqual({
      ok: false,
      error: { code: "not_offered", serviceId: "pachet_complet" },
    });
    const unknown = ok(select({ rimSizeId: null, items: [{ serviceId: "pachet_complet" }] }), catalog);
    expect(line(unknown, "pachet_complet").priceStatus).toBe("priced");
  });
});

describe("suprataxe", () => {
  it("Runflat se ia o singură dată pe roată, chiar dacă se aplică la două servicii", () => {
    const e = ok(
      select({
        surchargeIds: ["runflat"],
        items: [{ serviceId: "schimb_anvelopa" }, { serviceId: "echilibrat" }],
      }),
    );
    expect(line(e, "runflat")).toMatchObject({ quantity: 4, lineMinBani: 4000 });
  });

  it("cu regula „la fiecare serviciu”, Runflat se ia pentru fiecare serviciu", () => {
    const catalog = rotiRapidPricingCatalog();
    catalog.surcharges.find((s) => s.id === "runflat")!.stacking = "per_item";
    const e = ok(
      select({ surchargeIds: ["runflat"], items: [{ serviceId: "schimb_anvelopa" }, { serviceId: "echilibrat" }] }),
      catalog,
    );
    expect(line(e, "runflat")).toMatchObject({ quantity: 8, lineMinBani: 8000 });
  });

  it("suprataxa bifată, dar fără serviciu la care să se aplice, nu apare", () => {
    const e = ok(select({ surchargeIds: ["runflat"], items: [{ serviceId: "geometrie_punte_fata" }] }));
    expect(e.lines.map((l) => l.code)).toEqual(["geometrie_punte_fata"]);
    expect(e.totalMinBani).toBe(14000);
  });

  it("suprataxa „de la” face totalul „de la”", () => {
    const e = ok(select({ surchargeIds: ["offroad_montaj_special"], items: [{ serviceId: "pachet_complet" }] }));
    expect(line(e, "offroad_montaj_special")).toMatchObject({ lineMinBani: 8000, priceIsMinimum: true });
    expect(e).toMatchObject({ totalMinBani: 26000, hasMinimumOnly: true });
    expect(describeTotal(e)).toBe("De la 260 lei");
  });

  it("aceeași suprataxă bifată de două ori se numără o dată", () => {
    const e = ok(select({ surchargeIds: ["runflat", "runflat"], items: [{ serviceId: "pachet_complet" }] }));
    expect(e.lines.filter((l) => l.code === "runflat")).toHaveLength(1);
  });

  it("suprataxa ascunsă clienților se poate folosi doar de patron", () => {
    const catalog = rotiRapidPricingCatalog();
    catalog.surcharges.find((s) => s.id === "offroad_montaj_special")!.customerSelectable = false;
    const selection = select({ surchargeIds: ["offroad_montaj_special"], items: [{ serviceId: "pachet_complet" }] });
    expect(run(selection, catalog, "online")).toMatchObject({ ok: false, error: { code: "unknown_surcharge" } });
    expect(run(selection, catalog, "admin").ok).toBe(true);
  });
});

describe("durate combinate", () => {
  it("se adună duratele serviciilor, apoi se rotunjește la pas", () => {
    const e = ok(
      select({ items: [{ serviceId: "pachet_complet" }, { serviceId: "geometrie_punte_fata" }] }),
    );
    expect(e).toMatchObject({ workDurationMin: 73, bookedDurationMin: 75 });
  });

  it("serviciile fără programare online au durată 0 când le adaugă patronul", () => {
    const e = ok(select({ items: [{ serviceId: "snur" }] }), undefined, "admin");
    expect(e).toMatchObject({ totalMinBani: 16000, workDurationMin: 0, bookedDurationMin: 0 });
  });
});

type InvalidCase = [Partial<PricingSelection> & Pick<PricingSelection, "items">, EstimateErrorCode];

describe("validări", () => {
  it.each<InvalidCase>([
    [{ items: [] }, "no_services"],
    [{ items: [{ serviceId: "pachet_complet" }, { serviceId: "pachet_complet" }] }, "duplicate_service"],
    [{ items: [{ serviceId: "nu_exista" }] }, "unknown_service"],
    [{ items: [{ serviceId: "polish_faruri" }] }, "service_inactive"],
    [{ items: [{ serviceId: "snur" }] }, "not_bookable_online"],
    [{ items: [{ serviceId: "indreptat_janta_aliaj", quantity: 11 }] }, "invalid_quantity"],
    [{ items: [{ serviceId: "indreptat_janta_aliaj", quantity: 0 }] }, "invalid_quantity"],
    [{ wheelCount: 0, items: [{ serviceId: "pachet_complet" }] }, "invalid_wheel_count"],
    [{ wheelCount: 11, items: [{ serviceId: "pachet_complet" }] }, "invalid_wheel_count"],
    [{ vehicleTypeId: "tractor", items: [{ serviceId: "pachet_complet" }] }, "unknown_vehicle_type"],
    [{ rimSizeId: "23", items: [{ serviceId: "pachet_complet" }] }, "unknown_rim_size"],
    [{ rimTypeId: "carbon", items: [{ serviceId: "pachet_complet" }] }, "unknown_rim_type"],
    [{ surchargeIds: ["nu_exista"], items: [{ serviceId: "pachet_complet" }] }, "unknown_surcharge"],
  ])("%j → %s", (overrides, code) => {
    const result = run(select(overrides));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
  });

  it("refuză combinațiile de servicii incompatibile", () => {
    const catalog = rotiRapidPricingCatalog();
    catalog.conflicts = [["pachet_complet", "echilibrat"]];
    const result = run(
      select({ items: [{ serviceId: "pachet_complet" }, { serviceId: "echilibrat" }] }),
      catalog,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "conflict" } });
  });
});
