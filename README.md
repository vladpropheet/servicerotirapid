# Programări online pentru service-uri auto

Aplicație multi-tenant de programări online (Propheet AIgency). Primul service: **Service Roți Rapid**, la adresa `/roti-rapid`.

- Cerințele proiectului: [CLAUDE.md](CLAUDE.md)
- Planul aprobat (schemă, algoritmi, întrebări deschise): [docs/plan-faza-0.md](docs/plan-faza-0.md)

## Ce îți trebuie pe calculator

- Node.js 24 sau mai nou
- Docker Desktop (pornit)
- Git

## Pornire locală, prima dată

Toate comenzile se rulează în PowerShell, în folderul proiectului.

1. Copiază `.env.example` în `.env`. Pune o parolă lungă în locul valorilor false (aceeași parolă în toate cele trei locuri) și o cheie lungă, aleatorie, la `BOOKING_LINK_SECRET`.
2. Instalează dependențele:
   ```
   npm install
   ```
3. Pornește baza de date:
   ```
   docker compose up -d
   ```
4. Creează tabelele:
   ```
   npm run db:migrate
   ```
5. Încarcă service-ul `roti-rapid` din catalog:
   ```
   npm run db:seed
   ```
6. Pornește aplicația:
   ```
   npm run dev
   ```
   Apoi deschide http://localhost:3000/api/health în browser. Trebuie să vezi `{"status":"ok"}`.
   Pagina de programare a service-ului: http://localhost:3000/roti-rapid

## Comenzi utile

| Comandă | Ce face |
|---|---|
| `npm run dev` | Pornește aplicația pentru dezvoltare (http://localhost:3000). |
| `npm test` | Rulează testele unitare și de integrare (baza de date trebuie să fie pornită). |
| `npm run test:e2e` | Rulează testele cap-coadă în browser (Playwright). Prima dată: `npx playwright install chromium`. |
| `npm run db:studio` | Deschide în browser un vizualizator al bazei de date. |
| `npm run db:generate` | Generează o migrare nouă după o modificare în `src/server/db/schema`. |
| `npm run db:migrate` | Aplică migrările care nu au rulat încă. Nu șterge date. |
| `npm run db:seed` | Creează un service din catalog. Dacă există deja, nu modifică nimic. |
| `npm run lint` / `npm run typecheck` | Verifică codul. |
| `docker compose stop` | Oprește baza de date (datele rămân). |

## Structura

- `src/domain/` — logică pură (prețuri, intervale libere, bani), fără bază de date.
- `src/server/db/` — schema bazei de date și conexiunea.
- `src/server/tenant/` — `withTenant()`: orice acces la datele unui service trece pe aici.
- `src/server/repos/` — interogările, toate filtrate după service.
- `src/server/seed/` — transformarea catalogului în date de pornire.
- `drizzle/` — migrările SQL (versionate în Git).
- `tests/` — teste unitare și de integrare (pe baza separată `servicerotirapid_test`).
