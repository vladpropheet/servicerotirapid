import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Notice } from "@/components/admin/ui";
import { getSessionUser } from "@/server/auth/session";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Schimbă parola", robots: { index: false, follow: false } };

export default function ChangePasswordPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-10">
      <h1 className="font-display text-4xl font-bold uppercase">Alege o parolă nouă</h1>
      <Suspense fallback={<p>Se încarcă…</p>}>
        <Content />
      </Suspense>
    </main>
  );
}

async function Content() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  return (
    <>
      {user.mustChangePassword && (
        <Notice kind="review">Ai intrat cu o parolă temporară. Alege acum o parolă doar a ta.</Notice>
      )}
      <PasswordForm />
    </>
  );
}
