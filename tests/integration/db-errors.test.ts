// Un telefon deja folosit trebuie recunoscut ca atare (nu printr-un text de mesaj), iar eroarea
// de bază de date nu are voie să ajungă în log cu numele și telefonul.
import { afterAll, describe, expect, it } from "vitest";
import { isUniqueViolation } from "@/lib/db-errors";
import { createUserWithTemporaryPassword } from "@/server/auth/users";
import { closeDb } from "@/server/db/client";
import { redactLogValue } from "@/server/security/redact-logs";

afterAll(async () => {
  await closeDb();
});

async function duplicateError(): Promise<unknown> {
  const input = { phone: "0799 111 222", name: "Ion Duplicat" };
  await createUserWithTemporaryPassword(input);
  return createUserWithTemporaryPassword(input).then(
    () => null,
    (error: unknown) => error,
  );
}

describe("telefon duplicat la crearea unui cont", () => {
  it("e recunoscut după constrângere, prin eroarea învelită de Drizzle", async () => {
    const error = await duplicateError();
    expect(error).toBeInstanceOf(Error);
    expect(isUniqueViolation(error, "auth_user_username_uq")).toBe(true);
    expect(isUniqueViolation(error, "alta_constrangere")).toBe(false);
    expect(isUniqueViolation(new Error("auth_user_username_uq"), "auth_user_username_uq")).toBe(false);
  });

  it("în log rămân doar codul și constrângerea, fără nume, telefon sau interogare", async () => {
    const error = await createUserWithTemporaryPassword({ phone: "0799 111 222", name: "Ion Duplicat" }).catch((e: unknown) => e);
    const safe = redactLogValue(error) as Error;
    const text = `${safe.message}\n${safe.stack}\n${JSON.stringify(safe)}`;
    expect(safe.message).toBe("Interogare eșuată (23505, auth_user_username_uq)");
    expect(text).not.toMatch(/Duplicat|40799111222|0799 111 222|insert into/);
    expect(safe.stack).toMatch(/\n\s+at /);
  });

  it("celelalte valori din log rămân neschimbate", () => {
    const plain = new Error("altceva");
    expect(redactLogValue(plain)).toBe(plain);
    expect(redactLogValue("text")).toBe("text");
  });
});
