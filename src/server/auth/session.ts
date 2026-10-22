import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAdminTenant, resolveSupportTenant, type TenantId } from "@/server/tenant";
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

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getAuth().api.getSession({ headers: await headers() });
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

/** Panoul unui service: patronul lui sau super-adminul în sesiune de suport. */
export async function requireAdmin(): Promise<AdminContext> {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (user.mustChangePassword) redirect("/admin/schimba-parola");

  if (user.platformRole === "superadmin") {
    if (!user.twoFactorEnabled) redirect("/superadmin/2fa");
    const support = await resolveSupportTenant(user.id);
    if (!support) redirect("/superadmin");
    return {
      user,
      tenantId: support.id,
      tenantSlug: support.slug,
      tenantName: support.displayName,
      timeZone: support.timezone,
      tenantStatus: support.status,
      role: "support",
      supportSessionId: support.supportSessionId,
    };
  }

  const tenant = await resolveAdminTenant(user.id);
  if (!tenant) redirect("/admin/login?eroare=fara-acces");
  return {
    user,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantName: tenant.displayName,
    timeZone: tenant.timezone,
    tenantStatus: tenant.status,
    role: tenant.role,
    supportSessionId: null,
  };
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
