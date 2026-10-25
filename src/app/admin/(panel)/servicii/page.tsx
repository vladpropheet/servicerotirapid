import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/admin/action-form";
import { AdminFrame, AdminSkeleton } from "@/components/admin/admin-frame";
import { SubmitButton } from "@/components/admin/submit-button";
import { buttonClass, Card, Field, inputClass, PageTitle } from "@/components/admin/ui";
import { SERVICE_UNITS } from "@/domain/enums";
import { UNIT_LABEL } from "@/lib/labels";
import { listServicesForAdmin } from "@/server/admin/catalog";
import { requireAdmin } from "@/server/auth/session";
import { withTenant } from "@/server/tenant";
import { createServiceAction, moveServiceAction } from "./actions";

export const metadata: Metadata = { title: "Servicii și prețuri", robots: { index: false, follow: false } };

export default function ServicesPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const ctx = await requireAdmin();
  const categories = await withTenant(ctx.tenantId, (t) => listServicesForAdmin(t));

  return (
    <AdminFrame ctx={ctx} active="/admin/meniu">
      <PageTitle>Servicii și prețuri</PageTitle>
      <p>
        Apasă pe un serviciu ca să-i schimbi numele, prețurile, durata sau dacă se programează online. Ordinea de aici
        e ordinea de pe pagina de programare.
      </p>

      {categories.map((category) => (
        <section key={category.id} className="flex flex-col gap-2">
          <h2 className="font-display text-2xl font-bold uppercase">{category.name}</h2>
          {category.services.map((service, index) => (
            <div key={service.id} className="flex items-stretch gap-2 rounded-lg bg-white p-2">
              <Link href={`/admin/servicii/${service.id}`} className="flex min-h-14 flex-1 flex-col justify-center px-2">
                <span className="text-lg font-semibold">{service.name}</span>
                <span className="flex flex-wrap gap-2 text-sm">
                  {!service.active ? (
                    <span className="rounded bg-zinc-200 px-2">Ascuns</span>
                  ) : service.bookableOnline ? (
                    <span className="rounded bg-green-100 px-2 text-green-900">Programare online</span>
                  ) : (
                    <span className="rounded bg-zinc-100 px-2">Doar la telefon</span>
                  )}
                </span>
              </Link>
              <div className="flex flex-col gap-1">
                {(["up", "down"] as const).map((direction) => (
                  <form key={direction} action={moveServiceAction}>
                    <input type="hidden" name="id" value={service.id} />
                    <input type="hidden" name="direction" value={direction} />
                    <button
                      type="submit"
                      disabled={direction === "up" ? index === 0 : index === category.services.length - 1}
                      aria-label={`Mută „${service.name}” ${direction === "up" ? "mai sus" : "mai jos"}`}
                      className="size-11 rounded border-2 border-zinc-300 font-bold disabled:opacity-30"
                    >
                      {direction === "up" ? "↑" : "↓"}
                    </button>
                  </form>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}

      <Card>
        <h2 className="mb-3 text-xl font-bold">Adaugă un serviciu</h2>
        <ActionForm action={createServiceAction}>
          <Field label="Nume" name="name" required />
          <label className="flex flex-col gap-1 font-semibold">
            Categoria
            <select name="categoryId" className={inputClass}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 font-semibold">
            Prețul se socotește
            <select name="unit" className={inputClass}>
              {SERVICE_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {UNIT_LABEL[unit]}
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm text-zinc-600">Serviciul nou e ascuns până îi pui prețul și îl activezi.</p>
          <SubmitButton>Adaugă</SubmitButton>
        </ActionForm>
      </Card>
      <Link href="/admin/suprataxe" className={buttonClass.secondary}>
        Suprataxe (Runflat, Off Road)
      </Link>
    </AdminFrame>
  );
}
