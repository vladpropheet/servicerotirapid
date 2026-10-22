"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/admin/submit-button";
import { Field, Notice } from "@/components/admin/ui";
import { loginAction, type FormState } from "./actions";

export function LoginForm() {
  const [state, action] = useActionState<FormState, FormData>(loginAction, { error: null });
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Telefon" name="telefon" type="tel" inputMode="tel" autoComplete="username" required placeholder="07xx xxx xxx" />
      <Field label="Parolă" name="parola" type="password" autoComplete="current-password" required />
      {state.error && <Notice kind="error">{state.error}</Notice>}
      <SubmitButton pendingText="Se verifică…">Intră în cont</SubmitButton>
    </form>
  );
}
