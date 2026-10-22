// Transformă catalogul de pornire (data/seed/catalog-servicii.json) într-un plan de inserare.
// Funcție pură: nu atinge baza de date, deci se poate testa complet.
//
// Regulile pentru valorile ciudate din catalog sunt descrise în planul Fazei 0
// („Cum mapez ciudățeniile din catalog”).
import { z } from "zod";
import type { PriceStatus, ServiceUnit, SmsTemplateKind } from "@/domain/enums";
import { leiToBani } from "@/domain/money";
import { normalizeRoPhone } from "@/lib/validation/phone";
import type { bookingSettings, services, surcharges, tenants } from "@/server/db/schema";

// ---------------------------------------------------------------------------
// Formatul catalogului (validat, ca o greșeală în JSON să oprească seed-ul)
// ---------------------------------------------------------------------------

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const interval = z.object({ de_la: hhmm, pana_la: hhmm });
const idName = z.object({ id: z.string().min(1), nume: z.string().min(1) });
const dimension = z.enum(["tip_vehicul", "marime_janta", "tip_janta"]);

const catalogServiceSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  categorie: z.string(),
  nume: z.string().min(1),
  include: z.string().optional(),
  unitate: z.enum(["roată", "bucată", "serviciu"]),
  programabil_online: z.boolean(),
  durata_min: z.number().int().positive().optional(),
  durata_nota: z.string().optional(),
  pret_dupa: z.array(dimension).min(1).optional(),
  preturi: z.unknown().optional(),
  pret_fix: z.number().nonnegative().optional(),
  pret_interval: z.object({ min: z.number().nonnegative(), max: z.number().nonnegative() }).optional(),
  de_confirmat: z.boolean().optional(),
  nota_confirmare: z.string().optional(),
  nota: z.string().optional(),
});

const catalogSchema = z.object({
  firma: z.object({
    nume_afisat: z.string().min(1),
    denumire_legala: z.string().min(1),
    cui: z.string().min(1),
    nr_reg_com: z.string().min(1),
    adresa_punct_lucru: z.string().min(1),
    adresa_sediu_social: z.string().nullable(),
    telefon_public: z.string(),
    email: z.string().nullable(),
    program: z.object({
      sursa: z.string(),
      luni: z.array(interval),
      marti: z.array(interval),
      miercuri: z.array(interval),
      joi: z.array(interval),
      vineri: z.array(interval),
      sambata: z.array(interval),
      duminica: z.array(interval),
    }),
  }),
  dimensiuni: z.object({
    tipuri_vehicul: z.array(idName).min(1),
    marimi_janta: z.array(z.string().regex(/^\d{2}(-\d{2})?$/)).min(1),
    tipuri_janta: z.array(idName).min(1),
  }),
  suprataxe_pe_roata: z.array(
    z.object({
      id: z.string().regex(/^[a-z0-9_]+$/),
      nume: z.string().min(1),
      pret: z.number().nonnegative(),
      nota: z.string().optional(),
      se_aplica_la: z.array(z.string()),
    }),
  ),
  categorii: z.array(idName).min(1),
  servicii: z.array(catalogServiceSchema).min(1),
  servicii_de_pe_fatada_fara_pret: z.array(z.string()),
  setari_programare_implicite: z.object({
    capacitate_programari_online: z.number().int().min(0),
    pas_intervale_min: z.number().int().positive(),
    programare_cu_cel_putin_ore_inainte: z.number().nonnegative(),
    programare_cel_mult_zile_inainte: z.number().int().nonnegative(),
    confirmare: z.enum(["automata", "manuala"]),
    reamintire_sms_ore_inainte: z.number().int().positive(),
  }),
});

export type Catalog = z.infer<typeof catalogSchema>;
type CatalogService = z.infer<typeof catalogServiceSchema>;
type Dimension = z.infer<typeof dimension>;

// ---------------------------------------------------------------------------
// Planul de inserare
// ---------------------------------------------------------------------------

type TenantSeed = Omit<typeof tenants.$inferInsert, "id" | "createdAt" | "updatedAt">;
type ServiceSeed = Omit<
  typeof services.$inferInsert,
  "id" | "tenantId" | "categoryId" | "createdAt" | "updatedAt"
