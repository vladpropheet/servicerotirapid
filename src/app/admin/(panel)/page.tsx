import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminFrame, AdminSkeleton } from "@/components/admin/admin-frame";
import { Notice } from "@/components/admin/ui";
import { localDayRange, todayIn } from "@/domain/time";
import { formatLongDate } from "@/lib/format";
import { listBookings } from "@/server/admin/bookings";
import { requireAdmin } from "@/server/auth/session";
import { withTenant } from "@/server/tenant";
import { BookingCard } from "./booking-card";

export const metadata: Metadata = { title: "Programările de azi", robots: { index: false, follow: false } };

export default function TodayPage(props: PageProps<"/admin">) {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: Pick<PageProps<"/admin">, "searchParams">) {
  const ctx = await requireAdmin();
  const { zi } = await searchParams;
  const tomorrow = zi === "maine";
  const today = todayIn(ctx.timeZone);
  const day = tomorrow ? today.add({ days: 1 }) : today;
  const range = localDayRange(day, ctx.timeZone);
  const list = await withTenant(ctx.tenantId, (t) => listBookings(t, range));
  const active = list.filter((b) => b.status !== "cancelled");
  const pending = list.filter((b) => b.status === "pending").length;

  return (
    <AdminFrame ctx={ctx} active="/admin">
      <nav aria-label="Ziua" className="grid grid-cols-2 gap-2">
        {[
          { href: "/admin", label: "Azi", current: !tomorrow },
          { href: "/admin?zi=maine", label: "Mâine", current: tomorrow },
        ].map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.current ? "page" : undefined}
            className={`flex min-h-12 items-center justify-center rounded-md text-lg font-bold ${
              tab.current ? "bg-zinc-900 text-white" : "bg-white"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-3xl font-bold uppercase">{formatLongDate(range.from.getTime(), ctx.timeZone)}</h1>
        <p className="text-lg">
          {active.length} {active.length === 1 ? "programare" : "programări"}
        </p>
      </div>
      {pending > 0 && <Notice kind="review">{pending} în așteptare: confirmă sau anulează.</Notice>}
      {list.length === 0 ? (
        <p className="rounded-lg bg-white p-4 text-lg">Nicio programare.</p>
      ) : (
        list.map((booking) => <BookingCard key={booking.id} booking={booking} timeZone={ctx.timeZone} />)
      )}
      <div className="grid grid-cols-2 gap-2">
        <Link href="/admin/programare-noua" className="flex min-h-12 items-center justify-center rounded-md bg-accent font-bold text-white">
          Adaugă programare
        </Link>
        <Link href="/admin/blocari" className="flex min-h-12 items-center justify-center rounded-md border-2 border-zinc-900 bg-white font-bold">
          Blochează ore
        </Link>
      </div>
    </AdminFrame>
  );
}
