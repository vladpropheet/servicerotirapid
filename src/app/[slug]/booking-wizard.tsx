"use client";

// Fluxul public de programare, în 3 pași (CLAUDE.md §5). Mobile-first.
// Prețurile se calculează aici doar pentru afișare; serverul le recalculează la confirmare.
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import {
  describeLine,
  describeTotal,
  estimate,
  FINAL_PRICE_NOTE,
  type EstimateErrorCode,
  type PricingCatalog,
  type PricingSelection,
} from "@/domain/pricing";
import { MARKETING_CONSENT_TEXT, PRIVACY_CONSENT_TEXT } from "@/lib/consent-texts";
import { FEATURES } from "@/lib/features";
import { formatDayChip, formatDuration, formatLongDate, formatRoPhone, telHref } from "@/lib/format";
import type { PublicCatalog, PublicService } from "@/lib/public-catalog";
import { customerSchema } from "@/lib/validation/booking";
import { createBookingAction, getSlotsAction, type SlotDay, type SlotOption } from "./actions";

type Props = {
  slug: string;
  timeZone: string;
  publicPhone: string;
  slotStepMin: number;
  pricing: PricingCatalog;
  display: PublicCatalog;
};

type Step = 1 | 2 | 3;

const ESTIMATE_ERRORS: Partial<Record<EstimateErrorCode, string>> = {
  not_offered: "Unul dintre serviciile alese nu se face pentru această mașină. Scoate-l sau sună-ne.",
  conflict: "Două dintre serviciile alese se suprapun (unul îl include pe celălalt). Păstrează doar unul.",
  invalid_quantity: "Cantitatea aleasă nu e permisă.",
};

