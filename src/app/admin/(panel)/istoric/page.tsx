import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminFrame, AdminSkeleton } from "@/components/admin/admin-frame";
import { buttonClass, PageTitle } from "@/components/admin/ui";
import { formatLongDate, formatTime } from "@/lib/format";
import { listAudit } from "@/server/admin/audit";
import { requireAdmin } from "@/server/auth/session";
import { withTenant } from "@/server/tenant";

export const metadata: Metadata = { title: "Istoric modificări", robots: { index: false, follow: false } };

const PAGE_SIZE = 30;

const ACTION_LABEL: Record<string, string> = {
  "booking.create": "Programare nouă",
  "booking.status": "Status programare schimbat",
  "booking.cancel": "Programare anulată de client",
  "closure.create": "Zi / interval blocat",
  "closure.delete": "Blocare ștearsă",
  "service.update": "Serviciu modificat",
  "service.create": "Serviciu adăugat",
  "service.reorder": "Ordinea serviciilor",
  "price_matrix.update": "Prețuri modificate",
  "surcharge.update": "Suprataxă modificată",
  "dimension.create": "Tip mașină / jantă adăugat",
  "dimension.update": "Tip mașină / jantă modificat",
  "business_hours.update": "Program modificat",
  "settings.update": "Setări programări",
  "sms_template.update": "Text SMS modificat",
  "tenant.update": "Datele firmei",
  "facade.update": "Poza fațadei",
  "logo.update": "Logo",
  "review.confirm": "Valoare confirmată („E corect”)",
  "gdpr.export": "Date descărcate (CSV)",
  "customer.erase": "Datele unui client șterse (la cererea lui)",
  "retention.purge": "Ștergere automată a datelor vechi",
};

const ACTOR_LABEL: Record<string, string> = {
  owner: "Patron",
  staff: "Angajat",
  superadmin: "Propheet AIgency (suport)",
  customer: "Client",
  system: "Sistem",
};

export default function HistoryPage(props: PageProps<"/admin/istoric">) {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: Pick<PageProps<"/admin/istoric">, "searchParams">) {
  const ctx = await requireAdmin();
  const { pagina } = await searchParams;
  const page = Math.max(1, Number(typeof pagina === "string" ? pagina : 1) || 1);
  const entries = await withTenant(ctx.tenantId, (t) => listAudit(t, { limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE }));
  const hasMore = entries.length > PAGE_SIZE;
  const tz = ctx.timeZone;

  return (
    <AdminFrame ctx={ctx} active="/admin/meniu">
      <PageTitle>Istoric modificări</PageTitle>
      <p>Cine a schimbat ce și când. Deschide o intrare ca să vezi valoarea de dinainte și pe cea nouă.</p>
      {entries.slice(0, PAGE_SIZE).map((entry) => (
        <details key={entry.id} className="rounded-lg bg-white p-3">
          <summary className="min-h-11 cursor-pointer content-center">
            <span className="font-bold">{ACTION_LABEL[entry.action] ?? entry.action}</span>
            <span className="block text-sm text-zinc-600">
              {formatLongDate(entry.createdAt.getTime(), tz)}, {formatTime(entry.createdAt.getTime(), tz)} ·{" "}
              {ACTOR_LABEL[entry.actorKind] ?? entry.actorKind}
            </span>
          </summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-zinc-600">Înainte</p>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-zinc-100 p-2 text-sm">
                {entry.before ? JSON.stringify(entry.before, null, 2) : "—"}
              </pre>
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-600">După</p>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-zinc-100 p-2 text-sm">
                {entry.after ? JSON.stringify(entry.after, null, 2) : "—"}
              </pre>
            </div>
          </div>
        </details>
      ))}
      {entries.length === 0 && <p className="rounded-lg bg-white p-4">Nicio modificare încă.</p>}
      <div className="flex justify-between">
        {page > 1 ? (
          <Link href={`/admin/istoric?pagina=${page - 1}`} className={buttonClass.small}>
            ← Mai noi
          </Link>
        ) : (
          <span />
        )}
        {hasMore && (
          <Link href={`/admin/istoric?pagina=${page + 1}`} className={buttonClass.small}>
            Mai vechi →
          </Link>
        )}
      </div>
    </AdminFrame>
  );
}
