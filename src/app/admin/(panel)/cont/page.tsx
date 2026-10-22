import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminFrame, AdminSkeleton } from "@/components/admin/admin-frame";
import { buttonClass, Card, PageTitle } from "@/components/admin/ui";
import { formatRoPhone } from "@/lib/format";
import { requireAdmin } from "@/server/auth/session";
import { logoutEverywhereAction } from "../../account-actions";
import { PasswordForm } from "../../schimba-parola/password-form";

export const metadata: Metadata = { title: "Contul meu", robots: { index: false, follow: false } };

export default function AccountPage() {
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
      <PageTitle>Contul meu</PageTitle>
      <Card>
        <p className="text-lg">
          {ctx.user.name}
          {ctx.user.username ? ` · ${formatRoPhone(`+${ctx.user.username}`)}` : ""}
        </p>
      </Card>
      <Card>
        <h2 className="mb-3 text-xl font-bold">Schimbă parola</h2>
        <PasswordForm />
      </Card>
      <Card>
        <h2 className="mb-2 text-xl font-bold">Telefon pierdut sau parolă aflată de altcineva?</h2>
        <p className="mb-3">Te deconectează de pe toate telefoanele și calculatoarele, inclusiv acesta.</p>
        <form action={logoutEverywhereAction}>
          <button type="submit" className={`${buttonClass.danger} w-full`}>
            Ieși de pe toate dispozitivele
          </button>
        </form>
      </Card>
    </AdminFrame>
  );
}
