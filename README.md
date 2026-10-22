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

1. Copiază `.env.example` în `.env` și înlocuiește toate valorile false:
   - aceeași parolă lungă la `POSTGRES_PASSWORD`, în `MIGRATION_DATABASE_URL` și în `TEST_DATABASE_URL`;
   - o altă parolă lungă la `APP_DB_PASSWORD` și aceeași în `DATABASE_URL`;
   - câte o cheie lungă, aleatorie, la `AUTH_SECRET` și `BOOKING_LINK_SECRET`.
2. Instalează dependențele:
   ```
   npm install
   ```
3. Pornește baza de date:
   ```
   docker compose up -d
   ```
4. Creează tabelele și contul aplicației (`app_user`, fără drepturi de administrator):
   ```
   npm run db:migrate
   ```
5. Încarcă service-ul `roti-rapid` din catalog:
   ```
   npm run db:seed
   ```
6. Creează contul patronului (afișează o parolă temporară, o singură dată):
   ```
   npm run admin:create -- --rol patron --service roti-rapid --telefon "0766 777 130" --nume "Patron"
   ```
7. Pornește aplicația:
   ```
   npm run dev
   ```
   - Pagina de programare: http://localhost:3000/roti-rapid
   - Panoul patronului: http://localhost:3000/admin (la prima logare se cere o parolă nouă)
   - Verificare: http://localhost:3000/api/health trebuie să arate `{"status":"ok"}`

## Comenzi utile

| Comandă | Ce face |
|---|---|
| `npm run dev` | Pornește aplicația pentru dezvoltare (http://localhost:3000). |
| `npm test` | Rulează testele unitare și de integrare (baza de date trebuie să fie pornită). |
| `npm run test:e2e` | Rulează testele cap-coadă în browser (Playwright). Prima dată: `npx playwright install chromium`. |
| `npm run admin:create -- …` | Creează un cont de patron (`--rol patron --service slug`) sau de super-admin (`--rol superadmin`). |
| `npm run db:studio` | Deschide în browser un vizualizator al bazei de date. |
| `npm run db:generate` | Generează o migrare nouă după o modificare în `src/server/db/schema`. |
| `npm run db:migrate` | Aplică migrările care nu au rulat încă și actualizează contul aplicației. Nu șterge date. |
| `npm run db:seed` | Creează un service din catalog. Dacă există deja, nu modifică nimic. |
| `npm run lint` / `npm run typecheck` | Verifică codul. |
| `docker compose stop` | Oprește baza de date (datele rămân). |

## Securitate, pe scurt

- Aplicația se conectează cu contul `app_user`, care **nu poate ocoli Row-Level Security**: fiecare service vede doar datele lui, chiar dacă o interogare din cod ar uita filtrul. Migrările rulează cu contul proprietar (`MIGRATION_DATABASE_URL`). În producție, serverul refuză să pornească dacă `DATABASE_URL` are drepturi de administrator.
- Parolele: argon2id. După 5 încercări greșite contul se blochează 15 minute. Parola uitată: super-adminul dă o parolă temporară nouă (fără SMS).
- Super-adminul are obligatoriu verificare în doi pași (aplicație de autentificare pe telefon).

## Structura

- `src/domain/` — logică pură (prețuri, intervale libere, bani), fără bază de date.
- `src/server/db/` — schema bazei de date, conexiunea, contul aplicației.
- `src/server/tenant/` — `withTenant()`: orice acces la datele unui service trece pe aici.
- `src/server/auth/` — logare, parole, sesiuni (Better Auth).
- `src/server/admin/` — funcțiile panoului de administrare (toate primesc tranzacția unui service).
- `src/server/booking/` — rezervarea atomică și linkul „vezi / anulează”.
- `src/app/[slug]/` — pagina publică de programare; `src/app/admin/` — panoul patronului; `src/app/superadmin/` — Propheet AIgency.
- `drizzle/` — migrările SQL (versionate în Git).
- `storage/` — pozele încărcate (nu intră în Git; în producție: volum inclus în backup).
- `tests/` — teste unitare, de integrare (pe baza separată `servicerotirapid_test`) și cap-coadă (Playwright).
