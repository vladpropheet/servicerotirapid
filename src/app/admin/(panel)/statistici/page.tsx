import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminFrame, AdminSkeleton } from "@/components/admin/admin-frame";
import { PageTitle } from "@/components/admin/ui";
import { monthlyStats } from "@/server/admin/stats";
import { requireAdmin } from "@/server/auth/session";
import { withTenant } from "@/server/tenant";

export const metadata: Metadata = { title: "Statistici", robots: { index: false, follow: false } };

const MONTHS = ["ian.", "feb.", "mar.", "apr.", "mai", "iun.", "iul.", "aug.", "sep.", "oct.", "nov.", "dec."];

export default function StatsPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const ctx = await requireAdmin();
  const stats = await withTenant(ctx.tenantId, (t) => monthlyStats(t, ctx.timeZone));
  const label = (month: string) => {
    const [year, m] = month.split("-");
    return `${MONTHS[Number(m) - 1]} ${year}`;
  };

  return (
    <AdminFrame ctx={ctx} active="/admin/meniu">
      <PageTitle>Statistici</PageTitle>
      <p>Programările din ultimele 12 luni, după luna în care au avut loc.</p>
      {stats.length === 0 ? (
        <p className="rounded-lg bg-white p-4">Încă nu sunt programări.</p>
      ) : (
        <div className="min-w-0 overflow-x-auto rounded-lg bg-white">
          <table className="w-full text-left">
            <caption className="sr-only">Programări pe lună</caption>
            <thead>
              <tr className="border-b border-zinc-200">
                <th scope="col" className="p-3">Luna</th>
                <th scope="col" className="p-3 text-right">Online</th>
                <th scope="col" className="p-3 text-right">Telefon</th>
                <th scope="col" className="p-3 text-right">Finalizate</th>
                <th scope="col" className="p-3 text-right">Anulate</th>
                <th scope="col" className="p-3 text-right">Nu au venit</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((row) => (
                <tr key={row.month} className="border-b border-zinc-100">
                  <th scope="row" className="p-3 font-semibold">{label(row.month)}</th>
                  <td className="p-3 text-right text-lg font-bold">{row.online}</td>
                  <td className="p-3 text-right">{row.manual}</td>
                  <td className="p-3 text-right">{row.completed}</td>
                  <td className="p-3 text-right">{row.cancelled}</td>
                  <td className="p-3 text-right">{row.noShow}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminFrame>
  );
}
