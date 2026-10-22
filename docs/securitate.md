# Lista de verificare a securității și GDPR

Stare la finalul Fazei 6 (22.10.2026). `[x]` = făcut și verificat prin teste; `[ ]` = rămâne de făcut (cu faza sau persoana responsabilă).

## 1. Secrete

- [x] Niciun secret în cod sau în Git. `.env` e exclus din Git (`.gitignore`), iar `.env.example` conține doar valori false. Verificat: valorile din `.env` nu apar în istoricul Git.
- [x] Cheile secrete (`AUTH_SECRET`, `BOOKING_LINK_SECRET`) sunt verificate la pornire: în producție serverul nu pornește dacă lipsesc sau au sub 32 de caractere (`src/instrumentation.ts`).
- [ ] **Faza 7:** cheile de producție se generează nou (nu cele din dezvoltare) și se pun doar în Coolify.

## 2. Baza de date

- [x] Interogări doar prin ORM (Drizzle), parametrizate. Nicio interogare construită prin lipire de text de la utilizator.
- [x] Izolare între service-uri, pe două niveluri: (1) codul trece obligatoriu prin `withTenant()`; (2) Row-Level Security în PostgreSQL pe toate cele 20 de tabele cu date ale unui service. Teste: un service nu poate citi, modifica sau șterge nimic din altul (`tests/integration/tenant-isolation.test.ts`, `admin.test.ts`, `gdpr.test.ts`).
- [x] Aplicația folosește contul `app_user`, fără drept de ocolire a RLS. În producție serverul refuză să pornească cu un cont de administrator.
- [x] Istoricul modificărilor (`audit_log`) nu poate fi modificat sau șters de aplicație.
- [x] Local, portul 5432 e legat doar de `127.0.0.1`.
- [ ] **Faza 7:** fără port 5432 public pe VPS (baza de date doar în rețeaua internă Docker din Coolify).

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
- [ ] **Vlad, înainte de lansare:** cont Cloudflare gratuit → Turnstile → widget pentru subdomeniul aplicației → cheile în Coolify.
- [ ] **Faza 7:** de verificat pe server că Traefik (proxy-ul din Coolify) suprascrie `X-Real-Ip` cu IP-ul real al vizitatorului.

## 5. Header-e de securitate (verificate cu `curl` și în testele Playwright)

- [x] `Content-Security-Policy`: doar resursele aplicației + Cloudflare Turnstile; `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`. Testul Playwright pică dacă browserul raportează vreo blocare CSP.
- [x] `Strict-Transport-Security` (2 ani, doar în producție), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`. Fără `X-Powered-By`.
- [x] Linkurile personale `/p/...`: `no-store`, `noindex`, `Referrer-Policy: no-referrer`. Panoul: `noindex`.

**Decizie: CSP fără „nonce”.** Next.js 16 cere randare complet dinamică pentru CSP cu nonce, ceea ce oprește randarea parțial statică (pagina de programare se încarcă mai greu pe telefoane vechi).
- Pro: pagina rămâne rapidă; restul regulilor CSP rămân stricte; aplicația nu afișează niciodată HTML venit de la utilizatori (React escapează tot textul, `dangerouslySetInnerHTML` nu e folosit).
- Contra: `script-src` conține `'unsafe-inline'`, deci CSP-ul nu mai oprește un script injectat, dacă ar apărea o greșeală care permite injectarea.
- Alternativă: CSP cu nonce + randare dinamică a tuturor paginilor. O putem activa oricând (modificare în `next.config.ts` + un `proxy.ts`), dacă viteza pe telefoane vechi contează mai puțin.

## 6. Linkurile „vezi / anulează programarea”

- [x] Token semnat (HMAC-SHA256), 22 de caractere, fără ID-uri ghicibile. În baza de date stă doar hash-ul. Expiră la 7 zile după programare. Se poate revoca.
- [x] Deschiderea linkului nu anulează nimic (aplicațiile de mesagerie deschid singure linkurile); anularea cere apăsarea butonului.

## 7. Loguri

- [x] Logurile aplicației nu conțin nume, telefoane sau IP-uri: doar tipul erorii.
- [x] Better Auth: doar erori, fără detaliile atașate, cu numerele lungi mascate. Telemetria e oprită.
- [x] Scriptul de ștergere automată scrie doar numere (câte rânduri s-au șters).

## 8. GDPR

- [x] Politica de confidențialitate generată din datele firmei fiecărui service (operator), cu Propheet AIgency ca persoană împuternicită; pomenește protecția anti-abuz, Cloudflare Turnstile (doar când e activ), cookie-urile și durata păstrării.
- [ ] **Jurist:** textele legale (politica de confidențialitate, textul bifei de acord) trebuie verificate de un jurist înainte de lansare. Puncte de verificat: temeiul legal (executarea serviciului vs. consimțământ), transferul de date către Cloudflare (SUA), lista persoanelor împuternicite (Propheet AIgency, OVHcloud, Cloudflare), contractul de persoană împuternicită dintre SC DANI ROCA SRL și Propheet AIgency.
- [x] Subsol cu datele firmei pe paginile publice.
- [x] Export CSV al programărilor și clienților (panou → Meniu → Datele clienților). Fiecare export se notează în istoric.
- [x] Ștergerea datelor unui client la cerere: nume, telefon, nr. de înmatriculare și observații șterse definitiv; programările viitoare anulate; linkurile personale oprite; programările rămân anonime în statistici.
- [x] Ștergere automată: programările mai vechi decât perioada setată (implicit 24 de luni, editabilă în „Datele firmei”) + clienții rămași fără programări + sesiuni și linkuri expirate (`npm run gdpr:retention`, se poate rula de mai multe ori).
- [ ] **Faza 7:** programarea zilnică a ștergerii automate (task programat în Coolify). Până atunci, pagina din panou promite o ștergere care nu rulează încă singură.
- [ ] **Vlad / patron:** confirmarea perioadei de păstrare (24 de luni).
- [x] Fără marketing și fără SMS (decizia din 22.10.2026): nu se colectează acord de marketing.

## 9. Dependențe (`npm audit`, 22.10.2026)

- [x] Dependențe puține, versiuni fixate exact în `package.json`.
- Rămase, fără impact în producție:
  - `esbuild` ≤ 0.24.2 (moderat), prin `drizzle-kit`: afectează doar serverul de dezvoltare al esbuild, pe care nu-l folosim. `drizzle-kit` e unealta de migrări; nu rulează în aplicație.
  - `braces` (ridicat), prin `eslint-config-next`: doar în verificarea codului (lint), pe tiparele noastre de fișiere. Nu există încă o versiune reparată.
- [ ] **Faza 7:** imaginea Docker de producție nu include uneltele de dezvoltare; `npm audit --omit=dev` din nou înainte de lansare.

## 10. Producție și backup (Faza 7)

- [ ] VPS securizat: actualizări, utilizator non-root, SSH doar cu cheie, firewall doar 22/80/443, fail2ban, actualizări automate de securitate.
- [ ] HTTPS prin Let's Encrypt (Coolify). HSTS e deja activ în producție.
- [ ] Datele doar pe serverul din UE (VPS OVH).
- [ ] Backup zilnic criptat al bazei de date în afara serverului, păstrat 30 de zile, cu test de restaurare documentat. Backup și pentru folderul `storage/` (poza fațadei).
- [ ] Migrările rulează controlat la deploy.
- [ ] Monitorizare: `/api/health` (nu dezvăluie informații sensibile).
