// Creează un service (tenant) din catalogul de pornire. Se poate rula de oricâte ori:
// dacă service-ul există deja, nu modifică nimic.
//
//   npm run db:seed                                   -> roti-rapid din data/seed/catalog-servicii.json
//   npm run db:seed -- --slug alt-service --file cale/catalog.json
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { closeDb, getDb } from "@/server/db/client";
import { mapCatalog } from "@/server/seed/map-catalog";
import { seedTenant } from "@/server/seed/write-seed";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      slug: { type: "string", default: "roti-rapid" },
      file: { type: "string", default: "data/seed/catalog-servicii.json" },
    },
  });

  const catalog: unknown = JSON.parse(await readFile(values.file, "utf8"));
  const plan = mapCatalog(catalog, { slug: values.slug });
  const result = await seedTenant(getDb(), plan);

  if (!result.created) {
    console.log(`Service-ul „${values.slug}” există deja. Nu am modificat nimic.`);
    return;
  }

  const reviewCount =
    plan.tenant.reviewFields!.length +
    plan.services.filter((s) => s.needsReview || s.durationNeedsReview).length +
    plan.prices.filter((p) => p.needsReview).length +
    plan.surcharges.filter((s) => s.needsReview).length;

  console.log(`Am creat service-ul „${values.slug}”:`);
  console.log(`  ${result.counts.services} servicii, ${result.counts.prices} prețuri,`);
  console.log(`  ${result.counts.surcharges} suprataxe, ${result.counts.businessHours} intervale de program.`);
  console.log(`  ${reviewCount} valori marcate „de verificat”.`);
}

main()
  .catch((error: unknown) => {
    console.error("Seed-ul a eșuat:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
