// Adresa bazei de teste, cu o verificare de siguranță: testele golesc această bază,
// deci refuzăm orice bază al cărei nume nu se termină în `_test` sau care nu e pe calculatorul local.

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "db"]);

export function testDatabaseUrl(): string {
  try {
    process.loadEnvFile(".env");
  } catch {
    // Fără .env (ex. în CI): variabilele vin din mediu.
  }

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
