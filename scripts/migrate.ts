// Aplică migrările din folderul drizzle/ care nu au rulat încă.
// Nu șterge nimic: fiecare migrare rulează o singură dată, în ordine, și e înregistrată în baza de date.
//
//   npm run db:migrate
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// În producție (Faza 4+) migrările rulează cu contul proprietar al tabelelor.
const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Lipsește DATABASE_URL (sau MIGRATION_DATABASE_URL).");
  process.exit(1);
}

const pool = new Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("Migrările au fost aplicate.");
} catch (error) {
  console.error("Migrarea a eșuat:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
