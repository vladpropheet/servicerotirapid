// Dovezi că un service nu poate citi sau modifica datele altui service (CLAUDE.md §4).
// Testele cu admin autentificat vin în Faza 4; aici verificăm stratul de date și baza de date.
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { closeOwnerDb, ownerDb } from "./owner-db";
import { servicePrices, services, tenants, vehicleTypes } from "@/server/db/schema";
import {
  getServiceById,
  listActiveServices,
  listCategories,
  listPricesForService,
  renameService,
} from "@/server/repos/catalog";
import { mapCatalog } from "@/server/seed/map-catalog";
import { seedTenant } from "@/server/seed/write-seed";
import { resolvePublicTenant, withTenant, type TenantId } from "@/server/tenant";
import { loadCatalog } from "../helpers/catalog";

let tenantA: TenantId;
let tenantB: TenantId;
let serviceOfB: { id: string; name: string };

beforeAll(async () => {
  await seedTenant(getDb(), mapCatalog(loadCatalog(), { slug: "izolare-a" }));
  await seedTenant(getDb(), mapCatalog(loadCatalog(), { slug: "izolare-b" }));
  tenantA = (await resolvePublicTenant("izolare-a"))!.id;
  tenantB = (await resolvePublicTenant("izolare-b"))!.id;

  const [row] = await ownerDb()
    .select({ id: services.id, name: services.name })
    .from(services)
    .where(and(eq(services.tenantId, tenantB), eq(services.code, "pachet_complet")));
  serviceOfB = row!;
});

afterAll(async () => {
  await closeDb();
  await closeOwnerDb();
});

describe("rezolvarea tenantului din URL", () => {
  it("găsește un service activ după slug", async () => {
    const tenant = await resolvePublicTenant("izolare-a");
    expect(tenant).toMatchObject({ slug: "izolare-a", displayName: "Service Roți Rapid" });
  });

  it("refuză slug-uri invalide sau inexistente", async () => {
    expect(await resolvePublicTenant("nu-exista")).toBeNull();
    expect(await resolvePublicTenant("../admin")).toBeNull();
    expect(await resolvePublicTenant("IZOLARE-A")).toBeNull();
  });

  it("nu întoarce un service suspendat", async () => {
    await seedTenant(getDb(), mapCatalog(loadCatalog(), { slug: "izolare-suspendat" }));
    await ownerDb().update(tenants).set({ status: "suspended" }).where(eq(tenants.slug, "izolare-suspendat"));
    expect(await resolvePublicTenant("izolare-suspendat")).toBeNull();
  });
});

describe("repo-urile filtrează după tenant", () => {
  it("listele conțin doar datele tenantului curent", async () => {
    const list = await withTenant(tenantA, (t) => listActiveServices(t));
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((s) => s.tenantId === tenantA)).toBe(true);

    const categories = await withTenant(tenantA, (t) => listCategories(t));
    expect(categories.every((c) => c.tenantId === tenantA)).toBe(true);
  });

  it("A nu poate citi un serviciu al lui B, nici prețurile lui", async () => {
    expect(await withTenant(tenantA, (t) => getServiceById(t, serviceOfB.id))).toBeNull();
    expect(await withTenant(tenantA, (t) => listPricesForService(t, serviceOfB.id))).toEqual([]);
    // Controlul: B își vede propriul serviciu.
    expect(await withTenant(tenantB, (t) => getServiceById(t, serviceOfB.id))).not.toBeNull();
  });

  it("A nu poate modifica un serviciu al lui B", async () => {
    const changed = await withTenant(tenantA, (t) => renameService(t, serviceOfB.id, "Furat"));
    expect(changed).toBe(false);

    const [after] = await ownerDb().select().from(services).where(eq(services.id, serviceOfB.id));
    expect(after?.name).toBe(serviceOfB.name);
  });

  it("withTenant setează tenantul doar pentru tranzacția curentă", async () => {
    const inside = await withTenant(tenantA, async ({ tx }) => {
      const result = await tx.execute<{ value: string }>(
        sql`select current_setting('app.tenant_id', true) as value`,
      );
      return result.rows[0]?.value;
    });
    expect(inside).toBe(tenantA);

    const outside = await ownerDb().execute<{ value: string | null }>(
      sql`select current_setting('app.tenant_id', true) as value`,
    );
    expect(outside.rows[0]?.value ?? "").toBe("");
  });
});

