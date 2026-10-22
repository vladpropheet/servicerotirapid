// Denumiri în română pentru valorile interne, afișate în panoul de administrare.
import type { BookingStatus, ClosureKind, ServiceUnit } from "@/domain/enums";

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  pending: "În așteptare",
  confirmed: "Confirmată",
  cancelled: "Anulată",
  completed: "Finalizată",
  no_show: "Nu a venit",
};

export const BOOKING_STATUS_STYLE: Record<BookingStatus, string> = {
  pending: "bg-label text-zinc-900",
  confirmed: "bg-green-700 text-white",
  cancelled: "bg-zinc-300 text-zinc-800",
  completed: "bg-zinc-800 text-white",
  no_show: "bg-red-800 text-white",
};

/** Textul butonului care duce programarea în statusul dat. */
export const STATUS_ACTION_LABEL: Record<BookingStatus, string> = {
  pending: "În așteptare",
  confirmed: "Confirmă",
  cancelled: "Anulează",
  completed: "Finalizată",
  no_show: "Nu a venit",
};

export const CLOSURE_KIND_LABEL: Record<ClosureKind, string> = {
  closed: "Service închis",
  online_block: "Fără programări online",
};

export const UNIT_LABEL: Record<ServiceUnit, string> = {
  wheel: "pe roată",
  piece: "pe bucată",
  service: "pe serviciu",
};
