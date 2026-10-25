import { z } from "zod";
import { checkSuperadminTenant, superadminActor } from "@/server/auth/session";
import { exportForAdmin } from "@/server/gdpr/export";
import { withTenant } from "@/server/tenant";

// Descărcarea datelor (CSV) din pagina „Datele clienților” (super-admin). Doar POST, din formularul panoului:
// cookie-ul de sesiune (SameSite=Lax) nu pleacă la un POST venit de pe alt site, iar Origin se verifică în plus.

const kindSchema = z.enum(["programari", "clienti"]);

function fromOtherSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

export async function POST(request: Request, { params }: RouteContext<"/superadmin/service/[id]/clienti/export">) {
  if (fromOtherSite(request)) return new Response("Cerere refuzată.", { status: 403 });
  const access = await checkSuperadminTenant((await params).id);
  if (!access.ok) return new Response(null, { status: 303, headers: { Location: access.redirectTo } });
  const ctx = access.ctx;

  const form = await request.formData();
  const kind = kindSchema.safeParse(form.get("tip"));
  if (!kind.success) return new Response("Tip de export necunoscut.", { status: 400 });

  const result = await withTenant(ctx.tenantId, (t) => exportForAdmin(t, superadminActor(ctx), kind.data, ctx.timeZone));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: ctx.timeZone }).format(new Date());
  return new Response(result.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind.data}-${ctx.tenantSlug}-${today}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
