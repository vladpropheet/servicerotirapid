import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminFrame, AdminSkeleton } from "@/components/admin/admin-frame";
import { buttonClass } from "@/components/admin/ui";
import { localDayRange, Temporal, todayIn } from "@/domain/time";
import { formatDayChip, formatLongDate, formatTime } from "@/lib/format";
import { BOOKING_STATUS_LABEL } from "@/lib/labels";
import { listBookings } from "@/server/admin/bookings";
import { requireAdmin } from "@/server/auth/session";
import { withTenant } from "@/server/tenant";
import { BookingCard } from "../booking-card";

export const metadata: Metadata = { title: "Calendar", robots: { index: false, follow: false } };

export default function CalendarPage(props: PageProps<"/admin/calendar">) {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}

const VIEWS = [
  { key: "zi", label: "Zi" },
  { key: "saptamana", label: "Săptămână" },
  { key: "luna", label: "Lună" },
] as const;
type View = (typeof VIEWS)[number]["key"];

const WEEKDAYS = ["L", "Ma", "Mi", "J", "V", "S", "D"];

function parseDate(value: string | string[] | undefined, fallback: Temporal.PlainDate): Temporal.PlainDate {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  try {
    return Temporal.PlainDate.from(value);
  } catch {
    return fallback;
  }
}

async function Content({ searchParams }: Pick<PageProps<"/admin/calendar">, "searchParams">) {
  const ctx = await requireAdmin();
  const query = await searchParams;
  const tz = ctx.timeZone;
  const date = parseDate(query.data, todayIn(tz));
  const view: View = query.vedere === "saptamana" ? "saptamana" : query.vedere === "luna" ? "luna" : "zi";
  const week = view === "saptamana";
  const month = view === "luna";

  const monday = date.subtract({ days: date.dayOfWeek - 1 });
  const monthStart = date.with({ day: 1 });
  const first = week ? monday : month ? monthStart : date;
  const last = week ? monday.add({ days: 6 }) : month ? monthStart.add({ days: monthStart.daysInMonth - 1 }) : date;
  const range = { from: localDayRange(first, tz).from, to: localDayRange(last, tz).to };
  const bookings = await withTenant(ctx.tenantId, (t) => listBookings(t, range));

  const step = week ? { weeks: 1 } : month ? { months: 1 } : { days: 1 };
  const link = (d: Temporal.PlainDate, to: View = view) => `/admin/calendar?data=${d.toString()}&vedere=${to}`;
  const today = todayIn(tz);
  const activeOn = (day: Temporal.PlainDate) => {
    const dayRange = localDayRange(day, tz);
    return bookings.filter((b) => b.status !== "cancelled" && b.startsAt >= dayRange.from && b.startsAt < dayRange.to).length;
  };

  return (
    <AdminFrame ctx={ctx} active="/admin/calendar">
      <div className="grid grid-cols-3 gap-2">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={link(date, v.key)}
            aria-current={view === v.key ? "page" : undefined}
            className={`flex min-h-12 items-center justify-center rounded-md font-bold ${view === v.key ? "bg-zinc-900 text-white" : "bg-white"}`}
          >
            {v.label}
          </Link>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <Link href={link(date.subtract(step))} className={buttonClass.small} aria-label="Înapoi">
          ←
        </Link>
        <h1 className="text-center font-display text-2xl font-bold uppercase">
          {week
            ? `${formatDayChip(localDayRange(first, tz).from.getTime(), tz).day} – ${formatDayChip(localDayRange(last, tz).from.getTime(), tz).day}`
            : month
              ? new Intl.DateTimeFormat("ro-RO", { month: "long", year: "numeric", timeZone: tz }).format(range.from)
              : formatLongDate(range.from.getTime(), tz)}
        </h1>
        <Link href={link(date.add(step))} className={buttonClass.small} aria-label="Înainte">
          →
        </Link>
      </div>
      <form action="/admin/calendar" className="flex gap-2">
        <input type="hidden" name="vedere" value={view} />
        <label htmlFor="data" className="sr-only">
          Mergi la data
        </label>
        <input id="data" type="date" name="data" defaultValue={date.toString()} className="min-h-11 flex-1 rounded-md border-2 border-zinc-400 bg-white px-3" />
        <button type="submit" className={buttonClass.small}>
          Arată
        </button>
      </form>

      {month ? (
        <div className="rounded-lg bg-white p-2">
          <div className="grid grid-cols-7 text-center text-sm font-semibold text-zinc-600">
            {WEEKDAYS.map((d) => (
              <span key={d} className="py-1">
                {d}
              </span>
            ))}
          </div>
          <ul className="grid grid-cols-7 gap-1">
            {Array.from({ length: monthStart.dayOfWeek - 1 }, (_, i) => (
              <li key={`gol-${i}`} aria-hidden="true" />
            ))}
            {Array.from({ length: monthStart.daysInMonth }, (_, i) => monthStart.add({ days: i })).map((day) => {
              const count = activeOn(day);
              const isToday = day.equals(today);
              return (
                <li key={day.toString()}>
                  <Link
                    href={link(day, "zi")}
                    aria-label={`${formatLongDate(localDayRange(day, tz).from.getTime(), tz)}: ${count} ${count === 1 ? "programare" : "programări"}`}
                    className={`flex min-h-14 flex-col items-center justify-center rounded-md border-2 ${isToday ? "border-accent" : "border-transparent"} ${count > 0 ? "bg-zinc-900 text-white" : "bg-zinc-100"}`}
                  >
                    <span className="font-bold">{day.day}</span>
                    {count > 0 && <span className="text-xs">{count}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : week ? (
        Array.from({ length: 7 }, (_, i) => monday.add({ days: i })).map((day) => {
          const dayRange = localDayRange(day, tz);
          const items = bookings.filter((b) => b.startsAt >= dayRange.from && b.startsAt < dayRange.to);
          return (
            <section key={day.toString()} className="rounded-lg bg-white p-3">
              <h2 className="flex items-center justify-between">
                <Link href={link(day, "zi")} className="text-lg font-bold underline">
                  {formatLongDate(dayRange.from.getTime(), tz)}
                </Link>
                <span className="text-zinc-600">{items.filter((b) => b.status !== "cancelled").length}</span>
              </h2>
              <ul className="mt-2 flex flex-col gap-1">
                {items.map((b) => (
                  <li key={b.id} className={b.status === "cancelled" ? "text-zinc-400 line-through" : ""}>
                    <span className="font-bold">{formatTime(b.startsAt.getTime(), tz)}</span>{" "}
                    {b.items.find((i) => i.kind === "service")?.name ?? ""} · {b.customerName ?? "—"}
                    {b.status === "pending" ? ` (${BOOKING_STATUS_LABEL.pending})` : ""}
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      ) : bookings.length === 0 ? (
        <p className="rounded-lg bg-white p-4 text-lg">Nicio programare.</p>
      ) : (
        bookings.map((booking) => <BookingCard key={booking.id} booking={booking} timeZone={tz} />)
      )}
    </AdminFrame>
  );
}
