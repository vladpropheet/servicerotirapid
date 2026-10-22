import { sql, type SQL } from "drizzle-orm";
import { timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";

export const idColumn = () => uuid("id").primaryKey().defaultRandom();

export const createdAtColumn = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const timestamps = () => ({
  createdAt: createdAtColumn(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** CHECK „coloana este una din valorile listei”. Valorile sunt constante din src/domain/enums.ts. */
export function inList(column: AnyPgColumn, values: readonly string[]): SQL {
  for (const value of values) {
    if (!/^[a-z0-9_]+$/.test(value)) {
      throw new Error(`Valoare nepermisă într-o constrângere CHECK: ${value}`);
    }
  }
  const literals = sql.join(
    values.map((value) => sql.raw(`'${value}'`)),
    sql`, `,
  );
  return sql`${column} in (${literals})`;
}

/** Codurile interne (ex. `pachet_complet`, `12-16`): litere mici, cifre, `_` și `-`. */
export function codeCheck(column: AnyPgColumn): SQL {
  return sql`${column} ~ '^[a-z0-9_-]{1,48}$'`;
}
