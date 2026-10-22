import { createHmac } from "node:crypto";

// Generator TOTP (RFC 6238) pentru teste, ca o aplicație de autentificare de pe telefon.

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of input.replace(/=+$/, "").toUpperCase()) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error(`Caracter base32 invalid: ${char}`);
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((byte) => parseInt(byte, 2)));
}

export function totpCode(secretBase32: string, now: number = Date.now(), digits = 6, periodSeconds = 30): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / periodSeconds)));
  const hmac = createHmac("sha1", base32Decode(secretBase32)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/** Secretul din `otpauth://totp/...?secret=XXXX&...`. */
export function secretFromTotpUri(uri: string): string {
  const secret = new URL(uri).searchParams.get("secret");
  if (!secret) throw new Error("URI TOTP fără secret.");
  return secret;
}
