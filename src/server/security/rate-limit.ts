import "server-only";
import { createHmac } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/server/db/client";
import { rateLimitBuckets } from "@/server/db/schema";

// Limitarea numărului de cereri (anti-spam, CLAUDE.md §8), pe IP și pe telefon.
// În baza de date stă doar un HMAC al IP-ului / telefonului (cu AUTH_SECRET): un IPv4 simplu
// hash-uit s-ar putea ghici încercând toate adresele, un HMAC fără cheie nu.

export type RateRule = { limit: number; windowSeconds: number };

export const RATE_RULES = {
  /** Pasul 2: intervalele libere (la fiecare schimbare de servicii). */
  slotsPerIp: { limit: 120, windowSeconds: 10 * 60 },
  /** Programări trimise de pe același IP. */
  bookingsPerIp: { limit: 10, windowSeconds: 60 * 60 },
  /** Programări pentru același telefon, pe zi (pe lângă limita de programări active). */
  bookingsPerPhone: { limit: 5, windowSeconds: 24 * 60 * 60 },
  /** Logări în panou de pe același IP (pe lângă blocarea contului după 5 greșeli). */
  loginsPerIp: { limit: 20, windowSeconds: 15 * 60 },
  /** Anulări din link de pe același IP. */
  cancelsPerIp: { limit: 20, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateRule>;

function keyFor(scope: string, identifier: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Lipsește AUTH_SECRET.");
  return `${scope}:${createHmac("sha256", secret).update(identifier).digest("hex").slice(0, 32)}`;
}

/**
 * Numără o cerere și spune dacă mai e permisă. Fereastră fixă (ex. ora curentă).
 * Atomic: două cereri simultane nu pot citi amândouă același număr.
 */
export async function hitRateLimit(
  scope: string,
  identifier: string,
  rule: RateRule,
  now: Date = new Date(),
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const [row] = await getDb()
    .insert(rateLimitBuckets)
    .values({ key: keyFor(scope, identifier), windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimitBuckets.key, rateLimitBuckets.windowStart],
      set: { count: sql`${rateLimitBuckets.count} + 1` },
    })
    .returning({ count: rateLimitBuckets.count });
  const count = row?.count ?? 1;
  const retryAfterSeconds = Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000);
  return { allowed: count <= rule.limit, retryAfterSeconds };
}

/**
 * IP-ul clientului. În producție aplicația stă în spatele proxy-ului Coolify (Traefik), care pune
 * adresa reală în X-Real-Ip și o adaugă la finalul X-Forwarded-For. Primele valori din
 * X-Forwarded-For le poate scrie oricine, deci nu le folosim.
 */
export async function clientIp(): Promise<string> {
  let h: Headers;
  try {
    h = await headers();
  } catch {
    return "necunoscut"; // în afara unei cereri (scripturi, teste)
  }
  const realIp = h.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = h.get("x-forwarded-for");
  const last = forwarded?.split(",").at(-1)?.trim();
  return last || "necunoscut";
}

/** Șterge ferestrele vechi (rulat de jobul zilnic). */
export async function purgeOldRateLimits(now: Date = new Date()): Promise<number> {
  const removed = await getDb()
    .delete(rateLimitBuckets)
    .where(lt(rateLimitBuckets.windowStart, new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)))
    .returning({ key: rateLimitBuckets.key });
  return removed.length;
}
