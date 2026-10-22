// Calculul prețului estimativ și al duratei unei programări. Funcție pură.
// Regulile sunt descrise în planul Fazei 0, secțiunea „Algoritmul de preț”.
import { roundUpToStep } from "@/domain/time";
import type {
  Estimate,
  EstimateError,
  EstimateLine,
  EstimateResult,
  PriceCell,
  PricingCatalog,
  PricingFlow,
  PricingSelection,
  PricingService,
} from "./types";

export const MAX_WHEEL_COUNT = 10;

type ServicePrice =
  | { kind: "not_offered" }
  | {
      kind: "ok";
      unitMinBani: number | null;
      unitMaxBani: number | null;
      priceIsMinimum: boolean;
      partlyOnRequest: boolean;
      matchedCellIds: string[];
    };

export function estimate(
  catalog: PricingCatalog,
  selection: PricingSelection,
  options: { flow: PricingFlow; slotStepMin: number },
): EstimateResult {
  const fail = (error: EstimateError): EstimateResult => ({ ok: false, error });

  if (selection.items.length === 0) return fail({ code: "no_services" });
  if (
    !Number.isInteger(selection.wheelCount) ||
    selection.wheelCount < 1 ||
    selection.wheelCount > MAX_WHEEL_COUNT
  ) {
    return fail({ code: "invalid_wheel_count" });
  }
  if (!catalog.activeVehicleTypeIds.includes(selection.vehicleTypeId)) {
    return fail({ code: "unknown_vehicle_type" });
  }
  if (selection.rimSizeId !== null && !catalog.activeRimSizeIds.includes(selection.rimSizeId)) {
    return fail({ code: "unknown_rim_size" });
  }
  if (selection.rimTypeId !== null && !catalog.activeRimTypeIds.includes(selection.rimTypeId)) {
    return fail({ code: "unknown_rim_type" });
  }

  const servicesById = new Map(catalog.services.map((s) => [s.id, s]));
  const chosen: { service: PricingService; quantity: number }[] = [];
  const seen = new Set<string>();

  for (const item of selection.items) {
    if (seen.has(item.serviceId)) return fail({ code: "duplicate_service", serviceId: item.serviceId });
    seen.add(item.serviceId);

    const service = servicesById.get(item.serviceId);
    if (!service) return fail({ code: "unknown_service", serviceId: item.serviceId });
    if (!service.active) return fail({ code: "service_inactive", serviceId: service.id });
    if (options.flow === "online" && !service.bookableOnline) {
      return fail({ code: "not_bookable_online", serviceId: service.id });
    }

    const quantity = quantityFor(service, item.quantity, selection.wheelCount);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > service.maxQuantity) {
      return fail({ code: "invalid_quantity", serviceId: service.id });
    }
    chosen.push({ service, quantity });
  }

  for (const [a, b] of catalog.conflicts) {
    if (seen.has(a) && seen.has(b)) return fail({ code: "conflict", serviceId: b });
  }

  const lines: EstimateLine[] = [];
  for (const { service, quantity } of chosen) {
    const price = priceFor(service, selection, catalog);
    if (price.kind === "not_offered") return fail({ code: "not_offered", serviceId: service.id });

    const priced = price.unitMinBani !== null && price.unitMaxBani !== null;
    lines.push({
      kind: "service",
      refId: service.id,
      code: service.code,
      name: service.name,
      unit: service.unit,
      quantity,
      priceStatus: priced ? "priced" : "on_request",
      unitMinBani: price.unitMinBani,
      unitMaxBani: price.unitMaxBani,
      lineMinBani: priced ? (price.unitMinBani as number) * quantity : null,
      lineMaxBani: priced ? (price.unitMaxBani as number) * quantity : null,
      priceIsMinimum: price.priceIsMinimum,
      partlyOnRequest: price.partlyOnRequest,
      durationMin: (service.baseDurationMin ?? 0) + service.perUnitDurationMin * quantity,
      matchedCellIds: price.matchedCellIds,
    });
  }

  const surchargesById = new Map(catalog.surcharges.map((s) => [s.id, s]));
  for (const surchargeId of new Set(selection.surchargeIds)) {
    const surcharge = surchargesById.get(surchargeId);
    if (
      !surcharge ||
      !surcharge.active ||
      (options.flow === "online" && !surcharge.customerSelectable)
    ) {
      return fail({ code: "unknown_surcharge", surchargeId });
    }

    const applicable = chosen.filter((c) => surcharge.serviceIds.includes(c.service.id));
    // Bifată, dar fără niciun serviciu la care să se aplice (ex. Runflat doar cu geometrie): nu se adaugă.
    if (applicable.length === 0) continue;

    let quantity: number;
    if (surcharge.unit === "per_booking") {
      quantity = 1;
    } else if (surcharge.stacking === "once_per_wheel") {
      quantity = Math.max(...applicable.map((c) => c.quantity));
    } else {
      quantity = applicable.reduce((sum, c) => sum + c.quantity, 0);
    }

    lines.push({
      kind: "surcharge",
      refId: surcharge.id,
      code: surcharge.code,
      name: surcharge.name,
      unit: surcharge.unit,
      quantity,
      priceStatus: "priced",
      unitMinBani: surcharge.minBani,
      unitMaxBani: surcharge.maxBani,
      lineMinBani: surcharge.minBani * quantity,
      lineMaxBani: surcharge.maxBani * quantity,
      priceIsMinimum: surcharge.priceIsMinimum,
      partlyOnRequest: false,
      durationMin: 0,
      matchedCellIds: [],
    });
  }

  const workDurationMin = lines.reduce((sum, line) => sum + line.durationMin, 0);
  const result: Estimate = {
    lines,
    totalMinBani: lines.reduce((sum, line) => sum + (line.lineMinBani ?? 0), 0),
    totalMaxBani: lines.reduce((sum, line) => sum + (line.lineMaxBani ?? 0), 0),
    hasUnpriced: lines.some((line) => line.priceStatus === "on_request" || line.partlyOnRequest),
    hasMinimumOnly: lines.some((line) => line.priceIsMinimum),
    workDurationMin,
    bookedDurationMin: roundUpToStep(workDurationMin, options.slotStepMin),
    rimSizeUnknown: selection.rimSizeId === null,
    rimTypeUnknown: selection.rimTypeId === null,
  };
  return { ok: true, estimate: result };
}

