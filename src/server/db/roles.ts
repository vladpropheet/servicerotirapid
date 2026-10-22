// Contul de bază de date al aplicației (`app_user`): fără drepturi de administrator și
// fără drept de a ocoli Row-Level Security. Migrările rulează cu contul proprietar;
// aplicația rulează doar cu acest cont.
import { escapeIdentifier, escapeLiteral, type Pool } from "pg";

const ROLE_NAME = /^[a-z_][a-z0-9_]{0,30}$/;

export type AppRole = { user: string; password: string };

/** Creează (sau actualizează) contul aplicației și îi dă exact drepturile necesare. Se poate rula de oricâte ori. */
export async function ensureAppRole(pool: Pool, role: AppRole): Promise<void> {
  if (!ROLE_NAME.test(role.user)) {
    throw new Error(`Nume de cont invalid: ${role.user}`);
  }
  if (role.password.length < 16) {
    throw new Error("Parola contului aplicației trebuie să aibă cel puțin 16 caractere.");
  }
  const user = escapeIdentifier(role.user);
  const { rows } = await pool.query<{ db: string }>("select current_database() as db");
  const database = escapeIdentifier(rows[0]!.db);

  const statements = [
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${escapeLiteral(role.user)}) THEN
         CREATE ROLE ${user} LOGIN;
       END IF;
     END $$`,
    `ALTER ROLE ${user} WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD ${escapeLiteral(role.password)}`,
    `GRANT CONNECT ON DATABASE ${database} TO ${user}`,
    `GRANT USAGE ON SCHEMA public TO ${user}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${user}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${user}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${user}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${user}`,
    // Istoricul modificărilor: aplicația poate doar adăuga, nu poate modifica sau șterge.
    `REVOKE UPDATE, DELETE ON audit_log, platform_audit_log FROM ${user}`,
  ];
  for (const statement of statements) {
    await pool.query(statement);
  }
}

/** Adresa de conectare a contului aplicației, construită din adresa proprietarului. */
export function appRoleUrl(ownerUrl: string, role: AppRole): string {
  const url = new URL(ownerUrl);
  url.username = encodeURIComponent(role.user);
  url.password = encodeURIComponent(role.password);
  return url.toString();
}
