import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Conexiunea la baza de date se folosește doar prin straturile care impun tenantul.
// Orice alt cod (pagini, componente, acțiuni) trece prin src/server/tenant și src/server/repos.
const DB_IMPORT_MESSAGE =
  "Nu importa conexiunea la baza de date direct. Folosește withTenant() din @/server/tenant și funcțiile din @/server/repos.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/server/db/**",
      "src/server/repos/**",
      "src/server/tenant/**",
      "src/server/seed/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server/db", "@/server/db/*", "**/server/db", "**/server/db/*"],
              message: DB_IMPORT_MESSAGE,
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "drizzle/**"]),
]);

export default eslintConfig;
