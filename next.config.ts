import type { NextConfig } from "next";

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
    ];
  },
};

export default nextConfig;