describe("baza de date refuză legăturile între tenanți", () => {
  it("un preț al lui A nu poate indica un serviciu al lui B", async () => {
    await expect(
      ownerDb().insert(servicePrices).values({
        tenantId: tenantA,
        serviceId: serviceOfB.id,
        status: "priced",
        minBani: 100,
        maxBani: 100,
      }),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
  });

  it("un preț al lui A nu poate folosi un tip de vehicul al lui B", async () => {
    const [serviceOfA] = await ownerDb()
      .select({ id: services.id })
      .from(services)
      .where(and(eq(services.tenantId, tenantA), eq(services.code, "geometrie_off_road")));
    const [vehicleOfB] = await ownerDb()
      .select({ id: vehicleTypes.id })
      .from(vehicleTypes)
      .where(eq(vehicleTypes.tenantId, tenantB));

    await expect(
      ownerDb().insert(servicePrices).values({
        tenantId: tenantA,
        serviceId: serviceOfA!.id,
        vehicleTypeId: vehicleOfB!.id,
        status: "priced",
        minBani: 100,
        maxBani: 100,
      }),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
  });
});

describe("structura bazei de date", () => {
  // Tabele globale, fără tenant_id obligatoriu (vezi planul Fazei 0).
  const GLOBAL_TABLES = new Set([
    "tenants",
    "platform_audit_log",
    "rate_limit_buckets",
    "auth_user",
    "auth_session",
    "auth_account",
    "auth_verification",
    "auth_two_factor",
    "auth_login_guard",
  ]);

  it("orice tabel de service are tenant_id NOT NULL", async () => {
    const result = await ownerDb().execute<{ table_name: string; is_nullable: string | null }>(sql`
      select t.table_name, c.is_nullable
      from information_schema.tables t
      left join information_schema.columns c
        on c.table_schema = t.table_schema and c.table_name = t.table_name and c.column_name = 'tenant_id'
      where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
    `);
    const offenders = result.rows
      .filter((row) => !GLOBAL_TABLES.has(row.table_name))
      .filter((row) => row.is_nullable !== "NO")
      .map((row) => row.table_name);
    expect(result.rows.length).toBeGreaterThan(20);
    expect(offenders).toEqual([]);
  });

  it("orice cheie străină între tabelele unui service include tenant_id", async () => {
    const result = await ownerDb().execute<{ name: string; target: string; columns: string[] }>(sql`
      select c.conname as name, tgt.relname as target,
        array(
          select a.attname::text from unnest(c.conkey) as k(n)
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n
        ) as columns
      from pg_constraint c
      join pg_class src on src.oid = c.conrelid
      join pg_class tgt on tgt.oid = c.confrelid
      join pg_namespace ns on ns.oid = src.relnamespace
      where c.contype = 'f' and ns.nspname = 'public'
    `);
    const offenders = result.rows
      .filter((fk) => !GLOBAL_TABLES.has(fk.target))
      .filter((fk) => !fk.columns.includes("tenant_id"))
      .map((fk) => fk.name);
    expect(offenders).toEqual([]);
  });
});

describe("Row-Level Security (a doua barieră, în baza de date)", () => {
  // Tabele cu tenant_id care rămân globale intenționat (căutare după token, legături cont ↔ service).
  const NO_RLS = new Set(["booking_access_tokens", "tenant_memberships", "support_sessions", "platform_audit_log"]);

  it("aplicația rulează cu un cont fără drepturi de administrator și fără ocolirea RLS", async () => {
    const result = await getDb().execute<{ rolsuper: boolean; rolbypassrls: boolean; current_user: string }>(
      sql`select current_user, rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
    );
    expect(result.rows[0]).toEqual({ current_user: "app_user", rolsuper: false, rolbypassrls: false });
  });

  it("fiecare tabel cu date ale unui service are RLS activ și politica de izolare", async () => {
    const result = await ownerDb().execute<{ table: string; rls: boolean; policies: number }>(sql`
      select c.relname as table, c.relrowsecurity as rls,
        (select count(*)::int from pg_policies p where p.tablename = c.relname and p.policyname = 'tenant_isolation') as policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join information_schema.columns col
        on col.table_schema = n.nspname and col.table_name = c.relname and col.column_name = 'tenant_id'
      where n.nspname = 'public' and c.relkind = 'r'
    `);
    const tenantTables = result.rows.filter((row) => !NO_RLS.has(row.table));
    expect(tenantTables.length).toBeGreaterThanOrEqual(20);
    expect(tenantTables.filter((row) => !row.rls || row.policies !== 1).map((row) => row.table)).toEqual([]);
  });

  it("fără tenant setat, aplicația nu vede niciun rând", async () => {
    for (const table of ["services", "service_prices", "bookings", "customers", "audit_log"]) {
      const result = await getDb().execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(table)}`);
      expect(result.rows[0]?.n, table).toBe(0);
    }
  });

  it("cu tenantul A, chiar și o interogare fără filtru vede doar datele lui A", async () => {
    const tenantIds = await withTenant(tenantA, async ({ tx }) => {
      const result = await tx.execute<{ tenant_id: string }>(sql`select distinct tenant_id from services`);
      return result.rows.map((row) => row.tenant_id);
    });
    expect(tenantIds).toEqual([tenantA]);
  });

  it("cu tenantul A, nu se poate scrie un rând al lui B și nu se poate modifica unul existent", async () => {
    await expect(
      withTenant(tenantA, ({ tx }) => tx.insert(vehicleTypes).values({ tenantId: tenantB, code: "furat", label: "Furat" })),
    ).rejects.toMatchObject({ cause: { code: "42501" } });

    const updated = await withTenant(tenantA, async ({ tx }) => {
      const result = await tx.execute(sql`update services set name = 'Furat' where id = ${serviceOfB.id}`);
      return result.rowCount;
    });
    expect(updated).toBe(0);
    const [after] = await ownerDb().select().from(services).where(eq(services.id, serviceOfB.id));
    expect(after?.name).toBe(serviceOfB.name);
  });

  it("istoricul modificărilor nu poate fi modificat sau șters de aplicație", async () => {
    await expect(
      withTenant(tenantA, ({ tx }) => tx.execute(sql`delete from audit_log`)),
    ).rejects.toMatchObject({ cause: { code: "42501" } });
  });
});
