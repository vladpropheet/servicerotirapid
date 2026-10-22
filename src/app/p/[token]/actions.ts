"use server";

import { redirect } from "next/navigation";
import { cancelBookingByToken } from "@/server/booking/manage";
import { clientIp } from "@/server/security/client-ip";
import { hitRateLimit, RATE_RULES } from "@/server/security/rate-limit";

export type CancelActionState = { error: string | null };

const MESSAGES = {
  invalid_link: "Linkul nu mai este valabil.",
  too_late: "Programarea nu mai poate fi anulată online. Te rugăm să suni la service.",
  not_cancellable: "Programarea nu mai poate fi anulată.",
} as const;

/** Anularea din link. Tokenul vine din formular și se verifică pe server (hash + expirare). */
export async function cancelFromLinkAction(
  _previous: CancelActionState,
  formData: FormData,
): Promise<CancelActionState> {
  const token = String(formData.get("token") ?? "");
  if (!(await hitRateLimit("cancel-ip", await clientIp(), RATE_RULES.cancelsPerIp)).allowed) {
    return { error: "Prea multe încercări. Încearcă din nou mai târziu sau sună la service." };
  }
  let result;
  try {
    result = await cancelBookingByToken(token, Date.now());
  } catch (error) {
    console.error("Anularea a eșuat:", error instanceof Error ? error.name : "unknown");
    return { error: "A apărut o problemă. Încearcă din nou sau sună la service." };
  }
  if (!result.ok) return { error: MESSAGES[result.error] };
  redirect(`/p/${token}?anulat=1`);
}
