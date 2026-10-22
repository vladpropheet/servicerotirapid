// Calcule de durată fără fus orar. Fișier separat ca prețul (care rulează și în browser)
// să nu încarce biblioteca Temporal.

/** Rotunjește o durată în sus la pas: 58 min cu pas de 15 → 60 min. */
export function roundUpToStep(minutes: number, stepMin: number): number {
  if (minutes <= 0) return 0;
  return Math.ceil(minutes / stepMin) * stepMin;
}
