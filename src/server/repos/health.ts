import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";

const TIMEOUT_MS = 2000;

/** true dacă baza de date răspunde în cel mult 2 secunde. Nu expune detalii despre eroare. */
export async function pingDatabase(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS);
  });
  try {
    await Promise.race([getDb().execute(sql`select 1`), timeout]);
    return true;
  } catch {
    console.error("Health check: baza de date nu răspunde.");
    return false;
  } finally {
    clearTimeout(timer);
  }
}
