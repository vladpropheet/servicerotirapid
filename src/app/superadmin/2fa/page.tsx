import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionUser } from "@/server/auth/session";
import { TwoFactorSetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Verificare în doi pași", robots: { index: false, follow: false } };

export default function TwoFactorPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="font-display text-4xl font-bold uppercase">Verificare în doi pași</h1>
      <Suspense fallback={<p>Se încarcă…</p>}>
        <Content />
      </Suspense>
    </main>
  );
}

async function Content() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (user.platformRole !== "superadmin") redirect("/admin");
  if (user.mustChangePassword) redirect("/admin/schimba-parola");
  if (user.twoFactorEnabled) redirect("/superadmin");
  return <TwoFactorSetupForm />;
}
