# Faza 0 — Planul aplicației de programări online (Propheet AIgency)

## Context

Construim de la zero o aplicație web multi-tenant de programări pentru service-uri auto. Primul client: **Service Roți Rapid** (SC DANI ROCA SRL, Pitești), slug `roti-rapid`. Folderul conține doar `CLAUDE.md` și `catalog-servicii.json`. Faza 0 = planul: structura de foldere, schema bazei de date, algoritmii (preț, intervale libere, rezervare atomică) și întrebările deschise. **Nu se scrie cod până la aprobare.**

Catalogul este în rădăcina proiectului, nu în `data/seed/` cum scrie în CLAUDE.md. În Faza 1 îl mut în `data/seed/catalog-servicii.json` (mutare, nu ștergere).

Planul a fost verificat cu un al doilea design, făcut independent. De acolo am preluat: chei străine compuse pe tenant, blocarea pe tenant (nu pe zi), linkul de anulare re-generabil, „outbox” pentru SMS și întrebarea despre diacriticele din SMS.

## Decizii confirmate de Vlad (22.10.2026)

1. Programările adăugate manual **nu** ocupă capacitatea online (`manual_bookings_use_capacity = false`). La adăugare manuală patronul vede un avertisment dacă se suprapune. Setarea se poate schimba din admin.
2. Geometria și vulcanizarea folosesc **aceeași capacitate** (1 total). Schema are loc pentru capacitate pe categorie mai târziu.
3. **Row-Level Security** în PostgreSQL ca a doua barieră, din Faza 4. Din Faza 1 codul e deja pregătit pentru ea (vezi „Izolarea”).

## Mediul local (verificat)

- Node.js **24.19.0**, npm 11.17.0, Git 2.55 — instalate.
- **Docker lipsește.** Înainte de Faza 1 instalezi Docker Desktop (gratuit pentru firme sub 250 de angajați și sub 10 mil. $ venit). Îți dau pașii la începutul Fazei 1.

## Stack — versiuni verificate pe 22.10.2026

| Componentă | Versiune | Notă |
|---|---|---|
| Node.js | 24 LTS (instalat) | Node 26 devine LTS pe 28.10.2026. Trecerea e o linie în Dockerfile, o putem face în Faza 7. |
| Next.js | 16.x (ultima stabilă, 16.3.x) | App Router. În Next 16 `middleware.ts` se numește `proxy.ts`. |
| PostgreSQL | 16 (`postgres:16-alpine`) | |
| Drizzle ORM | 0.45.x (linia stabilă) | 1.0 e încă beta, deci nu-l folosim. |
| Better Auth | 1.7.x | plugin-uri `username`, `twoFactor`, `admin` |
| Tailwind CSS | 4.3.x | |
| Fus orar | `temporal-polyfill` (API-ul standard Temporal) | Merge pe Node 24 și pe Safari/iPhone. Când trecem pe Node 26 îl putem scoate. |
| Teste | Vitest + Playwright | |

Versiunile exacte le fixez în Faza 1 cu `npm view <pachet> version` și le scriu în `package.json` fără `^`.

## Structura de foldere

```
servicerotirapid/
├─ CLAUDE.md, README.md, .env.example, .gitignore
├─ docker-compose.yml          # dev: app + Postgres (port legat doar de 127.0.0.1)
├─ Dockerfile                  # producție, multi-stage, utilizator non-root (Faza 7)
├─ drizzle.config.ts
├─ drizzle/                    # migrări SQL, versionate în Git
├─ data/seed/catalog-servicii.json
├─ scripts/
│  ├─ seed.ts                  # creează/actualizează tenantul din catalog (idempotent)
│  └─ cron.ts                  # trimiterea SMS-urilor programate (Faza 5)
├─ src/
│  ├─ app/
│  │  ├─ [slug]/               # pagina publică a service-ului + fluxul în 3 pași
│  │  │  └─ confidentialitate/ # politica GDPR generată din datele firmei
│  │  ├─ p/[token]/            # link scurt din SMS: vezi / anulează programarea
│  │  ├─ admin/                # panoul patronului (PWA)
│  │  ├─ superadmin/           # Propheet: tenanți noi, suport, resetare parolă
│  │  └─ api/ (health, auth/[...all], cron)
│  ├─ domain/                  # FUNCȚII PURE, fără bază de date (ușor de testat)
│  │  ├─ time/                 # ora României ↔ UTC (Temporal)
│  │  ├─ money/                # bani întregi, formatare „120 lei”
│  │  ├─ pricing/              # prețul estimativ
│  │  └─ availability/         # intervalele libere
│  ├─ server/                  # cod doar pe server (`server-only`)
│  │  ├─ db/                   # conexiunea + schema Drizzle (singurul loc care o importă)
│  │  ├─ tenant/               # TenantId, withTenant(), rezolvarea tenantului
│  │  ├─ repos/                # interogări, toate cu tenantId obligatoriu
│  │  ├─ booking/              # rezervarea atomică
│  │  ├─ auth/                 # Better Auth
│  │  ├─ sms/                  # interfața SmsProvider + ConsoleSmsProvider
│  │  └─ audit/
│  ├─ lib/validation/          # scheme Zod, telefon RO, nr. înmatriculare
│  └─ components/
└─ tests/
   ├─ unit/                    # Vitest: preț, disponibilitate, ora de vară/iarnă
   ├─ integration/             # Vitest + Postgres real: izolare tenanți, concurență
   └─ e2e/                     # Playwright: programare cap-coadă
```

