import { count, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { businessHours, servicePrices, services, tenants } from "@/server/db/schema";
import { mapCatalog } from "@/server/seed/map-catalog";
import { seedTenant } from "@/server/seed/write-seed";
import { loadCatalog } from "../helpers/catalog";

afterAll(() => closeDb());

async function countFor(table: typeof services | typeof servicePrices | typeof businessHours, tenantId: string) {
  const [row] = await getDb().select({ n: count() }).from(table).where(eq(table.tenantId, tenantId));
  return row?.n ?? 0;
}

describe("seed", () => {
  it("creează tenantul cu tot catalogul", async () => {
    const plan = mapCatalog(loadCatalog(), { slug: "seed-test" });
    const result = await seedTenant(getDb(), plan);

    expect(result.created).toBe(true);
    expect(await countFor(services, result.tenantId)).toBe(plan.services.length);
    expect(await countFor(servicePrices, result.tenantId)).toBe(plan.prices.length);
    expect(await countFor(businessHours, result.tenantId)).toBe(6);
  });

  it("a doua rulare nu dublează și nu modifică nimic", async () => {
    const plan = mapCatalog(loadCatalog(), { slug: "seed-test" });
    const [before] = await getDb().select().from(tenants).where(eq(tenants.slug, "seed-test"));

    const result = await seedTenant(getDb(), plan);

    expect(result.created).toBe(false);
    expect(result.tenantId).toBe(before?.id);
    const [{ n } = { n: 0 }] = await getDb()
      .select({ n: count() })
      .from(tenants)
      .where(eq(tenants.slug, "seed-test"));
    expect(n).toBe(1);
    expect(await countFor(services, result.tenantId)).toBe(plan.services.length);
  });

  it("păstrează modificările patronului la o nouă rulare", async () => {
    const [tenant] = await getDb().select().from(tenants).where(eq(tenants.slug, "seed-test"));
    await getDb().update(tenants).set({ displayName: "Vulcanizare Auto" }).where(eq(tenants.id, tenant!.id));

    await seedTenant(getDb(), mapCatalog(loadCatalog(), { slug: "seed-test" }));

    const [after] = await getDb().select().from(tenants).where(eq(tenants.id, tenant!.id));
    expect(after?.displayName).toBe("Vulcanizare Auto");
  });

  it("același catalog poate crea un al doilea service, cu date separate", async () => {
    const result = await seedTenant(getDb(), mapCatalog(loadCatalog(), { slug: "seed-test-doi" }));
    const [first] = await getDb().select().from(tenants).where(eq(tenants.slug, "seed-test"));

    expect(result.created).toBe(true);
    expect(result.tenantId).not.toBe(first?.id);
    expect(await countFor(services, result.tenantId)).toBe(32);
  });
});
