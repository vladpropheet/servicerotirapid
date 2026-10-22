// Conexiune cu contul PROPRIETAR al bazei de teste. Ocolește Row-Level Security, deci se folosește
// doar în teste: pentru pregătirea datelor și pentru verificări care trebuie să vadă toate rândurile.
// Codul aplicației folosește getDb() (contul aplicației, supus RLS).
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/server/db/schema";
import { testDatabaseUrl } from "./test-database";

let pool: Pool | undefined;
let db: NodePgDatabase<typeof schema> | undefined;

export function ownerDb(): NodePgDatabase<typeof schema> {
  if (!db) {
    pool = new Pool({ connectionString: testDatabaseUrl(), max: 5 });
    db = drizzle(pool, { schema });
  }
  return db;
}

export async function closeOwnerDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
  db = undefined;
}
