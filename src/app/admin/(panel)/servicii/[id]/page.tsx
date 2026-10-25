import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/admin/action-form";
import { AdminFrame, AdminSkeleton } from "@/components/admin/admin-frame";
import { SubmitButton } from "@/components/admin/submit-button";
import { Card, Checkbox, Field, inputClass, PageTitle, TextArea } from "@/components/admin/ui";
import { SERVICE_UNITS } from "@/domain/enums";
import { cellText } from "@/domain/pricing/cell-text";
import { UNIT_LABEL } from "@/lib/labels";
import { getServiceForEdit } from "@/server/admin/catalog";
import { requireAdmin } from "@/server/auth/session";
import { withTenant } from "@/server/tenant";
import { updateServiceDetailsAction } from "../actions";
import { PriceEditor } from "./price-editor";

export const metadata: Metadata = { title: "Serviciu", robots: { index: false, follow: false } };

export default function ServicePage(props: PageProps<"/admin/servicii/[id]">) {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Content params={props.params} />
    </Suspense>
  );
}

async function Content({ params }: Pick<PageProps<"/admin/servicii/[id]">, "params">) {
  const ctx = await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await withTenant(ctx.tenantId, (t) => getServiceForEdit(t, id));
  if (!data) notFound();
  const { service, prices, categories, dimensions } = data;

  const key = (p: { vehicleTypeId: string | null; rimSizeId: string | null; rimTypeId: string | null }) =>
    `${p.vehicleTypeId ?? "-"}|${p.rimSizeId ?? "-"}|${p.rimTypeId ?? "-"}`;
  const cells = Object.fromEntries(prices.map((p) => [key(p), cellText(p)]));
  const dim = (list: { id: string; label: string; active: boolean }[]) => list.map(({ id, label, active }) => ({ id, label, active }));

  return (
    <AdminFrame ctx={ctx} active="/admin/meniu">
      <Link href="/admin/servicii" className="font-semibold text-accent underline">
        ← Toate serviciile
      </Link>
      <PageTitle>{service.name}</PageTitle>

      <Card>
        <h2 className="mb-3 text-xl font-bold">Prețuri</h2>
        <PriceEditor
          serviceId={service.id}
          initial={{ mode: service.pricingMode, byVehicle: service.byVehicle, byRimSize: service.byRimSize, byRimType: service.byRimType }}
          cells={cells}
          vehicles={dim(dimensions.vehicles)}
          sizes={dim(dimensions.sizes)}
          types={dim(dimensions.types)}
        />
      </Card>

      <Card>
        <h2 className="mb-3 text-xl font-bold">Detalii și durată</h2>
        <ActionForm action={updateServiceDetailsAction}>
          <input type="hidden" name="id" value={service.id} />
          <Field label="Nume" name="name" defaultValue={service.name} required />
          <label className="flex flex-col gap-1 font-semibold">
            Categoria
            <select name="categoryId" defaultValue={service.categoryId} className={inputClass}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 font-semibold">
            Prețul se socotește
            <select name="unit" defaultValue={service.unit} className={inputClass}>
              {SERVICE_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {UNIT_LABEL[unit]}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Durata de bază (min)" name="baseDurationMin" type="number" inputMode="numeric" min={0} max={600} defaultValue={service.baseDurationMin} />
            <Field label="+ minute pe roată / bucată" name="perUnitDurationMin" type="number" inputMode="numeric" min={0} max={600} defaultValue={service.perUnitDurationMin} />
          </div>
          <p className="text-sm text-zinc-600">
            Ex.: pachet complet = 10 min + 12 min pe roată → 4 roți = 58 min (rezervat 60 min).
          </p>
          <Field label="Cantitate maximă" name="maxQuantity" type="number" inputMode="numeric" min={1} max={50} defaultValue={service.maxQuantity} />
          <TextArea label="Ce include (opțional)" name="includes" defaultValue={service.includes} />
          <TextArea label="Explicație pentru client: când alege serviciul acesta (opțional)" name="customerExplainer" defaultValue={service.customerExplainer} />
          <TextArea label="Descriere (opțional)" name="description" defaultValue={service.description} rows={2} />
          <Checkbox label="Se poate programa online" name="bookableOnline" defaultChecked={service.bookableOnline} />
          <Checkbox label="Activ (apare pe pagina de programare)" name="active" defaultChecked={service.active} />
          <SubmitButton>Salvează detaliile</SubmitButton>
        </ActionForm>
      </Card>
    </AdminFrame>
  );
}
