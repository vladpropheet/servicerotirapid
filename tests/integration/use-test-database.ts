// Rulează înaintea fiecărui fișier de test de integrare: aplicația (getDb) folosește baza de teste,
// cu contul aplicației (supus Row-Level Security), exact ca în producție.
import { testAppDatabaseUrl } from "./test-database";

process.env.DATABASE_URL = testAppDatabaseUrl();
// Destule conexiuni ca testul de concurență să trimită cererile chiar în paralel.
process.env.DATABASE_POOL_MAX = "25";
process.env.BOOKING_LINK_SECRET ??= "cheie-doar-pentru-teste-0123456789abcdef";
process.env.AUTH_SECRET ??= "cheie-de-sesiune-doar-pentru-teste-0123456789";
process.env.APP_BASE_URL ??= "http://localhost:3000";
