import { defineConfig, devices } from "@playwright/test";
import { testAppDatabaseUrl } from "./tests/integration/test-database";

// Testele cap-coadă rulează pe o versiune de producție a aplicației (build + start),
// pe portul 3100, legată de baza de TESTE (golită și populată în global-setup),
// cu contul aplicației (supus Row-Level Security), exact ca în producție.
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    ...devices["Pixel 7"],
    baseURL: BASE_URL,
    locale: "ro-RO",
    timezoneId: "Europe/Bucharest",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      DATABASE_URL: testAppDatabaseUrl(),
      APP_BASE_URL: BASE_URL,
      AUTH_SECRET: process.env.AUTH_SECRET ?? "cheie-de-sesiune-doar-pentru-teste-0123456789",
      BOOKING_LINK_SECRET: process.env.BOOKING_LINK_SECRET ?? "cheie-doar-pentru-teste-0123456789abcdef",
      NEXT_TELEMETRY_DISABLED: "1",
      // Testele nu depind de serverele Cloudflare: verificarea anti-robot e oprită conștient.
      TURNSTILE_DISABLED: "1",
    },
  },
});
