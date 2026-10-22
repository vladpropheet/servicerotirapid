import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/admin/action-form";
import { SubmitButton } from "@/components/admin/submit-button";
import { buttonClass, Card, Field, Notice, PageTitle } from "@/components/admin/ui";
import { formatRoPhone } from "@/lib/format";
import { listTenantsWithOwners, SUPPORT_MINUTES } from "@/server/admin/platform";
import { requireSuperadmin } from "@/server/auth/session";
import { resolveSupportTenant } from "@/server/tenant";
import { logoutAction } from "../admin/account-actions";
import {
  addOwnerAction,
  createTenantAction,
  endSupportAction,
  resetOwnerPasswordAction,
  setTenantStatusAction,
  startSupportAction,
} from "./actions";

export const metadata: Metadata = { title: "Super-admin", robots: { index: false, follow: false } };

export default function SuperadminPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-8">
      <Suspense fallback={<p>Se încarcă…</p>}>
        <Content />
      </Suspense>
    </main>
  );
}

async function Content() {
  const user = await requireSuperadmin();
  const tenantList = await listTenantsWithOwners();
  const support = await resolveSupportTenant(user.id);

  return (
    <>
      <div className="flex items-center justify-between">
        <PageTitle>Propheet AIgency</PageTitle>
        <form action={logoutAction}>
          <button type="submit" className={buttonClass.small}>
            Ieși
          </button>
        </form>
      </div>

      {support && (
        <Card className="border-2 border-label">
          <p className="mb-3">
            Ești în mod suport la <strong>{support.displayName}</strong>.{" "}
            <Link href="/admin" className="font-semibold text-accent underline">
              Deschide panoul
            </Link>
          </p>
          <form action={endSupportAction}>
            <button type="submit" className={buttonClass.secondary}>
              Închide modul suport
            </button>
          </form>
        </Card>
      )}

      <Notice kind="info">
        Ca persoană împuternicită GDPR, intri în panoul unui service (unde se văd datele clienților) doar cu un motiv
        scris. Accesul durează {SUPPORT_MINUTES} de minute și rămâne în jurnal.
      </Notice>

      {tenantList.map((tenant) => (
        <Card key={tenant.id}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-bold">{tenant.displayName}</h2>
            <span className={`rounded px-2 py-1 text-sm font-bold ${tenant.status === "active" ? "bg-green-100 text-green-900" : "bg-red-100 text-red-900"}`}>
              {tenant.status === "active" ? "Activ" : "Suspendat"}
            </span>
          </div>
          <p className="text-zinc-700">
            <Link href={`/${tenant.slug}`} className="underline">
              /{tenant.slug}
            </Link>{" "}
            · {tenant.legalName} · CUI {tenant.cui}
          </p>

          <h3 className="mt-3 font-semibold">Conturi</h3>
          {tenant.owners.length === 0 && <p className="text-zinc-600">Niciun cont.</p>}
          {tenant.owners.map((owner) => (
            <ActionForm key={owner.userId} action={resetOwnerPasswordAction} className="mt-2 flex flex-col gap-2">
              <p>
                {owner.name} · {owner.username ? formatRoPhone(`+${owner.username}`) : "—"}
              </p>
              <input type="hidden" name="tenantId" value={tenant.id} />
              <input type="hidden" name="userId" value={owner.userId} />
              <SubmitButton variant="small" pendingText="Se resetează…">
                Resetează parola (parolă temporară nouă)
              </SubmitButton>
            </ActionForm>
          ))}

          <details className="mt-3">
            <summary className="min-h-11 cursor-pointer content-center font-semibold">Adaugă un cont de patron</summary>
            <ActionForm action={addOwnerAction} className="mt-2 flex flex-col gap-3">
              <input type="hidden" name="tenantId" value={tenant.id} />
              <Field label="Nume" name="name" required />
              <Field label="Telefon" name="phone" type="tel" inputMode="tel" required />
              <SubmitButton variant="secondary">Creează contul</SubmitButton>
            </ActionForm>
          </details>

          <details className="mt-2">
            <summary className="min-h-11 cursor-pointer content-center font-semibold">Intră în panoul lui (suport)</summary>
            <ActionForm action={startSupportAction} className="mt-2 flex flex-col gap-3">
              <input type="hidden" name="tenantId" value={tenant.id} />
              <Field label="Motivul (apare în jurnal)" name="reason" required placeholder="ex. Patronul a cerut ajutor la prețuri" />
              <SubmitButton variant="secondary">Intră pentru {SUPPORT_MINUTES} de minute</SubmitButton>
            </ActionForm>
          </details>

          <ActionForm action={setTenantStatusAction} className="mt-3 flex flex-col gap-2">
            <input type="hidden" name="tenantId" value={tenant.id} />
            <input type="hidden" name="status" value={tenant.status === "active" ? "suspended" : "active"} />
            <SubmitButton variant={tenant.status === "active" ? "danger" : "secondary"}>
              {tenant.status === "active" ? "Suspendă (oprește pagina publică)" : "Activează din nou"}
            </SubmitButton>
          </ActionForm>
        </Card>
      ))}

      <Card>
        <h2 className="mb-3 text-xl font-bold">Service nou</h2>
        <p className="mb-3 text-sm text-zinc-600">
          Pornește cu catalogul standard (servicii, prețuri, program). Patronul le modifică apoi singur din panou.
        </p>
        <ActionForm action={createTenantAction}>
          <Field label="Adresa paginii (ex. vulcanizare-pitesti)" name="slug" required />
          <Field label="Numele afișat" name="displayName" required />
          <Field label="Denumirea firmei" name="legalName" required />
          <div className="grid grid-cols-2 gap-3">
            <Field label="CUI" name="cui" required />
            <Field label="Nr. Reg. Com." name="regCom" required />
          </div>
          <Field label="Adresa punctului de lucru" name="workAddress" required />
          <Field label="Telefon public" name="publicPhone" type="tel" inputMode="tel" required />
          <Field label="Numele patronului" name="ownerName" required />
          <Field label="Telefonul patronului (pentru logare)" name="ownerPhone" type="tel" inputMode="tel" required />
          <SubmitButton pendingText="Se creează…">Creează service-ul</SubmitButton>
        </ActionForm>
      </Card>

      <Link href="/admin/schimba-parola" className="font-semibold text-accent underline">
        Schimbă-ți parola
      </Link>
    </>
  );
}
