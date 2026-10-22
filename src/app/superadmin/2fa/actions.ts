"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { getAuth } from "@/server/auth/auth";
import { getSessionUser } from "@/server/auth/session";

export type TwoFactorSetupState =
  | { step: "password"; error: string | null }
  | { step: "scan"; qrDataUrl: string; secret: string; backupCodes: string[]; error: string | null };

/**
 * Activarea verificării în doi pași, în doi pași:
 * 1. parola → cheia TOTP (cod QR) și codurile de rezervă;
 * 2. primul cod din aplicație → 2FA devine activ (dovedește că telefonul e configurat corect).
 */
export async function twoFactorSetupAction(
  previous: TwoFactorSetupState,
  formData: FormData,
): Promise<TwoFactorSetupState> {
  const user = await getSessionUser();
  if (!user || user.platformRole !== "superadmin") redirect("/admin/login");
  const requestHeaders = await headers();

  if (previous.step === "password") {
    const password = String(formData.get("parola") ?? "");
    try {
      const result = await getAuth().api.enableTwoFactor({ body: { password }, headers: requestHeaders });
      if (!("totpURI" in result)) return { step: "password", error: "Activarea a eșuat. Încearcă din nou." };
      const secret = new URL(result.totpURI).searchParams.get("secret") ?? "";
      const qrDataUrl = await QRCode.toDataURL(result.totpURI, { margin: 1, width: 240 });
      return { step: "scan", qrDataUrl, secret, backupCodes: result.backupCodes, error: null };
    } catch (error) {
      if (isAPIError(error)) return { step: "password", error: "Parola nu e corectă." };
      throw error;
    }
  }

  const code = String(formData.get("cod") ?? "").replace(/\s/g, "");
  try {
    await getAuth().api.verifyTOTP({ body: { code }, headers: requestHeaders });
  } catch (error) {
    if (isAPIError(error)) return { ...previous, error: "Codul nu e corect. Verifică ora telefonului și încearcă din nou." };
    throw error;
  }
  redirect("/superadmin");
}