URL-uri: public `APP_BASE_URL/roti-rapid`; admin `APP_BASE_URL/admin` (tenantul vine din sesiune); link din SMS `APP_BASE_URL/p/<token>`.

## Schema bazei de date

**Convenții**
- Chei `uuid`. Fiecare tabel de service are `tenant_id`, `UNIQUE (tenant_id, id)`, `created_at`, `updated_at`.
- **Chei străine compuse** `(tenant_id, x_id)`: baza de date refuză fizic o legătură între tenantul A și B.
- Momente în `timestamptz` (UTC). Program local în `time`. Zile locale în `date`.
- Bani în **bani întregi** (`integer`, 1 leu = 100 bani, deci 2,5 lei = 250). Fără zecimale cu virgulă mobilă.
- Statusuri ca `text` + `CHECK` (mai ușor de extins decât enum-urile PostgreSQL).
- Marcajul „de verificat” = coloanele `needs_review` + `review_note`. Adminul arată „De verificat (N)”. Marcajul dispare când patronul modifică valoarea sau apasă „E corect”.

### Platformă și utilizatori (fără RLS: sunt globale)

- **tenants**: `slug` (unic, `^[a-z0-9-]+$`), `display_name`, `legal_name`, `cui`, `reg_com`, `registered_address` (null → de completat), `work_address`, `public_phone`, `email`, `timezone` (`Europe/Bucharest`), `brand` (jsonb, culori validate), `facade_media_id`, `status` (`active` / `suspended`), `sms_monthly_limit`, `retention_months` (24), `review_fields` (ce câmpuri sunt „de verificat”).
- **Tabelele Better Auth**, cu prefixul `auth_` (`user` e cuvânt rezervat în PostgreSQL): `auth_user` (+ `username` = telefonul normalizat, `role` = `superadmin` sau `user`, `two_factor_enabled`, `must_change_password`), `auth_session`, `auth_account` (hash-ul parolei), `auth_verification`, `auth_two_factor`.
- **tenant_memberships**: `(tenant_id, user_id)` PK, `role` (`owner` / `staff`). Super-adminul nu are membership.
- **support_sessions**: super-adminul intră în tenantul unui client doar cu motiv scris și termen de expirare. Se jurnalizează (cerință GDPR: persoana împuternicită nu vede date fără motiv).
- **platform_audit_log**: tenanți creați/suspendați, accese de suport, resetări de parolă.
- **auth_login_guard**: blocare temporară după încercări greșite, per telefon (hash).
- **rate_limit_buckets**: anti-spam pe formular, per IP și per telefon (hash-uite).
- **booking_access_tokens**: `lookup_hash` (PK), `booking_id`, `expires_at`, `revoked_at`. Global, ca să găsească programarea după link.

### Catalog (editabil per tenant)

