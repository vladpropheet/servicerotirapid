import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm } from "@/components/admin/action-form";
import { AdminFrame, AdminSkeleton } from "@/components/admin/admin-frame";
import { SubmitButton } from "@/components/admin/submit-button";
import { Card, Field, PageTitle } from "@/components/admin/ui";
import { loadDimensions, type DimensionKind } from "@/server/admin/catalog";
import { requireAdmin } from "@/server/auth/session";
import { withTenant } from "@/server/tenant";
import { addDimensionAction, updateDimensionAction } from "./actions";

export const metadata: Metadata = { title: "Tipuri de mașini și jante", robots: { index: false, follow: false } };

export default function DimensionsPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Content />
    </Suspense>
  );
}

function DimensionList({
  title,
  kind,
  items,
  hint,
}: {
  title: string;
  kind: DimensionKind;
  items: { id: string; label: string; active: boolean }[];
  hint?: string;
}) {
  return (
    <Card>
      <h2 className="mb-3 text-xl font-bold">{title}</h2>
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <ActionForm key={item.id} action={updateDimensionAction} className="flex flex-wrap items-end gap-2 border-b border-zinc-200 pb-2">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="id" value={item.id} />
            <label className="flex flex-1 flex-col gap-1 font-semibold">
              <span className="sr-only">Denumire</span>
              <input name="label" defaultValue={item.label} className="min-h-11 rounded-md border-2 border-zinc-400 px-3" />
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" name="active" defaultChecked={item.active} className="size-6 accent-accent" />
              Activ
            </label>
            <SubmitButton variant="small">Salvează</SubmitButton>
          </ActionForm>
        ))}
      </div>
      <ActionForm action={addDimensionAction} className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="kind" value={kind} />
        <Field label="Adaugă" name="label" required />
        {kind === "size" && <Field label="Mărime în inch" name="inches" placeholder="ex. 23 sau 12-16" />}
        {hint && <p className="text-sm text-zinc-600">{hint}</p>}
        <SubmitButton variant="secondary">Adaugă</SubmitButton>
      </ActionForm>
    </Card>
  );
}

async function Content() {
  const ctx = await requireAdmin();
  const { vehicles, sizes, types } = await withTenant(ctx.tenantId, (t) => loadDimensions(t));
  return (
    <AdminFrame ctx={ctx} active="/admin/meniu">
      <PageTitle>Tipuri de mașini și jante</PageTitle>
      <p>
        Acestea sunt opțiunile pe care le alege clientul și rândurile / coloanele tabelelor de prețuri. Un element
        dezactivat nu mai apare la client; prețurile lui rămân salvate.
      </p>
      <DimensionList title="Tipuri de mașini" kind="vehicle" items={vehicles} />
      <DimensionList title="Mărimi de jantă" kind="size" items={sizes} hint="Denumirea e ce vede clientul (ex. R23)." />
      <DimensionList title="Tipuri de jantă" kind="type" items={types} />
    </AdminFrame>
  );
}
