// Creează un cont pentru panoul de administrare, cu o parolă temporară afișată O SINGURĂ DATĂ.
// La prima logare, parola temporară trebuie schimbată.
//
//   npm run admin:create -- --rol patron --service roti-rapid --telefon "0766 777 130" --nume "Patron"
//   npm run admin:create -- --rol superadmin --telefon "07xx xxx xxx" --nume "Vlad"
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { createUserWithTemporaryPassword } from "@/server/auth/users";
import { closeDb, getDb } from "@/server/db/client";
import { tenants } from "@/server/db/schema";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      rol: { type: "string" },
      service: { type: "string" },
      telefon: { type: "string" },
      nume: { type: "string" },
    },
  });
  if (!values.telefon || !values.nume || (values.rol !== "patron" && values.rol !== "superadmin")) {
    throw new Error('Folosire: --rol patron|superadmin --telefon "07xx xxx xxx" --nume "Nume" [--service slug]');
  }

  let membership: { tenantId: string; role: "owner" } | undefined;
  if (values.rol === "patron") {
    if (!values.service) throw new Error("Pentru un patron, spune și service-ul: --service roti-rapid");
    const [tenant] = await getDb().select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, values.service));
    if (!tenant) throw new Error(`Service-ul „${values.service}” nu există. Rulează întâi npm run db:seed.`);
    membership = { tenantId: tenant.id, role: "owner" };
  }

  const { temporaryPassword } = await createUserWithTemporaryPassword({
    phone: values.telefon,
    name: values.nume,
    platformRole: values.rol === "superadmin" ? "superadmin" : undefined,
    membership,
  });

  console.log("\nContul a fost creat.");
  console.log(`  Telefon (pentru logare): ${values.telefon}`);
  console.log(`  Parolă temporară:        ${temporaryPassword}`);
  console.log("\nNotează parola acum: nu se mai afișează și nu e salvată nicăieri în clar.");
  console.log("La prima logare pe /admin/login se cere o parolă nouă.\n");
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Contul nu a fost creat:", message.includes("auth_user_username_uq") ? "există deja un cont cu acest telefon." : message);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
