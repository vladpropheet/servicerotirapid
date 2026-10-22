// Înaintea testelor cap-coadă: golește baza de TESTE, aplică migrările și creează service-ul roti-rapid.
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { testDatabaseUrl } from "../integration/test-database";

export default async function setup(): Promise<void> {
  const url = testDatabaseUrl();
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query("drop schema if exists drizzle cascade");
    await pool.query("drop schema if exists public cascade");
    await pool.query("create schema public");
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }

  process.env.DATABASE_URL = url;
  const { getDb, closeDb } = await import("../../src/server/db/client");
  const { mapCatalog } = await import("../../src/server/seed/map-catalog");
  const { seedTenant } = await import("../../src/server/seed/write-seed");
  const catalog: unknown = JSON.parse(readFileSync("data/seed/catalog-servicii.json", "utf8"));
  await seedTenant(getDb(), mapCatalog(catalog, { slug: "roti-rapid" }));
  await closeDb();
}
