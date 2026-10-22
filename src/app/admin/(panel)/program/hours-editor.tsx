"use client";

import { useState, useTransition } from "react";
import { buttonClass, Notice } from "@/components/admin/ui";
import { saveHoursAction } from "./actions";

type Interval = { weekday: number; opensAt: string; closesAt: string };

const DAYS = ["Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă", "Duminică"];

/** Programul săptămânal: unul sau mai multe intervale pe zi (al doilea = după pauza de prânz). */
export function HoursEditor({ initial }: { initial: Interval[] }) {
  const [intervals, setIntervals] = useState(initial.map((h) => ({ ...h, opensAt: h.opensAt.slice(0, 5), closesAt: h.closesAt.slice(0, 5) })));
  const [result, setResult] = useState<{ error: string | null; ok?: boolean; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (index: number, field: "opensAt" | "closesAt", value: string) =>
    setIntervals(intervals.map((h, i) => (i === index ? { ...h, [field]: value } : h)));

  return (
    <div className="flex flex-col gap-3">
      {DAYS.map((name, dayIndex) => {
        const weekday = dayIndex + 1;
        const day = intervals.map((h, index) => ({ h, index })).filter(({ h }) => h.weekday === weekday);
        return (
          <fieldset key={weekday} className="rounded-lg bg-white p-3">
            <legend className="sr-only">{name}</legend>
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold">{name}</p>
              {day.length === 0 && <p className="font-semibold text-zinc-500">Închis</p>}
            </div>
            {day.map(({ h, index }, position) => (
              <div key={index} className="mt-2 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2">
                  <span className="sr-only">
                    {name}, interval {position + 1}, de la
                  </span>
                  <input type="time" step={900} value={h.opensAt} onChange={(e) => update(index, "opensAt", e.target.value)} className="min-h-11 rounded-md border-2 border-zinc-400 px-2" />
                </label>
                <span>–</span>
                <label className="flex items-center gap-2">
                  <span className="sr-only">
                    {name}, interval {position + 1}, până la
                  </span>
                  <input type="time" step={900} value={h.closesAt} onChange={(e) => update(index, "closesAt", e.target.value)} className="min-h-11 rounded-md border-2 border-zinc-400 px-2" />
                </label>
                <button type="button" onClick={() => setIntervals(intervals.filter((_, i) => i !== index))} className={buttonClass.small}>
                  Șterge
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setIntervals([
                  ...intervals,
                  day.length === 0 ? { weekday, opensAt: "08:00", closesAt: "17:00" } : { weekday, opensAt: "14:00", closesAt: "18:00" },
                ])
              }
              className="mt-2 min-h-11 font-semibold text-accent underline"
            >
              {day.length === 0 ? "Deschis în ziua asta" : "Adaugă interval (după pauză)"}
            </button>
          </fieldset>
        );
      })}
      {result?.error && <Notice kind="error">{result.error}</Notice>}
      {result?.ok && <Notice kind="success">{result.message}</Notice>}
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await saveHoursAction(intervals)))}
        className={buttonClass.primary}
      >
        {pending ? "Se salvează…" : "Salvează programul"}
      </button>
    </div>
  );
}
