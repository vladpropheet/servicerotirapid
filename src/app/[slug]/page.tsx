import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { MapsLink } from "@/components/maps-link";
import { SiteFooter } from "@/components/site-footer";
import { formatRoPhone, telHref } from "@/lib/format";
import { loadBookingSettings, loadCatalog, loadTenantInfo } from "@/server/repos/booking-data";
import { turnstileSiteKey } from "@/server/security/turnstile";
import { resolvePublicTenant, withTenant } from "@/server/tenant";
import { BookingWizard } from "./booking-wizard";

// Imaginea din previzualizarea linkului (WhatsApp, Facebook): pictograma aplicației.
// Adresa trebuie să fie completă, din APP_BASE_URL, citită la cerere (nu la build).
export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const base = process.env.APP_BASE_URL;
  return {
    title: "Programare online",
    description: "Programează-te online la service, în mai puțin de un minut.",
    ...(base && {
      metadataBase: new URL(base),
      openGraph: { images: [{ url: "/icons/icon-512.png", width: 512, height: 512, type: "image/png" }] },
    }),
  };
}

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
      <header className="bg-white px-4 pb-5 pt-3 shadow-sm">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          <MapsLink address={info.workAddress} />
          {/* Logo-ul îl încarcă patronul din admin („Datele firmei”). Fără logo, numele apare ca logo text (CLAUDE.md §5). */}
          {info.logoMediaId ? (
            <div className="relative mx-auto w-fit max-w-full">
              {/* eslint-disable-next-line @next/next/no-img-element -- logo încărcat de patron, servit de aplicație */}
              <img
                src={`/${info.slug}/logo?v=${info.logoMediaId}`}
                alt={info.displayName}
                className="max-h-32 w-auto max-w-full sm:max-h-40"
              />
              <OnlineBadge className="absolute bottom-0 right-0" />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-center">
              <p className="font-display text-4xl font-bold uppercase leading-none tracking-tight text-zinc-900">
                {info.displayName}
              </p>
              <OnlineBadge />
            </div>
          )}
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
            turnstileSiteKey={turnstileSiteKey()}
          />
        )}
      </main>

      <SiteFooter
        tenant={info}
        belowBottomBar={settings.onlineCapacity > 0}
        backgroundImage={info.facadeMediaId ? `/${info.slug}/fatada?v=${info.facadeMediaId}` : null}
      />
    </>
  );
}

/** Eticheta galbenă „Programează-te online”, în colțul de jos-dreapta al logo-ului. */
function OnlineBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`whitespace-nowrap rounded bg-label px-2 py-1 text-sm font-bold uppercase text-zinc-900 shadow ${className}`}>
      Programează-te online
    </span>
  );
}

function PageSkeleton() {
  return (
    <div aria-busy="true" className="flex-1">
      <div className="h-48 bg-white" />
      <p className="mx-auto max-w-2xl px-4 py-6 text-lg">Se încarcă…</p>
    </div>
  );
}
