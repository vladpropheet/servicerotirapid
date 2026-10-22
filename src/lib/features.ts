// Funcții care depind de contractul clientului.
//
// Decizia lui Vlad (22.10.2026): clientul nu a ales abonamentul lunar, deci fără SMS-uri
// (confirmări, reamintiri, anunțuri) și fără acord de marketing prin SMS.
// Tabelele, textele SMS și istoricul acordurilor rămân în baza de date: pentru reactivare,
// se schimbă valorile de mai jos și se construiește Faza 5 (vezi CLAUDE.md §7).
export const FEATURES = {
  /** SMS-uri de confirmare, reamintire și anunț către patron; setările lor în panou. */
  smsNotifications: false,
  /** Bifa „Vreau SMS-uri cu oferte…” din formularul public. */
  marketingSms: false,
} as const;
