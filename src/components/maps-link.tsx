// Adresa service-ului, cu pin de hartă: o apăsare deschide alegerea aplicației de navigare
// (Google Maps, Waze, Apple Maps). Fără JavaScript: <details> se deschide și se închide singur.

function mapLinks(address: string) {
  const query = encodeURIComponent(address);
  return [
    { label: "Google Maps", href: `https://www.google.com/maps/search/?api=1&query=${query}` },
    { label: "Waze", href: `https://waze.com/ul?q=${query}&navigate=yes` },
    { label: "Apple Maps", href: `https://maps.apple.com/?q=${query}` },
  ];
}

export function MapsLink({ address }: { address: string }) {
  return (
    <details className="group">
      <summary className="block min-h-11 cursor-pointer list-none py-2 text-center font-semibold text-zinc-800 [&::-webkit-details-marker]:hidden">
        {/* Pinul stă în același rând cu textul, lipit de primul cuvânt al adresei. */}
        <svg aria-hidden="true" viewBox="0 0 24 24" className="mr-1 inline-block size-5 fill-accent align-[-0.2em]">
          <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
        </svg>
        <span className="underline decoration-zinc-400 underline-offset-4">{address}</span>
        <span className="sr-only">(deschide harta)</span>
      </summary>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {mapLinks(address).map((link) => (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-md border-2 border-zinc-900 bg-white px-4 font-semibold text-zinc-900"
          >
            {link.label}
          </a>
        ))}
      </div>
    </details>
  );
}
