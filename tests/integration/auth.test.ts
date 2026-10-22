// Autentificarea panoului (CLAUDE.md §6): parole argon2id, blocare după încercări greșite,
// resetare fără SMS, endpoint-uri închise, TOTP pentru super-admin.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAuth } from "@/server/auth/auth";
import { createUserWithTemporaryPassword, phoneToUsername, resetToTemporaryPassword } from "@/server/auth/users";
import { closeDb } from "@/server/db/client";
import { authAccount, authUser, tenantMemberships } from "@/server/db/schema";
import { resolveAdminTenant } from "@/server/tenant";
import { secretFromTotpUri, totpCode } from "../helpers/totp";
import { seedFreshTenant } from "./booking-helpers";
import { closeOwnerDb, ownerDb } from "./owner-db";

let tenantId: string;

beforeAll(async () => {
  tenantId = await seedFreshTenant("auth-test");
});

afterAll(async () => {
  await closeDb();
  await closeOwnerDb();
});

const signIn = (phone: string, password: string) =>
  getAuth().api.signInUsername({
    body: { username: phoneToUsername(phone)!, password },
    asResponse: true,
  });

const cookieHeader = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");

describe("conturi și parole", () => {
  it("creează patronul cu parolă temporară, stocată doar ca hash argon2id", async () => {
    const { userId, temporaryPassword } = await createUserWithTemporaryPassword({
      phone: "0711 000 001",
      name: "Patron Test",
      membership: { tenantId, role: "owner" },
    });
    expect(temporaryPassword).toMatch(/^[A-Za-z0-9]{4}(-[A-Za-z0-9]{4}){3}$/);

    const [account] = await ownerDb().select().from(authAccount).where(eq(authAccount.userId, userId));
    expect(account?.password).toMatch(/^\$argon2id\$/);
    expect(account?.password).not.toContain(temporaryPassword);

    const [user] = await ownerDb().select().from(authUser).where(eq(authUser.id, userId));
    expect(user).toMatchObject({ username: "40711000001", mustChangePassword: true, platformRole: null });
    expect(await resolveAdminTenant(userId)).toMatchObject({ id: tenantId, role: "owner" });
  });

  it("se loghează cu telefonul în orice format și parola", async () => {
    const { temporaryPassword } = await createUserWithTemporaryPassword({
      phone: "+40 711 000 002",
      name: "Alt Patron",
      membership: { tenantId, role: "owner" },
    });
    const response = await signIn("0711-000-002", temporaryPassword);
    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie().join("\n");
    expect(cookies).toMatch(/pa\.session_token=/);
    expect(cookies).toMatch(/HttpOnly/i);
    expect(cookies).toMatch(/SameSite=Lax/i);
  });

  it("blochează contul după 5 parole greșite, chiar dacă a 6-a e corectă", async () => {
    const phone = "0711 000 003";
    const { temporaryPassword } = await createUserWithTemporaryPassword({
      phone,
      name: "Țintă",
      membership: { tenantId, role: "owner" },
    });
    for (let i = 0; i < 5; i++) {
      expect((await signIn(phone, "parola-gresita-123")).status).toBe(401);
    }
    // Refuzul vine înainte de verificarea parolei, deci parola corectă nu ajută.
    await expect(signIn(phone, temporaryPassword)).rejects.toMatchObject({
      statusCode: 429,
      message: expect.stringContaining("blocat"),
    });
  });

  it("resetarea făcută de super-admin deblochează contul și invalidează parola veche", async () => {
    const phone = "0711 000 004";
    const { userId, temporaryPassword } = await createUserWithTemporaryPassword({
      phone,
      name: "Uituc",
      membership: { tenantId, role: "owner" },
    });
    for (let i = 0; i < 5; i++) await signIn(phone, "parola-gresita-123");
    await expect(signIn(phone, temporaryPassword)).rejects.toMatchObject({ statusCode: 429 });

    const newPassword = await resetToTemporaryPassword(userId, userId);
    expect(newPassword).not.toBe(temporaryPassword);
    expect((await signIn(phone, temporaryPassword)).status).toBe(401);
    expect((await signIn(phone, newPassword)).status).toBe(200);
  });

  it("schimbarea parolei cere parola actuală și închide celelalte sesiuni", async () => {
    const phone = "0711 000 005";
    const { temporaryPassword } = await createUserWithTemporaryPassword({
      phone,
      name: "Schimbător",
      membership: { tenantId, role: "owner" },
    });
    const first = await signIn(phone, temporaryPassword);
    const second = await signIn(phone, temporaryPassword);

    const wrong = await getAuth().api.changePassword({
      body: { currentPassword: "nu-e-parola-actuala", newPassword: "O parolă nouă și lungă 2026" },
      headers: new Headers({ cookie: cookieHeader(first) }),
      asResponse: true,
    });
    expect(wrong.status).toBe(400);

    const changed = await getAuth().api.changePassword({
      body: { currentPassword: temporaryPassword, newPassword: "O parolă nouă și lungă 2026", revokeOtherSessions: true },
      headers: new Headers({ cookie: cookieHeader(first) }),
      asResponse: true,
    });
    expect(changed.status).toBe(200);

    const otherSession = await getAuth().api.getSession({ headers: new Headers({ cookie: cookieHeader(second) }) });
    expect(otherSession).toBeNull();
  });
});