function quantityFor(service: PricingService, requested: number | undefined, wheelCount: number): number {
  switch (service.unit) {
    case "wheel":
      return requested ?? wheelCount;
    case "piece":
      return requested ?? service.defaultQuantity ?? 1;
    case "service":
      return 1;
  }
}

function priceFor(
  service: PricingService,
  selection: PricingSelection,
  catalog: PricingCatalog,
): ServicePrice {
  const onRequest: ServicePrice = {
    kind: "ok",
    unitMinBani: null,
    unitMaxBani: null,
    priceIsMinimum: false,
    partlyOnRequest: false,
    matchedCellIds: [],
  };

  if (service.pricingMode === "on_request") return onRequest;

  let candidates: PriceCell[];
  if (service.pricingMode === "fixed" || service.pricingMode === "range") {
    candidates = service.prices.filter(
      (c) => c.vehicleTypeId === null && c.rimSizeId === null && c.rimTypeId === null,
    );
  } else {
    candidates = service.prices.filter(
      (c) =>
        matches(service.byVehicle, c.vehicleTypeId, selection.vehicleTypeId, catalog.activeVehicleTypeIds) &&
        matches(service.byRimSize, c.rimSizeId, selection.rimSizeId, catalog.activeRimSizeIds) &&
        matches(service.byRimType, c.rimTypeId, selection.rimTypeId, catalog.activeRimTypeIds),
    );
  }

  // Combinația nu există în tabel: „preț stabilit în service”.
  if (candidates.length === 0) return onRequest;
  if (candidates.every((c) => c.status === "not_offered")) return { kind: "not_offered" };

  const priced = candidates.filter(
    (c): c is PriceCell & { minBani: number; maxBani: number } =>
      c.status === "priced" && c.minBani !== null && c.maxBani !== null,
  );
  const someOnRequest = candidates.some((c) => c.status === "on_request");
  if (priced.length === 0) return { ...onRequest, matchedCellIds: candidates.map((c) => c.id) };

  return {
    kind: "ok",
    unitMinBani: Math.min(...priced.map((c) => c.minBani)),
    unitMaxBani: Math.max(...priced.map((c) => c.maxBani)),
    priceIsMinimum: priced.some((c) => c.priceIsMinimum),
    partlyOnRequest: someOnRequest,
    matchedCellIds: priced.map((c) => c.id),
  };
}

/**
 * O celulă se potrivește pe o dimensiune dacă:
 * - serviciul nu depinde de dimensiune și celula nu o are;
 * - clientul a ales o valoare și celula are exact acea valoare;
 * - clientul a ales „nu știu” și celula are oricare valoare activă.
 */
function matches(
  usesDimension: boolean,
  cellValue: string | null,
  selected: string | null,
  activeIds: string[],
): boolean {
  if (!usesDimension) return cellValue === null;
  if (cellValue === null) return false;
  if (selected === null) return activeIds.includes(cellValue);
  return cellValue === selected;
}
