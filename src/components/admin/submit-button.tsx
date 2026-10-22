"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { buttonClass } from "./ui";

/** Buton de trimitere care se dezactivează cât timp formularul se trimite (fără dublu-click). */
export function SubmitButton({
  children,
  pendingText = "Se salvează…",
  variant = "primary",
  name,
  value,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: keyof typeof buttonClass;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={buttonClass[variant]}>
      {pending ? pendingText : children}
    </button>
  );
}