> & { categoryCode: string };
type SurchargeSeed = Omit<typeof surcharges.$inferInsert, "id" | "tenantId" | "createdAt" | "updatedAt">;
type SettingsSeed = Omit<typeof bookingSettings.$inferInsert, "tenantId" | "createdAt" | "updatedAt">;

export type PriceSeed = {
  serviceCode: string;
  vehicleTypeCode: string | null;
  rimSizeCode: string | null;
  rimTypeCode: string | null;
  status: PriceStatus;
  minBani: number | null;
  maxBani: number | null;
  priceIsMinimum: boolean;
  sourceNote: string | null;
  needsReview: boolean;
  reviewNote: string | null;
};

export type SeedPlan = {
  tenant: TenantSeed;
  vehicleTypes: { code: string; label: string; sortOrder: number }[];
  rimSizes: { code: string; label: string; inchMin: number; inchMax: number; sortOrder: number }[];
  rimTypes: { code: string; label: string; sortOrder: number }[];
  categories: { code: string; name: string; sortOrder: number }[];
  services: ServiceSeed[];
  prices: PriceSeed[];
  surcharges: SurchargeSeed[];
  surchargeServices: { surchargeCode: string; serviceCode: string }[];
  businessHours: {
    weekday: number;
    opensAt: string;
    closesAt: string;
    needsReview: boolean;
    reviewNote: string | null;
  }[];
  settings: SettingsSeed;
  smsTemplates: { kind: SmsTemplateKind; body: string; needsReview: boolean; reviewNote: string }[];
};

// ---------------------------------------------------------------------------
// Valori care nu sunt în catalog
// ---------------------------------------------------------------------------

const ESTIMATED = "Durată estimată de noi, de verificat cu patronul.";

/** Duratele implicite din CLAUDE.md §4 (bază + pe unitate), folosite când catalogul nu are `durata_min`. */
const DEFAULT_DURATIONS: Record<string, { base: number; perUnit: number }> = {
  pachet_complet: { base: 10, perUnit: 12 },
  montat_demontat_roata: { base: 10, perUnit: 5 },
  // CLAUDE.md nu dă o estimare pentru schimb anvelopă; propunerea din planul Fazei 0.
  schimb_anvelopa: { base: 10, perUnit: 10 },
  echilibrat: { base: 5, perUnit: 6 },
  geometrie_punte_spate: { base: 30, perUnit: 0 },
  geometrie_off_road: { base: 45, perUnit: 0 },
  indreptat_janta_tabla: { base: 0, perUnit: 30 },
  indreptat_janta_aliaj: { base: 0, perUnit: 60 },
};

/** Textele care explică pe ecran diferența dintre serviciile asemănătoare (CLAUDE.md §5). */
const CUSTOMER_EXPLAINERS: Record<string, { text: string; needsReview: boolean }> = {
  montat_demontat_roata: {
    text: "Ai deja roțile complete (anvelope montate pe jante), de exemplu setul de iarnă. Le dăm jos pe cele de pe mașină și le punem pe celelalte. Nu umblăm la anvelope.",
    needsReview: false,
  },
  pachet_complet: {
    text: "Schimbi anvelopele pe aceleași jante. Scoatem anvelopele vechi, le montăm pe cele noi, echilibrăm roțile și le punem pe mașină.",
    needsReview: false,
  },
  schimb_anvelopa: {
    text: "Schimbăm doar anvelopa pe jantă, fără echilibrare. Dacă vrei și echilibrare, alege „Pachet complet anvelope”.",
    needsReview: true,
  },
};

/** Note din catalog care sunt pentru clienți, nu pentru patron. */
const PUBLIC_NOTES = new Set(["deblocare_bieleta", "reglaj_unghi_amortizor"]);

/** Valori care ni se par suspecte, deși nu sunt marcate în catalog. */
const EXTRA_REVIEW: Record<string, string> = {
  indreptat_janta_tabla:
    "Prețul de 10 lei pare mic față de îndreptat jantă aliaj (100–150 lei). De confirmat dacă e 10 sau 100 lei.",
};

/** Catalogul folosește uneori o altă etichetă de coloană decât lista de mărimi. */
const RIM_SIZE_ALIASES: Record<string, { code: string; note: string }> = {
  "13-16": { code: "12-16", note: "Pe afiș coloana este 13–16 inch, nu 12–16." },
};

