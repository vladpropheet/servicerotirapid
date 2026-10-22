"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth/auth";
import { phoneToUsername } from "@/server/auth/users";
import { clientIp } from "@/server/security/client-ip";
import { hitRateLimit, RATE_RULES } from "@/server/security/rate-limit";

export type FormState = { error: string | null };

/** Starea formularului de logare: telefonul rămâne completat după o încercare greșită. */
export type LoginState = { error: string | null; phone: string; attempt: number };

/** Pasul 1: telefon + parolă. Cookie-ul de sesiune îl setează Better Auth (plugin nextCookies). */
export async function loginAction(previous: LoginState, formData: FormData): Promise<LoginState> {
  const phone = String(formData.get("telefon") ?? "").slice(0, 30);
  const failed = (error: string): LoginState => ({ error, phone, attempt: previous.attempt + 1 });
  const username = phoneToUsername(phone);
  const password = String(formData.get("parola") ?? "");
  if (!username || password === "") {
    return failed("Scrie numărul de telefon și parola.");
  }
  if (!(await hitRateLimit("login-ip", await clientIp(), RATE_RULES.loginsPerIp)).allowed) {
    return failed("Prea multe încercări de pe această conexiune. Încearcă din nou peste 15 minute.");
  }

  let needsCode = false;
  try {
    const result = await getAuth().api.signInUsername({
      body: { username, password, rememberMe: true },
      headers: await headers(),
    });
    needsCode = "twoFactorRedirect" in result && result.twoFactorRedirect === true;
  } catch (error) {
    if (isAPIError(error)) {
      if (error.statusCode === 429) {
        return failed("Prea multe încercări greșite. Contul e blocat 15 minute. Dacă ai uitat parola, sună la Propheet AIgency.");
      }
      return failed("Telefonul sau parola nu sunt corecte.");
    }
    console.error("Logarea a eșuat:", error instanceof Error ? error.name : "unknown");
    return failed("A apărut o problemă. Încearcă din nou.");
  }
  redirect(needsCode ? "/admin/login/cod" : "/admin");
}

/** Pasul 2 (doar dacă are 2FA): codul din aplicația de autentificare sau un cod de rezervă. */
export async function verifyCodeAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const code = String(formData.get("cod") ?? "").replace(/\s/g, "");
  const isBackup = formData.get("tip") === "rezerva";
  if (!isBackup && !/^\d{6}$/.test(code)) return { error: "Codul are 6 cifre." };
  if (isBackup && code.length < 6) return { error: "Scrie codul de rezervă." };
  if (!(await hitRateLimit("login-ip", await clientIp(), RATE_RULES.loginsPerIp)).allowed) {
    return { error: "Prea multe încercări de pe această conexiune. Încearcă din nou peste 15 minute." };
  }

  try {
    const requestHeaders = await headers();
    if (isBackup) {
      await getAuth().api.verifyBackupCode({ body: { code }, headers: requestHeaders });
    } else {
      await getAuth().api.verifyTOTP({ body: { code }, headers: requestHeaders });
    }
  } catch (error) {
    if (isAPIError(error)) return { error: "Codul nu e corect sau a expirat. Încearcă din nou." };
    console.error("Verificarea codului a eșuat:", error instanceof Error ? error.name : "unknown");
    return { error: "A apărut o problemă. Încearcă din nou." };
  }
  redirect("/admin");
}
