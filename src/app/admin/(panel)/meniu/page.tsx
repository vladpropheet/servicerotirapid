import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminFrame, AdminSkeleton } from "@/components/admin/admin-frame";
import { buttonClass, PageTitle } from "@/components/admin/ui";
import { FEATURES } from "@/lib/features";
import { requireAdmin } from "@/server/auth/session";
import { logoutAction, logoutEverywhereAction } from "../../account-actions";

export const metadata: Metadata = { title: "Meniu", robots: { index: false, follow: false } };

const LINKS = [
  { href: "/admin/blocari", label: "Zile libere și ore blocate" },
  { href: "/admin/program", label: "Programul de lucru" },
  { href: "/admin/servicii", label: "Servicii și prețuri" },
  { href: "/admin/suprataxe", label: "Suprataxe (Runflat, Off Road)" },
  { href: "/admin/dimensiuni", label: "Tipuri de mașini și jante" },
  { href: "/admin/setari", label: FEATURES.smsNotifications ? "Setări programări și SMS" : "Setări programări" },
  { href: "/admin/firma", label: "Datele firmei și poza" },
  { href: "/admin/de-verificat", label: "De verificat" },
  { href: "/admin/istoric", label: "Istoric modificări" },
  { href: "/admin/statistici", label: "Statistici" },
  { href: "/admin/cont", label: "Contul meu (parolă)" },
];

export default function MenuPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const ctx = await requireAdmin();
  return (
    <AdminFrame ctx={ctx} active="/admin/meniu">
      <PageTitle>Meniu</PageTitle>
      <ul className="flex flex-col gap-2">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="flex min-h-14 items-center rounded-lg bg-white px-4 text-lg font-semibold">
              {link.label}
            </Link>
          </li>
        ))}
        <li>
          <Link href={`/${ctx.tenantSlug}`} className="flex min-h-14 items-center rounded-lg bg-white px-4 text-lg font-semibold">
            Vezi pagina de programare (ca un client)
          </Link>
        </li>
      </ul>
      <form action={logoutAction}>
        <button type="submit" className={`${buttonClass.secondary} w-full`}>
          Ieși din cont
        </button>
      </form>
      <form action={logoutEverywhereAction}>
        <button type="submit" className={`${buttonClass.danger} w-full`}>
          Ieși de pe toate dispozitivele
        </button>
      </form>
    </AdminFrame>
  );
}
