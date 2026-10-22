import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SiteFooter } from "@/components/site-footer";
import { formatRoPhone, telHref } from "@/lib/format";
import { loadBookingSettings, loadCatalog, loadTenantInfo } from "@/server/repos/booking-data";
import { resolvePublicTenant, withTenant } from "@/server/tenant";
import { BookingWizard } from "./booking-wizard";

export const metadata: Metadata = {
  title: "Programare online",
  description: "Programează-te online la service, în mai puțin de un minut.",
};

// Pagina publică a unui service (ex. /roti-rapid). Datele vin din baza de date la fiecare cerere,
// deci tot conținutul stă într-un <Suspense> (cerință Next 16 cu Cache Components).
export default function TenantPage(props: PageProps<"/[slug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TenantContent params={props.params} />
    </Suspense>
  );
}

async function TenantContent({ params }: { params: PageProps<"/[slug]">["params"] }) {
  const { slug } = await params;
  const tenant = await resolvePublicTenant(slug);
  if (!tenant) notFound();

  const data = await withTenant(tenant.id, async (t) => ({
    info: await loadTenantInfo(t),
    settings: await loadBookingSettings(t),
    catalog: await loadCatalog(t),
  }));
  const { info, settings, catalog } = data;

  return (
    <>
      <header className="bg-zinc-900 px-4 pb-6 pt-8 text-white">
        <div className="mx-auto max-w-2xl">
          {/* Logo text: service-ul nu are logo (CLAUDE.md §5). Poza fațadei vine din admin, în Faza 4. */}
          <p className="font-display text-4xl font-bold uppercase leading-none tracking-tight">{info.displayName}</p>
          <p className="mt-2 text-zinc-300">{info.workAddress}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="rounded bg-label px-2 py-1 text-sm font-bold uppercase text-zinc-900">
              Programare online
            </span>
            <a
              href={telHref(info.publicPhone)}
              className="inline-flex min-h-11 items-center rounded-md border border-white/40 px-4 font-semibold"
            >
              Sună: {formatRoPhone(info.publicPhone)}
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        {settings.onlineCapacity === 0 ? (
          <p role="status" className="rounded-md bg-white p-4 text-lg">
            Momentan nu primim programări online. Te rugăm să ne suni la{" "}
            <a className="font-semibold text-accent underline" href={telHref(info.publicPhone)}>
              {formatRoPhone(info.publicPhone)}
            </a>
            .
          </p>
        ) : (
          <BookingWizard
            slug={info.slug}
            timeZone={info.timezone}
            publicPhone={info.publicPhone}
            slotStepMin={settings.slotStepMin}
            pricing={catalog.pricing}
            display={catalog.display}
          />
        )}
      </main>

      <SiteFooter tenant={info} belowBottomBar={settings.onlineCapacity > 0} />
    </>
  );
}

function PageSkeleton() {
  return (
    <div aria-busy="true" className="flex-1">
      <div className="h-36 bg-zinc-900" />
      <p className="mx-auto max-w-2xl px-4 py-6 text-lg">Se încarcă…</p>
    </div>
  );
}
