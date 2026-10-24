// Logurile serverului nu au voie să conțină date personale (CLAUDE.md §8).
// O eroare de bază de date din Drizzle conține în mesaj interogarea și valorile ei (nume, telefoane),
// iar eroarea PostgreSQL din `cause` poate conține valoarea duplicată. Next.js le scrie în log
// cu console.error când o acțiune eșuează neprevăzut; aici le înlocuim cu o variantă fără valori.
// Fără `server-only`: rulează din src/instrumentation.ts.

type PgDetails = { code?: unknown; constraint?: unknown; table?: unknown };

/** O copie a erorii fără interogare, valori și detalii; restul argumentelor rămân neschimbate. */
export function redactLogValue(value: unknown): unknown {
  if (!(value instanceof Error) || !("query" in value) || !("params" in value)) return value;
  const cause = (value.cause ?? {}) as PgDetails;
  const parts = [cause.code, cause.constraint ?? cause.table].filter((part) => typeof part === "string");
  const safe = new Error(`Interogare eșuată${parts.length > 0 ? ` (${parts.join(", ")})` : ""}`);
  safe.name = value.name;
  const frames = (value.stack ?? "").split("\n").filter((line) => line.trimStart().startsWith("at "));
  safe.stack = [`${safe.name}: ${safe.message}`, ...frames].join("\n");
  const digest = (value as { digest?: unknown }).digest;
  if (typeof digest === "string") Object.assign(safe, { digest });
  return safe;
}

let installed = false;

export function installLogRedaction(): void {
  if (installed) return;
  installed = true;
  for (const method of ["error", "warn", "log"] as const) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => original(...args.map(redactLogValue));
  }
}
