import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { formatBani, formatLeiAmount } from "@/domain/money";
import { FINAL_PRICE_NOTE } from "@/domain/pricing";
import { formatLongDate, formatRoPhone, formatTime, telHref } from "@/lib/format";
import { loadBookingSummary, type BookingSummary } from "@/server/booking/manage";
import { CancelForm } from "./cancel-form";

// Pagina din linkul „vezi / anulează programarea”: ecranul de succes după programare
// și locul din care clientul își anulează programarea. Nu se indexează (vezi next.config.ts).
export const metadata: Metadata = {
  title: "Programarea ta",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function BookingLinkPage(props: PageProps<"/p/[token]">) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Suspense fallback={<p className="text-lg">Se încarcă…</p>}>
        <BookingLinkContent params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function BookingLinkContent({
  params,
  searchParams,
}: Pick<PageProps<"/p/[token]">, "params" | "searchParams">) {
  await connection();
  const { token } = await params;
  const query = await searchParams;
  const summary = await loadBookingSummary(token);

  if (!summary) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-3xl font-bold uppercase">Link invalid</h1>
        <p className="text-lg">Linkul nu există sau a expirat. Dacă ai nevoie de ajutor, sună la service.</p>
      </div>
    );
  }

  const justBooked = query.nou === "1";
  const justCancelled = query.anulat === "1";
  return <Summary summary={summary} token={token} justBooked={justBooked} justCancelled={justCancelled} />;
}

function Summary({
  summary,
  token,
  justBooked,
  justCancelled,
}: {
  summary: BookingSummary;
  token: string;
  justBooked: boolean;
  justCancelled: boolean;
}) {
  const tz = summary.tenant.timezone;
  const when = `${formatLongDate(summary.startsAt, tz)}, ora ${formatTime(summary.startsAt, tz)}`;
  const cancelled = summary.status === "cancelled";

  let heading = "Programarea ta";
  if (cancelled) heading = "Programarea a fost anulată";
  else if (justBooked && summary.status === "pending") heading = "Am primit cererea ta";
  else if (justBooked) heading = "Programarea e confirmată";

  return (
    <div className="flex flex-col gap-5">
      <div className={`rounded-lg p-5 ${cancelled ? "bg-zinc-200" : "bg-zinc-900 text-white"}`}>
        <h1 className="font-display text-3xl font-bold uppercase">{heading}</h1>
        {!cancelled && summary.firstName && justBooked && <p className="mt-1 text-lg">Mulțumim, {summary.firstName}!</p>}
        {!cancelled && summary.status === "pending" && (
          <p className="mt-2 text-lg">Service-ul îți confirmă programarea în cel mai scurt timp.</p>
        )}
        {justCancelled && <p className="mt-2 text-lg">Ora a fost eliberată. Te așteptăm altă dată!</p>}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg bg-white p-4 text-lg">
        <dt className="text-zinc-600">Când</dt>
        <dd className="font-bold">{when}</dd>
        <dt className="text-zinc-600">Unde</dt>
        <dd>
          {summary.tenant.displayName}, {summary.tenant.workAddress}
        </dd>
        <dt className="text-zinc-600">Mașina</dt>
        <dd>{vehicleText(summary)}</dd>
        <dt className="text-zinc-600">Cod</dt>
        <dd className="font-mono font-bold tracking-widest">{summary.publicRef}</dd>
      </dl>

      <section aria-labelledby="servicii" className="rounded-lg bg-white p-4">
        <h2 id="servicii" className="mb-2 text-xl font-bold">
          Servicii
        </h2>
        <ul className="flex flex-col divide-y divide-zinc-200">
          {summary.items.map((item, index) => (
            <li key={index} className="flex justify-between gap-3 py-2">
              <span>
                {item.name}
                {item.quantity > 1 ? ` × ${item.quantity}` : ""}
              </span>
              <span className="shrink-0 font-semibold">{lineText(item)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-zinc-300 pt-3 text-lg font-bold">
          Total estimativ: {totalText(summary)}
        </p>
        <p className="text-sm text-zinc-600">{FINAL_PRICE_NOTE}</p>
      </section>

      {!cancelled && (
        <p className="rounded-lg bg-amber-50 p-4">
          <strong>Păstrează acest link</strong> (pune-l la favorite): din el îți vezi sau îți anulezi programarea.
        </p>
      )}

      {summary.cancelDeadline !== null ? (
        <CancelForm
          token={token}
          deadlineText={`${formatLongDate(summary.cancelDeadline, tz)}, ora ${formatTime(summary.cancelDeadline, tz)}`}
        />
      ) : (
        !cancelled && (
          <p className="text-lg">
            Pentru modificări, sună la{" "}
            <a className="font-semibold text-accent underline" href={telHref(summary.tenant.publicPhone)}>
              {formatRoPhone(summary.tenant.publicPhone)}
            </a>
            .
          </p>
        )
      )}

      <Link href={`/${summary.tenant.slug}`} className="font-semibold text-accent underline">
        {cancelled ? "Fă o programare nouă" : "Înapoi la pagina service-ului"}
      </Link>
    </div>
  );
}

/** „Autoturism · jantă R16 aliaj · 4 roți · AG12ABC”. */
function vehicleText(summary: BookingSummary): string {
  const rim = [summary.rimSizeLabel, summary.rimTypeLabel?.toLowerCase()].filter(Boolean).join(" ");
  return [summary.vehicleTypeLabel, rim ? `jantă ${rim}` : null, `${summary.wheelCount} roți`, summary.plate]
    .filter(Boolean)
    .join(" · ");
}

function lineText(item: BookingSummary["items"][number]): string {
  if (item.lineMinBani === null || item.lineMaxBani === null) return "preț în service";
  if (item.priceIsMinimum) return `de la ${formatBani(item.lineMinBani)}`;
  if (item.lineMinBani === item.lineMaxBani) return formatBani(item.lineMinBani);
  return `${formatLeiAmount(item.lineMinBani)}–${formatBani(item.lineMaxBani)}`;
}

function totalText(summary: BookingSummary): string {
  const { estimateMinBani: min, estimateMaxBani: max } = summary;
  if (min === 0 && max === 0 && summary.estimateHasUnpriced) return "preț stabilit în service";
  const amount = min === max ? formatBani(min) : `${formatLeiAmount(min)}–${formatBani(max)}`;
  return summary.estimateHasUnpriced ? `${amount} + unele lucrări cu preț stabilit în service` : amount;
}
