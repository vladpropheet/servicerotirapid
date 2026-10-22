"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/admin/submit-button";
import { Field, Notice } from "@/components/admin/ui";
import { changePasswordAction, type PasswordState } from "../account-actions";

export function PasswordForm() {
  const [state, action] = useActionState<PasswordState, FormData>(changePasswordAction, { error: null });
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Parola actuală (sau cea temporară)" name="parola_actuala" type="password" autoComplete="current-password" required />
      <Field
        label="Parola nouă"
        name="parola_noua"
        type="password"
        autoComplete="new-password"
        required
        hint="Cel puțin 12 caractere. Cel mai simplu: 3–4 cuvinte, de ex. „roata galbena sambata 2026”."
      />
      <Field label="Scrie din nou parola nouă" name="parola_confirmare" type="password" autoComplete="new-password" required />
      {state.error && <Notice kind="error">{state.error}</Notice>}
      <SubmitButton>Salvează parola</SubmitButton>
    </form>
  );
}
