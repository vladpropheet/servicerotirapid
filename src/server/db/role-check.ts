import { sql } from "drizzle-orm";
import { getDb } from "./client";

/** Aruncă o eroare dacă aplicația e conectată cu un cont care ocolește Row-Level Security. */
export async function assertRestrictedDatabaseRole(): Promise<void> {
  const result = await getDb().execute<{ user: string; rolsuper: boolean; rolbypassrls: boolean }>(
    sql`select current_user as "user", rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
  );
  const role = result.rows[0];
  if (!role) throw new Error("Nu am putut verifica contul bazei de date.");
  if (role.rolsuper || role.rolbypassrls) {
    throw new Error(
      `DATABASE_URL folosește contul „${role.user}”, care ocolește Row-Level Security. Folosește app_user (vezi .env.example).`,
    );
  }
}
