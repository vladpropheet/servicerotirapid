"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

// Widgetul Cloudflare Turnstile („nu sunt robot”). De obicei trece singur, fără ca omul să facă ceva.
// https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function TurnstileWidget({
  siteKey,
  onToken,
  resetCount,
}: {
  siteKey: string;
  /** Trebuie să fie o funcție stabilă (de ex. un setState). */
  onToken: (token: string | null) => void;
  /** Când crește, widgetul cere un token nou (un token merge o singură dată). */
  resetCount: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [ready, setReady] = useState(() => typeof window !== "undefined" && Boolean(window.turnstile));

  useEffect(() => {
    if (!ready || !container.current || !window.turnstile || widgetId.current) return;
    widgetId.current = window.turnstile.render(container.current, {
      sitekey: siteKey,
      language: "ro",
      appearance: "interaction-only",
      callback: (token: string) => onToken(token),
      "expired-callback": () => onToken(null),
      "error-callback": () => onToken(null),
    });
    return () => {
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [ready, siteKey, onToken]);

  useEffect(() => {
    if (resetCount > 0 && widgetId.current && window.turnstile) {
      onToken(null);
      window.turnstile.reset(widgetId.current);
    }
  }, [resetCount, onToken]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
      />
      <div ref={container} />
    </>
  );
}
