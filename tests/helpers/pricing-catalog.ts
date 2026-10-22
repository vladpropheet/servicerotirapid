import type { PricingCatalog } from "@/domain/pricing";
import { mapCatalog, type SeedPlan } from "@/server/seed/map-catalog";
import { loadCatalog } from "./catalog";

/**
 * Catalogul de prețuri al lui Roți Rapid, construit din catalogul real de pornire.
 * Id-urile sunt chiar codurile (ex. `pachet_complet`, `suv`, `12-16`), ca testele să fie ușor de citit.
 */
export function rotiRapidPricingCatalog(): PricingCatalog {
  return pricingCatalogFromPlan(mapCatalog(loadCatalog(), { slug: "roti-rapid" }));
}

export function pricingCatalogFromPlan(plan: SeedPlan): PricingCatalog {
  return {
    services: plan.services.map((s) => ({
      id: s.code,
      code: s.code,
      name: s.name,
      unit: s.unit,
      pricingMode: s.pricingMode,
      byVehicle: s.byVehicle ?? false,
      byRimSize: s.byRimSize ?? false,
      byRimType: s.byRimType ?? false,
      baseDurationMin: s.baseDurationMin ?? null,
      perUnitDurationMin: s.perUnitDurationMin ?? 0,
      bookableOnline: s.bookableOnline ?? false,
      active: s.active ?? true,
      defaultQuantity: s.defaultQuantity ?? null,
      maxQuantity: s.maxQuantity ?? 10,
      prices: plan.prices
        .filter((p) => p.serviceCode === s.code)
        .map((p) => ({
          id: [p.serviceCode, p.vehicleTypeCode, p.rimSizeCode, p.rimTypeCode].join(":"),
          vehicleTypeId: p.vehicleTypeCode,
          rimSizeId: p.rimSizeCode,
          rimTypeId: p.rimTypeCode,
          status: p.status,
          minBani: p.minBani,
          maxBani: p.maxBani,
          priceIsMinimum: p.priceIsMinimum,
        })),
    })),
    surcharges: plan.surcharges.map((s) => ({
      id: s.code,
      code: s.code,
      name: s.name,
      unit: s.unit,
      minBani: s.minBani,
      maxBani: s.maxBani,
      priceIsMinimum: s.priceIsMinimum ?? false,
      stacking: s.stacking ?? "once_per_wheel",
      customerSelectable: s.customerSelectable ?? true,
      active: s.active ?? true,
      serviceIds: plan.surchargeServices
        .filter((link) => link.surchargeCode === s.code)
        .map((link) => link.serviceCode),
    })),
    activeVehicleTypeIds: plan.vehicleTypes.map((v) => v.code),
    activeRimSizeIds: plan.rimSizes.map((r) => r.code),
    activeRimTypeIds: plan.rimTypes.map((r) => r.code),
    conflicts: [],
  };
}
