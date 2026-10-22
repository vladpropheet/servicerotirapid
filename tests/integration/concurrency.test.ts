// CLAUDE.md §5: două cereri simultane nu pot depăși capacitatea.
// Trimitem 20 de cereri în același timp, pe conexiuni separate, pentru același interval.
import { and, count, eq, ne } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { closeOwnerDb, ownerDb } from "./owner-db";
import { bookingSettings, bookings } from "@/server/db/schema";
import { reserveOnlineBooking } from "@/server/booking/reserve";
import { bookingRequest, catalogIds, FRIDAY_8, NOW, seedFreshTenant } from "./booking-helpers";

afterAll(async () => {
  await closeDb();
  await closeOwnerDb();
});

async function race(slug: string, capacity: number) {
  const tenantId = await seedFreshTenant(slug);
  const ids = await catalogIds(tenantId);
  await ownerDb().update(bookingSettings).set({ onlineCapacity: capacity }).where(eq(bookingSettings.tenantId, tenantId));

  const requests = Array.from({ length: 20 }, () => bookingRequest(ids, { startsAt: FRIDAY_8 }));
  const results = await Promise.all(requests.map((r) => reserveOnlineBooking(tenantId, r, { now: NOW })));

  const [stored] = await ownerDb()
    .select({ n: count() })
    .from(bookings)
    .where(and(eq(bookings.tenantId, tenantId), ne(bookings.status, "cancelled")));
  return {
    ok: results.filter((r) => r.ok).length,
    taken: results.filter((r) => !r.ok && r.error === "slot_taken").length,
    stored: stored?.n ?? 0,
  };
}

describe("cereri simultane pentru același interval", () => {
  it("capacitate 1: exact o programare reușește", async () => {
    expect(await race("concurenta-1", 1)).toEqual({ ok: 1, taken: 19, stored: 1 });
  });

  it("capacitate 3: exact trei programări reușesc", async () => {
    expect(await race("concurenta-3", 3)).toEqual({ ok: 3, taken: 17, stored: 3 });
  });
});
