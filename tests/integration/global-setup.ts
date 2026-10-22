// Rulează o dată înainte de testele de integrare: golește baza de TESTE și aplică migrările.
// Nu atinge baza de dezvoltare (vezi verificarea din test-database.ts).
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { testDatabaseUrl } from "./test-database";

export default async function setup(): Promise<void> {
  const pool = new Pool({ connectionString: testDatabaseUrl(), max: 1 });
  try {
    await pool.query("drop schema if exists drizzle cascade");
    await pool.query("drop schema if exists public cascade");
    await pool.query("create schema public");
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }
}
