"use client";

import { useActionState, type ReactNode } from "react";
import { Notice } from "./ui";

/** Rezultatul unei acțiuni de formular din admin. */
export type FormResult = { error: string | null; ok?: boolean; message?: string };

/**
 * Formular care trimite o acțiune de server și afișează rezultatul (eroare sau „Salvat”).
 * Funcționează și fără JavaScript (trimitere clasică a formularului).
 */
export function ActionForm({
  action,
  children,
  successText = "Salvat.",
  className = "flex flex-col gap-4",
}: {
  action: (previous: FormResult, formData: FormData) => Promise<FormResult>;
  children: ReactNode;
  successText?: string;
  className?: string;
}) {
  const [state, formAction] = useActionState<FormResult, FormData>(action, { error: null });
  return (
    <form action={formAction} className={className}>
      {children}
      {state.error && <Notice kind="error">{state.error}</Notice>}
      {state.ok && !state.error && <Notice kind="success">{state.message ?? successText}</Notice>}
    </form>
  );
}
