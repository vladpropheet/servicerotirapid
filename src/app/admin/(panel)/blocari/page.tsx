import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm } from "@/components/admin/action-form";
import { AdminFrame, AdminSkeleton } from "@/components/admin/admin-frame";
import { SubmitButton } from "@/components/admin/submit-button";
import { Card, inputClass, PageTitle } from "@/components/admin/ui";
import { CLOSURE_KINDS } from "@/domain/enums";
import { todayIn } from "@/domain/time";
import { formatLongDate, formatTime } from "@/lib/format";
import { CLOSURE_KIND_LABEL } from "@/lib/labels";
import { listUpcomingClosures } from "@/server/admin/closures";
import { requireAdmin } from "@/server/auth/session";
import { withTenant } from "@/server/tenant";
import {
  createDaysClosureAction,
  createIntervalClosureAction,
  deleteClosureAction,
  stopOnlineTodayAction,
} from "./actions";

export const metadata: Metadata = { title: "Zile libere și ore blocate", robots: { index: false, follow: false } };

export default function ClosuresPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Content />
    </Suspense>
  );
}

function KindSelect() {
  return (
    <label className="flex flex-col gap-1 font-semibold">
      Ce înseamnă
      <select name="kind" defaultValue="closed" className={inputClass}>
        {CLOSURE_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {CLOSURE_KIND_LABEL[kind]}
          </option>
        ))}
      </select>
    </label>
  );
}

async function Content() {
  const ctx = await requireAdmin();
  const today = todayIn(ctx.timeZone).toString();
  const list = await withTenant(ctx.tenantId, (t) => listUpcomingClosures(t, today, new Date()));
  const tz = ctx.timeZone;
  const dateText = (d: string) => formatLongDate(Date.parse(`${d}T12:00:00Z`), tz);

  return (
    <AdminFrame ctx={ctx} active="/admin/meniu">
      <PageTitle>Zile libere și ore blocate</PageTitle>

      <Card>
        <h2 className="mb-3 text-xl font-bold">Azi nu mai iau programări online după…</h2>
        <ActionForm action={stopOnlineTodayAction} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 font-semibold">
            Ora
            <input type="time" name="from" defaultValue="15:00" step={900} className={inputClass} />
          </label>
          <SubmitButton>Blochează</SubmitButton>
        </ActionForm>
      </Card>

      <Card>
        <h2 className="mb-3 text-xl font-bold">Zile libere sau concediu</h2>
        <ActionForm action={createDaysClosureAction}>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 font-semibold">
              De la
              <input type="date" name="dateFrom" defaultValue={today} required className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 font-semibold">
              Până la (inclusiv)
              <input type="date" name="dateTo" className={inputClass} />
            </label>
          </div>
          <KindSelect />
          <label className="flex flex-col gap-1 font-semibold">
            Notă (opțional)
            <input name="note" maxLength={200} className={inputClass} placeholder="ex. Concediu" />
          </label>
          <SubmitButton>Blochează zilele</SubmitButton>
        </ActionForm>
      </Card>

      <Card>
        <h2 className="mb-3 text-xl font-bold">Un interval dintr-o zi</h2>
        <ActionForm action={createIntervalClosureAction}>
          <label className="flex flex-col gap-1 font-semibold">
            Ziua
            <input type="date" name="date" defaultValue={today} required className={inputClass} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 font-semibold">
              De la ora
              <input type="time" name="from" step={900} required className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 font-semibold">
              Până la ora
              <input type="time" name="to" step={900} required className={inputClass} />
            </label>
          </div>
          <KindSelect />
          <label className="flex flex-col gap-1 font-semibold">
            Notă (opțional)
            <input name="note" maxLength={200} className={inputClass} />
          </label>
          <SubmitButton>Blochează intervalul</SubmitButton>
        </ActionForm>
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">Blocări active</h2>
        {list.length === 0 && <p className="rounded-lg bg-white p-4">Nicio blocare.</p>}
        {list.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-3">
            <div>
              <p className="font-bold">
                {c.dateFrom && c.dateTo
                  ? c.dateFrom === c.dateTo
                    ? dateText(c.dateFrom)
                    : `${dateText(c.dateFrom)} – ${dateText(c.dateTo)}`
                  : `${formatLongDate(c.startsAt!.getTime(), tz)}, ${formatTime(c.startsAt!.getTime(), tz)}–${formatTime(c.endsAt!.getTime(), tz)}`}
              </p>
              <p className="text-zinc-700">
                {CLOSURE_KIND_LABEL[c.kind]}
                {c.internalNote ? ` · ${c.internalNote}` : ""}
              </p>
            </div>
            <ActionForm action={deleteClosureAction} className="flex flex-col gap-1">
              <input type="hidden" name="id" value={c.id} />
              <SubmitButton variant="danger" pendingText="Se șterge…">
                Șterge
              </SubmitButton>
            </ActionForm>
          </div>
        ))}
      </section>
    </AdminFrame>
  );
}
