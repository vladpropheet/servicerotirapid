# Proiect: Programări online pentru service-uri auto (Propheet AIgency)

Ești agentul care construiește această aplicație de la zero, pe faze. Citește tot documentul înainte de orice acțiune. El este sursa de adevăr pentru proiect. Dacă ceva din cerere contrazice acest document, oprește-te și întreabă.

---

## 1. Cine sunt eu și cum lucrăm

- Sunt Vlad, conduc Propheet AIgency (PFA). Sunt **începător cu Git și terminalul**.
- **Răspunde-mi mereu în română**, direct și clar.
- Când trebuie să fac eu ceva (o comandă, un cont, o setare), dă-mi **pași numerotați, unul câte unul**. Pentru fiecare comandă spune-mi:
  1. **unde** o rulez (PowerShell pe Windows, terminalul serverului prin SSH, panoul Coolify etc.),
  2. **ce face**,
  3. **cum arată un rezultat corect**.
- Explică termenii tehnici prima dată când apar (commit, branch, migrare, variabilă de mediu etc.).
- **Avertizează-mă înainte** de orice comandă care șterge, suprascrie sau resetează ceva (fișiere, baze de date, `git reset`, `docker volume rm`, `DROP` etc.) și așteaptă confirmarea mea.
- Când modifici un fișier pe care trebuie să-l copiez eu undeva, dă-mi **fișierul complet**, nu fragmente.
- **Nu adăuga servicii plătite** (API-uri, abonamente) și **nu genera imagini, video sau audio** fără acordul meu scris. Spune-mi întâi costul estimat.
- **Nu publica, nu trimite și nu șterge nimic în numele meu** fără acord explicit (inclusiv push pe `main`, deploy în producție, SMS-uri reale).
- La finalul fiecărei faze: **oprește-te**, rezumă ce ai făcut în 5–10 rânduri, spune ce trebuie să testez eu și ce urmează. Nu începe faza următoare până nu spun „continuă”.
- Dacă nu ești sigur de ceva (un preț, o lege, o funcție a unei biblioteci), spune clar și verifică în documentația oficială. Nu inventa.
- Pentru decizii importante: dă-mi pe scurt **pro/contra** și o alternativă.

---

## 2. Produsul

O aplicație web de **programări online pentru service-uri auto** (vulcanizare, geometrie). E construită **multi-tenant** de la început: o singură aplicație și o singură bază de date, mai multe service-uri, fiecare cu datele lui complet separate. Primul client (tenant) este cel de mai jos. Ceilalți se adaugă ulterior fără cod nou.

Aplicația are două părți:

1. **Pagina publică a service-ului**, unde clientul final face programarea de pe telefon, **fără cont și fără parolă**.
2. **Panoul de administrare**, unde patronul **gestionează complet singur** totul: servicii, prețuri, durate, program, zile libere, capacitate, mesaje SMS și programări.

Mai există un rol de **super-admin (Propheet AIgency, eu)**, care creează tenanți noi și poate ajuta un client. Ca persoană împuternicită GDPR, super-adminul nu vede date personale ale clienților finali decât dacă e nevoie pentru suport.

### Primul tenant

| Câmp | Valoare |
|---|---|
| Slug (în URL) | `roti-rapid` |
| Nume afișat | Service Roți Rapid *(pe Google Maps apare „Vulcanizare Auto”; numele trebuie să fie editabil)* |
| Firma (operator GDPR) | SC DANI ROCA SRL |
| CUI | 4834157 |
| Nr. Reg. Com. | J03/2366/27.09.1993 |
| Punct de lucru | Bulevardul Petrochimiștilor 1A, 110167 Pitești, Argeș |
| Telefon public | 0766 777 130 |
| Utilizator admin | patronul, cu telefonul 0766 777 130 (singurul utilizator al panoului) |
| Program (Google Maps, de confirmat) | Luni–Vineri 08:00–18:00, Sâmbătă 08:00–17:00, Duminică închis |
| Capacitate online | **1 programare online în același timp** (restul posturilor rămân pentru clienții fără programare) |

Datele de pornire (servicii, prețuri, suprataxe, program, setări) sunt în **`data/seed/catalog-servicii.json`**. Citește-l integral. Câmpurile marcate `"de_confirmat": true` sau cu valoare `null` primesc o valoare implicită sau rămân goale, dar trebuie să fie vizibile în admin ca „de verificat”.

---

## 3. Stack tehnic (decis, nu-l schimba fără să mă întrebi)

