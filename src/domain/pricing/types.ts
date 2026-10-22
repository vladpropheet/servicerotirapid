import type {
  PriceStatus,
  PricingMode,
  ServiceUnit,
  SurchargeStacking,
  SurchargeUnit,
} from "@/domain/enums";
import type { Bani } from "@/domain/money";

// Datele de catalog de care are nevoie calculul. Se încarcă din baza de date (un tenant)
// și se dau funcției pure `estimate`, care nu atinge baza de date.

export type PriceCell = {
  id: string;
  vehicleTypeId: string | null;
  rimSizeId: string | null;
  rimTypeId: string | null;
  status: PriceStatus;
  minBani: Bani | null;
  maxBani: Bani | null;
  priceIsMinimum: boolean;
};

export type PricingService = {
  id: string;
  code: string;
  name: string;
  unit: ServiceUnit;
  pricingMode: PricingMode;
  byVehicle: boolean;
  byRimSize: boolean;
  byRimType: boolean;
  baseDurationMin: number | null;
  perUnitDurationMin: number;
  bookableOnline: boolean;
  active: boolean;
  defaultQuantity: number | null;
  maxQuantity: number;
  prices: PriceCell[];
};

export type PricingSurcharge = {
  id: string;
  code: string;
  name: string;
  unit: SurchargeUnit;
  minBani: Bani;
  maxBani: Bani;
  priceIsMinimum: boolean;
  stacking: SurchargeStacking;
  customerSelectable: boolean;
  active: boolean;
  /** Serviciile la care se aplică. */
  serviceIds: string[];
};

export type PricingCatalog = {
  services: PricingService[];
  surcharges: PricingSurcharge[];
  /** Doar valorile active; „nu știu” se potrivește cu oricare dintre ele. */
  activeVehicleTypeIds: string[];
  activeRimSizeIds: string[];
  activeRimTypeIds: string[];
  /** Perechi de servicii care nu se pot alege împreună. */
  conflicts: [string, string][];
};

/** Ce a ales clientul (sau patronul). `null` la jantă = „nu știu”. */
export type PricingSelection = {
  vehicleTypeId: string;
  rimSizeId: string | null;
  rimTypeId: string | null;
  wheelCount: number;
  surchargeIds: string[];
  items: { serviceId: string; quantity?: number }[];
};

/** online = formularul public (doar servicii programabile online); admin = programare adăugată de patron. */
export type PricingFlow = "online" | "admin";

export type EstimateLine = {
  kind: "service" | "surcharge";
  refId: string;
  code: string;
  name: string;
  unit: ServiceUnit | SurchargeUnit;
  quantity: number;
  /** on_request = „preț stabilit în service”. */
  priceStatus: "priced" | "on_request";
  unitMinBani: Bani | null;
  unitMaxBani: Bani | null;
  lineMinBani: Bani | null;
  lineMaxBani: Bani | null;
  /** Prețul e minim („de la X lei”). */
  priceIsMinimum: boolean;
  /** La „nu știu mărimea”, unele mărimi au „preț stabilit în service”. */
  partlyOnRequest: boolean;
  durationMin: number;
  /** Ce celule de preț s-au folosit (se salvează la programare). */
  matchedCellIds: string[];
};

export type Estimate = {
  lines: EstimateLine[];
  totalMinBani: Bani;
  totalMaxBani: Bani;
  /** Cel puțin o linie (sau o parte din ea) are „preț stabilit în service”. */
  hasUnpriced: boolean;
  /** Există o linie cu „de la X lei”: totalul maxim nu e sigur. */
  hasMinimumOnly: boolean;
  /** Durata de lucru, suma pe servicii. */
  workDurationMin: number;
  /** Durata rezervată în calendar: durata de lucru rotunjită în sus la pasul intervalelor. */
  bookedDurationMin: number;
  rimSizeUnknown: boolean;
  rimTypeUnknown: boolean;
};

export type EstimateErrorCode =
  | "no_services"
  | "duplicate_service"
  | "unknown_service"
  | "service_inactive"
  | "not_bookable_online"
  | "not_offered"
  | "conflict"
  | "invalid_quantity"
  | "invalid_wheel_count"
  | "unknown_vehicle_type"
  | "unknown_rim_size"
  | "unknown_rim_type"
  | "unknown_surcharge";

export type EstimateError = { code: EstimateErrorCode; serviceId?: string; surchargeId?: string };

export type EstimateResult = { ok: true; estimate: Estimate } | { ok: false; error: EstimateError };
