// Aplică migrările din folderul drizzle/ care nu au rulat încă.
// Nu șterge nimic: fiecare migrare rulează o singură dată, în ordine, și e înregistrată în baza de date.
//
//   npm run db:migrate
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main(): Promise<void> {
  // În producție (Faza 4+) migrările rulează cu contul proprietar al tabelelor.
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Lipsește DATABASE_URL (sau MIGRATION_DATABASE_URL).");
  }

  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }
}

main().then(
  () => console.log("Migrările au fost aplicate."),
  (error: unknown) => {
    console.error("Migrarea a eșuat:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
