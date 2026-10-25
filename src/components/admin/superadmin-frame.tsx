import Link from "next/link";
import type { ReactNode } from "react";

/** Paginile unui service administrate doar de super-admin (Propheet AIgency). */
export const SUPERADMIN_SECTIONS = [
  { path: "firma", label: "Datele firmei și poza" },
  { path: "clienti", label: "Datele clienților" },
  { path: "istoric", label: "Istoric modificări" },
  { path: "statistici", label: "Statistici" },
] as const;

export type SuperadminSection = (typeof SUPERADMIN_SECTIONS)[number]["path"];

export function SuperadminFrame({
  tenantId,
  tenantName,
  active,
  children,
}: {
  tenantId: string;
  tenantName: string;
  active: SuperadminSection;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="bg-zinc-900 px-4 py-3 text-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
          <p className="font-display text-xl font-bold uppercase">{tenantName}</p>
          <Link href="/superadmin" className="font-semibold underline">
            ← Propheet AIgency
          </Link>
        </div>
      </header>
      <nav aria-label="Secțiuni super-admin" className="border-b border-zinc-300 bg-white">
        <ul className="mx-auto flex max-w-3xl flex-wrap gap-1 px-2 py-2">
          {SUPERADMIN_SECTIONS.map((section) => (
            <li key={section.path}>
              <Link
                href={`/superadmin/service/${tenantId}/${section.path}`}
                aria-current={active === section.path ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm font-bold ${
                  active === section.path ? "bg-accent text-white" : "text-zinc-800"
                }`}
              >
                {section.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-5">{children}</main>
    </div>
  );
}
