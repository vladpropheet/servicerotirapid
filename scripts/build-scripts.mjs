// Împachetează scripturile de întreținere (migrări, seed, conturi, ștergere automată) în fișiere JavaScript
// de sine stătătoare, pentru containerul `ops` din producție (unde nu există TypeScript / tsx).
//
//   npm run build:scripts   -> dist/scripts/*.mjs
import { build } from "esbuild";

await build({
  entryPoints: ["scripts/migrate.ts", "scripts/seed.ts", "scripts/create-user.ts", "scripts/reset-password.ts", "scripts/retention.ts"],
  outdir: "dist/scripts",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  // `server-only` devine un modul gol, ca în serverul Next.js.
  conditions: ["react-server"],
  // Module native sau opționale: rămân în node_modules din imagine.
  external: ["@node-rs/argon2", "pg-native"],
  // Unele biblioteci folosesc `require` (CommonJS) în interiorul pachetului ESM.
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
  tsconfig: "tsconfig.json",
  logLevel: "warning",
});
console.log("Scripturile de întreținere au fost împachetate în dist/scripts/.");
