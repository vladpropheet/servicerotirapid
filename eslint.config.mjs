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
      // Rezervarea și anularea lucrează doar prin withTenant() (verificat de testele de izolare).
      "src/server/booking/**",
      // Conturile și sesiunile: tabele globale (fără tenant), vezi src/server/db/schema/auth.ts.
      "src/server/auth/**",
      // Funcțiile panoului de administrare primesc mereu un TenantTx (verificat de testele de izolare).
      "src/server/admin/**",
      // Limitele de cereri și jobul de păstrare a datelor: tabele globale sau buclă explicită pe tenanți.
      "src/server/security/**",
      "src/server/gdpr/**",
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
