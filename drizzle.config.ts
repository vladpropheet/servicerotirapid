import { defineConfig } from "drizzle-kit";

// drizzle-kit (generate, studio) citește conexiunea din .env.
try {
  process.loadEnvFile(".env");
} catch {
  // Fără .env (ex. în CI): variabilele vin din mediu.
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
