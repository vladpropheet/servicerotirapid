// Recunoașterea erorilor PostgreSQL, fără să depindem de textul mesajului.
// Drizzle învelește eroarea bazei de date într-un DrizzleQueryError, cu eroarea originală în `cause`.

/** „Valoare duplicată” (cod 23505) pentru constrângerea dată, direct sau în lanțul de `cause`. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (candidate.code === "23505" && candidate.constraint === constraint) return true;
    current = candidate.cause;
  }
  return false;
}
