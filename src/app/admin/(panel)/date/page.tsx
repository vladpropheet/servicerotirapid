import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/admin/action-form";
import { AdminFrame, AdminSkeleton } from "@/components/admin/admin-frame";
import { SubmitButton } from "@/components/admin/submit-button";
import { buttonClass, Card, inputClass, Notice, PageTitle } from "@/components/admin/ui";
import { formatLongDate, formatRoPhone } from "@/lib/format";
import { getTenantProfile } from "@/server/admin/tenant-profile";
import { requireAdmin } from "@/server/auth/session";
import { findCustomers, getCustomerForErase } from "@/server/gdpr/erase";
import { withTenant } from "@/server/tenant";
import { eraseCustomerAction } from "./actions";

export const metadata: Metadata = { title: "Datele clienților", robots: { index: false, follow: false } };

export default function CustomerDataPage(props: PageProps<"/admin/date">) {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}

function param(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.slice(0, 100) : "";
}

async function Content({ searchParams }: Pick<PageProps<"/admin/date">, "searchParams">) {
  const ctx = await requireAdmin();
  const params = await searchParams;
  const query = param(params.cauta).trim();
  const eraseId = param(params.sterge);
  const erased = /^(\d+)-(\d+)$/.exec(param(params.sters));
  const now = new Date();

  const { matches, toErase, retentionMonths } = await withTenant(ctx.tenantId, async (t) => ({
    matches: query ? await findCustomers(t, query) : [],
    toErase: /^[0-9a-f-]{36}$/.test(eraseId) ? await getCustomerForErase(t, eraseId, now) : null,
    retentionMonths: (await getTenantProfile(t)).retentionMonths,
  }));

  return (
    <AdminFrame ctx={ctx} active="/admin/meniu">
      <PageTitle>Datele clienților</PageTitle>

      {erased && (
        <Notice kind="success">
          Datele clientului au fost șterse. Programări păstrate fără date personale: {erased[1]}.
          {Number(erased[2]) > 0 && ` Programări viitoare anulate: ${erased[2]}.`}
        </Notice>
      )}

      <Card>
        <h2 className="mb-2 text-xl font-bold">Descarcă datele (pentru Excel)</h2>
        <p className="mb-3">
          Fișierele conțin nume și telefoane. Păstrează-le în siguranță, nu le trimite altor persoane și
          șterge-le când nu mai ai nevoie de ele.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <form method="post" action="/admin/date/export">
            <input type="hidden" name="tip" value="programari" />
            <button type="submit" className={`${buttonClass.secondary} w-full`}>
              Descarcă programările
            </button>
          </form>
          <form method="post" action="/admin/date/export">
            <input type="hidden" name="tip" value="clienti" />
            <button type="submit" className={`${buttonClass.secondary} w-full`}>
              Descarcă clienții
            </button>
          </form>
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 text-xl font-bold">Șterge datele unui client</h2>
        <p className="mb-3">
          Dacă un client îți cere să-i ștergi datele, caută-l după telefon, nume sau numărul mașinii.
          Verifică întâi că persoana care cere e chiar clientul (de exemplu, sună de pe numărul lui).
        </p>
        <form method="get" action="/admin/date" className="flex flex-col gap-2">
          <label htmlFor="cauta" className="font-semibold">
            Telefon, nume sau nr. de înmatriculare
          </label>
          <div className="flex gap-2">
            <input id="cauta" name="cauta" defaultValue={query} minLength={3} required className={inputClass} />
            <button type="submit" className={buttonClass.primary}>
              Caută
            </button>
          </div>
        </form>

        {query && matches.length === 0 && <p className="mt-3">Niciun client găsit pentru „{query}”.</p>}
        {matches.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {matches.map((customer) => (
              <li key={customer.id} className="flex flex-col gap-2 rounded-md border-2 border-zinc-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold">{customer.fullName}</p>
                  <p>{formatRoPhone(customer.phoneE164)}</p>
                  <p className="text-sm text-zinc-600">
                    {customer.bookings} {customer.bookings === 1 ? "programare" : "programări"}
                    {customer.lastStartsAt ? `, ultima: ${formatLongDate(customer.lastStartsAt.getTime(), ctx.timeZone)}` : ""}
                  </p>
                </div>
                <Link
                  href={`/admin/date?cauta=${encodeURIComponent(query)}&sterge=${customer.id}#confirma`}
                  className={buttonClass.danger}
                >
                  Șterge datele
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {toErase && (
        <Card className="border-4 border-red-800">
          <h2 id="confirma" className="mb-2 text-xl font-bold">
            Ștergi datele lui {toErase.fullName} ({formatRoPhone(toErase.phoneE164)})?
          </h2>
          <ul className="mb-3 list-disc pl-6">
            <li>Numele, telefonul, numărul mașinii și observațiile se șterg definitiv.</li>
            <li>
              {toErase.bookings} {toErase.bookings === 1 ? "programare rămâne" : "programări rămân"} în statistici,
              fără date personale.
            </li>
            {toErase.upcoming > 0 && (
              <li className="font-bold">
                {toErase.upcoming} {toErase.upcoming === 1 ? "programare viitoare se anulează" : "programări viitoare se anulează"}.
              </li>
            )}
            <li>Ștergerea nu se poate anula.</li>
          </ul>
          <ActionForm action={eraseCustomerAction}>
            <input type="hidden" name="customerId" value={toErase.id} />
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-lg">
              <input type="checkbox" name="confirm" required className="size-6 shrink-0 accent-accent" />
              <span>Persoana a cerut ștergerea datelor și am verificat că e chiar clientul.</span>
            </label>
            <SubmitButton variant="danger" pendingText="Se șterg…">
              Șterge definitiv
            </SubmitButton>
          </ActionForm>
        </Card>
      )}

      <Card>
        <h2 className="mb-2 text-xl font-bold">Ștergere automată</h2>
        <p>
          Programările mai vechi de <strong>{retentionMonths} de luni</strong> se șterg automat, în fiecare noapte,
          împreună cu clienții care nu mai au alte programări. Perioada se schimbă din{" "}
          <Link href="/admin/firma" className="font-semibold text-accent underline">
            Datele firmei
          </Link>
          .
        </p>
      </Card>
    </AdminFrame>
  );
}
