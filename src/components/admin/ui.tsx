// Componente simple pentru panoul de administrare: mari, ușor de atins pe telefon, în română.
import type { ReactNode } from "react";

export const buttonClass = {
  primary:
    "inline-flex min-h-12 items-center justify-center rounded-md bg-accent px-5 text-lg font-bold text-white disabled:opacity-50",
  secondary:
    "inline-flex min-h-12 items-center justify-center rounded-md border-2 border-zinc-900 bg-white px-5 font-bold text-zinc-900 disabled:opacity-50",
  danger:
    "inline-flex min-h-12 items-center justify-center rounded-md border-2 border-red-800 bg-white px-4 font-bold text-red-800 disabled:opacity-50",
  small:
    "inline-flex min-h-11 items-center justify-center rounded-md border-2 border-zinc-300 bg-white px-3 font-semibold text-zinc-900 disabled:opacity-50",
};

export const inputClass =
  "min-h-12 w-full rounded-md border-2 border-zinc-400 bg-white px-3 text-lg aria-invalid:border-red-700";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg bg-white p-4 shadow-sm ${className}`}>{children}</section>;
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="font-display text-3xl font-bold uppercase">{children}</h1>;
}

export function Notice({ kind = "info", children }: { kind?: "info" | "error" | "success" | "review"; children: ReactNode }) {
  const styles = {
    info: "bg-zinc-100 text-zinc-900",
    error: "bg-red-100 text-red-900",
    success: "bg-green-100 text-green-900",
    review: "bg-amber-100 text-amber-950",
  }[kind];
  return (
    <p role={kind === "error" ? "alert" : "status"} className={`rounded-md p-3 font-semibold ${styles}`}>
      {children}
    </p>
  );
}

export function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required = false,
  hint,
  error,
  ...rest
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  inputMode?: "numeric" | "tel" | "text" | "decimal" | "email";
  autoComplete?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}) {
  const id = `f-${name}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={hint || error ? `${id}-info` : undefined}
        className={inputClass}
        {...rest}
      />
      {(hint || error) && (
        <p id={`${id}-info`} className={error ? "font-semibold text-red-800" : "text-sm text-zinc-600"}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export function TextArea({
  label,
  name,
  defaultValue,
  rows = 3,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  rows?: number;
  hint?: string;
}) {
  const id = `f-${name}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? undefined}
        className="w-full rounded-md border-2 border-zinc-400 bg-white p-3 text-lg"
      />
      {hint && <p className="text-sm text-zinc-600">{hint}</p>}
    </div>
  );
}

export function Checkbox({ label, name, defaultChecked }: { label: string; name: string; defaultChecked?: boolean }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-lg">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-6 accent-accent" />
      <span>{label}</span>
    </label>
  );
}
