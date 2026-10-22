import "server-only";
import { createHash, createHmac } from "node:crypto";

// Linkul „vezi / anulează programarea”: APP_BASE_URL/p/<token>.
//
// token = primii 16 octeți din HMAC-SHA256(BOOKING_LINK_SECRET, booking_id + versiune), în base64url (22 de caractere).
// - Doar serverul îl poate genera (are nevoie de cheia secretă) și nu conține niciun id.
// - Se poate genera din nou oricând (de ex. pentru SMS-ul de reamintire), fără să-l stocăm.
// - În baza de date stă doar SHA-256(token): cine are doar baza de date nu poate folosi linkurile.

export const TOKEN_KEY_ID = 1;
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

function linkSecret(): string {
  const secret = process.env.BOOKING_LINK_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("BOOKING_LINK_SECRET lipsește sau are mai puțin de 32 de caractere.");
  }
  return secret;
}

export function deriveBookingToken(bookingId: string, tokenVersion: number): string {
  return createHmac("sha256", linkSecret())
    .update(`bk-manage|${bookingId}|${tokenVersion}`)
    .digest()
    .subarray(0, 16)
    .toString("base64url");
}

export function hashBookingToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
