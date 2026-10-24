import type { Metadata, Viewport } from "next";

// Panoul ca aplicație pe telefon (PWA): iconița pentru iPhone („Adaugă pe ecranul principal”)
// și pentru fila browserului. Manifestul (src/app/manifest.ts) acoperă Android.
export const metadata: Metadata = {
  icons: {
    icon: [{ url: "/icons/favicon-48.png", sizes: "48x48", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "Programări", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#18181B" };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return children;
}
