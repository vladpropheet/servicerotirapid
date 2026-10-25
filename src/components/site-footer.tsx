import Link from "next/link";
import { formatRoPhone, telHref } from "@/lib/format";

type FooterTenant = {
  slug: string;
  legalName: string;
  cui: string;
  regCom: string;
  workAddress: string;
  publicPhone: string;
};

/**
 * Subsolul cu datele firmei (CLAUDE.md §9).
 * `belowBottomBar`: spațiu în plus jos, ca bara fixă a formularului să nu acopere subsolul.
 * `backgroundImage`: poza fațadei, pe fundal, întunecată ca textul să rămână ușor de citit.
 */
export function SiteFooter({
  tenant,
  belowBottomBar = false,
  backgroundImage = null,
}: {
  tenant: FooterTenant;
  belowBottomBar?: boolean;
  backgroundImage?: string | null;
}) {
  const onPhoto = backgroundImage !== null;
  return (
    <footer
      className={`relative mt-12 overflow-hidden px-4 pt-8 text-sm ${belowBottomBar ? "pb-32" : "pb-8"} ${
        onPhoto ? "bg-zinc-950 text-zinc-200" : "border-t border-zinc-300 bg-white text-zinc-700"
      }`}
    >
      {onPhoto && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- poza încărcată de patron, servită de aplicație */}
          <img src={backgroundImage} alt="" aria-hidden="true" loading="lazy" className="absolute inset-0 size-full object-cover" />
          <div aria-hidden="true" className="absolute inset-0 bg-zinc-950/85" />
        </>
      )}
      <div className="relative mx-auto flex max-w-2xl flex-col gap-1">
        <p className={`font-semibold ${onPhoto ? "text-white" : "text-zinc-900"}`}>{tenant.legalName}</p>
        <p>
          CUI {tenant.cui} · Reg. Com. {tenant.regCom}
        </p>
        <p>{tenant.workAddress}</p>
        <p>
          Telefon:{" "}
          <a className={`font-semibold underline ${onPhoto ? "text-white" : "text-accent"}`} href={telHref(tenant.publicPhone)}>
            {formatRoPhone(tenant.publicPhone)}
          </a>
        </p>
        <p className="mt-3">
          <Link className="underline" href={`/${tenant.slug}/confidentialitate`}>
            Politica de confidențialitate
          </Link>
        </p>
        <p className={`mt-3 text-xs ${onPhoto ? "text-zinc-400" : "text-zinc-500"}`}>
          Programări online realizate de Propheet AIgency.
        </p>
      </div>
    </footer>
  );
}
