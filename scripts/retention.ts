// Ștergerea automată a datelor vechi (GDPR): programările mai vechi decât perioada setată de fiecare
// service, clienții rămași fără programări, sesiunile și linkurile expirate, limitele de cereri vechi.
// Se programează zilnic (Coolify, Faza 7). Se poate rula de mai multe ori fără probleme.
//
//   npm run gdpr:retention
import { closeDb } from "@/server/db/client";
import { runRetention } from "@/server/gdpr/retention";

async function main(): Promise<void> {
  const report = await runRetention(new Date());
  // Doar numere: niciun nume sau telefon în log.
  console.log(
    `Ștergere automată gata: ${report.tenants} service-uri, ${report.bookings} programări, ` +
      `${report.customers} clienți, ${report.sessions} sesiuni expirate, ${report.bookingLinks} linkuri expirate, ` +
      `${report.rateLimits} limite de cereri, ${report.verifications} verificări, ${report.loginGuards} blocări de logare.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("Ștergerea automată a eșuat:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
