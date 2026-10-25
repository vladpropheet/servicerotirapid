"use client";

import { useState, useSyncExternalStore } from "react";

// Fără SMS, clientul își păstrează singur linkul programării: îl vede, îl copiază
// sau și-l trimite (WhatsApp, SMS, email) din meniul de partajare al telefonului.

const noSubscription = () => () => {};
const canShareOnThisDevice = () => typeof navigator.share === "function";

export function SaveLink({ url }: { url: string }) {
  const canShare = useSyncExternalStore(noSubscription, canShareOnThisDevice, () => false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Copierea poate fi blocată de browser: linkul rămâne vizibil și se poate selecta manual.
      setCopied(false);
    }
  }

  async function share() {
    try {
      await navigator.share({ title: "Programarea mea", text: "Linkul programării mele (vezi / anulează):", url });
    } catch {
      // Clientul a închis meniul de partajare: nimic de făcut.
    }
  }

  return (
    <section aria-labelledby="link-programare" className="flex flex-col gap-3 rounded-lg bg-amber-50 p-4">
      <h2 id="link-programare" className="text-lg font-bold">
        Păstrează linkul programării
      </h2>
      <p>Din el îți vezi sau îți anulezi programarea. Nu îl primești prin SMS, așa că salvează-l acum.</p>
      <input
        readOnly
        value={url}
        aria-label="Linkul programării"
        onFocus={(e) => e.currentTarget.select()}
        className="min-h-12 w-full rounded-md border-2 border-zinc-300 bg-white px-3 text-base"
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={copy}
          className="min-h-12 rounded-md border-2 border-zinc-900 bg-white px-4 font-bold text-zinc-900"
        >
          {copied ? "Copiat ✓" : "Copiază linkul"}
        </button>
        {canShare && (
          <button type="button" onClick={share} className="min-h-12 rounded-md bg-accent px-4 font-bold text-white">
            Trimite-l (WhatsApp, SMS, email)
          </button>
        )}
      </div>
      <p className="text-sm text-zinc-700">Poți să-l trimiți și ție pe WhatsApp sau să-l pui la favorite.</p>
    </section>
  );
}
