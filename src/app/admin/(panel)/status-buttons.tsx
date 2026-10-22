"use client";

import { useActionState, useState } from "react";
import { buttonClass } from "@/components/admin/ui";
import type { BookingStatus } from "@/domain/enums";
import { STATUS_ACTION_LABEL } from "@/lib/labels";
import { changeStatusAction, type StatusActionState } from "./booking-actions";

/** Butoanele de status ale unei programări. Anularea cere o a doua apăsare. */
export function StatusButtons({ bookingId, transitions }: { bookingId: string; transitions: BookingStatus[] }) {
  const [state, action, pending] = useActionState<StatusActionState, FormData>(changeStatusAction, { error: null });
  const [confirmCancel, setConfirmCancel] = useState(false);
  if (transitions.length === 0) return null;

  return (
    <form action={action} className="mt-3 flex flex-wrap gap-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      {transitions
        .filter((next) => next !== "cancelled")
        .map((next) => (
          <button key={next} type="submit" name="next" value={next} disabled={pending} className={buttonClass.small}>
            {STATUS_ACTION_LABEL[next]}
          </button>
        ))}
      {transitions.includes("cancelled") &&
        (confirmCancel ? (
          <>
            <button type="submit" name="next" value="cancelled" disabled={pending} className={buttonClass.danger}>
              Da, anulează
            </button>
            <button type="button" onClick={() => setConfirmCancel(false)} className={buttonClass.small}>
              Nu
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmCancel(true)} className={buttonClass.small}>
            Anulează
          </button>
        ))}
      {state.error && (
        <p role="alert" className="w-full font-semibold text-red-800">
          {state.error}
        </p>
      )}
    </form>
  );
}
