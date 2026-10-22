// Rulează o dată, la pornirea serverului.
// Verifică faptul că aplicația folosește contul de bază de date fără drepturi de administrator:
// altfel Row-Level Security nu s-ar aplica și izolarea dintre service-uri ar depinde doar de cod.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.DATABASE_URL) return;

  const { assertRestrictedDatabaseRole } = await import("./server/db/role-check");
  try {
    await assertRestrictedDatabaseRole();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Pornire oprită: ${message}`);
    }
    console.warn(`ATENȚIE: ${message}`);
  }
}
