// Formatări pentru afișare, în română. Merg și în browser, și pe server.

/** „+40766777130” → „0766 777 130”. */
export function formatRoPhone(e164: string): string {
  if (!/^\+40\d{9}$/.test(e164)) return e164;
  const national = `0${e164.slice(3)}`;
  return `${national.slice(0, 4)} ${national.slice(4, 7)} ${national.slice(7)}`;
}

/** Link `tel:` pentru butonul „Sună acum”. */
export function telHref(e164: string): string {
  return `tel:${e164}`;
}

/** 105 → „1 h 45 min”, 45 → „45 min”, 60 → „1 h”. */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** „vineri, 23 octombrie” (ziua locală a service-ului). */
export function formatLongDate(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat("ro-RO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  }).format(epochMs);
}

/** „vin.” + „23 oct.” pentru butoanele de zi. */
export function formatDayChip(epochMs: number, timeZone: string): { weekday: string; day: string } {
  const weekday = new Intl.DateTimeFormat("ro-RO", { weekday: "short", timeZone }).format(epochMs);
  const day = new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "short", timeZone }).format(epochMs);
  return { weekday, day };
}

/** „14:30”. */
export function formatTime(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat("ro-RO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(
    epochMs,
  );
}