const WEEKDAYS = ["luni", "marti", "miercuri", "joi", "vineri", "sambata", "duminica"] as const;

const UNIT_MAP: Record<CatalogService["unitate"], ServiceUnit> = {
  roată: "wheel",
  bucată: "piece",
  serviciu: "service",
};

const DIMENSION_FIELD = {
  tip_vehicul: "vehicleTypeCode",
  marime_janta: "rimSizeCode",
  tip_janta: "rimTypeCode",
} as const satisfies Record<Dimension, keyof PriceSeed>;

const SMS_REVIEW_NOTE =
  "Text propus de noi, fără diacritice (un SMS cu diacritice are 70 de caractere în loc de 160 și costă mai mult). De verificat.";

const DEFAULT_SMS_TEMPLATES: Record<SmsTemplateKind, string> = {
  customer_confirmed:
    "{nume}, programarea ta la {service} este confirmata: {data}, ora {ora}. Detalii sau anulare: {link}",
  customer_pending:
    "{nume}, am primit cererea ta de programare la {service} pentru {data}, ora {ora}. Revenim cu confirmarea. {link}",
  customer_reminder:
    "Reamintire: ai programare la {service} pe {data}, ora {ora}. Daca nu mai poti ajunge, anuleaza aici: {link}",
  customer_cancelled:
    "Programarea ta la {service} din {data}, ora {ora} a fost anulata. Info: {telefon}",
  owner_new_booking: "Programare noua: {data} ora {ora}, {servicii}. Client: {nume}, {telefon_client}",
  owner_cancelled: "Programare anulata: {data} ora {ora}, {nume}.",
};

// ---------------------------------------------------------------------------
// Transformarea
// ---------------------------------------------------------------------------

export type MapOptions = { slug: string };

