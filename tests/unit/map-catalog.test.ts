import { describe, expect, it } from "vitest";
import { mapCatalog, slugify, type PriceSeed, type SeedPlan } from "@/server/seed/map-catalog";
import { loadCatalog } from "../helpers/catalog";

const plan: SeedPlan = mapCatalog(loadCatalog(), { slug: "roti-rapid" });

function service(code: string) {
  const found = plan.services.find((s) => s.code === code);
  if (!found) throw new Error(`Lipsește serviciul ${code}`);
  return found;
}

function cell(
  serviceCode: string,
  vehicleTypeCode: string | null,
  rimSizeCode: string | null = null,
  rimTypeCode: string | null = null,
): PriceSeed | undefined {
  return plan.prices.find(
    (p) =>
      p.serviceCode === serviceCode &&
      p.vehicleTypeCode === vehicleTypeCode &&
      p.rimSizeCode === rimSizeCode &&
      p.rimTypeCode === rimTypeCode,
  );
}

describe("datele firmei", () => {
  it("normalizează telefonul și marchează câmpurile lipsă", () => {
    expect(plan.tenant.slug).toBe("roti-rapid");
    expect(plan.tenant.displayName).toBe("Service Roți Rapid");
    expect(plan.tenant.publicPhone).toBe("+40766777130");
    expect(plan.tenant.registeredAddress).toBeNull();
    expect(plan.tenant.reviewFields).toEqual(
      expect.arrayContaining(["display_name", "registered_address", "email", "retention_months"]),
    );
  });
});

describe("dimensiuni", () => {
  it("creează mărimile de jantă ca intervale în inch", () => {
    expect(plan.rimSizes[0]).toMatchObject({ code: "12-16", label: "R12–R16", inchMin: 12, inchMax: 16 });
    expect(plan.rimSizes.find((r) => r.code === "22")).toMatchObject({ inchMin: 22, inchMax: 22 });
    expect(plan.vehicleTypes.map((v) => v.code)).toEqual(["autoturism", "suv", "autoutilitara"]);
    expect(plan.rimTypes.map((r) => r.code)).toEqual(["tabla", "aliaj"]);
  });
});

describe("servicii", () => {
  it("include serviciile din catalog și pe cele de pe fațadă (inactive)", () => {
    expect(plan.services).toHaveLength(25 + 7);
    const facade = plan.services.filter((s) => s.active === false);
    expect(facade).toHaveLength(7);
    for (const s of facade) {
      expect(s).toMatchObject({ pricingMode: "on_request", bookableOnline: false, needsReview: true });
    }
    expect(service("incarcare_cu_freon_ac").name).toBe("Încărcare cu freon (AC)");
  });

  it("orice serviciu programabil online are o durată", () => {
    for (const s of plan.services.filter((x) => x.bookableOnline)) {
      expect(s.baseDurationMin, s.code).not.toBeNull();
      expect((s.baseDurationMin ?? 0) + (s.perUnitDurationMin ?? 0), s.code).toBeGreaterThan(0);
    }
  });

  it("folosește duratele confirmate fără marcaj și estimările cu marcaj", () => {
    expect(service("geometrie_punte_fata")).toMatchObject({ baseDurationMin: 15, durationNeedsReview: false });
    expect(service("geometrie_fata_spate")).toMatchObject({ baseDurationMin: 45, durationNeedsReview: false });
    expect(service("pachet_complet")).toMatchObject({
      baseDurationMin: 10,
      perUnitDurationMin: 12,
      durationNeedsReview: true,
    });
    expect(service("schimb_anvelopa")).toMatchObject({ baseDurationMin: 10, perUnitDurationMin: 10 });
    expect(service("indreptat_janta_aliaj")).toMatchObject({ baseDurationMin: 0, perUnitDurationMin: 60 });
  });

  it("mapează unitățile și modurile de preț", () => {
    expect(service("pachet_complet")).toMatchObject({
      unit: "wheel",
      pricingMode: "matrix",
      byVehicle: true,
      byRimSize: true,
      byRimType: true,
    });
    expect(service("echilibrat")).toMatchObject({ byVehicle: true, byRimSize: false, byRimType: true });
    expect(service("geometrie_off_road")).toMatchObject({ unit: "service", pricingMode: "fixed" });
    expect(service("indreptat_janta_aliaj")).toMatchObject({ unit: "piece", pricingMode: "range", defaultQuantity: 1 });
  });

  it("explică diferența dintre schimb roți complete și pachet complet", () => {
    expect(service("montat_demontat_roata").customerExplainer).toMatch(/roțile complete/);
    expect(service("pachet_complet").customerExplainer).toMatch(/aceleași jante/);
  });

  it("marchează valorile neconfirmate și pe cele suspecte", () => {
    expect(service("montat_demontat_roata").needsReview).toBe(true);
    expect(service("petic_radial").needsReview).toBe(true);
    expect(service("indreptat_janta_tabla")).toMatchObject({ needsReview: true });
    expect(service("indreptat_janta_tabla").reviewNote).toMatch(/10 sau 100/);
    expect(service("deblocare_bieleta")).toMatchObject({
      needsReview: false,
      description: "Supliment, se adaugă la service dacă e nevoie.",
    });
  });
});

