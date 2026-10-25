import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm } from "@/components/admin/action-form";
import { AdminFrame, AdminSkeleton } from "@/components/admin/admin-frame";
import { AutoUploadInput } from "@/components/admin/auto-upload-input";
import { SubmitButton } from "@/components/admin/submit-button";
import { Card, Field, PageTitle, ReviewBadge } from "@/components/admin/ui";
import { formatRoPhone } from "@/lib/format";
import { getTenantProfile } from "@/server/admin/tenant-profile";
import { requireAdmin } from "@/server/auth/session";
import { withTenant } from "@/server/tenant";
import { removeLogoAction, updateProfileAction, uploadFacadeAction, uploadLogoAction } from "./actions";

export const metadata: Metadata = { title: "Datele firmei", robots: { index: false, follow: false } };

export default function FirmPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const ctx = await requireAdmin();
  const tenant = await withTenant(ctx.tenantId, (t) => getTenantProfile(t));
  const review = (field: string) => (tenant.reviewFields.includes(field) ? <ReviewBadge /> : null);

  return (
    <AdminFrame ctx={ctx} active="/admin/meniu">
      <PageTitle>Datele firmei</PageTitle>

      <Card>
        <h2 className="mb-3 text-xl font-bold">Logo</h2>
        {tenant.logoMediaId ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo servit de aplicație, dimensiune variabilă
          <img src={`/${tenant.slug}/logo?v=${tenant.logoMediaId}`} alt="Logo-ul service-ului" className="mb-3 max-h-32 w-auto rounded bg-white p-2" />
        ) : (
          <p className="mb-3">Niciun logo încă. Pe pagina de programare numele service-ului apare scris cu litere mari.</p>
        )}
        <ActionForm action={uploadLogoAction}>
          <label className="flex flex-col gap-1 font-semibold">
            Alege logo-ul (JPG, PNG sau WEBP, maxim 5 MB; cel mai bine pe fundal alb sau transparent). Se încarcă imediat ce îl alegi.
            <AutoUploadInput name="logo" />
          </label>
          <SubmitButton pendingText="Se încarcă…">Încarcă logo-ul</SubmitButton>
        </ActionForm>
        {tenant.logoMediaId && (
          <ActionForm action={removeLogoAction} className="mt-3">
            <SubmitButton variant="secondary" pendingText="Se scoate…">Scoate logo-ul</SubmitButton>
          </ActionForm>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-xl font-bold">Poza fațadei</h2>
        {tenant.facadeMediaId ? (
          // eslint-disable-next-line @next/next/no-img-element -- poză servită de aplicație, dimensiune variabilă
          <img src={`/${tenant.slug}/fatada?v=${tenant.facadeMediaId}`} alt="Fațada service-ului" className="mb-3 max-h-64 w-full rounded object-cover" />
        ) : (
          <p className="mb-3">Nicio poză încă. Pe pagina de programare apare doar numele service-ului.</p>
        )}
        <ActionForm action={uploadFacadeAction}>
          <label className="flex flex-col gap-1 font-semibold">
            Alege o poză (JPG, PNG sau WEBP, maxim 5 MB). Se încarcă imediat ce o alegi.
            <AutoUploadInput name="poza" />
          </label>
          <SubmitButton pendingText="Se încarcă…">Încarcă poza</SubmitButton>
        </ActionForm>
      </Card>

      <Card>
        <ActionForm action={updateProfileAction}>
          <p className="text-sm text-zinc-600">
            Aceste date apar în subsolul paginii și în politica de confidențialitate (operatorul datelor).
          </p>
          <div>
            {review("display_name")}
            <Field label="Numele afișat (ca logo)" name="displayName" defaultValue={tenant.displayName} required />
          </div>
          <Field label="Denumirea firmei" name="legalName" defaultValue={tenant.legalName} required />
          <div className="grid grid-cols-2 gap-3">
            <Field label="CUI" name="cui" defaultValue={tenant.cui} required />
            <Field label="Nr. Reg. Com." name="regCom" defaultValue={tenant.regCom} required />
          </div>
          <div>
            {review("registered_address")}
            <Field label="Sediul social" name="registeredAddress" defaultValue={tenant.registeredAddress} hint="Din certificatul de înregistrare (ONRC)." />
          </div>
          <Field label="Adresa punctului de lucru" name="workAddress" defaultValue={tenant.workAddress} required />
          <Field label="Telefon public" name="publicPhone" type="tel" inputMode="tel" defaultValue={formatRoPhone(tenant.publicPhone)} required />
          <div>
            {review("email")}
            <Field label="Email (opțional)" name="email" type="email" inputMode="email" defaultValue={tenant.email} />
          </div>
          <div>
            {review("retention_months")}
            <Field
              label="Cât timp păstrăm programările (luni)"
              name="retentionMonths"
              type="number"
              inputMode="numeric"
              min={6}
              max={120}
              defaultValue={tenant.retentionMonths}
              hint="Programările mai vechi se șterg automat, în fiecare noapte. Implicit 24 de luni."
            />
          </div>
          <SubmitButton>Salvează datele</SubmitButton>
        </ActionForm>
      </Card>
    </AdminFrame>
  );
}
