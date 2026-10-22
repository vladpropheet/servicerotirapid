import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminFrame, AdminSkeleton } from "@/components/admin/admin-frame";
import { ReviewPrompt } from "@/components/admin/review-button";
import { PageTitle } from "@/components/admin/ui";
import { getWeeklyHours } from "@/server/admin/schedule";
import { requireAdmin } from "@/server/auth/session";
import { withTenant } from "@/server/tenant";
import { HoursEditor } from "./hours-editor";

export const metadata: Metadata = { title: "Programul de lucru", robots: { index: false, follow: false } };

export default function HoursPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const ctx = await requireAdmin();
  const hours = await withTenant(ctx.tenantId, (t) => getWeeklyHours(t));
  const review = hours.find((h) => h.needsReview);
  return (
    <AdminFrame ctx={ctx} active="/admin/meniu">
      <PageTitle>Programul de lucru</PageTitle>
      <p>
        Programările online se fac doar în aceste ore și se termină cel târziu la închidere sau la pauză. Pentru zile
        libere sau concediu, folosește{" "}
        <Link href="/admin/blocari" className="font-semibold text-accent underline">
          Zile libere și ore blocate
        </Link>
        .
      </p>
      {review && <ReviewPrompt target={{ type: "hours" }} note={review.reviewNote} label="Programul e corect" />}
      <HoursEditor initial={hours.map(({ weekday, opensAt, closesAt }) => ({ weekday, opensAt, closesAt }))} />
    </AdminFrame>
  );
}
