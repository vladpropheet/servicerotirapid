// Limitarea cererilor (anti-spam, CLAUDE.md §8): numărare atomică, ferestre, fără IP / telefon în clar.
import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { rateLimitBuckets } from "@/server/db/schema";
import { hitRateLimit } from "@/server/security/rate-limit";
import { closeOwnerDb, ownerDb } from "./owner-db";

const RULE = { limit: 3, windowSeconds: 60 };
const NOW = new Date("2026-10-22T07:00:10Z");

afterAll(async () => {
  await closeDb();
  await closeOwnerDb();
});

describe("hitRateLimit", () => {
  it("permite exact `limit` cereri pe fereastră, apoi refuză până la fereastra următoare", async () => {
    const results = [];
    for (let i = 0; i < 4; i += 1) results.push(await hitRateLimit("rl-test", "10.0.0.1", RULE, NOW));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3]?.retryAfterSeconds).toBe(50);

    expect((await hitRateLimit("rl-test", "10.0.0.1", RULE, new Date(NOW.getTime() + 60_000))).allowed).toBe(true);
  });

  it("IP-uri și scopuri diferite au contoare separate", async () => {
    expect((await hitRateLimit("rl-test", "10.0.0.2", RULE, NOW)).allowed).toBe(true);
    expect((await hitRateLimit("rl-alt", "10.0.0.1", RULE, NOW)).allowed).toBe(true);
  });

  it("cererile simultane nu trec peste limită", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => hitRateLimit("rl-paralel", "10.0.0.9", RULE, NOW)),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
  });

  it("în baza de date nu apare IP-ul sau telefonul, doar un HMAC", async () => {
    await hitRateLimit("booking-phone", "+40722123456", RULE, NOW);
    const keys = (await ownerDb().select({ key: rateLimitBuckets.key }).from(rateLimitBuckets)).map((r) => r.key);
    expect(keys.some((key) => key.includes("10.0.0") || key.includes("40722123456"))).toBe(false);
    expect(keys.filter((key) => key.startsWith("booking-phone:"))[0]).toMatch(/^booking-phone:[0-9a-f]{32}$/);
  });
});
