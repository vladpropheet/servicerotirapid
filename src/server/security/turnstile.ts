import "server-only";

// Cloudflare Turnstile (gratuit): verifică faptul că formularul de programare e completat de un om.
// https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
//
// Cheile vin din variabile de mediu (TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY).
// Fără chei: în dezvoltare verificarea e oprită; în producție serverul nu pornește,
// decât dacă TURNSTILE_DISABLED=1 (oprire conștientă, de ex. în testele automate).

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileMode = "enabled" | "disabled";

export function turnstileMode(): TurnstileMode {
  if (process.env.TURNSTILE_DISABLED === "1") return "disabled";
  return process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY ? "enabled" : "disabled";
}

/** Cheia publică pentru widget (null = widgetul nu se afișează). */
export function turnstileSiteKey(): string | null {
  return turnstileMode() === "enabled" ? (process.env.TURNSTILE_SITE_KEY ?? null) : null;
}

type SiteverifyResponse = { success: boolean; "error-codes"?: string[] };

/**
 * Verifică tokenul primit de la widget. Fiecare token merge o singură dată și expiră în 5 minute.
 * Nu trimitem IP-ul clientului către Cloudflare (parametrul e opțional).
 */
export async function verifyTurnstile(
  token: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (turnstileMode() === "disabled") return true;
  if (!token || token.length > 2048) return false;
  try {
    const response = await fetchImpl(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY ?? "", response: token }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as SiteverifyResponse;
    return data.success === true;
  } catch {
    console.error("Turnstile: verificarea nu a răspuns.");
    return false;
  }
}
