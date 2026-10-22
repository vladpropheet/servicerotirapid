"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buttonClass, inputClass, Notice } from "@/components/admin/ui";
import { describeTotal, estimate, type PricingCatalog } from "@/domain/pricing";
import { formatDuration } from "@/lib/format";
import type { PublicCatalog } from "@/lib/public-catalog";
import { createManualBookingAction } from "./actions";

type Props = {
  pricing: PricingCatalog;
  display: PublicCatalog;
  slotStepMin: number;
  defaultDate: string;
};

/** Programare pentru un client care a sunat. Toate serviciile active, inclusiv cele „doar la telefon”. */
export function ManualBookingForm({ pricing, display, slotStepMin, defaultDate }: Props) {
  const router = useRouter();
  const [vehicleTypeId, setVehicleTypeId] = useState(display.vehicleTypes[0]?.id ?? "");
  const [rimSizeId, setRimSizeId] = useState<string>("");
  const [rimTypeId, setRimTypeId] = useState<string>("");
  const [wheelCount, setWheelCount] = useState(4);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [surchargeIds, setSurchargeIds] = useState<string[]>([]);
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [plate, setPlate] = useState("");
  const [note, setNote] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selection = {
    vehicleTypeId,
    rimSizeId: rimSizeId || null,
    rimTypeId: rimTypeId || null,
    wheelCount,
    surchargeIds,
    items: serviceIds.map((serviceId) => ({ serviceId })),
  };
  const preview = serviceIds.length > 0 ? estimate(pricing, selection, { flow: "admin", slotStepMin }) : null;
  const allServices = display.categories.flatMap((c) => c.services.map((s) => ({ ...s, category: c.name })));

  const submit = (force: boolean) => {
    setMessage(null);
    startTransition(async () => {
      const result = await createManualBookingAction({
        selection,
        date,
        time,
        durationMin: duration === "" ? null : Number(duration),
        customer: { fullName, phone, plate },
        note: note.trim() === "" ? null : note,
        force,
      });
      if (result.ok) {
        router.push(`/admin/calendar?data=${result.date}&vedere=zi`);
        return;
      }
      if ("fieldErrors" in result) {
        setFieldErrors(result.fieldErrors);
        setWarnings(null);
      } else if ("warnings" in result) {
        setFieldErrors({});
        setWarnings(result.warnings);
      } else {
        setMessage(result.message);
      }
    });
  };

  const err = (key: string) =>
    fieldErrors[key] ? <p className="font-semibold text-red-800">{fieldErrors[key]}</p> : null;
  const select = (label: string, value: string, onChange: (v: string) => void, options: { id: string; label: string }[], emptyLabel?: string) => (
    <label className="flex flex-col gap-1 font-semibold">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      className="flex flex-col gap-4"
    >
      <fieldset className="flex min-w-0 flex-col gap-3 rounded-lg bg-white p-4">
        <legend className="px-1 text-lg font-bold">Mașina</legend>
        {select("Tip", vehicleTypeId, setVehicleTypeId, display.vehicleTypes)}
        <div className="grid grid-cols-2 gap-3">
          {select("Mărime jantă", rimSizeId, setRimSizeId, display.rimSizes, "Nu știu")}
          {select("Tip jantă", rimTypeId, setRimTypeId, display.rimTypes, "Nu știu")}
        </div>
        <label className="flex flex-col gap-1 font-semibold">
          Număr de roți
          <input type="number" min={1} max={10} value={wheelCount} onChange={(e) => setWheelCount(Number(e.target.value) || 1)} className={inputClass} />
        </label>
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-1 rounded-lg bg-white p-4">
        <legend className="px-1 text-lg font-bold">Servicii</legend>
        {allServices.map((s) => (
          <label key={s.id} className="flex min-h-11 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              className="size-6 shrink-0 accent-accent"
              checked={serviceIds.includes(s.id)}
              onChange={(e) => setServiceIds(e.target.checked ? [...serviceIds, s.id] : serviceIds.filter((id) => id !== s.id))}
            />
            <span>
              {s.name} <span className="text-sm text-zinc-500">({s.category})</span>
            </span>
          </label>
        ))}
        {err("selection.items")}
        {pricing.surcharges.map((s) => (
          <label key={s.id} className="flex min-h-11 cursor-pointer items-center gap-3 border-t border-zinc-200">
            <input
              type="checkbox"
              className="size-6 shrink-0 accent-accent"
              checked={surchargeIds.includes(s.id)}
              onChange={(e) => setSurchargeIds(e.target.checked ? [...surchargeIds, s.id] : surchargeIds.filter((id) => id !== s.id))}
            />
            <span>Suprataxă: {s.name}</span>
          </label>
        ))}
        {preview && (
          <p className="mt-2 rounded bg-zinc-100 p-2">
            {preview.ok
              ? `Estimativ: ${describeTotal(preview.estimate)} · durată ${preview.estimate.bookedDurationMin > 0 ? formatDuration(preview.estimate.bookedDurationMin) : "necunoscută"}`
              : "Combinația aleasă nu se poate calcula (un serviciu e „nu facem” sau incompatibil)."}
          </p>
        )}
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-3 rounded-lg bg-white p-4">
        <legend className="px-1 text-lg font-bold">Când</legend>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 font-semibold">
            Data
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 font-semibold">
            Ora
            <input type="time" step={slotStepMin * 60} value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
          </label>
        </div>
        {err("date")}
        {err("time")}
        <label className="flex flex-col gap-1 font-semibold">
          Durată în minute (opțional)
          <input
            type="number"
            min={5}
            max={720}
            step={5}
            inputMode="numeric"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder={preview?.ok && preview.estimate.bookedDurationMin > 0 ? String(preview.estimate.bookedDurationMin) : "ex. 30"}
            className={inputClass}
          />
          <span className="text-sm font-normal text-zinc-600">Gol = durata calculată din servicii.</span>
        </label>
        {err("durationMin")}
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-3 rounded-lg bg-white p-4">
        <legend className="px-1 text-lg font-bold">Clientul</legend>
        <label className="flex flex-col gap-1 font-semibold">
          Nume
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" className={inputClass} />
        </label>
        {err("customer.fullName")}
        <label className="flex flex-col gap-1 font-semibold">
          Telefon
          <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" className={inputClass} />
        </label>
        {err("customer.phone")}
        <label className="flex flex-col gap-1 font-semibold">
          Nr. înmatriculare (opțional)
          <input value={plate} onChange={(e) => setPlate(e.target.value)} autoComplete="off" className={inputClass} />
        </label>
        {err("customer.plate")}
        <label className="flex flex-col gap-1 font-semibold">
          Notă (opțional)
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="rounded-md border-2 border-zinc-400 p-3 text-lg" />
        </label>
      </fieldset>

      {message && <Notice kind="error">{message}</Notice>}
      {warnings && (
        <div role="alert" className="flex flex-col gap-2 rounded-lg bg-amber-100 p-4">
          <p className="font-bold">Atenție:</p>
          <ul className="list-disc pl-5">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <button type="button" disabled={pending} onClick={() => submit(true)} className={buttonClass.primary}>
            Salvează oricum
          </button>
        </div>
      )}
      <button type="submit" disabled={pending} className={buttonClass.primary}>
        {pending ? "Se salvează…" : "Salvează programarea"}
      </button>
    </form>
  );
}
