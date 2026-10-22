import "server-only";
import { randomInt } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

// Parolele se stochează doar ca hash argon2id (CLAUDE.md §3). Setările implicite ale @node-rs/argon2
// (argon2id, 19 MiB memorie, 2 treceri, 1 fir) sunt configurația minimă recomandată de OWASP.

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword({ hash: stored, password }: { hash: string; password: string }): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

/** Mesajul de eroare pentru o parolă nouă slabă, sau null dacă e bună. */
export function newPasswordProblem(password: string, phoneDigits: string | null): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Parola trebuie să aibă cel puțin ${PASSWORD_MIN_LENGTH} caractere.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Parola poate avea cel mult ${PASSWORD_MAX_LENGTH} de caractere.`;
  }
  if (/^(.)\1+$/.test(password)) {
    return "Parola nu poate fi același caracter repetat.";
  }
  const digits = password.replace(/\D/g, "");
  if (phoneDigits && digits.length >= 9 && phoneDigits.endsWith(digits.slice(-9))) {
    return "Parola nu poate fi numărul de telefon.";
  }
  return null;
}

const TEMP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/** Parolă temporară ușor de dictat la telefon, ex. „Kp7Q-mX3a-9RtE-w2Hd” (16 caractere aleatorii). */
export function generateTemporaryPassword(): string {
  const groups = Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)]).join(""),
  );
  return groups.join("-");
}
