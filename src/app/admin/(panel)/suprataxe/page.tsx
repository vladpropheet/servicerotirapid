import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm } from "@/components/admin/action-form";
import { AdminFrame, AdminSkeleton } from "@/components/admin/admin-frame";
import { SubmitButton } from "@/components/admin/submit-button";
import { Card, Checkbox, Field, inputClass, PageTitle } from "@/components/admin/ui";
import { cellText } from "@/domain/pricing/cell-text";
import { listServicesForAdmin, listSurchargesForAdmin } from "@/server/admin/catalog";
import { requireAdmin } from "@/server/auth/session";
import { withTenant } from "@/server/tenant";
import { updateSurchargeAction } from "./actions";

export const metadata: Metadata = { title: "Suprataxe", robots: { index: false, follow: false } };

export default function SurchargesPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const ctx = await requireAdmin();
  const { list, categories } = await withTenant(ctx.tenantId, async (t) => ({
    list: await listSurchargesForAdmin(t),
    categories: await listServicesForAdmin(t),
  }));
  const allServices = categories.flatMap((c) => c.services);

  return (
    <AdminFrame ctx={ctx} active="/admin/meniu">
      <PageTitle>Suprataxe</PageTitle>
      <p>Se adaugă la prețul serviciilor bifate mai jos (de ex. Runflat +10 lei pe roată).</p>
      {list.map((s) => (
        <Card key={s.id}>
          <ActionForm action={updateSurchargeAction}>
            <input type="hidden" name="id" value={s.id} />
            <Field label="Nume" name="name" defaultValue={s.name} required />
            <Field label="Preț (lei)" name="priceText" defaultValue={cellText({ ...s, status: "priced" })} hint="Ex. 10, 10-20 sau 20+ (= de la 20 lei)." />
            <Field label="Explicație scurtă (opțional)" name="description" defaultValue={s.description} />
            <label className="flex flex-col gap-1 font-semibold">
              Se socotește
              <select name="unit" defaultValue={s.unit} className={inputClass}>
                <option value="per_wheel">pe roată</option>
                <option value="per_booking">o dată pe programare</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 font-semibold">
              Dacă se aplică la mai multe servicii din aceeași programare
              <select name="stacking" defaultValue={s.stacking} className={inputClass}>
                <option value="once_per_wheel">o singură dată pe roată</option>
                <option value="per_item">la fiecare serviciu</option>
              </select>
            </label>
            <Checkbox label="Clientul o poate bifa online" name="customerSelectable" defaultChecked={s.customerSelectable} />
            <Checkbox label="Activă" name="active" defaultChecked={s.active} />
            <fieldset className="flex flex-col">
              <legend className="font-semibold">Se aplică la</legend>
              {allServices.map((service) => (
                <label key={service.id} className="flex min-h-11 items-center gap-3">
                  <input type="checkbox" name="serviceIds" value={service.id} defaultChecked={s.serviceIds.includes(service.id)} className="size-6 accent-accent" />
                  {service.name}
                </label>
              ))}
            </fieldset>
            <SubmitButton>Salvează</SubmitButton>
          </ActionForm>
        </Card>
      ))}
    </AdminFrame>
  );
}
