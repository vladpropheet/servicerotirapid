import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAdminTenant, resolveSupportTenant, resolveTenantForSuperadmin, type TenantId } from "@/server/tenant";
import { getAuth } from "./auth";

// Cine e logat și ce are voie să facă. Se apelează în FIECARE pagină și acțiune de admin:
// acțiunile de server sunt endpoint-uri publice, deci verificarea din pagină nu ajunge.

export type SessionUser = {
  id: string;
  name: string;
  username: string | null;
  platformRole: "superadmin" | null;
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
};

/**
 * Antetele cererii, cu cookie-urile așa cum sunt ACUM. Dacă o acțiune tocmai a schimbat sesiunea
 * (logare, schimbarea parolei), pagina redesenată în aceeași cerere vede deja sesiunea nouă.
 */
async function currentRequestHeaders(): Promise<Headers> {
  const requestHeaders = new Headers(await headers());
  const jar = (await cookies()).toString();
  if (jar) requestHeaders.set("cookie", jar);
  else requestHeaders.delete("cookie");
  return requestHeaders;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  // Întâi antetele cererii: la build (fără cerere și fără variabile de mediu) Next.js se oprește aici,
  // înainte de inițializarea autentificării.
  const requestHeaders = await currentRequestHeaders();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const user = session.user as typeof session.user & {
    username?: string | null;
    platformRole?: string | null;
    mustChangePassword?: boolean;
    twoFactorEnabled?: boolean | null;
  };
  return {
    id: user.id,
    name: user.name,
    username: user.username ?? null,
    platformRole: user.platformRole === "superadmin" ? "superadmin" : null,
    mustChangePassword: user.mustChangePassword === true,
    twoFactorEnabled: user.twoFactorEnabled === true,
  };
}

export type AdminContext = {
  user: SessionUser;
  tenantId: TenantId;
  tenantSlug: string;
  tenantName: string;
  timeZone: string;
  tenantStatus: "active" | "suspended";
  /** `support` = super-adminul, intrat cu o sesiune de suport. */
  role: "owner" | "staff" | "support";
  supportSessionId: string | null;
};

export type AdminAccess = { ok: true; ctx: AdminContext } | { ok: false; redirectTo: string };

/** Ca requireAdmin(), dar întoarce unde trebuie trimis utilizatorul în loc să redirecționeze (pentru rute API). */
export async function checkAdmin(): Promise<AdminAccess> {
  const user = await getSessionUser();
  if (!user) return { ok: false, redirectTo: "/admin/login" };
  if (user.mustChangePassword) return { ok: false, redirectTo: "/admin/schimba-parola" };

  if (user.platformRole === "superadmin") {
    if (!user.twoFactorEnabled) return { ok: false, redirectTo: "/superadmin/2fa" };
    const support = await resolveSupportTenant(user.id);
    if (!support) return { ok: false, redirectTo: "/superadmin" };
    return {
      ok: true,
      ctx: {
        user,
        tenantId: support.id,
        tenantSlug: support.slug,
        tenantName: support.displayName,
        timeZone: support.timezone,
        tenantStatus: support.status,
        role: "support",
        supportSessionId: support.supportSessionId,
      },
    };
  }

  const tenant = await resolveAdminTenant(user.id);
  if (!tenant) return { ok: false, redirectTo: "/admin/login?eroare=fara-acces" };
  return {
    ok: true,
    ctx: {
      user,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.displayName,
      timeZone: tenant.timezone,
      tenantStatus: tenant.status,
      role: tenant.role,
      supportSessionId: null,
    },
  };
}

/** Panoul unui service: patronul lui sau super-adminul în sesiune de suport. */
export async function requireAdmin(): Promise<AdminContext> {
  const access = await checkAdmin();
  if (!access.ok) redirect(access.redirectTo);
  return access.ctx;
}

/** Zona Propheet AIgency: doar super-admin, cu autentificare în doi pași activă. */
export async function requireSuperadmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (user.mustChangePassword) redirect("/admin/schimba-parola");
  if (user.platformRole !== "superadmin") redirect("/admin");
  if (!user.twoFactorEnabled) redirect("/superadmin/2fa");
  return user;
}

/** Pentru istoricul modificărilor: cine a făcut schimbarea. */
export function auditActor(ctx: AdminContext): { actorUserId: string; actorKind: "owner" | "staff" | "superadmin" } {
  return { actorUserId: ctx.user.id, actorKind: ctx.role === "support" ? "superadmin" : ctx.role };
}

export type SuperadminTenantContext = {
  user: SessionUser;
  tenantId: TenantId;
  tenantSlug: string;
  tenantName: string;
  timeZone: string;
};

/** Paginile unui service deschise din panoul super-admin (datele firmei, clienți, istoric, statistici). */
export async function requireSuperadminTenant(tenantId: string): Promise<SuperadminTenantContext> {
  const user = await requireSuperadmin();
  const tenant = await resolveTenantForSuperadmin(tenantId);
  if (!tenant) redirect("/superadmin");
  return { user, tenantId: tenant.id, tenantSlug: tenant.slug, tenantName: tenant.displayName, timeZone: tenant.timezone };
}

/** Ca requireSuperadminTenant(), dar pentru rute API: întoarce unde trebuie trimis utilizatorul. */
export async function checkSuperadminTenant(
  tenantId: string,
): Promise<{ ok: true; ctx: SuperadminTenantContext } | { ok: false; redirectTo: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, redirectTo: "/admin/login" };
  if (user.platformRole !== "superadmin" || user.mustChangePassword || !user.twoFactorEnabled) {
    return { ok: false, redirectTo: "/superadmin" };
  }
  const tenant = await resolveTenantForSuperadmin(tenantId);
  if (!tenant) return { ok: false, redirectTo: "/superadmin" };
  return {
    ok: true,
    ctx: { user, tenantId: tenant.id, tenantSlug: tenant.slug, tenantName: tenant.displayName, timeZone: tenant.timezone },
  };
}

/** Pentru istoricul modificărilor, când schimbarea o face super-adminul. */
export function superadminActor(ctx: SuperadminTenantContext): { actorUserId: string; actorKind: "superadmin" } {
  return { actorUserId: ctx.user.id, actorKind: "superadmin" };
}