export function BookingWizard({ slug, timeZone, publicPhone, slotStepMin, pricing, display }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);

  // Pasul 1
  const [vehicleTypeId, setVehicleTypeId] = useState(display.vehicleTypes[0]?.id ?? "");
  const [rimSizeId, setRimSizeId] = useState<string | null>(null);
  const [rimTypeId, setRimTypeId] = useState<string | null>(null);
  const [wheelCount, setWheelCount] = useState(4);
  const [surchargeIds, setSurchargeIds] = useState<string[]>([]);
  const [items, setItems] = useState<{ serviceId: string; quantity?: number }[]>([]);

  // Pasul 2
  const [days, setDays] = useState<SlotDay[] | null>(null);
  const [durationMin, setDurationMin] = useState<number | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [slot, setSlot] = useState<SlotOption | null>(null);
  const [slotsMessage, setSlotsMessage] = useState<string | null>(null);

  // Pasul 3
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [plate, setPlate] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  const [pending, startTransition] = useTransition();

  const selection: PricingSelection = { vehicleTypeId, rimSizeId, rimTypeId, wheelCount, surchargeIds, items };
  const total = useMemo(
    () => (items.length === 0 ? null : estimate(pricing, selection, { flow: "online", slotStepMin })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pricing, vehicleTypeId, rimSizeId, rimTypeId, wheelCount, surchargeIds, items, slotStepMin],
  );

  const servicePrice = (serviceId: string, quantity?: number) => {
    const result = estimate(
      pricing,
      { vehicleTypeId, rimSizeId, rimTypeId, wheelCount, surchargeIds: [], items: [{ serviceId, quantity }] },
      { flow: "admin", slotStepMin },
    );
    if (!result.ok) return { text: "Nu efectuăm pentru această mașină", offered: false };
    return { text: describeLine(result.estimate.lines[0]!), offered: true };
  };

  /** Orice schimbare la pasul 1 invalidează orele calculate. */
  const changed = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setDays(null);
    setSlot(null);
  };

  const toggleService = (service: PublicService) => {
    changed(setItems)(
      items.some((i) => i.serviceId === service.id)
        ? items.filter((i) => i.serviceId !== service.id)
        : [...items, { serviceId: service.id, quantity: service.unit === "piece" ? 1 : undefined }],
    );
  };

  /** Când clientul corectează un câmp, mesajul de eroare al câmpului dispare. */
  const edited =
    <T,>(field: string, setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      if (fieldErrors[field]) {
        setFieldErrors((errors) => {
          const next = { ...errors };
          delete next[field];
          return next;
        });
      }
    };

  const goTo = (next: Step) => {
    setStep(next);
    window.scrollTo({ top: 0 });
  };

  const loadSlots = (message: string | null = null) => {
    setSlotsMessage(message);
    startTransition(async () => {
      const result = await getSlotsAction(slug, selection);
      if (!result.ok) {
        setDays([]);
        setSlotsMessage(
          result.error === "invalid_selection"
            ? (ESTIMATE_ERRORS[result.code ?? "not_offered"] ?? "Serviciile alese nu se pot programa online.")
            : "Nu am putut încărca orele libere. Încearcă din nou.",
        );
        return;
      }
      setDays(result.days);
      setDurationMin(result.durationMin);
      setDayIndex(0);
    });
  };

  const continueToSlots = () => {
    goTo(2);
    if (days === null) loadSlots();
  };

  const submit = () => {
    setFormMessage(null);
    const customer = customerSchema.safeParse({ fullName, phone, plate });
    const errors: Record<string, string> = {};
    if (!customer.success) {
      for (const issue of customer.error.issues) errors[`customer.${issue.path.join(".")}`] ??= issue.message;
    }
    if (!privacyAccepted) errors.privacyAccepted = "Bifează acordul pentru prelucrarea datelor, ca să putem face programarea.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || !slot) return;

    idempotencyKey.current ??= crypto.randomUUID();
    startTransition(async () => {
      const result = await createBookingAction(slug, {
        selection,
        startsAt: slot.startsAt,
        customer: { fullName, phone, plate },
        privacyAccepted: true,
        marketingOptIn: FEATURES.marketingSms && marketingOptIn,
        idempotencyKey: idempotencyKey.current,
      });
      if (result.ok) {
        router.push(`/p/${result.token}?nou=1`);
        return;
      }
      switch (result.error) {
        case "validation":
          setFieldErrors(result.fieldErrors);
          break;
        case "slot_taken":
          idempotencyKey.current = null;
          setSlot(null);
          goTo(2);
          loadSlots("Ne pare rău, ora aleasă tocmai a fost ocupată. Alege altă oră.");
          break;
        case "too_many_bookings":
          setFormMessage(
            `Ai deja programări active pe acest număr de telefon. Pentru încă una, sună-ne la ${formatRoPhone(publicPhone)}.`,
          );
          break;
        case "invalid_selection":
          setFormMessage("Serviciile alese nu mai pot fi programate online. Reîncarcă pagina și încearcă din nou.");
          break;
        default:
          setFormMessage(`A apărut o problemă. Încearcă din nou sau sună-ne la ${formatRoPhone(publicPhone)}.`);
      }
    });
  };

  const bookable = display.categories
    .map((c) => ({ ...c, services: c.services.filter((s) => s.bookableOnline) }))
    .filter((c) => c.services.length > 0);
  const phoneOnly = display.categories.flatMap((c) => c.services.filter((s) => !s.bookableOnline));
  const chosenNames = items
    .map((i) => display.categories.flatMap((c) => c.services).find((s) => s.id === i.serviceId)?.name)
    .filter(Boolean)
    .join(", ");
  const currentDay = days?.[dayIndex];

  return (
    <div className="pb-8">
      <StepIndicator step={step} />

      {step === 1 && (
        <section aria-labelledby="pas-1" className="flex flex-col gap-6">
          <h1 id="pas-1" className="font-display text-3xl font-bold uppercase">
            Alege serviciul
          </h1>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-lg font-semibold">Ce mașină ai?</legend>
            <div className="flex flex-wrap gap-2">
              {display.vehicleTypes.map((v) => (
                <Pill key={v.id} name="vehicul" checked={vehicleTypeId === v.id} onChange={() => changed(setVehicleTypeId)(v.id)}>
                  {v.label}
                </Pill>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-lg font-semibold">Mărimea jantei</legend>
            <div className="flex flex-wrap gap-2">
              <Pill name="marime" checked={rimSizeId === null} onChange={() => changed(setRimSizeId)(null)}>
                Nu știu
              </Pill>
              {display.rimSizes.map((r) => (
                <Pill key={r.id} name="marime" checked={rimSizeId === r.id} onChange={() => changed(setRimSizeId)(r.id)}>
                  {r.label}
                </Pill>
              ))}
            </div>
            <p className="text-sm text-zinc-600">
              E scrisă pe anvelopă: de exemplu la <strong>205/55 R16</strong> mărimea este <strong>R16</strong>.
            </p>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-lg font-semibold">Tipul jantei</legend>
            <div className="flex flex-wrap gap-2">
              <Pill name="tip-janta" checked={rimTypeId === null} onChange={() => changed(setRimTypeId)(null)}>
                Nu știu
              </Pill>
              {display.rimTypes.map((r) => (
                <Pill key={r.id} name="tip-janta" checked={rimTypeId === r.id} onChange={() => changed(setRimTypeId)(r.id)}>
                  {r.label}
                </Pill>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            <Stepper label="Număr de roți" value={wheelCount} min={1} max={10} onChange={changed(setWheelCount)} />
            {display.surcharges.map((s) => (
              <label key={s.id} className="flex min-h-11 cursor-pointer items-center gap-3 text-lg">
                <input
                  type="checkbox"
                  className="size-6 accent-accent"
                  checked={surchargeIds.includes(s.id)}
                  onChange={(e) =>
                    changed(setSurchargeIds)(
                      e.target.checked ? [...surchargeIds, s.id] : surchargeIds.filter((id) => id !== s.id),
                    )
                  }
                />
                <span>
                  {s.name}
                  {s.description ? <span className="block text-sm text-zinc-600">{s.description}</span> : null}
                </span>
              </label>
            ))}
          </div>

          {bookable.map((category) => (
            <section key={category.id} aria-labelledby={`cat-${category.id}`} className="flex flex-col gap-3">
              <h2 id={`cat-${category.id}`} className="font-display text-2xl font-bold uppercase">
                {category.name}
              </h2>
              {category.services.map((service) => {
                const chosen = items.find((i) => i.serviceId === service.id);
                const price = servicePrice(service.id, chosen?.quantity);
                return (
                  <article
                    key={service.id}
                    className={`rounded-lg border-2 bg-white p-4 ${chosen ? "border-accent" : "border-zinc-200"}`}
                  >
                    <h3 className="text-xl font-bold">{service.name}</h3>
                    {service.customerExplainer && (
                      <p className="mt-2 rounded bg-amber-50 p-2 text-zinc-800">
                        <strong>Când alegi asta: </strong>
                        {service.customerExplainer}
                      </p>
                    )}
                    {service.includes && <p className="mt-2 text-sm text-zinc-600">Include: {service.includes}</p>}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-lg font-semibold">
                        {price.text}
                        {service.unit === "wheel" && price.offered && (
                          <span className="font-normal text-zinc-600"> · {wheelCount} roți</span>
                        )}
                      </p>
                      <button
                        type="button"
                        disabled={!price.offered && !chosen}
                        aria-pressed={Boolean(chosen)}
                        onClick={() => toggleService(service)}
                        className={`min-h-11 rounded-md px-5 font-bold disabled:opacity-40 ${
                          chosen ? "border-2 border-accent bg-white text-accent" : "bg-accent text-white"
                        }`}
                      >
                        {chosen ? "Adăugat ✓ (scoate)" : "Adaugă"}
                      </button>
                    </div>
                    {chosen && service.unit === "piece" && (
                      <div className="mt-3">
                        <Stepper
                          label="Bucăți"
                          value={chosen.quantity ?? 1}
                          min={1}
                          max={10}
                          onChange={(quantity) =>
                            changed(setItems)(items.map((i) => (i.serviceId === service.id ? { ...i, quantity } : i)))
                          }
                        />
                      </div>
                    )}
                  </article>
                );
              })}
            </section>
          ))}

          {phoneOnly.length > 0 && (
            <details className="rounded-lg border-2 border-zinc-200 bg-white p-4">
              <summary className="min-h-11 cursor-pointer content-center text-lg font-bold">
                Alte lucrări (reparații pană etc.) — doar la telefon
              </summary>
              <ul className="mt-3 flex flex-col divide-y divide-zinc-200">
                {phoneOnly.map((service) => (
                  <li key={service.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <span>
                      <span className="font-semibold">{service.name}</span>
                      <span className="block text-zinc-600">{servicePrice(service.id).text}</span>
                    </span>
                    <a href={telHref(publicPhone)} className="inline-flex min-h-11 items-center rounded-md border-2 border-zinc-900 px-4 font-bold">
                      Sună acum
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <BottomBar>
            {total === null ? (
              <p className="text-zinc-700">Alege cel puțin un serviciu.</p>
            ) : total.ok ? (
              <div>
                <p className="text-lg font-bold">Estimativ: {describeTotal(total.estimate)}</p>
                <p className="text-sm text-zinc-600">
                  {FINAL_PRICE_NOTE} Durată ~{formatDuration(total.estimate.bookedDurationMin)}.
                </p>
              </div>
            ) : (
              <p role="alert" className="font-semibold text-red-800">
                {ESTIMATE_ERRORS[total.error.code] ?? "Combinația aleasă nu se poate programa online."}
              </p>
            )}
            <button
              type="button"
              disabled={!total?.ok}
              onClick={continueToSlots}
              className="min-h-12 shrink-0 rounded-md bg-accent px-6 text-lg font-bold text-white disabled:opacity-40"
            >
              Alege ziua și ora
            </button>
          </BottomBar>
        </section>
      )}

      {step === 2 && (
        <section aria-labelledby="pas-2" className="flex flex-col gap-5">
          <h1 id="pas-2" className="font-display text-3xl font-bold uppercase">
            Alege ziua și ora
          </h1>
          <Summary onEdit={() => goTo(1)}>
            {chosenNames}
            {durationMin !== null && <> · durată ~{formatDuration(durationMin)}</>}
          </Summary>

          {slotsMessage && (
            <p role="alert" className="rounded-md bg-amber-100 p-3 font-semibold">
              {slotsMessage}
            </p>
          )}

          {pending && days === null ? (
            <p role="status" className="text-lg">
              Căutăm orele libere…
            </p>
          ) : days && days.length === 0 ? (
            <p className="rounded-md bg-white p-4 text-lg">
              Nu mai sunt ore libere online în perioada următoare. Sună-ne la{" "}
              <a className="font-semibold text-accent underline" href={telHref(publicPhone)}>
                {formatRoPhone(publicPhone)}
              </a>
              .
            </p>
          ) : days ? (
            <>
              {/* min-w-0: un <fieldset> nu se îngustează implicit sub conținut, iar rândul de zile ar lăți pagina. */}
              <fieldset className="min-w-0">
                <legend className="mb-2 text-lg font-semibold">Ziua</legend>
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
                  {days.map((day, index) => {
                    const chip = formatDayChip(day.slots[0]!.startsAt, timeZone);
                    return (
                      <label key={day.localDate} className="relative shrink-0">
                        <input
                          type="radio"
                          name="zi"
                          className="peer sr-only"
                          checked={dayIndex === index}
                          onChange={() => {
                            setDayIndex(index);
                            setSlot(null);
                          }}
                        />
                        <span className="flex min-h-14 min-w-16 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-zinc-300 bg-white px-3 py-1 peer-checked:border-accent peer-checked:bg-accent peer-checked:text-white peer-focus-visible:outline-3 peer-focus-visible:outline-zinc-900">
                          <span className="text-sm uppercase">{chip.weekday}</span>
                          <span className="font-bold">{chip.day}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {currentDay && (
                <fieldset>
                  <legend className="mb-2 text-lg font-semibold">
                    Ora ({formatLongDate(currentDay.slots[0]!.startsAt, timeZone)})
                  </legend>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {currentDay.slots.map((option) => (
                      <label key={option.startsAt} className="relative">
                        <input
                          type="radio"
                          name="ora"
                          className="peer sr-only"
                          checked={slot?.startsAt === option.startsAt}
                          onChange={() => setSlot(option)}
                        />
                        <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-md border-2 border-zinc-300 bg-white font-bold peer-checked:border-accent peer-checked:bg-accent peer-checked:text-white peer-focus-visible:outline-3 peer-focus-visible:outline-zinc-900">
                          {option.localTime}
                          {option.repeatedLocalTime ? "*" : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                  {currentDay.slots.some((o) => o.repeatedLocalTime) && (
                    <p className="mt-2 text-sm text-zinc-600">* a doua oară, după trecerea la ora de iarnă.</p>
                  )}
                </fieldset>
              )}
            </>
          ) : null}

          <BottomBar>
            <button type="button" onClick={() => goTo(1)} className="min-h-12 rounded-md border-2 border-zinc-900 px-4 font-bold">
              Înapoi
            </button>
            <button
              type="button"
              disabled={!slot}
              onClick={() => goTo(3)}
              className="min-h-12 flex-1 rounded-md bg-accent px-6 text-lg font-bold text-white disabled:opacity-40"
            >
              Continuă
            </button>
          </BottomBar>
        </section>
      )}

      {step === 3 && slot && (
        <section aria-labelledby="pas-3" className="flex flex-col gap-5">
          <h1 id="pas-3" className="font-display text-3xl font-bold uppercase">
            Datele tale
          </h1>
          <Summary onEdit={() => goTo(2)}>
            <strong>
              {formatLongDate(slot.startsAt, timeZone)}, ora {slot.localTime}
            </strong>
            <br />
            {chosenNames}
            {total?.ok && (
              <>
                <br />
                Estimativ: {describeTotal(total.estimate)}. {FINAL_PRICE_NOTE}
              </>
            )}
          </Summary>

          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex flex-col gap-4"
          >
            <TextField
              id="nume"
              label="Nume și prenume"
              value={fullName}
              onChange={edited("customer.fullName", setFullName)}
              autoComplete="name"
              error={fieldErrors["customer.fullName"]}
            />
            <TextField
              id="telefon"
              label="Telefon mobil"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={edited("customer.phone", setPhone)}
              autoComplete="tel"
              placeholder="07xx xxx xxx"
              error={fieldErrors["customer.phone"]}
            />
            <TextField
              id="nr-auto"
              label="Număr de înmatriculare (opțional)"
              value={plate}
              onChange={edited("customer.plate", setPlate)}
              autoComplete="off"
              placeholder="AG 12 ABC"
              error={fieldErrors["customer.plate"]}
            />

            <label className="flex cursor-pointer gap-3">
              <input
                type="checkbox"
                className="mt-1 size-6 shrink-0 accent-accent"
                checked={privacyAccepted}
                onChange={(e) => edited("privacyAccepted", setPrivacyAccepted)(e.target.checked)}
                aria-invalid={Boolean(fieldErrors.privacyAccepted)}
                aria-describedby={fieldErrors.privacyAccepted ? "eroare-acord" : undefined}
              />
              <span>
                {PRIVACY_CONSENT_TEXT}{" "}
                <a href={`/${slug}/confidentialitate`} target="_blank" rel="noopener" className="font-semibold text-accent underline">
                  Citește politica
                </a>
                .
              </span>
            </label>
            {fieldErrors.privacyAccepted && (
              <p id="eroare-acord" className="font-semibold text-red-800">
                {fieldErrors.privacyAccepted}
              </p>
            )}

            {FEATURES.marketingSms && (
              <label className="flex cursor-pointer gap-3">
                <input
                  type="checkbox"
                  className="mt-1 size-6 shrink-0 accent-accent"
                  checked={marketingOptIn}
                  onChange={(e) => setMarketingOptIn(e.target.checked)}
                />
                <span>
                  {MARKETING_CONSENT_TEXT} <span className="text-zinc-600">(opțional)</span>
                </span>
              </label>
            )}

            {formMessage && (
              <p role="alert" className="rounded-md bg-red-100 p-3 font-semibold text-red-900">
                {formMessage}
              </p>
            )}

            <BottomBar>
              <button type="button" onClick={() => goTo(2)} className="min-h-12 rounded-md border-2 border-zinc-900 px-4 font-bold">
                Înapoi
              </button>
              <button
                type="submit"
                disabled={pending}
                className="min-h-12 flex-1 rounded-md bg-accent px-6 text-lg font-bold text-white disabled:opacity-60"
              >
                {pending ? "Se trimite…" : "Confirmă programarea"}
              </button>
            </BottomBar>
          </form>
        </section>
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const steps = ["Serviciul", "Ziua și ora", "Datele tale"];
  return (
    <ol className="mb-6 flex gap-2 text-sm font-semibold" aria-label="Pașii programării">
      {steps.map((name, index) => {
        const number = (index + 1) as Step;
        return (
          <li
            key={name}
            aria-current={number === step ? "step" : undefined}
            className={`flex-1 rounded-md px-2 py-2 text-center ${
              number === step ? "bg-zinc-900 text-white" : number < step ? "bg-zinc-300" : "bg-white text-zinc-600"
            }`}
          >
            {number}. {name}
          </li>
        );
      })}
    </ol>
  );
}

function Pill({
  name,
  checked,
  onChange,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    // `relative`: butonul radio ascuns (sr-only) e poziționat absolut; fără un părinte poziționat
    // s-ar raporta la toată pagina și ar putea-o lăți (vezi testul Playwright).
    <label className="relative inline-flex">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="peer sr-only" />
      <span className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md border-2 border-zinc-300 bg-white px-4 font-semibold peer-checked:border-accent peer-checked:bg-accent peer-checked:text-white peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-zinc-900">
        {children}
      </span>
    </label>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-lg font-semibold">{label}</span>
      <div className="flex items-center rounded-md border-2 border-zinc-300 bg-white">
        <button
          type="button"
          aria-label={`${label}: mai puțin`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
          className="size-11 text-2xl font-bold disabled:opacity-30"
        >
          −
        </button>
        <output aria-live="polite" className="w-8 text-center text-lg font-bold">
          {value}
        </output>
        <button
          type="button"
          aria-label={`${label}: mai mult`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          className="size-11 text-2xl font-bold disabled:opacity-30"
        >
          +
        </button>
      </div>
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  type = "text",
  ...rest
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  inputMode?: "tel" | "text";
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-lg font-semibold">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-eroare` : undefined}
        className="min-h-12 rounded-md border-2 border-zinc-400 bg-white px-3 text-lg aria-invalid:border-red-700"
        {...rest}
      />
      {error && (
        <p id={`${id}-eroare`} className="font-semibold text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

function Summary({ children, onEdit }: { children: ReactNode; onEdit: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg bg-white p-4">
      <p>{children}</p>
      <button type="button" onClick={onEdit} className="min-h-11 shrink-0 px-2 font-semibold text-accent underline">
        Modifică
      </button>
    </div>
  );
}

function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-300 bg-white/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">{children}</div>
    </div>
  );
}
