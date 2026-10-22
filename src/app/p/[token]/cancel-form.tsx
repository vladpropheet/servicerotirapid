"use client";

import { useActionState, useState } from "react";
import { cancelFromLinkAction, type CancelActionState } from "./actions";

/** Anularea cere două apăsări: „Anulează” și apoi „Da, anulează”. */
export function CancelForm({ token, deadlineText }: { token: string; deadlineText: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<CancelActionState, FormData>(cancelFromLinkAction, {
    error: null,
  });

  return (
    <div className="flex flex-col gap-3 rounded-lg border-2 border-zinc-200 bg-white p-4">
      <p>Nu mai poți ajunge? Poți anula online până {deadlineText}.</p>
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="min-h-12 rounded-md border-2 border-red-800 px-4 font-bold text-red-800"
        >
          Anulează programarea
        </button>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="token" value={token} />
          <p className="font-semibold">Sigur vrei să anulezi programarea?</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="min-h-12 flex-1 rounded-md border-2 border-zinc-900 px-4 font-bold"
            >
              Nu, o păstrez
            </button>
            <button
              type="submit"
              disabled={pending}
              className="min-h-12 flex-1 rounded-md bg-red-800 px-4 font-bold text-white disabled:opacity-60"
            >
              {pending ? "Se anulează…" : "Da, anulează"}
            </button>
          </div>
        </form>
      )}
      {state.error && (
        <p role="alert" className="font-semibold text-red-800">
          {state.error}
        </p>
      )}
    </div>
  );
}
