import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm } from "@/components/admin/action-form";
import { AdminFrame, AdminSkeleton } from "@/components/admin/admin-frame";
import { ReviewPrompt } from "@/components/admin/review-button";
import { SubmitButton } from "@/components/admin/submit-button";
import { Card, Checkbox, Field, inputClass, PageTitle } from "@/components/admin/ui";
import type { SmsTemplateKind } from "@/domain/enums";
import { getSettings, getSmsTemplates, SMS_VARIABLES } from "@/server/admin/schedule";
import { requireAdmin } from "@/server/auth/session";
import { withTenant } from "@/server/tenant";
import { updateSettingsAction, updateSmsTemplateAction } from "./actions";

export const metadata: Metadata = { title: "Setări programări", robots: { index: false, follow: false } };

const SMS_LABEL: Record<SmsTemplateKind, string> = {
  customer_confirmed: "Către client: programare confirmată",
  customer_pending: "Către client: cerere primită (confirmare manuală)",
  customer_reminder: "Către client: reamintire",
  customer_cancelled: "Către client: programare anulată",
  owner_new_booking: "Către tine: programare nouă",
  owner_cancelled: "Către tine: programare anulată",
};

export default function SettingsPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const ctx = await requireAdmin();
  const { settings, templates } = await withTenant(ctx.tenantId, async (t) => ({
    settings: await getSettings(t),
    templates: await getSmsTemplates(t),
  }));
  const smsReview = templates.find((t) => t.needsReview);

  return (
    <AdminFrame ctx={ctx} active="/admin/meniu">
      <PageTitle>Setări programări</PageTitle>
      <Card>
        <ActionForm action={updateSettingsAction}>
          <Field
            label="Câte mașini programate online pot fi în același timp"
            name="onlineCapacity"
            type="number"
            inputMode="numeric"
            min={0}
            max={50}
            defaultValue={settings.onlineCapacity}
            hint="0 = oprești programările online. Restul posturilor rămân pentru clienții fără programare."
          />
          <label className="flex flex-col gap-1 font-semibold">
            Orele se afișează din
            <select name="slotStepMin" defaultValue={settings.slotStepMin} className={inputClass}>
              {[5, 10, 15, 20, 30, 60].map((step) => (
                <option key={step} value={step}>
                  {step === 60 ? "oră în oră" : `${step} în ${step} minute`}
                </option>
              ))}
            </select>
          </label>
          <Field label="Cu cel puțin câte ore înainte se poate programa" name="minLeadHours" type="number" inputMode="decimal" min={0} max={336} step={0.5} defaultValue={settings.minLeadMin / 60} />
          <Field label="Cu cel mult câte zile înainte" name="maxDaysAhead" type="number" inputMode="numeric" min={0} max={365} defaultValue={settings.maxDaysAhead} />
          <label className="flex flex-col gap-1 font-semibold">
            Confirmarea programărilor online
            <select name="confirmationMode" defaultValue={settings.confirmationMode} className={inputClass}>
              <option value="auto">Automată (clientul primește confirmarea pe loc)</option>
              <option value="manual">Manuală (le confirm eu din „Azi”)</option>
            </select>
          </label>
          <Checkbox
            label="Programările adăugate de mine (telefonice) ocupă și ele locul online"
            name="manualBookingsUseCapacity"
            defaultChecked={settings.manualBookingsUseCapacity}
          />
          <Checkbox label="Trimite SMS de reamintire" name="reminderEnabled" defaultChecked={settings.reminderHoursBefore !== null} />
          <Field label="Reamintirea pleacă cu câte ore înainte" name="reminderHoursBefore" type="number" inputMode="numeric" min={1} max={168} defaultValue={settings.reminderHoursBefore ?? 24} />
          <Field label="Clientul poate anula din link cu cel puțin câte ore înainte" name="customerCancelCutoffHours" type="number" inputMode="decimal" min={0} max={168} step={0.5} defaultValue={settings.customerCancelCutoffMin / 60} />
          <Field label="Câte programări active poate avea același telefon" name="maxActiveBookingsPerPhone" type="number" inputMode="numeric" min={1} max={20} defaultValue={settings.maxActiveBookingsPerPhone} />
          <SubmitButton>Salvează setările</SubmitButton>
        </ActionForm>
      </Card>

      <h2 className="font-display text-2xl font-bold uppercase">Textele SMS</h2>
      <p>
        Variabile: {SMS_VARIABLES.join(" ")}. Fără diacritice, un SMS are 160 de caractere; cu diacritice doar 70 (costă
        mai mult). SMS-urile vor fi trimise după ce alegem furnizorul.
      </p>
      {smsReview && <ReviewPrompt target={{ type: "sms", kind: "*" }} note={smsReview.reviewNote} label="Textele sunt bune" />}
      {templates.map((template) => (
        <Card key={template.kind}>
          <ActionForm action={updateSmsTemplateAction}>
            <input type="hidden" name="kind" value={template.kind} />
            <label className="flex flex-col gap-1 font-semibold">
              {SMS_LABEL[template.kind]}
              <textarea name="body" defaultValue={template.body} rows={3} maxLength={480} className="rounded-md border-2 border-zinc-400 p-3 text-lg" />
            </label>
            <Checkbox label="Activ" name="active" defaultChecked={template.active} />
            <SubmitButton variant="secondary">Salvează textul</SubmitButton>
          </ActionForm>
        </Card>
      ))}
    </AdminFrame>
  );
}
