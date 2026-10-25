# Lista de verificare a securității și GDPR

Stare la 25.10.2026, cu aplicația în producție la `https://programari.n8n-propheetai.xyz`. `[x]` = făcut și verificat (prin teste automate sau direct pe server); `[ ]` = rămâne de făcut (cu persoana responsabilă).

**Verificat din exterior, pe server (25.10.2026):** porturile 5432 (baza de date) și 3000 (aplicația) sunt închise; HTTPS, HSTS, CSP și `X-Frame-Options: DENY` sunt active; după oprirea Evolution API, sunt deschise doar 22, 80 și 443.

## 1. Secrete

- [x] Niciun secret în cod sau în Git. `.env` e exclus din Git (`.gitignore`), iar `.env.example` conține doar valori false. Verificat: valorile din `.env` nu apar în istoricul Git.
- [x] Cheile secrete (`AUTH_SECRET`, `BOOKING_LINK_SECRET`) sunt verificate la pornire: în producție serverul nu pornește dacă lipsesc sau au sub 32 de caractere (`src/instrumentation.ts`).
- [x] În producție, parolele bazei de date și cheile secrete se generează pe server (`docker/server/generate-env.sh`, 64 de caractere aleatorii) și stau doar în `.env` de pe server, citibil doar de proprietar. Nu se afișează și nu trec prin chat sau Git.

## 2. Baza de date

- [x] Interogări doar prin ORM (Drizzle), parametrizate. Nicio interogare construită prin lipire de text de la utilizator.
- [x] Izolare între service-uri, pe două niveluri: (1) codul trece obligatoriu prin `withTenant()`; (2) Row-Level Security în PostgreSQL pe toate cele 20 de tabele cu date ale unui service. Teste: un service nu poate citi, modifica sau șterge nimic din altul (`tests/integration/tenant-isolation.test.ts`, `admin.test.ts`, `gdpr.test.ts`).
- [x] Aplicația folosește contul `app_user`, fără drept de ocolire a RLS. În producție serverul refuză să pornească cu un cont de administrator.
- [x] Istoricul modificărilor (`audit_log`) nu poate fi modificat sau șters de aplicație.
- [x] Local, portul 5432 e legat doar de `127.0.0.1`.
- [x] În producție baza de date nu are niciun port publicat (`docker-compose.prod.yml` fără `ports:`), verificat local pe varianta de producție. Pe server: verificarea din `docs/productie.md`, pasul B8.
- [x] Separarea conturilor în producție: doar containerul `ops` are parola proprietarului bazei de date (migrări, backup); aplicația are doar `app_user`.

## 3. Autentificare (panoul patronului și super-admin)

- [x] Bibliotecă matură (Better Auth 1.7), fără criptografie proprie. Parole cu argon2id, minim 12 caractere.
- [x] Blocare temporară: 5 parole greșite pentru același cont = 15 minute blocat. Plus limită pe IP (20 de încercări / 15 minute) și limita internă Better Auth.
- [x] Cookie de sesiune `httpOnly`, `SameSite=Lax`, `Secure` în producție. Buton „Ieși de pe toate dispozitivele”.
- [x] Fără înregistrare publică. Parola uitată: super-adminul dă o parolă temporară, care trebuie schimbată la prima logare (fără SMS).
- [x] Super-admin: autentificare în doi pași (TOTP) obligatorie. Acces la datele unui service doar prin sesiune de suport, cu motiv scris, 60 de minute, înregistrată.
- [x] Fiecare acțiune de server (formular) verifică din nou cine e logat (acțiunile sunt endpoint-uri publice).

## 4. Anti-spam pe formularul de programare

- [x] Limite de cereri, salvate în baza de date (funcționează și după repornire): intervale libere 120 / 10 min pe IP; programări 10 / oră pe IP și 5 / zi pe telefon; anulări 20 / oră pe IP. Plus maxim 2 programări active pe telefon.
- [x] IP-ul și telefonul nu se salvează în clar: doar un HMAC (cu cheie secretă), păstrat cel mult 2 zile.
- [x] IP-ul se citește doar din `X-Real-Ip` (pus de proxy). `X-Forwarded-For` poate fi falsificat, deci nu se folosește.
- [x] Cloudflare Turnstile (gratuit): verificat pe server; testat cu cheile de test oficiale Cloudflare (programare reușită, fără blocări CSP). Oprit în dezvoltare fără chei; în producție serverul nu pornește fără chei, decât cu `TURNSTILE_DISABLED=1`.
- [x] Cloudflare Turnstile activ în producție (25.10.2026): widget pentru `programari.n8n-propheetai.xyz`, cheile în `.env` pe server; politica de confidențialitate pomenește Cloudflare.
- [x] Caddy (proxy-ul de pe VPS) suprascrie `X-Real-IP` cu IP-ul real (`header_up X-Real-IP {remote_host}` în `docker/server/Caddyfile.snippet`). Verificat local cu Caddy 2.11: un `X-Real-Ip` / `X-Forwarded-For` falsificat de vizitator e înlocuit.