- **Next.js** (ultima versiune stabilă, App Router) + **TypeScript** (strict).
- **PostgreSQL 16** + **Drizzle ORM** (schemă tipizată, migrări versionate în repo).
- **Autentificare:** o bibliotecă matură (de preferat **Better Auth**; propune alternativa dacă ai motiv). **Nu scrie criptografie proprie.** Parolele se stochează cu hash argon2id sau echivalent.
- **Validare:** Zod pe tot ce vine de la utilizator, pe server.
- **UI:** Tailwind CSS, mobile-first. Componente accesibile (butoane, label-uri și input-uri reale, ținte de atingere ≥ 44 px, contrast ≥ 4.5:1).
- **Teste:** Vitest (logică) + Playwright (fluxul de programare cap-coadă).
- **Rulare:** Docker. `docker-compose.yml` pentru dezvoltare locală (app + Postgres). `Dockerfile` de producție (build multi-stage, utilizator non-root).
- **Producție:** **VPS OVH**, administrat cu **Coolify**. Aplicația și baza de date stau pe același server. **Baza de date nu este expusă în internet** (fără port public 5432). Adresa: un **subdomeniu al domeniului Propheet AIgency** (încă nu știm care e; pune-l în variabila de mediu `APP_BASE_URL`, nu în cod). HTTPS prin Let's Encrypt, din Coolify.
- **Fus orar:** `Europe/Bucharest`, cu trecerea corectă la ora de vară/iarnă. Stochează orele în UTC (`timestamptz`) și afișează-le în ora României.
- **Limba interfeței:** română cu diacritice corecte (ă, â, î, ș, ț).

---

## 4. Modelul de date (propune schema completă în Faza 0)

Toate tabelele cu date ale unui service au coloana `tenant_id`. Minim:

- `tenants`: slug, nume afișat, date firmă (denumire, CUI, Reg. Com., sediu social, punct de lucru, telefon, email), culori/brand, status (activ/suspendat).
- `users` + legătura cu tenantul și rolul: `owner`, `staff` (pentru mai târziu), `superadmin`.
- `service_categories`, `services`: nume, descriere, ce include, unitate (roată/bucată/serviciu), activ, programabil online, ordine afișare, **durată de bază + durată pe unitate**.
- **Prețuri flexibile:** un serviciu poate avea preț fix, interval (min–max) sau o **matrice** după oricare combinație de `tip_vehicul` × `mărime_jantă` × `tip_jantă`. Tipurile de vehicul, mărimile și tipurile de jantă sunt **liste editabile per tenant**, nu valori fixe în cod.
- `surcharges` (suprataxe pe roată, de ex. Runflat +10 lei, Off Road +20 lei) și serviciile la care se aplică.
- `business_hours` (pe zi, mai multe intervale pe zi, ca să permită pauză de prânz), `closures` (zile libere, concedii, intervale blocate manual).
- `booking_settings`: capacitate online simultană, pasul intervalelor (15 min), cu cât timp înainte minim se poate programa, câte zile înainte maxim, confirmare automată sau manuală, ore pentru reamintire, texte SMS.
- `customers`: nume, telefon, nr. înmatriculare opțional, consimțământ marketing separat (cu dată și text acceptat).
- `bookings` + `booking_items` (o programare poate avea **mai multe servicii**): status (`confirmată`, `în așteptare`, `anulată`, `finalizată`, `neprezentat`), sursa (`online` / `adăugată manual`), preț estimat, durată totală, interval rezervat, token semnat pentru anulare de către client.
- `notifications_log`: SMS trimise, status, cost estimativ (fără conținut sensibil inutil).
- `audit_log`: cine a modificat ce și când (prețuri, servicii, program, setări), cu valoarea veche și cea nouă, ca orice greșeală să poată fi reparată.

### Izolarea între tenanți (critic)

- Toate citirile și scrierile trec printr-un **singur strat de acces la date** care primește obligatoriu `tenant_id`.
- Nicio rută nu primește `tenant_id` direct de la client fără verificare contra sesiunii sau a slug-ului.
- Scrie **teste automate** care dovedesc că un admin al tenantului A nu poate citi sau modifica nimic din tenantul B.
- Propune dacă merită și Row-Level Security în PostgreSQL ca a doua barieră (pro/contra).

### Durate implicite (până le setează patronul)

- Geometrie punte față: **15 min** (confirmat). Geometrie față + spate: **45 min** (confirmat).
- Estimări propuse, marcate „de verificat” în admin: geometrie punte spate 30 min, geometrie off-road 45 min, schimb roți complete 10 min + 5 min/roată, pachet complet anvelope 10 min + 12 min/roată, echilibrare 5 min + 6 min/roată, îndreptat jantă tablă 30 min, îndreptat jantă aliaj 60 min.
- Durata totală a unei programări se rotunjește în sus la pasul intervalelor (15 min).

---

## 5. Fluxul public de programare (3 pași, mobile-first)

