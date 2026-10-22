import "server-only";
import { and, asc, count, desc, eq, isNull, max } from "drizzle-orm";
import { localDateOf } from "@/domain/time";
import { csvLei, toCsv, type CsvValue } from "@/lib/csv";
import { formatRoPhone, formatTime } from "@/lib/format";
import { BOOKING_STATUS_LABEL } from "@/lib/labels";
import { writeAudit, type Actor } from "@/server/admin/audit";
import { bookingItems, bookings, customerConsents, customers } from "@/server/db/schema";
import type { TenantTx } from "@/server/tenant";

// Exportul datelor unui service (CLAUDE.md §6, GDPR): programările și clienții, în CSV pentru Excel.
// Fișierele conțin date personale, deci fiecare export se notează în istoricul modificărilor.

export type ExportKind = "programari" | "clienti";

export type CsvExport = { csv: string; rows: number };

function localDateTime(date: Date, timeZone: string): string {
  return `${localDateOf(date.getTime(), timeZone).toString()} ${formatTime(date.getTime(), timeZone)}`;
}

function phoneText(e164: string | null): string | null {
  return e164 === null ? null : formatRoPhone(e164);
}

export async function bookingsCsv(t: TenantTx, timeZone: string): Promise<CsvExport> {
  const rows = await t.tx
    .select({ booking: bookings, customerName: customers.fullName, customerPhone: customers.phoneE164 })
    .from(bookings)
    .innerJoin(customers, and(eq(customers.tenantId, bookings.tenantId), eq(customers.id, bookings.customerId)))
    .where(eq(bookings.tenantId, t.tenantId))
    .orderBy(asc(bookings.startsAt), asc(bookings.id));

  const items = await t.tx
    .select({ bookingId: bookingItems.bookingId, name: bookingItems.nameSnapshot, quantity: bookingItems.quantity })
    .from(bookingItems)
    .where(eq(bookingItems.tenantId, t.tenantId))
    .orderBy(asc(bookingItems.bookingId), asc(bookingItems.position));
  const itemsByBooking = new Map<string, string[]>();
  for (const item of items) {
    const list = itemsByBooking.get(item.bookingId) ?? [];
    list.push(item.quantity > 1 ? `${item.name} × ${item.quantity}` : item.name);
    itemsByBooking.set(item.bookingId, list);
  }

  const header = [
    "Cod",
    "Data",
    "Ora",
    "Până la",
    "Status",
    "Sursa",
    "Nume client",
    "Telefon",
    "Nr. înmatriculare",
    "Vehicul",
    "Roți",
    "Servicii",
    "Estimat minim (lei)",
    "Estimat maxim (lei)",
    "Preț final (lei)",
    "Observații client",
    "Creată la",
  ];
  const data: CsvValue[][] = rows.map(({ booking: b, customerName, customerPhone }) => [
    b.publicRef,
    localDateOf(b.startsAt.getTime(), timeZone).toString(),
    formatTime(b.startsAt.getTime(), timeZone),
    formatTime(b.endsAt.getTime(), timeZone),
    BOOKING_STATUS_LABEL[b.status],
    b.source === "online" ? "Online" : "Adăugată manual",
    customerName,
    phoneText(customerPhone),
    b.plate,
    [b.vehicleTypeLabel, b.rimSizeLabel, b.rimTypeLabel].filter(Boolean).join(" · "),
    b.wheelCount,
    (itemsByBooking.get(b.id) ?? []).join(" + "),
    csvLei(b.estimateMinBani),
    csvLei(b.estimateMaxBani),
    csvLei(b.finalPriceBani),
    b.customerNote,
    localDateTime(b.createdAt, timeZone),
  ]);
  return { csv: toCsv(header, data), rows: data.length };
}

export async function customersCsv(t: TenantTx, timeZone: string): Promise<CsvExport> {
  const list = await t.tx
    .select({
      id: customers.id,
      fullName: customers.fullName,
      phoneE164: customers.phoneE164,
      createdAt: customers.createdAt,
    })
    .from(customers)
    .where(and(eq(customers.tenantId, t.tenantId), isNull(customers.anonymizedAt)))
    .orderBy(asc(customers.fullName), asc(customers.id));

  const stats = await t.tx
    .select({ customerId: bookings.customerId, total: count(), lastStartsAt: max(bookings.startsAt) })
    .from(bookings)
    .where(eq(bookings.tenantId, t.tenantId))
    .groupBy(bookings.customerId);
  const statsByCustomer = new Map(stats.map((row) => [row.customerId, row]));

  // Ultimul acord pentru prelucrarea datelor, al fiecărui client.
  const consents = await t.tx
    .selectDistinctOn([customerConsents.customerId], {
      customerId: customerConsents.customerId,
      createdAt: customerConsents.createdAt,
      textVersion: customerConsents.textVersion,
    })
    .from(customerConsents)
    .where(
      and(
        eq(customerConsents.tenantId, t.tenantId),
        eq(customerConsents.purpose, "privacy_notice"),
        eq(customerConsents.granted, true),
      ),
    )
    .orderBy(customerConsents.customerId, desc(customerConsents.createdAt));
  const consentByCustomer = new Map(consents.map((row) => [row.customerId, row]));

  const header = [
    "Nume",
    "Telefon",
    "Programări",
    "Ultima programare",
    "Client din",
    "Acord prelucrare date (data)",
    "Versiunea textului acceptat",
  ];
  const data: CsvValue[][] = list.map((customer) => {
    const stat = statsByCustomer.get(customer.id);
    const consent = consentByCustomer.get(customer.id);
    return [
      customer.fullName,
      phoneText(customer.phoneE164),
      stat?.total ?? 0,
      stat?.lastStartsAt ? localDateOf(stat.lastStartsAt.getTime(), timeZone).toString() : null,
      localDateOf(customer.createdAt.getTime(), timeZone).toString(),
      consent ? localDateTime(consent.createdAt, timeZone) : null,
      consent?.textVersion ?? null,
    ];
  });
  return { csv: toCsv(header, data), rows: data.length };
}

/** Exportul cerut din panou, notat în istoric (fără date personale în notă: doar tipul și numărul de rânduri). */
export async function exportForAdmin(t: TenantTx, actor: Actor, kind: ExportKind, timeZone: string): Promise<CsvExport> {
  const result = kind === "programari" ? await bookingsCsv(t, timeZone) : await customersCsv(t, timeZone);
  await writeAudit(t, actor, { action: "gdpr.export", entityType: "export", after: { kind, rows: result.rows } });
  return result;
}
