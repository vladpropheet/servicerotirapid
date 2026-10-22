import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const isProd = process.env.NODE_ENV === "production";

/**
 * Content-Security-Policy: ce are voie pagina să încarce și să ruleze.
 *
 * Fără „nonce”: în Next 16, CSP-ul cu nonce cere randare complet dinamică și dezactivează
 * randarea parțial statică (care face pagina de programare rapidă pe telefoane vechi).
 * Next pune scripturi inline (datele paginii), deci `script-src` are nevoie de 'unsafe-inline'.
 * Riscul rămas e mic: aplicația nu afișează niciodată HTML venit de la utilizatori
 * (React escapează tot textul, iar dangerouslySetInnerHTML nu e folosit).
 * Tot restul e închis: doar resursele noastre și Cloudflare Turnstile.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // HSTS: doar în producție (pe HTTPS). Browserul nu va mai accepta HTTP pentru domeniu 2 ani.
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Nu anunțăm în header-e ce tehnologie folosim.
  poweredByHeader: false,
  experimental: {
    // Poza fațadei se încarcă printr-o acțiune de server: maxim 5 MB (+ restul formularului).
    serverActions: { bodySizeLimit: "6mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Linkurile „vezi / anulează programarea” sunt personale: nu se indexează,
        // nu se păstrează în cache și nu se trimit altor site-uri ca „Referer”.
        source: "/p/:token*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        // Panoul de administrare nu se indexează.
        source: "/(admin|superadmin)/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