describe("prețuri", () => {
  it("transformă lei în bani", () => {
    expect(cell("geometrie_punte_fata", "suv")).toMatchObject({ status: "priced", minBani: 16000, maxBani: 16000 });
    expect(cell("presiune_aer", "autoutilitara")).toMatchObject({ minBani: 250, maxBani: 250 });
    expect(cell("geometrie_off_road", null)).toMatchObject({ minBani: 18000, maxBani: 18000 });
    expect(cell("indreptat_janta_aliaj", null)).toMatchObject({ minBani: 10000, maxBani: 15000 });
  });

  it("pune coloana 13–16 de pe afiș în mărimea 12–16, cu notă", () => {
    expect(cell("pachet_complet", "autoturism", "12-16", "tabla")).toMatchObject({
      minBani: 4000,
      needsReview: true,
      sourceNote: expect.stringMatching(/13–16/),
    });
    expect(cell("montat_demontat_roata", "suv", "12-16")).toMatchObject({ minBani: 2500, needsReview: true });
    expect(cell("schimb_anvelopa", "autoturism", "12-16")).toMatchObject({ minBani: 2000, needsReview: false });
  });

  it("nu creează combinațiile care lipsesc din catalog", () => {
    expect(cell("pachet_complet", "autoturism", "17", "tabla")).toBeUndefined();
    expect(cell("pachet_complet", "autoturism", "17", "aliaj")).toMatchObject({ minBani: 5500 });
  });

  it("transformă celulele goale în „preț stabilit în service”", () => {
    expect(cell("pachet_complet", "autoutilitara", "20", "aliaj")).toMatchObject({
      status: "on_request",
      minBani: null,
      needsReview: true,
    });
    expect(cell("geometrie_punte_spate", "autoutilitara")).toMatchObject({ status: "on_request" });
    // Valorile ghicite din notă nu devin prețuri publice.
    expect(cell("petic_radial", "autoturism", "17")).toMatchObject({ status: "on_request" });
  });

  it("transformă „5 / 10” într-un interval marcat de verificat", () => {
    expect(cell("jet_apa_degresare", "autoturism")).toMatchObject({
      status: "priced",
      minBani: 500,
      maxBani: 1000,
      needsReview: true,
    });
    expect(cell("jet_apa_degresare", "autoutilitara")).toMatchObject({ minBani: 1000, maxBani: 1000 });
  });

  it("fiecare celulă folosește exact dimensiunile serviciului ei", () => {
    for (const price of plan.prices) {
      const s = service(price.serviceCode);
      expect(price.vehicleTypeCode !== null, price.serviceCode).toBe(Boolean(s.byVehicle));
      expect(price.rimSizeCode !== null, price.serviceCode).toBe(Boolean(s.byRimSize));
      expect(price.rimTypeCode !== null, price.serviceCode).toBe(Boolean(s.byRimType));
    }
  });

  it("nu are celule duplicate", () => {
    const keys = plan.prices.map((p) =>
      [p.serviceCode, p.vehicleTypeCode, p.rimSizeCode, p.rimTypeCode].join("|"),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("suprataxe, program, setări", () => {
  it("creează suprataxele pe roată și legăturile lor", () => {
    expect(plan.surcharges.find((s) => s.code === "runflat")).toMatchObject({
      unit: "per_wheel",
      minBani: 1000,
      priceIsMinimum: false,
      stacking: "once_per_wheel",
    });
    expect(plan.surcharges.find((s) => s.code === "offroad_montaj_special")).toMatchObject({
      minBani: 2000,
      priceIsMinimum: true,
    });
    expect(plan.surchargeServices.filter((l) => l.surchargeCode === "runflat")).toHaveLength(7);
  });

  it("creează programul de luni până sâmbătă, duminica închis", () => {
    expect(plan.businessHours).toHaveLength(6);
    expect(plan.businessHours.find((h) => h.weekday === 6)).toMatchObject({ opensAt: "08:00", closesAt: "17:00" });
    expect(plan.businessHours.some((h) => h.weekday === 7)).toBe(false);
  });

  it("preia setările de programare", () => {
    expect(plan.settings).toMatchObject({
      onlineCapacity: 1,
      slotStepMin: 15,
      minLeadMin: 120,
      maxDaysAhead: 30,
      confirmationMode: "auto",
      manualBookingsUseCapacity: false,
      reminderHoursBefore: 24,
    });
  });

  it("propune texte SMS fără diacritice, de verificat", () => {
    expect(plan.smsTemplates).toHaveLength(6);
    for (const t of plan.smsTemplates) {
      expect(t.body).not.toMatch(/[ăâîșțĂÂÎȘȚ]/);
      expect(t.needsReview).toBe(true);
    }
  });
});

describe("erori în catalog", () => {
  it("oprește seed-ul la o mărime de jantă necunoscută", () => {
    const broken = loadCatalog() as { servicii: { id: string; preturi?: Record<string, Record<string, unknown>> }[] };
    const svc = broken.servicii.find((s) => s.id === "schimb_anvelopa");
    svc!.preturi!.autoturism!["23"] = 60;
    expect(() => mapCatalog(broken, { slug: "x-test" })).toThrow(/23/);
  });

  it("oprește seed-ul la un preț de neînțeles", () => {
    const broken = loadCatalog() as { servicii: { id: string; preturi?: Record<string, unknown> }[] };
    broken.servicii.find((s) => s.id === "presiune_aer")!.preturi!.suv = "gratis";
    expect(() => mapCatalog(broken, { slug: "x-test" })).toThrow(/gratis/);
  });

  it("oprește seed-ul la o suprataxă pentru un serviciu inexistent", () => {
    const broken = loadCatalog() as { suprataxe_pe_roata: { se_aplica_la: string[] }[] };
    broken.suprataxe_pe_roata[0]!.se_aplica_la.push("nu_exista");
    expect(() => mapCatalog(broken, { slug: "x-test" })).toThrow(/nu_exista/);
  });
});

describe("slugify", () => {
  it("elimină diacriticele și semnele", () => {
    expect(slugify("Încărcare cu freon (AC)")).toBe("incarcare_cu_freon_ac");
    expect(slugify("Curățare tapițerie auto")).toBe("curatare_tapiterie_auto");
  });
});
