"use client";

import { useState, useTransition } from "react";
import { buttonClass, inputClass, Notice } from "@/components/admin/ui";
import type { PricingMode } from "@/domain/enums";
import { updateServicePricesAction } from "../actions";

type Dim = { id: string; label: string; active: boolean };

type Props = {
  serviceId: string;
  initial: { mode: PricingMode; byVehicle: boolean; byRimSize: boolean; byRimType: boolean };
  /** Textul fiecărei celule, după cheia „vehicul|mărime|tip” (`-` = dimensiune nefolosită). */
  cells: Record<string, string>;
  /** Celulele „de verificat”, cu nota lor. */
  review: Record<string, string>;
  vehicles: Dim[];
  sizes: Dim[];
  types: Dim[];
};

const key = (v: string | null, s: string | null, t: string | null) => `${v ?? "-"}|${s ?? "-"}|${t ?? "-"}`;

const MODES: { value: PricingMode; label: string }[] = [
  { value: "fixed", label: "Un singur preț" },
  { value: "range", label: "Interval (de la – până la)" },
  { value: "matrix", label: "Tabel după mașină / jantă" },
  { value: "on_request", label: "Preț stabilit în service" },
];

/** Editorul de prețuri: o căsuță de text pe celulă (vezi legenda). */
export function PriceEditor({ serviceId, initial, cells: initialCells, review, vehicles, sizes, types }: Props) {
  const [mode, setMode] = useState<PricingMode>(initial.mode);
  const [byVehicle, setByVehicle] = useState(initial.byVehicle || initial.mode !== "matrix");
  const [byRimSize, setByRimSize] = useState(initial.byRimSize);
  const [byRimType, setByRimType] = useState(initial.byRimType);
  const [cells, setCells] = useState(initialCells);
  const [result, setResult] = useState<{ error: string | null; ok?: boolean; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = (list: Dim[]) => list.filter((d) => d.active);
  const rows: { v: Dim | null; t: Dim | null }[] = [];
  for (const v of byVehicle ? visible(vehicles) : [null]) {
    for (const t of byRimType ? visible(types) : [null]) rows.push({ v, t });
  }
  const columns: (Dim | null)[] = byRimSize ? visible(sizes) : [null];
  const single = key(null, null, null);

  const save = () => {
    setResult(null);
    const payload =
      mode === "matrix"
        ? rows.flatMap((row) =>
            columns.map((col) => {
              const coords = { vehicleTypeId: row.v?.id ?? null, rimSizeId: col?.id ?? null, rimTypeId: row.t?.id ?? null };
              return { ...coords, text: cells[key(coords.vehicleTypeId, coords.rimSizeId, coords.rimTypeId)] ?? "" };
            }),
          )
        : mode === "on_request"
          ? []
          : [{ vehicleTypeId: null, rimSizeId: null, rimTypeId: null, text: cells[single] ?? "" }];
    startTransition(async () => {
      setResult(await updateServicePricesAction({ serviceId, mode, byVehicle, byRimSize, byRimType, cells: payload }));
    });
  };

  const cellInput = (k: string, label: string) => (
    <input
      aria-label={label}
      value={cells[k] ?? ""}
      onChange={(e) => setCells({ ...cells, [k]: e.target.value })}
      title={review[k]}
      className={`h-11 w-20 rounded border-2 px-2 text-center text-lg ${review[k] ? "border-amber-500 bg-amber-50" : "border-zinc-300 bg-white"}`}
    />
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <label className="flex flex-col gap-1 font-semibold">
        Cum se stabilește prețul
        <select value={mode} onChange={(e) => setMode(e.target.value as PricingMode)} className={inputClass}>
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      {(mode === "fixed" || mode === "range") && (
        <label className="flex flex-col gap-1 font-semibold">
          Preț (lei)
          {cellInput(single, "Preț")}
        </label>
      )}

      {mode === "matrix" && (
        <>
          <fieldset className="flex flex-wrap gap-x-5">
            <legend className="font-semibold">Prețul depinde de</legend>
            {[
              { label: "tipul mașinii", value: byVehicle, set: setByVehicle },
              { label: "mărimea jantei", value: byRimSize, set: setByRimSize },
              { label: "tipul jantei", value: byRimType, set: setByRimType },
            ].map((option) => (
              <label key={option.label} className="flex min-h-11 items-center gap-2">
                <input type="checkbox" checked={option.value} onChange={(e) => option.set(e.target.checked)} className="size-6 accent-accent" />
                {option.label}
              </label>
            ))}
          </fieldset>
          <div className="min-w-0 overflow-x-auto rounded border border-zinc-200 bg-white">
            <table className="border-collapse text-left">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-white p-2" />
                  {columns.map((col) => (
                    <th key={col?.id ?? "pret"} className="p-2 text-center font-semibold">
                      {col?.label ?? "Preț"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const rowLabel = [row.v?.label, row.t?.label].filter(Boolean).join(" · ") || "Preț";
                  return (
                    <tr key={`${row.v?.id}-${row.t?.id}`} className="border-t border-zinc-200">
                      <th className="sticky left-0 bg-white p-2 font-semibold">{rowLabel}</th>
                      {columns.map((col) => (
                        <td key={col?.id ?? "pret"} className="p-1">
                          {cellInput(key(row.v?.id ?? null, col?.id ?? null, row.t?.id ?? null), `${rowLabel}, ${col?.label ?? "preț"}`)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {mode !== "on_request" && (
        <p className="rounded bg-zinc-100 p-3 text-sm">
          Scrie prețul în lei: <strong>45</strong> · interval <strong>45-60</strong> · „de la” <strong>20+</strong> ·{" "}
          <strong>?</strong> = preț stabilit în service · <strong>x</strong> = nu facem · gol = combinația nu există.
          Căsuțele cu chenar galben sunt „de verificat”.
        </p>
      )}
      {result?.error && <Notice kind="error">{result.error}</Notice>}
      {result?.ok && <Notice kind="success">{result.message ?? "Salvat."}</Notice>}
      <button type="button" disabled={pending} onClick={save} className={buttonClass.primary}>
        {pending ? "Se salvează…" : "Salvează prețurile"}
      </button>
    </div>
  );
}
