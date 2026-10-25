// Înaintea testelor cap-coadă: golește baza de TESTE, aplică migrările, pregătește contul aplicației,
// creează service-ul roti-rapid, contul patronului și pe cel de super-admin (cu parolă temporară, ca în realitate).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { ensureAppRole } from "../../src/server/db/roles";
import { testAppDatabaseUrl, testAppRole, testDatabaseUrl } from "../integration/test-database";

const OWNER_PHONE = "0711 111 111";
const SUPERADMIN_PHONE = "0722 222 222";

/** Un cont creat cu scriptul real (npm run admin:create), care afișează parola temporară o dată. */
function createUser(args: string[]): string {
  const output = execFileSync(
    process.execPath,
    [path.join("node_modules", "tsx", "dist", "cli.mjs"), "--conditions=react-server", "scripts/create-user.ts", ...args],
    { env: { ...process.env, DATABASE_URL: testAppDatabaseUrl() }, encoding: "utf8" },
  );
  const password = /Parolă temporară:\s+(\S+)/.exec(output)?.[1];
  if (!password) throw new Error(`Scriptul admin:create nu a afișat parola temporară:\n${output}`);
  return password;
}

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

  process.env.DATABASE_URL = testAppDatabaseUrl();
  const { getDb, closeDb } = await import("../../src/server/db/client");
  const { mapCatalog } = await import("../../src/server/seed/map-catalog");
  const { seedTenant } = await import("../../src/server/seed/write-seed");
  const catalog: unknown = JSON.parse(readFileSync("data/seed/catalog-servicii.json", "utf8"));
  await seedTenant(getDb(), mapCatalog(catalog, { slug: "roti-rapid" }));
  await closeDb();

  const ownerPassword = createUser(["--rol", "patron", "--service", "roti-rapid", "--telefon", OWNER_PHONE, "--nume", "Patron Test"]);
  const superadminPassword = createUser(["--rol", "superadmin", "--telefon", SUPERADMIN_PHONE, "--nume", "Super Test"]);

  // Testele citesc datele din mediu (setup-ul rulează înaintea lor).
  process.env.E2E_OWNER_PHONE = OWNER_PHONE;
  process.env.E2E_OWNER_TEMP_PASSWORD = ownerPassword;
  process.env.E2E_SUPERADMIN_PHONE = SUPERADMIN_PHONE;
  process.env.E2E_SUPERADMIN_TEMP_PASSWORD = superadminPassword;
}
