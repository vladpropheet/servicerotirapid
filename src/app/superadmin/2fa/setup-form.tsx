"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/admin/submit-button";
import { Field, Notice } from "@/components/admin/ui";
import { twoFactorSetupAction, type TwoFactorSetupState } from "./actions";

export function TwoFactorSetupForm() {
  const [state, action] = useActionState<TwoFactorSetupState, FormData>(twoFactorSetupAction, {
    step: "password",
    error: null,
  });

  if (state.step === "password") {
    return (
      <form action={action} className="flex flex-col gap-4">
        <p className="text-lg">
          Contul de super-admin are nevoie de verificare în doi pași. Ai nevoie de o aplicație de autentificare pe
          telefon (de ex. Google Authenticator, Microsoft Authenticator sau 2FAS).
        </p>
        <Field label="Parola ta" name="parola" type="password" autoComplete="current-password" required />
        {state.error && <Notice kind="error">{state.error}</Notice>}
        <SubmitButton pendingText="Se pregătește…">Continuă</SubmitButton>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <ol className="list-decimal space-y-2 pl-6 text-lg">
        <li>Deschide aplicația de autentificare și scanează codul de mai jos.</li>
        <li>Notează pe hârtie codurile de rezervă și păstrează-le într-un loc sigur.</li>
        <li>Scrie codul de 6 cifre afișat de aplicație.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element -- imagine generată pe server, ca data: URL */}
      <img
        src={state.qrDataUrl}
        alt="Cod QR pentru aplicația de autentificare"
        width={240}
        height={240}
        className="self-center rounded bg-white p-2"
      />
      <p className="break-all text-sm text-zinc-600">
        Nu poți scana? Cheia manuală: <span className="font-mono font-bold">{state.secret}</span>
      </p>
      <div className="rounded-md bg-amber-50 p-3">
        <p className="font-bold">Coduri de rezervă (fiecare merge o singură dată):</p>
        <ul className="mt-2 grid grid-cols-2 gap-1 font-mono">
          {state.backupCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
      </div>
      <form action={action} className="flex flex-col gap-4">
        <Field label="Codul din aplicație" name="cod" inputMode="numeric" autoComplete="one-time-code" required />
        {state.error && <Notice kind="error">{state.error}</Notice>}
        <SubmitButton pendingText="Se verifică…">Activează</SubmitButton>
      </form>
    </div>
  );
}
