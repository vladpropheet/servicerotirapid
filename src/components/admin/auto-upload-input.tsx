"use client";

/**
 * Câmp de fișier care trimite formularul imediat ce patronul alege imaginea
 * (altfel e ușor să apeși alt buton de pe pagină și poza să nu se încarce).
 * Butonul de încărcare rămâne pentru browserele fără JavaScript.
 */
export function AutoUploadInput({ name }: { name: string }) {
  return (
    <input
      type="file"
      name={name}
      accept="image/jpeg,image/png,image/webp"
      required
      className="min-h-12 text-lg"
      onChange={(event) => {
        if (event.currentTarget.files?.length) event.currentTarget.form?.requestSubmit();
      }}
    />
  );
}
