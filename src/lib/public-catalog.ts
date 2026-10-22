// Ce vede clientul pe pagina publică despre catalog (fără nimic intern: fără note „de verificat”).
// Tip comun pentru server (care îl construiește) și pentru browser (care îl afișează).

export type PublicService = {
  id: string;
  name: string;
  description: string | null;
  includes: string | null;
  customerExplainer: string | null;
  unit: "wheel" | "piece" | "service";
  bookableOnline: boolean;
};

export type PublicCatalog = {
  vehicleTypes: { id: string; label: string }[];
  rimSizes: { id: string; label: string }[];
  rimTypes: { id: string; label: string }[];
  categories: { id: string; name: string; services: PublicService[] }[];
  surcharges: { id: string; name: string; description: string | null }[];
};
