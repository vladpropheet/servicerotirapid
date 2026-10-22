import { readFacade } from "@/server/admin/tenant-profile";
import { resolvePublicTenant, withTenant } from "@/server/tenant";

// Poza fațadei, afișată sus pe pagina publică a service-ului.
export async function GET(_request: Request, ctx: RouteContext<"/[slug]/fatada">) {
  const { slug } = await ctx.params;
  const tenant = await resolvePublicTenant(slug);
  if (!tenant) return new Response("Nu există.", { status: 404 });
  const facade = await withTenant(tenant.id, (t) => readFacade(t));
  if (!facade) return new Response("Nu există.", { status: 404 });
  return new Response(new Uint8Array(facade.bytes), {
    headers: {
      "Content-Type": facade.contentType,
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
