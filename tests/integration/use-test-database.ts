// Rulează înaintea fiecărui fișier de test de integrare: aplicația (getDb) folosește baza de teste.
import { testDatabaseUrl } from "./test-database";

process.env.DATABASE_URL = testDatabaseUrl();
// Destule conexiuni ca testul de concurență să trimită cererile chiar în paralel.
process.env.DATABASE_POOL_MAX = "25";
process.env.BOOKING_LINK_SECRET ??= "cheie-doar-pentru-teste-0123456789abcdef";
