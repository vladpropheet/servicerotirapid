import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminFrame, AdminSkeleton } from "@/components/admin/admin-frame";
import { PageTitle } from "@/components/admin/ui";
import { todayIn } from "@/domain/time";
import { requireAdmin } from "@/server/auth/session";
import { loadBookingSettings, loadCatalog } from "@/server/repos/booking-data";
import { withTenant } from "@/server/tenant";
import { ManualBookingForm } from "./manual-booking-form";

export const metadata: Metadata = { title: "Programare nouă", robots: { index: false, follow: false } };

export default function ManualBookingPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const ctx = await requireAdmin();
  const { catalog, settings } = await withTenant(ctx.tenantId, async (t) => ({
    catalog: await loadCatalog(t),
    settings: await loadBookingSettings(t),
  }));
  return (
    <AdminFrame ctx={ctx} active="/admin/programare-noua">
      <PageTitle>Programare nouă</PageTitle>
      <p className="text-lg">Pentru clienții care sună. Primești un avertisment dacă ora se suprapune cu altă programare.</p>
      <ManualBookingForm
        pricing={catalog.pricing}
        display={catalog.display}
        slotStepMin={settings.slotStepMin}
        defaultDate={todayIn(ctx.timeZone).toString()}
      />
    </AdminFrame>
  );
}