export function mapCatalog(input: unknown, options: MapOptions): SeedPlan {
  const catalog = catalogSchema.parse(input);
  const firma = catalog.firma;

  const vehicleCodes = new Set(catalog.dimensiuni.tipuri_vehicul.map((v) => v.id));
  const rimSizeCodes = catalog.dimensiuni.marimi_janta;
  const rimTypeCodes = new Set(catalog.dimensiuni.tipuri_janta.map((r) => r.id));
  const categoryCodes = new Set(catalog.categorii.map((c) => c.id));

  const publicPhone = normalizeRoPhone(firma.telefon_public);
  if (!publicPhone) {
    throw new Error(`Telefon public invalid: ${firma.telefon_public}`);
  }

  const plan: SeedPlan = {
    tenant: {
      slug: options.slug,
      displayName: firma.nume_afisat,
      legalName: firma.denumire_legala,
      cui: firma.cui,
      regCom: firma.nr_reg_com,
      registeredAddress: firma.adresa_sediu_social,
      workAddress: firma.adresa_punct_lucru,
      publicPhone,
      email: firma.email,
      timezone: "Europe/Bucharest",
      brand: { background: "#F6F5F2", text: "#18181B", accent: "#C2410C", label: "#FACC15" },
      status: "active",
      smsMonthlyLimit: 200,
      retentionMonths: 24,
      reviewFields: [
        "display_name",
        ...(firma.adresa_sediu_social ? [] : ["registered_address"]),
        ...(firma.email ? [] : ["email"]),
        "retention_months",
        "sms_monthly_limit",
      ],
    },
    vehicleTypes: catalog.dimensiuni.tipuri_vehicul.map((v, i) => ({
      code: v.id,
      label: v.nume,
      sortOrder: (i + 1) * 10,
    })),
    rimSizes: rimSizeCodes.map((code, i) => {
      const [min, max] = code.split("-").map(Number) as [number, number | undefined];
      return {
        code,
        label: max === undefined ? `R${min}` : `R${min}–R${max}`,
        inchMin: min,
        inchMax: max ?? min,
        sortOrder: (i + 1) * 10,
      };
    }),
    rimTypes: catalog.dimensiuni.tipuri_janta.map((r, i) => ({
      code: r.id,
      label: r.nume,
      sortOrder: (i + 1) * 10,
    })),
    categories: catalog.categorii.map((c, i) => ({
      code: c.id,
      name: c.nume,
      sortOrder: (i + 1) * 10,
    })),
    services: [],
    prices: [],
    surcharges: [],
    surchargeServices: [],
    businessHours: [],
    settings: mapSettings(catalog.setari_programare_implicite),
    smsTemplates: Object.entries(DEFAULT_SMS_TEMPLATES).map(([kind, body]) => ({
      kind: kind as SmsTemplateKind,
      body,
      needsReview: true,
      reviewNote: SMS_REVIEW_NOTE,
    })),
  };

  const dims = {
    tip_vehicul: [...vehicleCodes],
    marime_janta: rimSizeCodes,
    tip_janta: [...rimTypeCodes],
  } satisfies Record<Dimension, string[]>;

  catalog.servicii.forEach((service, index) => {
    if (!categoryCodes.has(service.categorie)) {
      throw new Error(`Serviciul ${service.id} are o categorie necunoscută: ${service.categorie}`);
    }
    plan.services.push(mapService(service, (index + 1) * 10));
    plan.prices.push(...mapPrices(service, dims));
  });

  const serviceCodes = new Set(plan.services.map((s) => s.code));
  if (serviceCodes.size !== plan.services.length) {
    throw new Error("Catalogul are coduri de serviciu duplicate.");
  }

  // Serviciile scrise pe fațadă, fără preț: inactive până decide patronul.
  catalog.servicii_de_pe_fatada_fara_pret.forEach((name, index) => {
    const code = slugify(name);
    if (serviceCodes.has(code)) {
      throw new Error(`Cod duplicat pentru serviciul de pe fațadă: ${code}`);
    }
    serviceCodes.add(code);
    plan.services.push({
      code,
      categoryCode: "diverse",
      name,
      unit: "service",
      pricingMode: "on_request",
      bookableOnline: false,
      active: false,
      sortOrder: 1000 + index * 10,
      needsReview: true,
      reviewNote: "Serviciu scris pe fațadă, fără preț pe afiș. De decis dacă îl afișăm și la ce preț.",
    });
  });

  catalog.suprataxe_pe_roata.forEach((surcharge, index) => {
    const bani = leiToBani(surcharge.pret);
    const isRunflat = surcharge.id === "runflat";
    plan.surcharges.push({
      code: surcharge.id,
      name: surcharge.nume,
      description: surcharge.nota ?? null,
      unit: "per_wheel",
      minBani: bani,
      maxBani: bani,
      // „în funcție de complexitate” → afișat „de la X lei”.
      priceIsMinimum: surcharge.nota !== undefined,
      stacking: "once_per_wheel",
      customerSelectable: true,
      active: true,
      sortOrder: (index + 1) * 10,
      needsReview: true,
      reviewNote: isRunflat
        ? "De confirmat: suprataxa se ia o dată pe roată sau la fiecare serviciu din programare?"
        : "De confirmat: preț fix sau „de la” acest preț? Îl bifează clientul sau se decide în service?",
    });
    for (const serviceCode of surcharge.se_aplica_la) {
      if (!serviceCodes.has(serviceCode)) {
        throw new Error(`Suprataxa ${surcharge.id} se aplică unui serviciu necunoscut: ${serviceCode}`);
      }
      plan.surchargeServices.push({ surchargeCode: surcharge.id, serviceCode });
    }
  });

  WEEKDAYS.forEach((day, index) => {
    for (const { de_la, pana_la } of firma.program[day]) {
      if (pana_la <= de_la) {
        throw new Error(`Program invalid ${day}: ${de_la}–${pana_la}`);
      }
      plan.businessHours.push({
        weekday: index + 1,
        opensAt: de_la,
        closesAt: pana_la,
        needsReview: true,
        reviewNote: `Program preluat din: ${firma.program.sursa}`,
      });
    }
  });

  return plan;
}

function mapSettings(s: Catalog["setari_programare_implicite"]): SettingsSeed {
  return {
    onlineCapacity: s.capacitate_programari_online,
    slotStepMin: s.pas_intervale_min,
    minLeadMin: Math.round(s.programare_cu_cel_putin_ore_inainte * 60),
    maxDaysAhead: s.programare_cel_mult_zile_inainte,
    confirmationMode: s.confirmare === "automata" ? "auto" : "manual",
    manualBookingsUseCapacity: false,
    reminderHoursBefore: s.reamintire_sms_ore_inainte,
  };
}

