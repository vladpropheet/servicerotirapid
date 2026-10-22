// Aplică migrările din folderul drizzle/ care nu au rulat încă, apoi pregătește contul aplicației.
// Nu șterge nimic: fiecare migrare rulează o singură dată, în ordine, și e înregistrată în baza de date.
//
//   npm run db:migrate
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { ensureAppRole } from "@/server/db/roles";

async function main(): Promise<void> {
  // Migrările rulează cu contul proprietar al tabelelor, nu cu cel al aplicației.
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) {
    throw new Error("Lipsește MIGRATION_DATABASE_URL (contul proprietar al bazei de date).");
  }
  const appPassword = process.env.APP_DB_PASSWORD;
  if (!appPassword) {
    throw new Error("Lipsește APP_DB_PASSWORD (parola contului aplicației, app_user).");
  }

  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    await ensureAppRole(pool, { user: process.env.APP_DB_USER ?? "app_user", password: appPassword });
  } finally {
    await pool.end();
  }
}

main().then(
  () => console.log("Migrările au fost aplicate, iar contul aplicației e pregătit."),
  (error: unknown) => {
    console.error("Migrarea a eșuat:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
