// Rulează înaintea fiecărui fișier de test de integrare: aplicația (getDb) folosește baza de teste.
import { testDatabaseUrl } from "./test-database";

process.env.DATABASE_URL = testDatabaseUrl();
