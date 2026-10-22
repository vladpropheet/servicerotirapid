import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SiteFooter } from "@/components/site-footer";
import { formatRoPhone } from "@/lib/format";
import { loadTenantInfo } from "@/server/repos/booking-data";
import { resolvePublicTenant, withTenant } from "@/server/tenant";

export const metadata: Metadata = { title: "Politica de confidențialitate" };

// ATENȚIE: text provizoriu, generat din datele firmei. Trebuie verificat de un jurist înainte de lansare.
// Varianta completă vine în Faza 6 (GDPR).
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
          <li>Numele și telefonul: ca să facem programarea și să te anunțăm despre ea (confirmare, reamintire).</li>
          <li>Numărul de înmatriculare (opțional): ca să recunoaștem mașina în service.</li>
          <li>Serviciile alese, ziua și ora: ca să pregătim lucrarea.</li>
        </ul>
        <p className="mt-2">
          Temeiul este pregătirea și executarea serviciului cerut de tine. Mesajele de marketing (de exemplu
          reamintirile sezoniere) le trimitem doar dacă ai bifat separat acordul, pe care îl poți retrage oricând.
        </p>

        <h2 className="mt-6 text-xl font-bold">Cât timp păstrăm datele</h2>
        <p>Programările se păstrează cel mult {info.retentionMonths} de luni, apoi se șterg automat.</p>

        <h2 className="mt-6 text-xl font-bold">Drepturile tale</h2>
        <p>
          Poți cere oricând acces la datele tale, corectarea sau ștergerea lor, restricționarea prelucrării,
          portabilitatea datelor, te poți opune prelucrării și îți poți retrage acordul pentru marketing. Pentru
          orice cerere, sună la {formatRoPhone(info.publicPhone)}. Ai dreptul să depui o plângere la Autoritatea
          Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP).
        </p>

        <h2 className="mt-6 text-xl font-bold">Unde stau datele</h2>
        <p>Datele sunt stocate pe servere din Uniunea Europeană.</p>

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
