import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { formatRoPhone } from "@/lib/format";
import { normalizeRoPhone } from "@/lib/validation/phone";
import { getDb } from "@/server/db/client";
import { authAccount, authSession, authUser, platformAuditLog, tenantMemberships } from "@/server/db/schema";
import { clearLoginGuard } from "./login-guard";
import { generateTemporaryPassword, hashPassword } from "./password";

// Conturile panoului: create de scriptul de pornire sau de super-admin, niciodată prin înregistrare publică.
// Parola inițială e temporară: la prima logare trebuie schimbată.

/** „0766 777 130” → „40766777130” (numele de utilizator pentru logare). */
export function phoneToUsername(phone: string): string | null {
  const e164 = normalizeRoPhone(phone);
  return e164 ? e164.slice(1) : null;
}

export type NewUser = {
  phone: string;
  name: string;
  platformRole?: "superadmin";
  membership?: { tenantId: string; role: "owner" | "staff" };
  actorUserId?: string | null;
};

export async function createUserWithTemporaryPassword(input: NewUser): Promise<{ userId: string; temporaryPassword: string }> {
  const username = phoneToUsername(input.phone);
  if (!username) throw new Error("Număr de telefon invalid.");
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const userId = randomUUID();
  const now = new Date();

  await getDb().transaction(async (tx) => {
    await tx.insert(authUser).values({
      id: userId,
      name: input.name,
      // Better Auth cere un email; patronii se loghează cu telefonul. Domeniul .invalid nu primește niciodată mesaje.
      email: `u-${userId}@users.invalid`,
      emailVerified: false,
      username,
      displayUsername: formatRoPhone(`+${username}`),
      platformRole: input.platformRole ?? null,
      mustChangePassword: true,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(authAccount).values({
      id: randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    });
    if (input.membership) {
      await tx.insert(tenantMemberships).values({ ...input.membership, userId });
    }
    await tx.insert(platformAuditLog).values({
      actorUserId: input.actorUserId ?? null,
      action: "user.create",
      tenantId: input.membership?.tenantId ?? null,
      details: { userId, platformRole: input.platformRole ?? null, role: input.membership?.role ?? null },
    });
  });
  return { userId, temporaryPassword };
}

/**
 * Resetarea parolei fără SMS (CLAUDE.md §6): super-adminul generează o parolă temporară,
 * toate sesiunile utilizatorului se închid, iar la următoarea logare trebuie aleasă o parolă nouă.
 */
/** `actorUserId` null = din linia de comandă (scriptul reset-password). */
export async function resetToTemporaryPassword(userId: string, actorUserId: string | null): Promise<string> {
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const username = await getDb().transaction(async (tx) => {
    const [user] = await tx.select({ username: authUser.username }).from(authUser).where(eq(authUser.id, userId));
    if (!user) throw new Error("Utilizatorul nu există.");
    await tx.update(authAccount).set({ password: passwordHash, updatedAt: new Date() }).where(eq(authAccount.userId, userId));
    await tx.update(authUser).set({ mustChangePassword: true, updatedAt: new Date() }).where(eq(authUser.id, userId));
    await tx.delete(authSession).where(eq(authSession.userId, userId));
    await tx.insert(platformAuditLog).values({ actorUserId, action: "user.password_reset", details: { userId } });
    return user.username;
  });
  if (username) await clearLoginGuard(username);
  return temporaryPassword;
}

export async function markPasswordChanged(userId: string): Promise<void> {
  await getDb().update(authUser).set({ mustChangePassword: false, updatedAt: new Date() }).where(eq(authUser.id, userId));
}
