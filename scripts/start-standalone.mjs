// Pornește versiunea de producție construită cu `npm run build` (ieșirea „standalone”), exact ca în Docker.
// Folosită de `npm run start` și de testele Playwright.
//
//   npm run start -- --port 3100
import { cpSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { port: { type: "string", short: "p" } }, strict: false });

// Fișierele statice (CSS, JS) nu sunt copiate automat lângă server; în Docker le copiază Dockerfile-ul.
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });

process.env.PORT = String(values.port ?? process.env.PORT ?? "3000");
await import(pathToFileURL(path.resolve(".next/standalone/server.js")).href);
