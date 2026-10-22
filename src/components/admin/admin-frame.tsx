import Link from "next/link";
import type { ReactNode } from "react";
import type { AdminContext } from "@/server/auth/session";

const NAV = [
  { href: "/admin", label: "Azi" },
  { href: "/admin/calendar", label: "Calendar" },
  { href: "/admin/programare-noua", label: "Adaugă" },
  { href: "/admin/servicii", label: "Servicii" },
  { href: "/admin/meniu", label: "Meniu" },
];

/** Cadrul paginilor de admin: numele service-ului sus, meniul principal jos (ca o aplicație de telefon). */
export function AdminFrame({ ctx, active, children }: { ctx: AdminContext; active: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="bg-zinc-900 px-4 py-3 text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <p className="font-display text-xl font-bold uppercase">{ctx.tenantName}</p>
          {ctx.tenantStatus === "suspended" && (
            <span className="rounded bg-red-700 px-2 py-1 text-sm font-bold">Suspendat</span>
          )}
        </div>
      </header>
      {ctx.role === "support" && (
        <p className="bg-label px-4 py-2 text-center font-semibold text-zinc-900">
          Mod suport Propheet AIgency ·{" "}
          <Link href="/superadmin" className="underline">
            ieși
          </Link>
        </p>
      )}
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 pb-28 pt-5">{children}</main>
      <nav
        aria-label="Meniu principal"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-300 bg-white pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto grid max-w-3xl grid-cols-5">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active === item.href ? "page" : undefined}
                className={`flex min-h-14 items-center justify-center text-sm font-bold ${
                  active === item.href ? "bg-accent text-white" : "text-zinc-800"
                }`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export function AdminSkeleton() {
  return (
    <div aria-busy="true" className="flex-1">
      <div className="h-12 bg-zinc-900" />
      <p className="mx-auto max-w-3xl px-4 py-6 text-lg">Se încarcă…</p>
    </div>
  );
}