Design de referință: **demo-ul aprobat** (fundal deschis #F6F5F2, text #18181B, accent portocaliu #C2410C, galben #FACC15 pentru etichete, fonturi Barlow / Barlow Condensed). Sus: poza fațadei service-ului, încărcată de patron din admin. **Logo nu există**: folosește numele service-ului ca logo text. Nu genera imagini.

1. **Alege serviciul.** Lista pe categorii. Clientul alege tipul vehiculului, apoi mărimea jantei (cu opțiunea „nu știu”), tipul jantei, numărul de roți (implicit 4) și bifa Runflat dacă e cazul. Vede **prețul estimativ**, cu mențiunea „prețul final se stabilește în service”. Poate adăuga încă un serviciu. Serviciile care nu se programează online (de ex. reparațiile de pană) apar cu preț și cu butonul „Sună acum”, nu cu programare. **Diferența dintre „Schimb roți complete” și „Pachet complet anvelope” trebuie explicată clar pe ecran.**
2. **Alege ziua și ora.** Se afișează doar intervalele libere, calculate din program, zile libere, intervale blocate, durata totală, capacitatea online, timpul minim înainte de programare și numărul maxim de zile înainte.
3. **Date și confirmare.** Nume, telefon (validare format RO), nr. înmatriculare opțional, bifă obligatorie pentru prelucrarea datelor (cu link la politica de confidențialitate) și **bifă separată, nebifată implicit**, pentru mesaje de marketing (de ex. reamintiri sezoniere). Urmează ecranul de succes cu rezumatul și un link pentru anulare.

### Fără suprapuneri

- Rezervarea unui interval se face **atomic în baza de date**: tranzacție + blocare sau constrângere, astfel încât două cereri simultane să nu poată depăși capacitatea. Scrie un test care trimite cereri concurente.
- Recalculează disponibilitatea pe server la confirmare. Nu te baza pe ce a afișat browserul.

---

## 6. Panoul de administrare (patronul, pe telefon)

Mobile-first, instalabil pe ecranul telefonului (PWA). Totul în română, cu cuvinte simple, fără termeni tehnici.

- **Azi / Mâine:** lista programărilor (ora, servicii, nume, telefon apăsabil, nr. mașină, preț estimat). Acțiuni: confirmă, anulează, finalizat, neprezentat.
- **Calendar** pe zi și pe săptămână.
- **Adaugă programare manual** (pentru cei care sună).
- **Blochează un interval sau o zi** („azi nu mai iau programări după 15:00”).
- **Servicii și prețuri:** adaugă, modifică, dezactivează, ordonează. Editor simplu de **matrice de prețuri** (tabel vehicul × mărime jantă), durate, „programabil online” da/nu. Suprataxe. Marcajul „de verificat” pentru valorile neconfirmate.
- **Program:** ore pe fiecare zi, pauze, zile libere sau concediu.
- **Setări programări:** capacitate online, timp minim înainte, câte zile înainte maxim, confirmare automată sau manuală, ora reamintirii, textele SMS (cu variabile ca {nume}, {data}, {ora}).
- **Datele firmei și poza fațadei.**
- **Istoric modificări** (audit log) cu posibilitatea de a vedea valoarea anterioară.
- **GDPR:** export CSV al programărilor și clienților, ștergerea datelor unui client la cerere, ștergerea automată a programărilor mai vechi decât o perioadă setabilă (implicit 24 de luni, de confirmat).
- **Statistici simple:** programări online pe lună (pentru raportul lunar).

**Autentificare admin:** telefon + parolă puternică. Limitare a încercărilor (blocare temporară după mai multe încercări greșite), sesiuni sigure (cookie httpOnly, Secure, SameSite), deconectare de pe toate dispozitivele. Propune o metodă de resetare a parolei care **nu costă SMS la fiecare logare**, de exemplu resetare făcută de super-admin. Super-adminul are obligatoriu autentificare în doi pași (TOTP).

---

## 7. Notificări

- Construiește un **strat abstract de SMS** (o interfață `SmsProvider`). În dezvoltare și în teste folosește un provider care doar scrie în consolă sau log, **fără SMS-uri reale**. Adaptorul pentru un furnizor românesc (SMSLink sau SMSO) îl facem **doar după ce aleg furnizorul și îți dau cheia** prin variabile de mediu.
- Mesaje:
  - confirmare către client la programare,
  - reamintire către client cu X ore înainte (implicit 24 h),
  - anunț către patron la programare nouă sau anulare,
  - opțional, mesaj de anulare.
- Reamintirile pleacă dintr-un **job programat** (cron), sigur la rulări duble: același SMS nu se trimite de două ori.
- Linkurile din SMS sunt scurte și folosesc domeniul aplicației (`APP_BASE_URL`).
- Fiecare SMS se înregistrează în `notifications_log`. Adaugă o limită lunară de SMS-uri per tenant, configurabilă, ca să nu am surprize la cost.
- Propune și varianta **notificări push gratuite** (PWA) pentru patron, cu pro/contra față de SMS.

---

## 8. Securitate (obligatoriu, nu opțional)

- **Niciun secret în cod sau în Git:** parole, chei API, `DATABASE_URL`, `AUTH_SECRET`. Doar variabile de mediu. Repo-ul conține `.env.example` cu nume și valori false. Verifică `.gitignore` înainte de primul commit.
- Validare Zod pe server pentru toate intrările. Doar interogări parametrizate (prin ORM).
- **Protecție anti-spam** pe formularul de programare: limitare de cereri pe IP și pe telefon, plus **Cloudflare Turnstile** (gratuit; cheia vine din variabile de mediu, cu un mod dezactivat pentru dezvoltare).
- Header-e de securitate: CSP strict, HSTS, X-Content-Type-Options, Referrer-Policy, frame-ancestors.
- Tokenurile de anulare sunt semnate, cu expirare, și nu dezvăluie ID-uri ușor de ghicit.
- **Logurile nu conțin date personale** (telefoane, nume) decât mascate.
- `npm audit` / verificarea dependențelor la fiecare fază. Dependențe puține și mature.
- Rută `/api/health` pentru monitorizare, fără informații sensibile.
- La final de proiect: o **listă de verificare de securitate** completată, cu ce e acoperit și ce rămâne.

---

## 9. GDPR și pagini legale

- Pagina **Politica de confidențialitate** a fiecărui tenant, generată din datele firmei lui (operatorul datelor). Propheet AIgency apare ca persoană împuternicită. Ce date se colectează, scopul, temeiul, durata păstrării, drepturile persoanei, contact.
- Subsol cu datele firmei: denumire, CUI, Reg. Com., adresă, telefon.
- Marchează clar în cod și în rezumat că **textele legale trebuie verificate de un jurist**. Tu nu ești avocat.
- Datele stau doar pe serverul din UE.

---

## 10. Producție și backup (Faza 7, ghidată pas cu pas pentru mine)

- Ghid pentru securizarea VPS-ului (actualizări, utilizator non-root, SSH doar cu cheie, firewall doar pe 22/80/443, fail2ban, actualizări automate de securitate), apoi instalarea Coolify. **Întreabă-mă întâi ce mai rulează pe VPS**: Coolify ocupă porturile 80/443 și poate opri alte site-uri.
- Deploy din GitHub prin Coolify. Variabilele de mediu se pun doar în Coolify.
- **Backup automat zilnic** al bazei de date (pg_dump, criptat) **în afara serverului** (de ex. OVH Object Storage), cu păstrare de 30 de zile și **un test de restaurare documentat**.
- Migrările bazei de date rulează controlat la deploy, nu automat distructiv.

---

## 11. Fazele de lucru

La fiecare fază: branch nou (explică-mi ce e un branch), commit-uri mici cu mesaje clare, teste care trec, apoi oprire și rezumat.

0. **Plan:** citește catalogul, propune structura de foldere, schema completă a bazei de date, algoritmul de calcul al intervalelor libere și al prețului, plus întrebările deschise. **Nu scrie cod până nu aprob.**
1. **Fundație:** proiect Next.js, Docker Compose local, Drizzle, migrări, script de seed care creează tenantul `roti-rapid` din `data/seed/catalog-servicii.json`.
2. **Motorul de prețuri și disponibilitate:** funcții pure + teste unitare extinse (ora de vară, pauze, zile libere, capacitate, durate combinate, suprataxe, „nu știu mărimea”).
3. **Fluxul public de programare** (cei 3 pași) + rezervare atomică + test cu cereri concurente + test Playwright.
4. **Panoul de administrare** + autentificare + audit log + teste de izolare între tenanți.
5. **Notificări:** strat SMS abstract (fără SMS-uri reale), reamintiri prin cron, anulare prin link.
6. **Securitate și GDPR:** anti-spam, header-e, pagini legale, export și ștergere date, lista de verificare de securitate.
7. **Producție:** Dockerfile final, ghid VPS + Coolify + backup, pas cu pas pentru mine.

**În afara versiunii 1** (dar schema să le permită mai târziu): plăți online, hotel de anvelope, reamintiri sezoniere de marketing, cereri automate de recenzii Google, mai mulți angajați cu conturi proprii, raport lunar automat pe WhatsApp.

---

## 12. Definiția lui „gata”

- Patronul poate schimba **orice** parametru din admin, fără să mă sune.
- Un client poate face o programare de pe un telefon vechi în sub un minut.
- Două programări nu pot depăși niciodată capacitatea setată.
- Niciun secret în repo, niciun port de bază de date deschis, backup testat.
- Toate testele trec, iar tu mi-ai dat la fiecare pas instrucțiuni pe care le pot urma singur.
