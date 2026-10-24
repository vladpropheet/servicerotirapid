import type { MetadataRoute } from "next";

// Panoul de administrare se poate instala pe ecranul telefonului, ca o aplicație (PWA, CLAUDE.md §6).
// Iconițele sunt pictograma primită de la Vlad (roata cu cheia), micșorată în public/icons/.
// Pagina publică de programare nu se instalează: clienții o folosesc ocazional, din browser.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/admin",
    name: "Programări service – panou",
    short_name: "Programări",
    description: "Programările și setările service-ului.",
    start_url: "/admin",
    scope: "/admin",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F6F5F2",
    theme_color: "#18181B",
    lang: "ro",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
