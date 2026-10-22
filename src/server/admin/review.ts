import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { businessHours, servicePrices, services, smsTemplates, surcharges, tenants } from "@/server/db/schema";
import type { TenantTx } from "@/server/tenant";
import { writeAudit, type Actor } from "./audit";

// „De verificat”: valorile de pornire neconfirmate de patron (prețuri, durate, program, texte).
// Dispar când patronul modifică valoarea sau apasă „E corect”.

export type ReviewItem = {
  target: ReviewTarget;
  title: string;
  note: string | null;
  href: string;
};

export type ReviewTarget =
  | { type: "service"; id: string }
  | { type: "duration"; id: string }
  | { type: "price"; id: string }
  | { type: "surcharge"; id: string }
  | { type: "hours" }
  | { type: "sms"; kind: string }
  | { type: "tenant"; field: string };

const TENANT_FIELD_LABEL: Record<string, string> = {
  display_name: "Numele afișat al service-ului",
  registered_address: "Sediul social (necesar în politica de confidențialitate)",
  email: "Emailul firmei",
  retention_months: "Cât timp se păstrează datele (implicit 24 de luni)",
  sms_monthly_limit: "Limita lunară de SMS-uri",
};

export async function listReviewItems(t: TenantTx): Promise<ReviewItem[]> {
  const items: ReviewItem[] = [];
  const [tenant] = await t.tx.select({ reviewFields: tenants.reviewFields }).from(tenants).where(eq(tenants.id, t.tenantId));
  for (const field of tenant?.reviewFields ?? []) {
    items.push({ target: { type: "tenant", field }, title: TENANT_FIELD_LABEL[field] ?? field, note: null, href: "/admin/firma" });
  }

  const serviceRows = await t.tx.select().from(services).where(eq(services.tenantId, t.tenantId));
  const name = (id: string) => serviceRows.find((s) => s.id === id)?.name ?? "Serviciu";
  for (const s of serviceRows.filter((s) => s.needsReview)) {
    items.push({ target: { type: "service", id: s.id }, title: s.name, note: s.reviewNote, href: `/admin/servicii/${s.id}` });
  }
  for (const s of serviceRows.filter((s) => s.durationNeedsReview)) {
    items.push({
      target: { type: "duration", id: s.id },
      title: `Durata: ${s.name} (${s.baseDurationMin ?? 0} min + ${s.perUnitDurationMin} min/unitate)`,
      note: "Durată estimată, de confirmat.",
      href: `/admin/servicii/${s.id}`,
    });
  }

  const prices = await t.tx
    .select({ id: servicePrices.id, serviceId: servicePrices.serviceId, reviewNote: servicePrices.reviewNote })
    .from(servicePrices)
    .where(and(eq(servicePrices.tenantId, t.tenantId), eq(servicePrices.needsReview, true)));
  const byService = new Map<string, typeof prices>();
  for (const p of prices) byService.set(p.serviceId, [...(byService.get(p.serviceId) ?? []), p]);
  for (const [serviceId, cells] of byService) {
    items.push({
      target: { type: "price", id: serviceId },
      title: `Prețuri: ${name(serviceId)} (${cells.length} ${cells.length === 1 ? "celulă" : "celule"})`,
      note: cells[0]?.reviewNote ?? null,
      href: `/admin/servicii/${serviceId}`,
    });
  }

  const surchargeRows = await t.tx
    .select()
    .from(surcharges)
    .where(and(eq(surcharges.tenantId, t.tenantId), eq(surcharges.needsReview, true)));
  for (const s of surchargeRows) {
    items.push({ target: { type: "surcharge", id: s.id }, title: `Suprataxă: ${s.name}`, note: s.reviewNote, href: "/admin/suprataxe" });
  }

  const [hours] = await t.tx
    .select({ note: businessHours.reviewNote })
    .from(businessHours)
    .where(and(eq(businessHours.tenantId, t.tenantId), eq(businessHours.needsReview, true)))
    .limit(1);
  if (hours) items.push({ target: { type: "hours" }, title: "Programul de lucru", note: hours.note, href: "/admin/program" });

  const sms = await t.tx
    .select({ kind: smsTemplates.kind, note: smsTemplates.reviewNote })
    .from(smsTemplates)
    .where(and(eq(smsTemplates.tenantId, t.tenantId), eq(smsTemplates.needsReview, true)));
  if (sms.length > 0) {
    items.push({ target: { type: "sms", kind: "*" }, title: `Textele SMS (${sms.length})`, note: sms[0]?.note ?? null, href: "/admin/setari" });
  }
  return items;
}

/** „E corect”: patronul confirmă valoarea așa cum e. */
export async function markReviewed(t: TenantTx, actor: Actor, target: ReviewTarget): Promise<void> {
  const tenantId = t.tenantId;
  switch (target.type) {
    case "service":
      await t.tx.update(services).set({ needsReview: false }).where(and(eq(services.tenantId, tenantId), eq(services.id, target.id)));
      break;
    case "duration":
      await t.tx.update(services).set({ durationNeedsReview: false }).where(and(eq(services.tenantId, tenantId), eq(services.id, target.id)));
      break;
    case "price":
      await t.tx
        .update(servicePrices)
        .set({ needsReview: false })
        .where(and(eq(servicePrices.tenantId, tenantId), eq(servicePrices.serviceId, target.id)));
      break;
    case "surcharge":
      await t.tx.update(surcharges).set({ needsReview: false }).where(and(eq(surcharges.tenantId, tenantId), eq(surcharges.id, target.id)));
      break;
    case "hours":
      await t.tx.update(businessHours).set({ needsReview: false }).where(eq(businessHours.tenantId, tenantId));
      break;
    case "sms":
      await t.tx.update(smsTemplates).set({ needsReview: false }).where(eq(smsTemplates.tenantId, tenantId));
      break;
    case "tenant":
      await t.tx
        .update(tenants)
        .set({ reviewFields: sql`array_remove(${tenants.reviewFields}, ${target.field})` })
        .where(eq(tenants.id, tenantId));
      break;
  }
  await writeAudit(t, actor, { action: "review.confirm", entityType: target.type, entityId: "id" in target ? target.id : null, after: target });
}
