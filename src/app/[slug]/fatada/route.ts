import { readTenantImage } from "@/server/admin/tenant-profile";
import { resolvePublicTenant, withTenant } from "@/server/tenant";

// Poza fațadei, afișată sus pe pagina publică a service-ului.
export async function GET(_request: Request, ctx: RouteContext<"/[slug]/fatada">) {
  const { slug } = await ctx.params;
  const tenant = await resolvePublicTenant(slug);
  if (!tenant) return new Response("Nu există.", { status: 404 });
  const image = await withTenant(tenant.id, (t) => readTenantImage(t, "facade"));
  if (!image) return new Response("Nu există.", { status: 404 });
  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
