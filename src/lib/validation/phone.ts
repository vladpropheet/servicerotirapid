// Numere de telefon românești, stocate în format internațional (E.164): +40766777130.

/**
 * Acceptă „0766 777 130”, „+40 766 777 130”, „0040766777130”, „(0766) 777-130”.
 * Întoarce „+40766777130” sau null dacă nu e un număr românesc valid (mobil 07…, fix 02…/03…).
 */
export function normalizeRoPhone(input: string): string | null {
  const compact = input.replace(/[\s().-]/g, "");
  let national: string;
  if (/^\+40\d{9}$/.test(compact)) {
    national = compact.slice(3);
  } else if (/^0040\d{9}$/.test(compact)) {
    national = compact.slice(4);
  } else if (/^0\d{9}$/.test(compact)) {
    national = compact.slice(1);
  } else {
    return null;
  }
  if (!/^[237]\d{8}$/.test(national)) {
    return null;
  }
  return `+40${national}`;
}

/** Doar numerele de mobil primesc SMS. */
export function isRoMobile(e164: string): boolean {
  return /^\+407\d{8}$/.test(e164);
}