- **vehicle_types**, **rim_sizes** (`code` `12-16`, `label`, `inch_min`, `inch_max`), **rim_types**: `code`, `label`, `sort_order`, `active`. Se dezactivează, nu se șterg.
- **service_categories**: `code`, `name`, `sort_order`, `active`.
- **services**: `category_id`, `code` (id-ul din catalog, pentru re-seed), `name`, `description`, `includes`, `customer_explainer` (textul care explică diferența dintre servicii), `unit` (`wheel` / `piece` / `service`), `pricing_mode` (`fixed` / `range` / `matrix` / `on_request`), `by_vehicle`, `by_rim_size`, `by_rim_type`, `base_duration_min`, `per_unit_duration_min`, `duration_needs_review`, `bookable_online` (nu → „Sună acum”), `default_quantity`, `max_quantity`, `active`, `archived_at` (ștergere doar logică), `sort_order`, `capacity_group` (null acum).
- **service_prices**: `service_id`, `vehicle_type_id`, `rim_size_id`, `rim_type_id` (null = dimensiune nefolosită), `status` (`priced` / `on_request` / `not_offered`), `min_bani`, `max_bani`, `price_is_minimum` („de la X lei”), `source_note`. `UNIQUE NULLS NOT DISTINCT (tenant_id, service_id, vehicle_type_id, rim_size_id, rim_type_id)`. Un singur tabel pentru toate modurile:
  - preț fix → un rând fără dimensiuni, `min = max`;
  - interval → un rând fără dimensiuni, `min < max`;
  - matrice → un rând pe combinație. **Lipsă** = combinația nu există (ex. jantă tablă 17"+). **`on_request`** = „preț stabilit în service”. **`not_offered`** = „nu facem”.
- **surcharges**: `code`, `name`, `unit` (`per_wheel` / `per_booking`), `min_bani`, `max_bani`, `price_is_minimum`, `stacking` (`once_per_wheel` / `per_item`), `customer_selectable`, `active`. **surcharge_services**: la ce servicii se aplică.
- **service_conflicts** (opțional): combinații care nu au sens, ex. „pachet complet” + „echilibrat” (pachetul include deja echilibrarea).

### Program și setări

- **business_hours**: `weekday` (1 = luni … 7 = duminică), `opens_at`, `closes_at`, `CHECK (opens_at < closes_at)`. Mai multe rânduri pe zi = pauză de prânz. Zi fără rânduri = închis.
- **closures**: `kind` (`closed` = service închis / `online_block` = deschis, dar fără programări online), fie zile întregi (`date_from`, `date_to`), fie interval (`starts_at`, `ends_at`). Acoperă zile libere, concedii și „azi nu mai iau după 15:00”.
- **booking_settings** (un rând per tenant): `online_capacity` (1; 0 = pauză), `slot_step_min` (15), `min_lead_min` (120), `max_days_ahead` (30), `confirmation_mode` (`auto` / `manual`), `manual_bookings_use_capacity` (false), `reminder_hours_before` (24; null = oprit), `customer_cancel_cutoff_min`, `max_active_bookings_per_phone` (2), `sms_quiet_from` / `sms_quiet_to` (21:00–08:00), `owner_notify_channels`.
- **sms_templates**: `kind` (`customer_confirmed`, `customer_pending`, `customer_reminder`, `customer_cancelled`, `owner_new_booking`, `owner_cancelled`), `body` cu `{nume}`, `{data}`, `{ora}`, `{servicii}`, `{link}`, `{telefon}`.
- **media**: poza fațadei (cale, tip, dimensiuni).

### Clienți și programări

- **customers**: `full_name`, `phone_e164` (unic per tenant), `marketing_sms_opt_in`, `last_booking_at`, `anonymized_at`. Ștergerea GDPR = anonimizare pe loc (numele și telefonul devin null). Statisticile rămân corecte.
- **customer_consents** (doar adăugare): `purpose` (`privacy_notice` / `marketing_sms`), `granted`, `text_version`, `text_snapshot`, `source`, `booking_id`. Istoric complet: ce text a acceptat clientul și când și-a retras acordul.
- **bookings**: `public_ref` (cod scurt de 6 caractere pentru telefon, nu e secret), `customer_id`, `status` (`pending`, `confirmed`, `cancelled`, `completed`, `no_show`), `source` (`online` / `manual`), `starts_at`, `ends_at`, `uses_online_capacity` (fixat la creare), `over_capacity` (forțat de patron), vehicul / jantă (id + etichetă copiată; `rim_size_id` null = „nu știu”), `wheel_count`, `plate` (pe programare: un client poate avea mai multe mașini), `customer_note`, `estimate_min_bani`, `estimate_max_bani`, `estimate_has_unpriced`, `work_duration_min`, `final_price_bani` (opțional), `confirmed_at`, `cancelled_at`, `cancelled_by`, `idempotency_key` (dublu-click = o singură programare), `token_version`.
- **booking_items**: `kind` (`service` / `surcharge`), `service_id` sau `surcharge_id` + **copii la momentul rezervării**: cod, nume, unitate, cantitate, preț unitar și total (min/max), `price_status`, `duration_min`, `pricing_basis` (jsonb: ce celule s-au folosit). Istoricul citește doar copiile, deci modificările ulterioare de preț nu schimbă programările vechi.

### Jurnale

- **notifications_log** (servește și ca „coadă” de trimitere): `booking_id`, `channel` (`sms` / `push`), `kind`, `audience`, `dedupe_key` (**unic** per tenant), `status` (`scheduled`, `sending`, `sent`, `failed`, `unknown`, `skipped`), `skip_reason`, `scheduled_for`, `attempts`, `recipient_masked` (`+40 7** *** *30`), `provider`, `provider_msg_id`, `encoding`, `segments`, `cost_estimate`. Fără textul SMS-ului.
- **audit_log** (aplicația poate doar adăuga): `actor_user_id`, `actor_kind`, `action` (ex. `price_matrix.update`), `entity_type`, `entity_id`, `before`, `after` (jsonb, fără date personale). „Revino la valoarea anterioară” = o modificare nouă, tot jurnalizată.
- **push_subscriptions**: pentru notificările push gratuite către patron (Faza 5).

## Cum mapez ciudățeniile din catalog (seed)

| Ce e în catalog | Ce face seed-ul |
|---|---|
| Cheia `13-16` (pachet complet, montat/demontat) vs. mărimea `12-16` | Mărimea `12-16`, cu `source_note` „afiș: 13–16"” și „de verificat”. Nu fac o a doua mărime: clientul alege una singură, iar două mărimi suprapuse ar face celula ambiguă. |
| `null` explicit (ex. autoutilitară 20"+) | Celulă `on_request` + „de verificat” (nu știm dacă „nu se face” sau „sună pentru preț”). |
| Cheie lipsă (pachet complet, tablă 17"+) | Fără rând: combinația nu există. |
| `"5 / 10"` (jet apă / degresare) | Interval 5–10 lei (autoutilitară 10 lei) + „de verificat”. Le despart în două servicii după confirmare. |
| Echilibrat (vehicul × tip jantă) | Matrice `by_vehicle` + `by_rim_type`. |
| Servicii doar după vehicul | Matrice `by_vehicle`, ca patronul să le poată diferenția mai târziu. |
| `pret_fix` / `pret_interval` | Mod `fixed` / `range`. |
| `2.5` lei | 250 bani, citit ca text, nu înmulțit ca număr cu zecimale. |
| `de_confirmat: true` | `needs_review` + nota din catalog. Valorile ghicite (petic radial 17–19") **nu** devin prețuri publice. Merg doar în notă. |
| Suprataxe | Runflat 10 lei/roată, Off Road 20 lei/roată cu „de la” + „de verificat”, legate de serviciile din catalog. |
| Durate confirmate (15 / 45 min) | Fără marcaj. |
| Durate lipsă | Estimările din CLAUDE.md, marcate „de verificat”. **Schimb anvelopă pe jantă** nu are nicio estimare: propun 10 min + 10 min/roată. Îndreptat jantă: 30 / 60 min **pe bucată**. |
| Program din Google Maps | Introdus + „de verificat”. Duminica fără rânduri = închis. |
| Sediu social și email `null`, numele afișat | `review_fields`. Sediul e necesar pentru politica GDPR. |
| Servicii de pe fațadă fără preț | Create **inactive**, `on_request`, neprogramabile online, „de verificat”. |
| `telefon_admin` | Contul patronului cu `username` = `40766777130` și parolă temporară. Patronul e obligat să o schimbe la prima logare. |

## Algoritmul de preț (funcție pură)

Intrare: vehiculul (obligatoriu), mărimea jantei (sau „nu știu”), tipul jantei (sau „nu știu”), numărul de roți (implicit 4, maxim 10), suprataxele bifate, serviciile alese.

Pentru fiecare serviciu:
1. **Cantitatea**: `wheel` → numărul de roți; `piece` → bucățile alese (implicit 1); `service` → 1.
2. **Celulele potrivite**: dimensiunea cunoscută se potrivește exact. Dimensiunea „nu știu” se potrivește cu toate valorile active. La „nu știu” combinațiile lipsă se ignoră (jantă tablă 17"+ nu există).
3. Toate celulele potrivite sunt `not_offered` → serviciul nu se poate alege („nu efectuăm pentru…”). Nicio celulă cu preț → „preț stabilit în service”. Altfel `min` = cel mai mic minim, `max` = cel mai mare maxim.
4. Linie = preț unitar × cantitate.

**Suprataxe**: devin linii separate. Implicit `once_per_wheel`: Runflat se ia **o dată pe roată**, chiar dacă se aplică la două servicii din aceeași programare (de confirmat).

**Total** = suma minimelor și a maximelor.
- Afișare: „120 lei”, „Între 200 și 360 lei” sau „+ unele lucrări: preț în service”. Mereu cu „Prețul final se stabilește în service.”
- La „nu știu mărimea”, ajutor: „e scris pe anvelopă: 205/55 **R16** → 16”.

**Exemplu de verificare**: SUV, mărime și tip „nu știu”, 4 roți, Runflat, pachet complet + geometrie față+spate.

| Linie | Calcul | Rezultat |
|---|---|---|
| Pachet complet | 50–90 lei/roată × 4 | 200–360 lei |
| Geometrie față + spate | preț fix | 270 lei |
| Runflat | doar la pachet: 10 × 4 | 40 lei |
| **Total** | | **510–670 lei** |

Durata de lucru = 58 + 45 = 103 min → rezervat **105 min**.

## Algoritmul intervalelor libere (funcție pură)

**Durata rezervată** `D` = suma pe servicii `(durată de bază + durată pe unitate × cantitate)`, rotunjită în sus la pas (15 min). Exemplu: pachet complet pe 4 roți = 10 + 12×4 = 58 → **60 min**.

Pentru fiecare zi locală, de azi până la `azi + max_days_ahead`:
1. Zi închisă complet (`closures` cu zile întregi) → sar peste ea.
2. Iau intervalele de program ale zilei. Le convertesc în momente UTC cu Temporal (regulile pentru ora de vară/iarnă sunt mai jos).
3. Scad intervalele `closed` și `online_block`. Rămân intervalele libere. **Pauza de prânz rămâne gol**: o programare nu trece peste ea.
4. Primul start = `max(deschidere, acum + min_lead_min)`, rotunjit în sus la grila de 15 minute a orei locale. Avansez din 15 în 15 minute **reale** cât timp `start + D ≤ sfârșitul intervalului`. Programarea se termină cel târziu la închidere sau la pauză.
5. Păstrez startul dacă numărul maxim de programări suprapuse simultan în `[start, start + D)` este `< online_capacity`. Se numără programările cu `uses_online_capacity = true` și orice status în afară de `cancelled` (inclusiv `pending`).
6. Afișez startul în ora României (`HH:mm`), grupat pe zile.

Aceeași funcție rulează la afișare **și** la confirmare, pe server. Nu există „rezervare temporară” cât timp clientul completează pașii: cu capacitatea 1, roboții ar putea ține ocupate toate orele.

**Ora de vară / iarnă (Europe/Bucharest)**

| Caz | Regula |
|---|---|
| Ora de vară, ultima duminică din martie: 03:00 → 04:00. O oră de program în golul 03:00–03:59 | Mut capătul la momentul trecerii (04:00 ora nouă). Nu folosesc regula implicită, care ar muta 03:30 la 04:30. |
| Ora de iarnă, ultima duminică din octombrie: 04:00 → 03:00. O oră care apare de două ori | Iau prima apariție. |
| Un interval de program care traversează trecerea | Capetele se rezolvă separat. Intervalul are real 5 h în martie și 7 h în octombrie. Starturile avansează în timp real, deci nu se pierde și nu se dublează nimic. |
| Iterarea zilelor | Zile calendaristice locale, niciodată „+24 de ore”. |

Roți Rapid e închis duminica noaptea, deci practic nu e afectat. Testele folosesc totuși un tenant fictiv deschis atunci (25.10.2026 și 28.03.2027).

Testele unitare acoperă: ora de vară și de iarnă, pauza de prânz, zile libere, intervale blocate, capacitatea 1 și 2, durate combinate, rotunjirea, timpul minim înainte, limita de zile, suprataxele, „nu știu mărimea”, celulele lipsă.

## Rezervarea atomică (fără suprapuneri)

**Variante cântărite**

| Variantă | Concluzie |
|---|---|
| Constrângere de excludere (`btree_gist`) | Merge doar la capacitate 1. Capacitatea e editabilă, deci nu se potrivește. |
| Contoare pe sloturi | Corect, dar multe rânduri, se strică la schimbarea pasului, iar contoarele se pot desincroniza. |
| SERIALIZABLE + reîncercare | Corect, dar greu de testat și de explicat. |
| **Blocare pe tenant (advisory lock) + reverificare** | **Aleasă.** Simplă, corectă pentru orice capacitate. Volumul (zeci de programări pe zi) face așteptarea neglijabilă. |

**Funcția `reserveBooking`**, aceeași pentru online, manual, reprogramare și reactivare:
1. `BEGIN` (nivelul implicit, READ COMMITTED). `set_config('app.tenant_id', …, true)`. `SET LOCAL lock_timeout = '5s'`.
2. `SELECT pg_advisory_xact_lock(hashtextextended('booking:' || tenant_id, 0))`, **ca instrucțiune separată, înainte de orice citire**. Astfel citirile următoare văd tot ce a salvat cererea dinainte. Blocarea dispare singură la `COMMIT` / `ROLLBACK`.
3. Dacă `idempotency_key` există deja → întorc programarea existentă.
4. Recitesc setările, serviciile, programul, închiderile și programările din jurul intervalului.
5. Recalculez prețul și durata **pe server** (ignor ce a trimis browserul).
6. Online: verific că intervalul e liber + limita de programări active per telefon. Manual: dacă depășește, întorc avertismentul. Dacă patronul confirmă, salvez cu `over_capacity = true`.
7. Clientul (inserare sau actualizare după telefon) + acordurile.
8. Programarea (`confirmed` sau `pending`, după setare) + liniile + tokenul de acces.
9. Rândurile din `notifications_log`: confirmarea acum, reamintirea la `start − 24 h`, anunțul către patron.
10. `audit_log`, apoi `COMMIT`. După commit, pornesc trimiterea.

Interval ocupat → „Intervalul tocmai s-a ocupat” + cele mai apropiate 3 intervale libere.

**Plasă de siguranță** (Faza 3): un trigger în baza de date, verificat la `COMMIT`, care renumără suprapunerile. Astfel „capacitatea nu se depășește niciodată” e garantat chiar dacă un cod viitor ocolește funcția.

**Test**: 20 de cereri simultane pe același interval, pe conexiuni separate → exact 1 reușită la capacitatea 1, exact 3 la capacitatea 3.

## Izolarea între tenanți

**Bariera 1 — codul (din Faza 1)**
- Doar `src/server/db/` și `src/server/repos/` pot importa conexiunea. O regulă ESLint interzice importul în altă parte.
- Tipul `TenantId` se poate crea doar în `src/server/tenant/`:
  - din slug (public; tenantul trebuie să fie activ);
  - din sesiune (admin: sesiune → membership → rol);
  - din `support_sessions` (super-admin, cu motiv).
- `withTenant(tenantId, fn)` deschide o tranzacție și setează `app.tenant_id`. Din Faza 1, ca RLS să se activeze în Faza 4 fără rescrieri.
- Repo-urile adaugă mereu `tenant_id = …`. La inserare, `tenant_id` îl pune repo-ul, nu cine apelează. Id-urile din formular sunt doar candidați, mereu filtrați după tenant.
- `tenantId` nu vine niciodată din formular. Fiecare acțiune de server reverifică membership-ul (acțiunile de server sunt endpoint-uri publice).
- Paginile de admin nu se pun în cache.

**Bariera 2 — Row-Level Security (Faza 4)**
- Funcția `app_current_tenant()` = `nullif(current_setting('app.tenant_id', true), '')::uuid`. `nullif` e necesar: pe o conexiune refolosită valoarea apare ca text gol, nu null.
- Politică pe fiecare tabel cu `tenant_id`: `USING` și `WITH CHECK (tenant_id = app_current_tenant())`. Fără tenant setat → zero rânduri (se închide în caz de eroare).
- Două conturi: `app_owner` (proprietarul tabelelor, rulează migrările, `MIGRATION_DATABASE_URL`) și `app_user` (aplicația, `DATABASE_URL`, fără drept de ocolire RLS). La pornire, aplicația verifică că rulează ca `app_user`.
- Cron-ul ia lista de tenanți activi, apoi lucrează cu `withTenant` pentru fiecare.
- Vederile SQL primesc `security_invoker = true`, altfel ar ocoli RLS.

**Teste**
1. Fiecare funcție din repo-uri apelată cu tenantul A și id-uri din B → nimic găsit, 0 rânduri modificate.
2. Test pe structură: orice tabel care nu e pe lista globală are `tenant_id NOT NULL`, chei compuse și (din Faza 4) RLS + politică.
3. Ca `app_user` direct în SQL: fără tenant → 0 rânduri; tenant A → niciun rând din B; inserare cu `tenant_id` din B → eroare.

## Autentificare (Faza 4)

- Better Auth 1.7 + adaptorul Drizzle. Fără înregistrare publică: conturile le creează seed-ul sau super-adminul.
- Logare **telefon + parolă** prin pluginul `username`. Numele de utilizator = telefonul normalizat (`40766777130`). Fără SMS la logare.
  - Better Auth cere email pe cont, așa că punem unul intern `u-<id>@users.invalid`. De verificat în documentația 1.7.
- Parole: argon2id (`@node-rs/argon2`) prin opțiunea de hash personalizat. Dacă opțiunea nu se aplică, rămâne scrypt-ul implicit, acceptat de OWASP. Minim 12 caractere.
- Blocare: limita pe IP din Better Auth + `auth_login_guard` (5 greșeli → 15 minute).
- Cookie `httpOnly`, `Secure`, `SameSite=Lax`. Buton „Deconectează-mă de pe toate dispozitivele”.
- **Resetare parolă fără SMS**: super-adminul setează o parolă temporară, iar patronul e obligat să o schimbe (`must_change_password`).
- Super-admin: TOTP obligatoriu. Fără 2FA activat vede doar pagina de activare. Funcția de impersonare din pluginul `admin` rămâne dezactivată; accesul de suport trece doar prin `support_sessions`.

## Linkul din SMS (vezi / anulează)

- **Token** = primele 16 octeți din `HMAC-SHA256(BOOKING_LINK_SECRET, booking_id + versiune)`, scrise în 22 de caractere. Link: `APP_BASE_URL/p/7Gq2…`, cam 50 de caractere.
  - E „semnat”: doar serverul îl poate genera, iar în link nu apare niciun id.
  - Se poate re-genera pentru SMS-ul de reamintire, fără să-l stocăm în clar.
  - În baza de date stă doar `SHA-256(token)`. Cine are doar baza de date nu poate nici folosi, nici falsifica linkuri.
  - Expiră. Poate fi revocat (crește versiunea).
- **Deschiderea linkului nu anulează nimic.** Aplicațiile de SMS deschid singure linkurile ca să facă previzualizarea. Pagina arată rezumatul și butonul „Anulează programarea”. Doar apăsarea butonului anulează (`POST`), până la limita setată.
- Pagina `/p/` are `no-store`, `noindex`, `Referrer-Policy: no-referrer` și limită de cereri pe IP.

## Notificări (Faza 5, pe scurt)

- Rândurile SMS se creează **în aceeași tranzacție** cu programarea. O programare anulată de eroare nu trimite niciun SMS.
- Cron la fiecare minut (task programat în Coolify). Ia rândurile scadente cu `FOR UPDATE SKIP LOCKED` și le trece pe `sending`, apoi trimite.
- `dedupe_key` unic + trecerea `scheduled → sending` = același SMS nu pleacă de două ori, nici la rulări duble.
- Un rând blocat în `sending` peste 10 minute devine `unknown` și **nu** se retrimite.
- Limita lunară per tenant e verificată înainte de trimitere. Peste limită → `skipped` + avertisment în admin.
- Ore de liniște: niciun SMS între 21:00 și 08:00.

## Riscuri de securitate de reținut

- **„SMS pumping”**: cineva face programări cu numerele altora ca să plătești tu SMS-uri. Protecție: Turnstile, limite pe IP și pe telefon, limita lunară.
- **Calendar umplut cu programări false**: la capacitatea 1 e ușor. Protecție: aceleași limite + anulare în masă din admin.
- Toate celelalte puncte din CLAUDE.md §8 (CSP, HSTS, loguri fără date personale, `npm audit`) intră în fazele lor.

## Întrebări deschise

Nu blochează Faza 1. Le pui patronului când poți. Cele marcate ⚑ contează cel mai mult.

**Prețuri**
1. ⚑ **Îndreptat jantă tablă = 10 lei/bucată?** Pare mic față de aliaj (100–150 lei). Poate e 100?
2. ⚑ Prețurile TVA incluse? Pentru clienți prețurile afișate trebuie să fie finale.
3. „Montat/demontat roată”: toată tabla e scrisă cu roșu / tăiată pe afiș. Toate cele 21 de valori de confirmat (citite 20/25/30 lei).
4. Petic radial 17–19" (șterse pe afiș) și jet apă / degresare „5 / 10”: ce prețuri?
5. Pachet complet și montat/demontat la **12"**: același preț ca 13–16"?
6. Pachet complet pe **jantă tablă 17"+**: nu se face sau costă cât aliajul?
7. Celulele goale (autoutilitară 20"+, geometrie spate pentru autoutilitară…): „nu facem” sau „sună pentru preț”?
8. Schimb anvelopă pe jantă: autoutilitară 17–19" = 25 lei, mai ieftin decât autoturismul (30/35 lei). Greșeală pe afiș?
9. Geometrie Off Road (180 lei): serviciu separat sau doar coloana pentru autoutilitare? Pentru ce mașini?
10. Suprataxa Off Road: fix 20 lei sau „de la 20 lei”? O bifează clientul?
11. ⚑ Runflat + mai multe servicii: suprataxa o dată pe roată sau la fiecare serviciu?
12. Pachet complet + echilibrat în aceeași programare: blocăm combinația (pachetul include deja echilibrarea)?
13. Serviciile de pe fațadă fără preț (polish, freon AC…): le ascundem sau apar cu „Sună pentru preț”?

**Durate și program**
14. ⚑ Duratele estimate: geometrie spate 30, off-road 45, schimb roți 10+5/roată, pachet 10+12/roată, echilibrare 5+6/roată, schimb anvelopă 10+10/roată, îndreptat jantă 30 / 60 pe bucată.
15. Servicii combinate: se adună duratele (pachet 60 + geometrie 45 = 105 min) sau lucrează doi oameni în paralel?
16. ⚑ Programul real: e corect cel de pe Google Maps? Există pauză de prânz?
17. Ultima programare trebuie să se termine până la închidere? (propunere: da; sâmbăta un pachet complet începe cel târziu la 16:00)
18. Sărbătorile legale: închis? (le propun ca sugestii în admin, nu automat)
19. Programare din aceeași zi cu minim 2 ore înainte și maxim 30 de zile înainte: e bine?
20. Până cu cât timp înainte poate anula clientul? (propunere: 1 oră)
21. Câte programări active poate avea același telefon? (propunere: 2)

**SMS**
22. ⚑ **SMS-uri fără diacritice?** Ă, â, î, ș, ț nu există în setul standard de caractere SMS. Cu diacritice, un SMS are 70 de caractere în loc de 160, deci costă de 2–3 ori mai mult. Propunere: interfața cu diacritice, SMS-urile fără.
23. Limita lunară de SMS-uri per tenant (propunere: 200)?
24. Anunțurile către patron prin notificări push gratuite în loc de SMS? (pro/contra în Faza 5)

**Firmă și GDPR**
25. Sediul social (din ONRC) și emailul firmei. Necesare pentru politica de confidențialitate.
26. Numele afișat: „Service Roți Rapid” sau „Vulcanizare Auto”? (implicit primul, editabil)
27. Păstrarea datelor: 24 de luni?
28. Numere de telefon străine la programare, sau doar mobile românești (07…)?
29. Subdomeniul Propheet AIgency (merge în `APP_BASE_URL`, nu blochează nimic acum).

## De verificat în documentația oficială, la faza respectivă

- **Better Auth 1.7** (Faza 4): emailul obligatoriu pe cont; numele de utilizator doar din cifre; hash-ul personalizat de parolă; pluginul `admin` (setare parolă, revocare sesiuni, oprirea impersonării).
- **Drizzle 0.45** (Faza 1): `nullsNotDistinct()`, cheile străine compuse, politicile RLS și `security_invoker`. Unde nu sunt suportate, scriu migrarea SQL manual.
- **Coolify** (Faza 5/7): „Scheduled Tasks” pentru cron.

## Faza 1 — ce fac după aprobare

1. Îți dau pașii pentru instalarea **Docker Desktop**.
2. `git init` (îți explic ce e Git, un commit și un branch). Primul commit pe `main`: `.gitignore` (verificat: `.env*` exclus, cu excepția `.env.example`) + `CLAUDE.md`. Apoi branch-ul `faza-1-fundatie`.
3. Proiect Next.js 16 (TypeScript strict, Tailwind 4, App Router, `src/`).
4. `docker-compose.yml`: Postgres 16 legat doar de `127.0.0.1`, parolă din `.env`.
5. Schema Drizzle de mai sus, fără tabelele Better Auth și fără RLS (vin în Faza 4, prin migrări care doar adaugă) + prima migrare.
6. `withTenant` + repo-urile de bază + regula ESLint.
7. Mut catalogul în `data/seed/`. `scripts/seed.ts` idempotent: a doua rulare nu dublează nimic.
8. `/api/health`, `.env.example`, Vitest, primele teste (seed, idempotență, chei compuse), `npm audit`.
9. Oprire + rezumat.

## Verificare la finalul Fazei 1 (ce testezi tu)

- `docker compose up -d` → containerul Postgres pornit.
- `npm run db:migrate`, apoi `npm run db:seed` de două ori → fără erori și fără dubluri.
- `npm run db:studio` → vezi tenantul `roti-rapid`, serviciile, prețurile și ce e „de verificat”.
- `http://localhost:3000/api/health` → `{"status":"ok"}`.
- `npm test` → toate testele trec.
