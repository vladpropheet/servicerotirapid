import { defineConfig, devices } from "@playwright/test";

// Testele cap-coadă rulează pe o versiune de producție a aplicației (build + start),
// pe portul 3100, legată de baza de TESTE (golită și populată în global-setup).
try {
  process.loadEnvFile(".env");
} catch {
  // Fără .env (ex. în CI): variabilele vin din mediu.
}

const PORT = 3100;
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? "";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    ...devices["Pixel 7"],
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: "ro-RO",
    timezoneId: "Europe/Bucharest",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      DATABASE_URL: testDatabaseUrl,
      BOOKING_LINK_SECRET: process.env.BOOKING_LINK_SECRET ?? "cheie-doar-pentru-teste-0123456789abcdef",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
