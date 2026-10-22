// Rulează o dată înainte de testele de integrare: golește baza de TESTE, aplică migrările
// și pregătește contul aplicației. Nu atinge baza de dezvoltare (vezi verificarea din test-database.ts).
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { ensureAppRole } from "@/server/db/roles";
import { testAppRole, testDatabaseUrl } from "./test-database";

export default async function setup(): Promise<void> {
  const pool = new Pool({ connectionString: testDatabaseUrl(), max: 1 });
  try {
    await pool.query("drop schema if exists drizzle cascade");
    await pool.query("drop schema if exists public cascade");
    await pool.query("create schema public");
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    await ensureAppRole(pool, testAppRole());
  } finally {
    await pool.end();
  }
}
