import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="font-display text-4xl font-bold uppercase">Pagina nu există</h1>
      <p className="text-lg">Verifică adresa sau întoarce-te la pagina de start.</p>
      <Link href="/" className="font-semibold text-accent underline">
        Pagina de start
      </Link>
    </main>
  );
}
