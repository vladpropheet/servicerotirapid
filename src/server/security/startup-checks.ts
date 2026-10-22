// Verificări de configurare la pornirea serverului (vezi src/instrumentation.ts).
// Fără `server-only`: fișierul rulează și în afara randării React.

/** În producție, protecția anti-spam a formularului (Turnstile) trebuie configurată sau oprită explicit. */
export function turnstileConfigProblem(): string | null {
  if (process.env.NODE_ENV !== "production" || process.env.TURNSTILE_DISABLED === "1") return null;
  if (process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY) return null;
  return "Lipsesc TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY (protecția anti-spam a formularului). Pentru a o opri conștient: TURNSTILE_DISABLED=1.";
}

/** Cheile secrete trebuie să fie lungi (sesiuni, linkuri din SMS / ecranul de succes). */
export function secretsProblem(): string | null {
  for (const name of ["AUTH_SECRET", "BOOKING_LINK_SECRET"]) {
    const value = process.env[name];
    if (!value || value.length < 32) return `${name} lipsește sau are mai puțin de 32 de caractere.`;
  }
  return null;
}
