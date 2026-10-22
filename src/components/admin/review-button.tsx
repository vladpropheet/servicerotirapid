import { markReviewedAction } from "@/app/admin/(panel)/servicii/actions";
import type { ReviewTarget } from "@/server/admin/review";
import { ActionForm } from "./action-form";
import { SubmitButton } from "./submit-button";
import { ReviewBadge } from "./ui";

/** Eticheta „De verificat”, nota și butonul „E corect”. */
export function ReviewPrompt({ target, note, label = "E corect" }: { target: ReviewTarget; note: string | null; label?: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-md bg-amber-50 p-3">
      <p>
        <ReviewBadge /> {note}
      </p>
      <ActionForm action={markReviewedAction} className="flex flex-col gap-2" successText="Confirmat.">
        <input type="hidden" name="target" value={JSON.stringify(target)} />
        <SubmitButton variant="small" pendingText="Se salvează…">
          {label}
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