function mapService(service: CatalogService, sortOrder: number): ServiceSeed {
  const unit = UNIT_MAP[service.unitate];
  const reviewNotes: string[] = [];
  let needsReview = service.de_confirmat === true;
  if (service.nota_confirmare) {
    reviewNotes.push(service.nota_confirmare);
  }

  let description: string | null = null;
  if (service.nota) {
    if (PUBLIC_NOTES.has(service.id)) {
      description = service.nota;
    } else {
      needsReview = true;
      reviewNotes.push(service.nota);
    }
  }

  const extra = EXTRA_REVIEW[service.id];
  if (extra) {
    needsReview = true;
    reviewNotes.push(extra);
  }

  // Durata: cea confirmată din catalog, altfel estimarea din CLAUDE.md (marcată „de verificat”).
  let baseDurationMin: number | null = null;
  let perUnitDurationMin = 0;
  let durationNeedsReview = false;
  const estimate = DEFAULT_DURATIONS[service.id];
  if (service.durata_min !== undefined) {
    baseDurationMin = service.durata_min;
  } else if (estimate) {
    baseDurationMin = estimate.base;
    perUnitDurationMin = estimate.perUnit;
    durationNeedsReview = true;
    reviewNotes.push(service.durata_nota ? `${ESTIMATED} (${service.durata_nota})` : ESTIMATED);
  }
  if (service.programabil_online && baseDurationMin === null) {
    throw new Error(`Serviciul ${service.id} se programează online, dar nu are durată.`);
  }

  const explainer = CUSTOMER_EXPLAINERS[service.id];
  if (explainer?.needsReview) {
    needsReview = true;
    reviewNotes.push("Textul explicativ pentru client e propus de noi; de verificat.");
  }

  const pricing = pricingOf(service);
  return {
    code: service.id,
    categoryCode: service.categorie,
    name: service.nume,
    description,
    includes: service.include ?? null,
    customerExplainer: explainer?.text ?? null,
    unit,
    pricingMode: pricing.mode,
    byVehicle: pricing.dims.includes("tip_vehicul"),
    byRimSize: pricing.dims.includes("marime_janta"),
    byRimType: pricing.dims.includes("tip_janta"),
    baseDurationMin,
    perUnitDurationMin,
    durationNeedsReview,
    bookableOnline: service.programabil_online,
    defaultQuantity: unit === "piece" ? 1 : null,
    maxQuantity: 10,
    active: true,
    sortOrder,
    needsReview,
    reviewNote: reviewNotes.length > 0 ? reviewNotes.join(" ") : null,
  };
}

function pricingOf(service: CatalogService): {
  mode: ServiceSeed["pricingMode"];
  dims: Dimension[];
} {
  const kinds = [
    service.pret_fix !== undefined,
    service.pret_interval !== undefined,
    service.preturi !== undefined,
  ].filter(Boolean).length;
  if (kinds > 1) {
    throw new Error(`Serviciul ${service.id} are mai multe tipuri de preț.`);
  }
  if (service.pret_fix !== undefined) return { mode: "fixed", dims: [] };
  if (service.pret_interval !== undefined) return { mode: "range", dims: [] };
  if (service.preturi !== undefined) {
    if (!service.pret_dupa) {
      throw new Error(`Serviciul ${service.id} are prețuri fără „pret_dupa”.`);
    }
    return { mode: "matrix", dims: service.pret_dupa };
  }
  return { mode: "on_request", dims: [] };
}

