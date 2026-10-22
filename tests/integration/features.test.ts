// Fără abonament SMS (decizia din 22.10.2026): serverul nu înregistrează acord de marketing,
// chiar dacă cineva trimite cererea direct, ocolind formularul.
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createBookingAction } from "@/app/[slug]/actions";
import { FEATURES } from "@/lib/features";
import { closeDb } from "@/server/db/client";
import { customerConsents, customers } from "@/server/db/schema";
import { seedFreshTenant, catalogIds } from "./booking-helpers";
import { closeOwnerDb, ownerDb } from "./owner-db";

afterAll(async () => {
  await closeDb();
  await closeOwnerDb();
});

describe("acordul de marketing prin SMS", () => {
  it("e oprit în configurația actuală", () => {
    expect(FEATURES).toEqual({ smsNotifications: false, marketingSms: false });
  });

  it("o cerere cu marketingOptIn: true nu salvează niciun acord de marketing", async () => {
    const tenantId = await seedFreshTenant("fara-marketing");
    const ids = await catalogIds(tenantId);
    // O zi lucrătoare din viitor, la 10:00, ca să fie liberă indiferent de ziua rulării testului.
    const day = new Date();
    day.setUTCDate(day.getUTCDate() + ((8 - day.getUTCDay()) % 7 || 7) + 1); // marțea viitoare
    day.setUTCHours(7, 0, 0, 0);

    const result = await createBookingAction("fara-marketing", {
      selection: {
        vehicleTypeId: ids.vehicle("autoturism"),
        rimSizeId: null,
        rimTypeId: null,
        wheelCount: 4,
        surchargeIds: [],
        items: [{ serviceId: ids.service("geometrie_punte_fata") }],
      },
      startsAt: day.getTime(),
      customer: { fullName: "Ana Marketing", phone: "0745 000 111", plate: "" },
      privacyAccepted: true,
      marketingOptIn: true,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(result).toMatchObject({ ok: true });

    const [customer] = await ownerDb().select().from(customers).where(eq(customers.phoneE164, "+40745000111"));
    expect(customer?.marketingSmsOptIn).toBe(false);
    const consents = await ownerDb().select().from(customerConsents).where(eq(customerConsents.customerId, customer!.id));
    expect(consents.map((c) => c.purpose)).toEqual(["privacy_notice"]);
  });
});
