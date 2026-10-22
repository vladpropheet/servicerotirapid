// Adresele bazei de teste, cu o verificare de siguranță: testele golesc această bază,
// deci refuzăm orice bază al cărei nume nu se termină în `_test` sau care nu e pe calculatorul local.
import { appRoleUrl, type AppRole } from "@/server/db/roles";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "db"]);

function loadEnv(): void {
  try {
    process.loadEnvFile(".env");
  } catch {
    // Fără .env (ex. în CI): variabilele vin din mediu.
  }
}

/** Contul proprietar al bazei de teste (migrări, verificări care trebuie să vadă tot). */
export function testDatabaseUrl(): string {
  loadEnv();
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) {
    throw new Error("Lipsește TEST_DATABASE_URL (vezi .env.example).");
  }
  const url = new URL(raw);
  const database = url.pathname.replace(/^\//, "");
  if (!database.endsWith("_test")) {
    throw new Error(`Refuz să rulez testele pe baza „${database}”: numele trebuie să se termine în _test.`);
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`Refuz să rulez testele pe serverul „${url.hostname}”: doar baze locale.`);
  }
  return raw;
}

export function testAppRole(): AppRole {
  loadEnv();
  return {
    user: process.env.APP_DB_USER ?? "app_user",
    password: process.env.APP_DB_PASSWORD ?? "parola-doar-pentru-teste-0123456789",
  };
}

/** Contul aplicației pe baza de teste: exact ce folosește aplicația în producție (supus RLS). */
export function testAppDatabaseUrl(): string {
  return appRoleUrl(testDatabaseUrl(), testAppRole());
}
