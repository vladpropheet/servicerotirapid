import { formatBani, formatLeiAmount } from "@/domain/money";
import { formatRoPhone, formatTime, telHref } from "@/lib/format";
import { BOOKING_STATUS_LABEL, BOOKING_STATUS_STYLE } from "@/lib/labels";
import { allowedTransitions, type AdminBooking } from "@/server/admin/bookings";
import { StatusButtons } from "./status-buttons";

function priceText(b: AdminBooking): string {
  if (b.estimateMinBani === 0 && b.estimateMaxBani === 0 && b.estimateHasUnpriced) return "preț în service";
  const amount =
    b.estimateMinBani === b.estimateMaxBani
      ? formatBani(b.estimateMinBani)
      : `${formatLeiAmount(b.estimateMinBani)}–${formatBani(b.estimateMaxBani)}`;
  return b.estimateHasUnpriced ? `${amount} + preț în service` : amount;
}

/** O programare în lista zilei: ora, serviciile, clientul (telefon apăsabil), mașina, prețul și acțiunile. */
export function BookingCard({ booking: b, timeZone }: { booking: AdminBooking; timeZone: string }) {
  const services = b.items
    .filter((i) => i.kind === "service")
    .map((i) => (i.quantity > 1 ? `${i.name} × ${i.quantity}` : i.name))
    .join(", ");
  const surcharges = b.items.filter((i) => i.kind === "surcharge").map((i) => i.name);

  return (
    <article
      className={`rounded-lg border-2 bg-white p-4 ${b.status === "pending" ? "border-label" : "border-zinc-200"} ${
        b.status === "cancelled" ? "opacity-60" : ""
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-2xl font-bold">
          {formatTime(b.startsAt.getTime(), timeZone)}–{formatTime(b.endsAt.getTime(), timeZone)}
        </p>
        <div className="flex gap-2">
          <span className="rounded bg-zinc-100 px-2 py-1 text-sm font-semibold">
            {b.source === "online" ? "Online" : "Telefon"}
          </span>
          <span className={`rounded px-2 py-1 text-sm font-bold ${BOOKING_STATUS_STYLE[b.status]}`}>
            {BOOKING_STATUS_LABEL[b.status]}
          </span>
        </div>
      </div>
      <p className="mt-2 text-lg font-semibold">{services}</p>
      {surcharges.length > 0 && <p className="text-zinc-700">+ {surcharges.join(", ")}</p>}
      <p className="mt-2 text-lg">
        {b.customerName ?? "Client anonimizat"}
        {b.customerPhone && (
          <>
            {" · "}
            <a href={telHref(b.customerPhone)} className="font-bold text-accent underline">
              {formatRoPhone(b.customerPhone)}
            </a>
          </>
        )}
      </p>
      <p className="text-zinc-700">
        {b.vehicle}, {b.wheelCount} roți{b.plate ? ` · ${b.plate}` : ""} · {priceText(b)}
      </p>
      {b.customerNote && <p className="mt-1 italic text-zinc-700">„{b.customerNote}”</p>}
      {b.overCapacity && <p className="mt-1 font-semibold text-red-800">Salvată peste capacitatea online.</p>}
      <p className="mt-1 text-sm text-zinc-500">Cod {b.publicRef}</p>
      <StatusButtons bookingId={b.id} transitions={allowedTransitions(b.status)} />
    </article>
  );
}
