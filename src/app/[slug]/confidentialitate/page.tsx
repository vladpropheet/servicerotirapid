import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SiteFooter } from "@/components/site-footer";
import { FEATURES } from "@/lib/features";
import { formatRoPhone } from "@/lib/format";
import { loadTenantInfo } from "@/server/repos/booking-data";
import { turnstileMode } from "@/server/security/turnstile";
import { resolvePublicTenant, withTenant } from "@/server/tenant";

export const metadata: Metadata = { title: "Politica de confidențialitate" };

// ATENȚIE: text generat din datele firmei, NEVERIFICAT JURIDIC. Trebuie verificat de un jurist înainte de lansare
// (temeiurile, transferul către Cloudflare, lista persoanelor împuternicite). Vezi docs/securitate.md.
export default function PrivacyPage(props: PageProps<"/[slug]/confidentialitate">) {
  return (
    <Suspense fallback={<p className="p-4 text-lg">Se încarcă…</p>}>
      <PrivacyContent params={props.params} />
    </Suspense>
  );
}

async function PrivacyContent({ params }: { params: PageProps<"/[slug]/confidentialitate">["params"] }) {
  const { slug } = await params;
  const tenant = await resolvePublicTenant(slug);
  if (!tenant) notFound();
  const info = await withTenant(tenant.id, (t) => loadTenantInfo(t));
  const usesTurnstile = turnstileMode() === "enabled";

  return (
    <>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 text-lg leading-relaxed">
        <p className="mb-6 rounded-md bg-amber-100 p-3 text-base font-semibold">
          Text provizoriu, în curs de verificare juridică.
        </p>
        <h1 className="font-display text-3xl font-bold uppercase">Politica de confidențialitate</h1>

        <h2 className="mt-6 text-xl font-bold">Cine prelucrează datele</h2>
        <p>
          Operatorul datelor este <strong>{info.legalName}</strong> (CUI {info.cui}, Reg. Com. {info.regCom}),
          {info.registeredAddress ? ` cu sediul în ${info.registeredAddress},` : ""} punct de lucru {info.workAddress},
          telefon {formatRoPhone(info.publicPhone)}
          {info.email ? `, e-mail ${info.email}` : ""}. Platforma de programări este furnizată de Propheet AIgency,
          care prelucrează datele doar în numele operatorului (persoană împuternicită).
        </p>

        <h2 className="mt-6 text-xl font-bold">Ce date colectăm și de ce</h2>
        <ul className="list-disc pl-6">
          <li>
            Numele și telefonul: ca să facem programarea și să te putem suna dacă apare o schimbare
            {FEATURES.smsNotifications ? " (și ca să-ți trimitem confirmarea și reamintirea prin SMS)" : ""}.
          </li>
          <li>Numărul de înmatriculare (opțional): ca să recunoaștem mașina în service.</li>
          <li>Serviciile alese, ziua și ora: ca să pregătim lucrarea.</li>
        </ul>
        <p className="mt-2">
          Temeiul este pregătirea și executarea serviciului cerut de tine.
          {FEATURES.marketingSms
            ? " Mesajele de marketing (de exemplu reamintirile sezoniere) le trimitem doar dacă ai bifat separat acordul, pe care îl poți retrage oricând."
            : " Nu folosim datele pentru reclame și nu le dăm altor firme."}
        </p>

        <h2 className="mt-6 text-xl font-bold">Cine are acces la date</h2>
        <p>
          Doar personalul service-ului. Propheet AIgency le poate vedea numai când service-ul cere ajutor tehnic,
          iar fiecare astfel de acces se înregistrează. Serverul aplicației este închiriat de la un furnizor de
          găzduire din Uniunea Europeană. Nu vindem și nu dăm datele altor firme.
        </p>

        <h2 className="mt-6 text-xl font-bold">Protecția împotriva abuzurilor</h2>
        <p>
          Ca să oprim programările false trimise în masă, numărăm câte cereri vin de la aceeași adresă IP și pentru
          același telefon. Pentru asta păstrăm cel mult 2 zile doar un cod obținut din adresa IP și din telefon,
          din care acestea nu pot fi citite înapoi. Temeiul este interesul nostru legitim de a proteja programările.
        </p>
        {usesTurnstile && (
          <p className="mt-2">
            Formularul de programare folosește și Cloudflare Turnstile, un serviciu al Cloudflare, Inc., care verifică
            dacă formularul e completat de un om. Pentru această verificare, Cloudflare primește date tehnice despre
            browser și adresa IP și le poate prelucra și în afara Uniunii Europene, în condițiile din{" "}
            <a href="https://www.cloudflare.com/privacypolicy/" className="font-semibold text-accent underline" rel="noopener noreferrer">
              politica de confidențialitate Cloudflare
            </a>
            .
          </p>
        )}

        <h2 className="mt-6 text-xl font-bold">Cookie-uri</h2>
        <p>
          Pagina de programare nu folosește cookie-uri de reclamă sau de statistică. Panoul de administrare al
          service-ului folosește doar un cookie strict necesar pentru logare.
        </p>

        <h2 className="mt-6 text-xl font-bold">Cât timp păstrăm datele</h2>
        <p>
          Programările se păstrează cel mult {info.retentionMonths} de luni de la data programării, apoi se șterg
          automat. Numele și telefonul se șterg odată cu ultima programare.
        </p>

        <h2 className="mt-6 text-xl font-bold">Drepturile tale</h2>
        <p>
          Poți cere oricând acces la datele tale, corectarea sau ștergerea lor, restricționarea prelucrării,
          portabilitatea datelor{FEATURES.marketingSms ? ", te poți opune prelucrării și îți poți retrage acordul pentru marketing" : " și te poți opune prelucrării"}. Pentru
          orice cerere, sună la {formatRoPhone(info.publicPhone)}. Îți răspundem în cel mult o lună. Ai dreptul să depui o plângere la Autoritatea
          Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP).
        </p>

        <h2 className="mt-6 text-xl font-bold">Unde stau datele</h2>
        <p>Datele programărilor sunt stocate pe servere din Uniunea Europeană.</p>

        <p className="mt-8">
          <Link href={`/${info.slug}`} className="font-semibold text-accent underline">
            Înapoi la programare
          </Link>
        </p>
      </main>
      <SiteFooter tenant={info} />
    </>
  );
}
