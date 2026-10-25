import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminFrame, AdminSkeleton } from "@/components/admin/admin-frame";
import { buttonClass, PageTitle } from "@/components/admin/ui";
import type { BookingStatus } from "@/domain/enums";
import { formatLongDate, formatTime } from "@/lib/format";
import { BOOKING_STATUS_LABEL } from "@/lib/labels";
import { listBookingJournal } from "@/server/admin/audit";
import { requireAdmin } from "@/server/auth/session";
import { withTenant } from "@/server/tenant";

export const metadata: Metadata = { title: "Jurnal programări", robots: { index: false, follow: false } };

const PAGE_SIZE = 30;

const ACTOR_LABEL: Record<string, string> = {
  owner: "Patron",
  staff: "Angajat",
  superadmin: "Propheet AIgency",
  customer: "Client",
  system: "Automat",
};

type Entry = Awaited<ReturnType<typeof listBookingJournal>>[number];

function field(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") return null;
  const v = (value as Record<string, unknown>)[key];
  return typeof v === "string" ? v : null;
}

function describe(entry: Entry): string {
  if (entry.action === "booking.create") {
    return field(entry.after, "source") === "online" ? "Programare nouă (online)" : "Programare adăugată manual";
  }
  if (entry.action === "booking.cancel") return "Anulată de client";
  const status = field(entry.after, "status") as BookingStatus | null;
  return status && status in BOOKING_STATUS_LABEL ? `Marcată: ${BOOKING_STATUS_LABEL[status]}` : "Status schimbat";
}

export default function JournalPage(props: PageProps<"/admin/jurnal">) {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: Pick<PageProps<"/admin/jurnal">, "searchParams">) {
  const ctx = await requireAdmin();
  const { pagina } = await searchParams;
  const page = Math.max(1, Number(typeof pagina === "string" ? pagina : 1) || 1);
  const entries = await withTenant(ctx.tenantId, (t) => listBookingJournal(t, { limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE }));
  const hasMore = entries.length > PAGE_SIZE;
  const tz = ctx.timeZone;

  return (
    <AdminFrame ctx={ctx} active="/admin/meniu">
      <PageTitle>Jurnal programări</PageTitle>
      <ul className="flex flex-col gap-2">
        {entries.slice(0, PAGE_SIZE).map((entry) => {
          const startsAt = entry.bookingStartsAt ?? (field(entry.after, "startsAt") ? new Date(field(entry.after, "startsAt")!) : null);
          return (
            <li key={entry.id} className="rounded-lg bg-white p-3">
              <p className="font-bold">{describe(entry)}</p>
              {startsAt && (
                <p>
                  Programarea din {formatLongDate(startsAt.getTime(), tz)}, ora {formatTime(startsAt.getTime(), tz)}
                </p>
              )}
              <p className="text-sm text-zinc-600">
                {formatLongDate(entry.createdAt.getTime(), tz)}, {formatTime(entry.createdAt.getTime(), tz)} ·{" "}
                {ACTOR_LABEL[entry.actorKind] ?? entry.actorKind}
              </p>
            </li>
          );
        })}
      </ul>
      {entries.length === 0 && <p className="rounded-lg bg-white p-4">Nicio programare încă.</p>}
      <div className="flex justify-between">
        {page > 1 ? (
          <Link href={`/admin/jurnal?pagina=${page - 1}`} className={buttonClass.small}>
            ← Mai noi
          </Link>
        ) : (
          <span />
        )}
        {hasMore && (
          <Link href={`/admin/jurnal?pagina=${page + 1}`} className={buttonClass.small}>
            Mai vechi →
          </Link>
        )}
      </div>
    </AdminFrame>
  );
}
