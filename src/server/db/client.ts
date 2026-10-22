// Conexiunea la PostgreSQL. Codul aplicației NU o importă direct (regulă ESLint):
// trece prin withTenant() din src/server/tenant, care impune tenantul.
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

let pool: Pool | undefined;
let db: Database | undefined;

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Lipsește variabila de mediu DATABASE_URL.");
  }
  return url;
}

/**
 * Conexiunea se creează la prima folosire, nu la încărcarea modulului,
 * ca `next build` să nu aibă nevoie de baza de date.
 */
export function getDb(): Database {
  if (!db) {
    pool = new Pool({
      connectionString: databaseUrl(),
      max: 10,
      // Toate orele se lucrează în UTC; conversia în ora României se face în aplicație.
      options: "-c TimeZone=UTC",
    });
    db = drizzle(pool, { schema });
  }
  return db;
}

/** Închide conexiunile (scripturi și teste). */
export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
  db = undefined;
}