## 5. Header-e de securitate (verificate cu `curl` și în testele Playwright)

- [x] `Content-Security-Policy`: doar resursele aplicației + Cloudflare Turnstile; `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`. Testul Playwright pică dacă browserul raportează vreo blocare CSP.
- [x] `Strict-Transport-Security` (2 ani, doar în producție), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`. Fără `X-Powered-By`.
- [x] Linkurile personale `/p/...`: `no-store`, `noindex`, `Referrer-Policy: no-referrer`. Panoul: `noindex`.

**Decizie: CSP fără „nonce”.** Next.js 16 cere randare complet dinamică pentru CSP cu nonce, ceea ce oprește randarea parțial statică (pagina de programare se încarcă mai greu pe telefoane vechi).
- Pro: pagina rămâne rapidă; restul regulilor CSP rămân stricte; aplicația nu afișează niciodată HTML venit de la utilizatori (React escapează tot textul, `dangerouslySetInnerHTML` nu e folosit).
- Contra: `script-src` conține `'unsafe-inline'`, deci CSP-ul nu mai oprește un script injectat, dacă ar apărea o greșeală care permite injectarea.
- Alternativă: CSP cu nonce + randare dinamică a tuturor paginilor. O putem activa oricând (modificare în `next.config.ts` + un `proxy.ts`), dacă viteza pe telefoane vechi contează mai puțin.

## 5b. Fișiere încărcate (poza fațadei, logo)

- [x] Tipul verificat după conținut, maxim 5 MB, se încarcă imediat ce e ales fișierul, decodate și re-salvate ca WebP pe server (un fișier care doar se dă drept imagine e refuzat). Metadatele (inclusiv locația GPS din pozele făcute cu telefonul) se șterg. Numele fișierului îl alege serverul.

## 6. Linkurile „vezi / anulează programarea”

- [x] Token semnat (HMAC-SHA256), 22 de caractere, fără ID-uri ghicibile. În baza de date stă doar hash-ul. Expiră la 7 zile după programare. Se poate revoca.
- [x] Deschiderea linkului nu anulează nimic (aplicațiile de mesagerie deschid singure linkurile); anularea cere apăsarea butonului.
- [x] Fără SMS, linkul se afișează pe ecranul de confirmare, cu butoanele „Copiază linkul” și „Trimite-l”, ca clientul să-l păstreze.

## 7. Loguri

- [x] Logurile aplicației nu conțin nume, telefoane sau IP-uri: doar tipul erorii.
- [x] Better Auth: doar erori, fără detaliile atașate, cu numerele lungi mascate. Telemetria e oprită.
- [x] Erorile de bază de date (care conțin interogarea și valorile, deci nume și telefoane) apar în log doar cu codul și constrângerea (`src/server/security/redact-logs.ts`), testat.
- [x] Scriptul de ștergere automată scrie doar numere (câte rânduri s-au șters).

## 8. GDPR

- [x] Politica de confidențialitate generată din datele firmei fiecărui service (operator), cu Propheet AIgency ca persoană împuternicită; pomenește protecția anti-abuz, Cloudflare Turnstile (doar când e activ), cookie-urile și durata păstrării.
- [ ] **Jurist:** textele legale (politica de confidențialitate, textul bifei de acord) trebuie verificate de un jurist înainte de lansare. Puncte de verificat: temeiul legal (executarea serviciului vs. consimțământ), transferul de date către Cloudflare (SUA), lista persoanelor împuternicite (Propheet AIgency, OVHcloud, Cloudflare), contractul de persoană împuternicită dintre SC DANI ROCA SRL și Propheet AIgency.
- [x] Subsol cu datele firmei pe paginile publice.
- [x] Export CSV al programărilor și clienților (panou → Meniu → Datele clienților). Fiecare export se notează în istoric.
- [x] Ștergerea datelor unui client la cerere: nume, telefon, nr. de înmatriculare și observații șterse definitiv; programările viitoare anulate; linkurile personale oprite; programările rămân anonime în statistici.
- [x] Ștergere automată: programările mai vechi decât perioada setată (implicit 24 de luni, editabilă în „Datele firmei”) + clienții rămași fără programări + sesiuni și linkuri expirate (`npm run gdpr:retention`, se poate rula de mai multe ori).
- [x] Cron-ul zilnic pe server (25.10.2026): ștergerea automată la 02:00 UTC, backup-ul la 02:30 UTC (`/etc/cron.d/servicerotirapid`, jurnal în `/var/log/servicerotirapid.log`). Rulat manual o dată, cu succes.
- [ ] **Vlad / patron:** confirmarea perioadei de păstrare. În panou e setată acum la **11 luni** (implicit era 24); de verificat dacă e decizia patronului.
- [ ] **Vlad / patron:** sediul social al firmei e gol în „Datele firmei”; e necesar în politica de confidențialitate.
- [x] Fără marketing și fără SMS (decizia din 22.10.2026): nu se colectează acord de marketing.

## 9. Dependențe (`npm audit`, 25.10.2026)

- [x] Dependențe puține, versiuni fixate exact în `package.json`.
- Rămase, fără impact în producție:
  - `esbuild` ≤ 0.24.2 (moderat), prin `drizzle-kit`: afectează doar serverul de dezvoltare al esbuild, pe care nu-l folosim. `drizzle-kit` e unealta de migrări; nu rulează în aplicație.
- [x] Imaginile Docker de producție nu includ uneltele de dezvoltare: `app` conține doar serverul Next.js și dependențele lui (ieșire „standalone”), `ops` doar scripturile împachetate + modulul argon2. `drizzle-kit` și `eslint` nu ajung pe server.
- [x] Containerele rulează cu utilizatorul `node` (fără drepturi de administrator); codul aplicației aparține lui root și nu poate fi modificat de aplicație.

## 10. Producție și backup

- [x] Aplicația rulează pe VPS-ul OVH din Varșovia (UE), lângă n8n, în spatele Caddy-ului existent (decizia din 23.10.2026, fără Coolify). `db` și `ops` sunt într-o rețea Docker proprie; doar `app` e vizibilă pentru Caddy.
- [x] HTTPS prin Let's Encrypt (Caddy), HSTS activ, `http://` trimite la `https://`.
- [x] Migrările rulează controlat la fiecare deploy, în containerul `ops`, înainte de pornirea aplicației; doar adaugă, fiecare în tranzacție.
- [x] Backup criptat zilnic (pg_dump + age) pentru baza de date și pozele încărcate; pe server doar cheia publică, cheia privată doar în managerul de parole al lui Vlad. **Test de restaurare reușit pe server (25.10.2026)**, notat în `docs/productie.md`.
- [ ] **Vlad:** copia backup-ului **în afara serverului** (stocare S3 într-o regiune din UE, de ex. OVH Object Storage, cost estimat sub 0,10 €/lună; ghid în `docs/productie.md`). Până atunci, backup-ul există doar pe același server: dacă serverul e pierdut, se pierd și copiile.
- [ ] **Vlad / patron:** test de restaurare **lunar** (`restore-test.sh`), notat în jurnalul din `docs/productie.md`.
- [x] Monitorizare: `/api/health` (fără informații sensibile) + healthcheck-urile containerelor (`docker compose ps`).

## 11. Serverul (VPS)

- [x] Logare SSH doar cu cheie (`PasswordAuthentication no`), `root` nu se poate loga (`PermitRootLogin no`). Verificat: logarea cu parolă e refuzată.
- [x] fail2ban activ pe SSH (la verificare blocase deja 27 de IP-uri care încercau parole).
- [x] Actualizări automate de securitate (`unattended-upgrades`) pornite.
- [x] Firewall `ufw` activ: doar 22, 80, 443.
- [x] Utilizatorul `ubuntu` (non-root, cu `sudo`); parola lui și cheia SSH sunt în managerul de parole, pentru consola KVM din panoul OVH în caz de urgență.
- [x] Actualizările de sistem instalate și serverul repornit (25.10.2026); toate containerele (n8n, Evolution API, aplicația) au pornit singure.
- [x] Evolution API (nefolosit momentan) oprit pe 25.10.2026, fără repornire automată; regula 8080 scoasă din `ufw`. Verificat din exterior: portul 8080 e închis. La nevoie se repornește securizat (subdomeniu + HTTPS), vezi `docs/evolution-api.md`.
- [ ] **Vlad:** verificarea în doi pași pe conturile de care depinde totul: OVH, GitHub, Namecheap, Cloudflare.