function mapPrices(service: CatalogService, dims: Record<Dimension, string[]>): PriceSeed[] {
  const base = {
    serviceCode: service.id,
    vehicleTypeCode: null,
    rimSizeCode: null,
    rimTypeCode: null,
    priceIsMinimum: false,
  } as const;

  if (service.pret_fix !== undefined) {
    const bani = leiToBani(service.pret_fix);
    return [
      { ...base, status: "priced", minBani: bani, maxBani: bani, sourceNote: null, needsReview: false, reviewNote: null },
    ];
  }
  if (service.pret_interval !== undefined) {
    const min = leiToBani(service.pret_interval.min);
    const max = leiToBani(service.pret_interval.max);
    if (max < min) {
      throw new Error(`Interval de preț invalid la ${service.id}.`);
    }
    return [
      { ...base, status: "priced", minBani: min, maxBani: max, sourceNote: null, needsReview: false, reviewNote: null },
    ];
  }
  if (service.preturi === undefined || !service.pret_dupa) {
    return [];
  }

  const out: PriceSeed[] = [];
  const seen = new Set<string>();

  const push = (cell: PriceSeed) => {
    const key = [cell.vehicleTypeCode, cell.rimSizeCode, cell.rimTypeCode].join("|");
    if (seen.has(key)) {
      throw new Error(`Celulă de preț duplicată la ${service.id}: ${key}`);
    }
    seen.add(key);
    out.push(cell);
  };

  const walk = (node: unknown, remaining: Dimension[], cell: PriceSeed, notes: string[]) => {
    const [dim, ...rest] = remaining;
    if (dim === undefined) {
      push(leafCell(service.id, node, cell, notes));
      return;
    }
    if (node === null) {
      // `null` pe un nivel intermediar: nu există preț pentru niciuna din combinațiile de dedesubt.
      for (const code of dims[dim]) {
        walk(null, rest, { ...cell, [DIMENSION_FIELD[dim]]: code }, notes);
      }
      return;
    }
    if (typeof node !== "object" || Array.isArray(node)) {
      throw new Error(`Structură de preț neașteptată la ${service.id} (${dim}).`);
    }
    for (const [rawKey, child] of Object.entries(node)) {
      const { code, note } = resolveDimensionKey(service.id, dim, rawKey, dims);
      walk(child, rest, { ...cell, [DIMENSION_FIELD[dim]]: code }, note ? [...notes, note] : notes);
    }
  };

  walk(
    service.preturi,
    service.pret_dupa,
    { ...base, status: "priced", minBani: null, maxBani: null, sourceNote: null, needsReview: false, reviewNote: null },
    [],
  );
  return out;
}

function resolveDimensionKey(
  serviceId: string,
  dim: Dimension,
  rawKey: string,
  dims: Record<Dimension, string[]>,
): { code: string; note: string | null } {
  if (dim === "marime_janta" && RIM_SIZE_ALIASES[rawKey]) {
    return RIM_SIZE_ALIASES[rawKey];
  }
  if (!dims[dim].includes(rawKey)) {
    throw new Error(`Valoare necunoscută „${rawKey}” pentru ${dim} la ${serviceId}.`);
  }
  return { code: rawKey, note: null };
}

const SPLIT_PRICE = /^(\d+(?:[.,]\d{1,2})?)\s*\/\s*(\d+(?:[.,]\d{1,2})?)$/;

function leafCell(serviceId: string, value: unknown, cell: PriceSeed, notes: string[]): PriceSeed {
  if (typeof value === "number") {
    const bani = leiToBani(value);
    return {
      ...cell,
      status: "priced",
      minBani: bani,
      maxBani: bani,
      sourceNote: notes.length > 0 ? notes.join(" ") : null,
      needsReview: notes.length > 0,
      reviewNote: notes.length > 0 ? notes.join(" ") : null,
    };
  }
  if (value === null) {
    return {
      ...cell,
      status: "on_request",
      minBani: null,
      maxBani: null,
      sourceNote: "Necompletat pe afiș.",
      needsReview: true,
      reviewNote: "Celulă goală pe afiș: „nu facem” sau „preț la cerere”? De confirmat.",
    };
  }
  if (typeof value === "string") {
    const match = SPLIT_PRICE.exec(value.trim());
    if (match) {
      const min = leiToBani(match[1] as string);
      const max = leiToBani(match[2] as string);
      return {
        ...cell,
        status: "priced",
        minBani: Math.min(min, max),
        maxBani: Math.max(min, max),
        sourceNote: `Pe afiș: „${value}”.`,
        needsReview: true,
        reviewNote: "Pe afiș sunt două prețuri; probabil două servicii diferite. De confirmat.",
      };
    }
  }
  throw new Error(`Preț neînțeles la ${serviceId}: ${JSON.stringify(value)}`);
}

/** „Polish profesional 3M” → `polish_profesional_3m`. */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}
