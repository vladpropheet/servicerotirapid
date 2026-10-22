import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminFrame, AdminSkeleton } from "@/components/admin/admin-frame";
import { ReviewPrompt } from "@/components/admin/review-button";
import { PageTitle } from "@/components/admin/ui";
import { listReviewItems } from "@/server/admin/review";
import { requireAdmin } from "@/server/auth/session";
import { withTenant } from "@/server/tenant";

export const metadata: Metadata = { title: "De verificat", robots: { index: false, follow: false } };

export default function ReviewPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const ctx = await requireAdmin();
  const items = await withTenant(ctx.tenantId, (t) => listReviewItems(t));
  return (
    <AdminFrame ctx={ctx} active="/admin/meniu">
      <PageTitle>De verificat ({items.length})</PageTitle>
      <p>
        Valorile de mai jos au fost puse de noi la pornire, din afișe sau estimări. Verifică-le: dacă sunt corecte,
        apasă „E corect”; dacă nu, deschide pagina și schimbă-le.
      </p>
      {items.length === 0 && <p className="rounded-lg bg-white p-4 text-lg">Totul e verificat.</p>}
      {items.map((item) => (
        <section key={JSON.stringify(item.target)} className="flex flex-col gap-2 rounded-lg bg-white p-4">
          <Link href={item.href} className="text-lg font-bold underline">
            {item.title}
          </Link>
          <ReviewPrompt target={item.target} note={item.note} />
        </section>
      ))}
    </AdminFrame>
  );
}
