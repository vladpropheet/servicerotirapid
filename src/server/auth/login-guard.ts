import "server-only";
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { authLoginGuard } from "@/server/db/schema";

// Blocare temporară după încercări greșite de logare, per cont (CLAUDE.md §6).
// Contul e identificat doar printr-un hash, ca tabelul să nu conțină numere de telefon.

export const MAX_FAILED_LOGINS = 5;
const WINDOW_MINUTES = 15;
const LOCK_MINUTES = 15;

function identifierHash(username: string): string {
  return createHash("sha256").update(`login|${username.trim().toLowerCase()}`).digest("hex");
}

/** Până când e blocat contul (null = nu e blocat). */
export async function lockedUntil(username: string, now: Date = new Date()): Promise<Date | null> {
  const [row] = await getDb()
    .select({ lockedUntil: authLoginGuard.lockedUntil })
    .from(authLoginGuard)
    .where(eq(authLoginGuard.identifierHash, identifierHash(username)))
    .limit(1);
  return row?.lockedUntil && row.lockedUntil > now ? row.lockedUntil : null;
}

/** O încercare greșită. La a 5-a în 15 minute, contul se blochează 15 minute. */
export async function recordFailedLogin(username: string): Promise<void> {
  await getDb().execute(sql`
    insert into auth_login_guard as g (identifier_hash, failed_count, window_started_at)
    values (${identifierHash(username)}, 1, now())
    on conflict (identifier_hash) do update set
      failed_count = case
        when g.window_started_at < now() - make_interval(mins => ${WINDOW_MINUTES}) then 1
        else g.failed_count + 1 end,
      window_started_at = case
        when g.window_started_at < now() - make_interval(mins => ${WINDOW_MINUTES}) then now()
        else g.window_started_at end,
      locked_until = case
        when g.window_started_at >= now() - make_interval(mins => ${WINDOW_MINUTES})
         and g.failed_count + 1 >= ${MAX_FAILED_LOGINS}
        then now() + make_interval(mins => ${LOCK_MINUTES})
        else g.locked_until end
  `);
}

export async function recordSuccessfulLogin(username: string): Promise<void> {
  await getDb().delete(authLoginGuard).where(eq(authLoginGuard.identifierHash, identifierHash(username)));
}

/** Folosit de super-admin când resetează parola: deblochează contul. */
export async function clearLoginGuard(username: string): Promise<void> {
  await recordSuccessfulLogin(username);
}
