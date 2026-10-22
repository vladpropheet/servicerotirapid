// Pagina de start a platformei. Paginile service-urilor (ex. /roti-rapid) vin în Faza 3.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="font-display text-4xl font-bold uppercase tracking-tight">
        Programări online
      </h1>
      <p className="text-lg">
        Platformă de programări pentru service-uri auto, construită de Propheet AIgency.
      </p>
    </main>
  );
}
