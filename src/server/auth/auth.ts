import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor, username } from "better-auth/plugins";
import { getDb } from "@/server/db/client";
import { authAccount, authSession, authTwoFactor, authUser, authVerification } from "@/server/db/schema";
import { lockedUntil, recordFailedLogin, recordSuccessfulLogin } from "./login-guard";
import { hashPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, verifyPassword } from "./password";

// Autentificarea panoului de administrare (Better Auth 1.7, CLAUDE.md §6).
// - Logare cu telefon + parolă: numele de utilizator e telefonul normalizat, fără „+” (ex. 40766777130).
// - Fără înregistrare publică: conturile le creează scriptul de pornire sau super-adminul.
// - Parole argon2id, blocare după 5 încercări greșite, TOTP pentru super-admin.
// - Doar endpoint-urile folosite rămân deschise; restul sunt dezactivate.

const SIGN_IN_PATH = "/sign-in/username";

/** Endpoint-uri Better Auth pe care nu le folosim. Închise, ca să nu fie o suprafață de atac. */
const DISABLED_PATHS = [
  "/sign-up/email",
  "/sign-in/email",
  "/sign-in/social",
  "/is-username-available",
  "/update-user",
  "/delete-user",
  "/delete-user/callback",
  "/change-email",
  "/request-password-reset",
  "/reset-password",
  "/send-verification-email",
  "/verify-email",
  "/set-password",
  "/link-social",
  "/unlink-account",
  "/list-accounts",
  "/refresh-token",
  "/get-access-token",
  "/account-info",
  "/two-factor/send-otp",
  "/two-factor/verify-otp",
];

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Lipsește variabila de mediu ${name}.`);
  return value;
}

function createAuth() {
  const secret = requiredEnv("AUTH_SECRET");
  if (secret.length < 32) throw new Error("AUTH_SECRET trebuie să aibă cel puțin 32 de caractere.");

  return betterAuth({
    appName: "Programări online",
    baseURL: requiredEnv("APP_BASE_URL"),
    secret,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        auth_user: authUser,
        auth_session: authSession,
        auth_account: authAccount,
        auth_verification: authVerification,
        auth_two_factor: authTwoFactor,
      },
    }),
    user: {
      modelName: "auth_user",
      additionalFields: {
        platformRole: { type: "string", required: false, input: false },
        mustChangePassword: { type: "boolean", required: true, defaultValue: false, input: false },
      },
    },
    session: {
      modelName: "auth_session",
      expiresIn: 60 * 60 * 24 * 30, // 30 de zile
      updateAge: 60 * 60 * 24, // se prelungește o dată pe zi
    },
    account: { modelName: "auth_account" },
    verification: { modelName: "auth_verification" },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    plugins: [
      username({
        minUsernameLength: 11,
        maxUsernameLength: 15,
        usernameValidator: (value) => /^\d{11,15}$/.test(value),
      }),
      twoFactor({
        issuer: "Propheet AIgency",
        schema: { twoFactor: { modelName: "auth_two_factor" } },
      }),
      // Trebuie să fie ultimul: setează cookie-urile când logarea vine dintr-o acțiune de server.
      nextCookies(),
    ],
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        [SIGN_IN_PATH]: { window: 60, max: 10 },
        "/two-factor/verify-totp": { window: 60, max: 10 },
        "/change-password": { window: 60, max: 5 },
      },
    },
    disabledPaths: DISABLED_PATHS,
    advanced: {
      cookiePrefix: "pa",
      useSecureCookies: process.env.NODE_ENV === "production",
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== SIGN_IN_PATH) return;
        const name = String((ctx.body as { username?: unknown } | undefined)?.username ?? "");
        if (await lockedUntil(name)) {
          throw new APIError("TOO_MANY_REQUESTS", {
            message: "Prea multe încercări greșite. Contul e blocat 15 minute.",
          });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== SIGN_IN_PATH) return;
        const name = String((ctx.body as { username?: unknown } | undefined)?.username ?? "");
        if (isAPIError(ctx.context.returned)) {
          if (ctx.context.returned.statusCode === 401) await recordFailedLogin(name);
        } else {
          await recordSuccessfulLogin(name);
        }
      }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

let instance: Auth | undefined;

/** Se creează la prima folosire, ca `next build` să nu aibă nevoie de baza de date și de chei. */
export function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}
