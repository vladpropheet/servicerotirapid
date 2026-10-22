import type { Metadata } from "next";
import { Suspense } from "react";
import { Notice } from "@/components/admin/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Intră în cont", robots: { index: false, follow: false } };

export default function LoginPage(props: PageProps<"/admin/login">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-10">
      <div>
        <p className="font-display text-lg font-bold uppercase text-accent">Panoul service-ului</p>
        <h1 className="font-display text-4xl font-bold uppercase">Intră în cont</h1>
      </div>
      <Suspense>
        <AccessError searchParams={props.searchParams} />
      </Suspense>
      <LoginForm />
      <p className="text-zinc-600">Ai uitat parola? Sună la Propheet AIgency: îți dăm o parolă nouă, temporară.</p>
    </main>
  );
}

async function AccessError({ searchParams }: Pick<PageProps<"/admin/login">, "searchParams">) {
  const { eroare } = await searchParams;
  if (eroare !== "fara-acces") return null;
  return <Notice kind="error">Contul tău nu are acces la niciun service. Sună la Propheet AIgency.</Notice>;
}
