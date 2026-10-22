// Validarea formularului de programare. Aceleași reguli în browser (mesaje rapide) și pe server (obligatoriu).
import { z } from "zod";
import { isRoMobile, normalizeRoPhone } from "./phone";

export const selectionSchema = z.object({
  vehicleTypeId: z.uuid(),
  rimSizeId: z.uuid().nullable(),
  rimTypeId: z.uuid().nullable(),
  wheelCount: z.number().int().min(1).max(10),
  surchargeIds: z.array(z.uuid()).max(10),
  items: z
    .array(z.object({ serviceId: z.uuid(), quantity: z.number().int().min(1).max(50).optional() }))
    .min(1)
    .max(10),
});

export type SelectionInput = z.infer<typeof selectionSchema>;

/** „ag 12-abc” → „AG12ABC”; gol → null. */
export function normalizePlate(value: string | undefined): string | null {
  if (!value) return null;
  const compact = value.toUpperCase().replace(/[\s.-]/g, "");
  return compact === "" ? null : compact;
}

export const customerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Scrie numele tău (cel puțin 2 litere).")
    .max(80, "Numele e prea lung (maxim 80 de caractere)."),
  phone: z
    .string()
    .trim()
    .transform((value, ctx) => {
      const normalized = normalizeRoPhone(value);
      if (!normalized || !isRoMobile(normalized)) {
        ctx.addIssue({ code: "custom", message: "Scrie un număr de mobil, de exemplu 0722 123 456." });
        return z.NEVER;
      }
      return normalized;
    }),
  plate: z
    .string()
    .trim()
    .max(15)
    .optional()
    .transform(normalizePlate)
    .refine((plate) => plate === null || /^[A-Z0-9]{2,10}$/.test(plate), {
      message: "Numărul de înmatriculare nu pare corect, de exemplu AG 12 ABC.",
    }),
});

/** Clientul unei programări adăugate de patron: acceptă și numere fixe (clientul a sunat). */
export const adminCustomerSchema = customerSchema.extend({
  phone: z
    .string()
    .trim()
    .transform((value, ctx) => {
      const normalized = normalizeRoPhone(value);
      if (!normalized) {
        ctx.addIssue({ code: "custom", message: "Număr de telefon invalid, de exemplu 0722 123 456." });
        return z.NEVER;
      }
      return normalized;
    }),
});

export const manualBookingSchema = z.object({
  selection: selectionSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Alege data."),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Alege ora."),
  durationMin: z.number().int().min(5).max(720).nullable(),
  customer: adminCustomerSchema,
  note: z.string().trim().max(500).nullable(),
  force: z.boolean(),
});

export const bookingRequestSchema = z.object({
  selection: selectionSchema,
  /** Începutul intervalului ales, în milisecunde UTC. */
  startsAt: z.number().int().positive(),
  customer: customerSchema,
  privacyAccepted: z.literal(true, { error: "Bifează acordul pentru prelucrarea datelor, ca să putem face programarea." }),
  marketingOptIn: z.boolean(),
  idempotencyKey: z.uuid(),
  /** Tokenul Cloudflare Turnstile (lipsește dacă protecția e oprită, în dezvoltare). */
  turnstileToken: z.string().max(2048).optional(),
});

export type BookingRequestInput = z.input<typeof bookingRequestSchema>;
