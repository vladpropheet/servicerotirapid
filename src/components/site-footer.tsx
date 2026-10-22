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
 */
export function SiteFooter({ tenant, belowBottomBar = false }: { tenant: FooterTenant; belowBottomBar?: boolean }) {
  return (
    <footer
      className={`mt-12 border-t border-zinc-300 bg-white px-4 pt-8 text-sm text-zinc-700 ${belowBottomBar ? "pb-32" : "pb-8"}`}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-1">
        <p className="font-semibold text-zinc-900">{tenant.legalName}</p>
        <p>
          CUI {tenant.cui} · Reg. Com. {tenant.regCom}
        </p>
        <p>{tenant.workAddress}</p>
        <p>
          Telefon:{" "}
          <a className="font-semibold text-accent underline" href={telHref(tenant.publicPhone)}>
            {formatRoPhone(tenant.publicPhone)}
          </a>
        </p>
        <p className="mt-3">
          <Link className="underline" href={`/${tenant.slug}/confidentialitate`}>
            Politica de confidențialitate
          </Link>
        </p>
        <p className="mt-3 text-xs text-zinc-500">Programări online realizate de Propheet AIgency.</p>
      </div>
    </footer>
  );
}
