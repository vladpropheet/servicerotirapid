// Rulează o dată, la pornirea serverului. Oprește pornirea în producție dacă lipsește ceva de securitate:
// - aplicația trebuie să folosească contul de bază de date fără drepturi de administrator
//   (altfel Row-Level Security nu s-ar aplica și izolarea dintre service-uri ar depinde doar de cod);
// - cheile secrete trebuie să existe și să fie lungi;
// - protecția anti-spam (Turnstile) trebuie configurată sau oprită explicit.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Erorile de bază de date apar în log fără valori (nume, telefoane).
  const { installLogRedaction } = await import("./server/security/redact-logs");
  installLogRedaction();

  const problems: string[] = [];
  const { secretsProblem, turnstileConfigProblem } = await import("./server/security/startup-checks");
  for (const problem of [secretsProblem(), turnstileConfigProblem()]) {
    if (problem) problems.push(problem);
  }

  if (process.env.DATABASE_URL) {
    const { assertRestrictedDatabaseRole } = await import("./server/db/role-check");
    try {
      await assertRestrictedDatabaseRole();
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  } else {
    problems.push("Lipsește DATABASE_URL.");
  }

  if (problems.length === 0) return;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`Pornire oprită:\n- ${problems.join("\n- ")}`);
  }
  for (const problem of problems) console.warn(`ATENȚIE: ${problem}`);
}
