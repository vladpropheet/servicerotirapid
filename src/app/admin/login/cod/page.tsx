"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/admin/submit-button";
import { Field, Notice } from "@/components/admin/ui";
import { verifyCodeAction, type FormState } from "../actions";

export default function CodePage() {
  const [backup, setBackup] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(verifyCodeAction, { error: null });
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-10">
      <h1 className="font-display text-4xl font-bold uppercase">Codul de verificare</h1>
      <p className="text-lg">
        {backup
          ? "Scrie unul dintre codurile de rezervă primite când ai activat verificarea în doi pași."
          : "Deschide aplicația de autentificare de pe telefon și scrie codul de 6 cifre."}
      </p>
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="tip" value={backup ? "rezerva" : "totp"} />
        <Field
          label={backup ? "Cod de rezervă" : "Cod"}
          name="cod"
          inputMode={backup ? "text" : "numeric"}
          autoComplete="one-time-code"
          required
        />
        {state.error && <Notice kind="error">{state.error}</Notice>}
        <SubmitButton pendingText="Se verifică…">Verifică</SubmitButton>
      </form>
      <button type="button" onClick={() => setBackup(!backup)} className="min-h-11 font-semibold text-accent underline">
        {backup ? "Folosește codul din aplicație" : "Nu am telefonul: folosesc un cod de rezervă"}
      </button>
    </main>
  );
}
