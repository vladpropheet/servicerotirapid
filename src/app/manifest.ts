import type { MetadataRoute } from "next";

// Permite „Adaugă pe ecranul principal” pentru panoul de administrare (CLAUDE.md §6).
// Iconițele lipsesc deocamdată: o iconiță e o imagine, iar imaginile se fac doar cu acordul lui Vlad.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Panoul service-ului",
    short_name: "Programări",
    description: "Programările și setările service-ului.",
    start_url: "/admin",
    scope: "/admin",
    display: "standalone",
    background_color: "#F6F5F2",
    theme_color: "#18181B",
    lang: "ro",
    icons: [],
  };
}