describe("endpoint-uri închise", () => {
  it.each(["/sign-in/email", "/sign-up/email", "/is-username-available", "/update-user", "/request-password-reset"])(
    "%s nu se poate folosi",
    async (path) => {
      const response = await getAuth().handler(
        new Request(`http://localhost:3000/api/auth${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost:3000" },
          body: JSON.stringify({ email: "x@y.ro", password: "parola-oarecare-123", username: "40711000001" }),
        }),
      );
      expect(response.status).toBe(404);
    },
  );
});

describe("super-admin cu TOTP", () => {
  it("după activarea 2FA, logarea cere codul din aplicația de autentificare", async () => {
    const phone = "0799 000 001";
    const { userId, temporaryPassword } = await createUserWithTemporaryPassword({
      phone,
      name: "Propheet",
      platformRole: "superadmin",
    });
    expect(await ownerDb().select().from(tenantMemberships).where(eq(tenantMemberships.userId, userId))).toEqual([]);

    const login = await signIn(phone, temporaryPassword);
    const headers = new Headers({ cookie: cookieHeader(login) });
    const enabled = await getAuth().api.enableTwoFactor({ body: { password: temporaryPassword }, headers });
    if (!("totpURI" in enabled)) throw new Error("TOTP neactivat");
    const secret = secretFromTotpUri(enabled.totpURI);
    await getAuth().api.verifyTOTP({ body: { code: totpCode(secret) }, headers });

    const [user] = await ownerDb().select().from(authUser).where(eq(authUser.id, userId));
    expect(user?.twoFactorEnabled).toBe(true);

    // A doua logare: parola singură nu mai dă sesiune.
    const second = await signIn(phone, temporaryPassword);
    const body = (await second.json()) as { twoFactorRedirect?: boolean };
    expect(body.twoFactorRedirect).toBe(true);
    expect(second.headers.getSetCookie().join("\n")).not.toMatch(/pa\.session_token=[^;]+;/);

    const wrongCode = await getAuth().api.verifyTOTP({
      body: { code: "000000" },
      headers: new Headers({ cookie: cookieHeader(second) }),
      asResponse: true,
    });
    expect(wrongCode.status).toBe(401);

    const verified = await getAuth().api.verifyTOTP({
      body: { code: totpCode(secret) },
      headers: new Headers({ cookie: cookieHeader(second) }),
      asResponse: true,
    });
    expect(verified.status).toBe(200);
    expect(verified.headers.getSetCookie().join("\n")).toMatch(/pa\.session_token=/);
  });
});
