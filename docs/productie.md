# Ghid de producție: VPS OVH + Coolify + backup

Ghid pas cu pas pentru punerea aplicației pe internet. Fiecare pas spune **unde** rulezi comanda, **ce face** și **cum arată un rezultat corect**. Dacă ceva arată altfel, oprește-te și trimite-mi exact ce vezi.

> **Reguli de siguranță pe tot parcursul**
> - Nu închide sesiunea SSH deschisă până nu ai verificat că o sesiune **nouă** merge. Așa nu rămâi blocat pe dinafară.
> - Dacă totuși rămâi blocat: panoul OVH → VPS-ul tău → **KVM** (consola din browser) te lasă să intri oricum.
> - Parolele, cheile și fișierele cu secrete merg doar în managerul tău de parole (Bitwarden, 1Password etc.), niciodată în chat, email sau Git.

## Cum arată totul pe server

```
Internet ──HTTPS──> Traefik (proxy-ul Coolify, porturile 80/443)
                        │
                        ▼
              app  (aplicația, contul app_user, supus Row-Level Security)
                        │  rețea internă Docker, fără porturi publice
              db   (PostgreSQL 16)
                        ▲
              ops  (migrări la fiecare deploy, backup criptat, ștergere automată)
                        │
                        └──> backup criptat: local (7 zile) + în afara serverului (30 de zile)
```

Totul e descris în [docker-compose.prod.yml](../docker-compose.prod.yml) și [Dockerfile](../Dockerfile). Coolify construiește imaginile din GitHub și le pornește.

**Termeni noi:**
- **SSH**: conexiunea securizată prin care dai comenzi serverului din PowerShell.
- **Cheie SSH**: o pereche de fișiere. Cea **privată** rămâne pe PC-ul tău, cea **publică** se pune pe server. Înlocuiește parola la logare.
- **Container**: un program izolat, cu tot ce-i trebuie, pornit de Docker.
- **Variabilă de mediu**: o setare (ex. o parolă) dată aplicației la pornire, din afara codului. În producție le pui doar în Coolify.
- **Deploy**: Coolify ia codul din GitHub, construiește aplicația și o pornește.

---

## Partea A — pe PC-ul tău

### A1. Cheia SSH

1. **Unde:** PowerShell pe Windows.
   ```
   ssh-keygen -t ed25519 -C "vlad-pc"
   ```
   **Ce face:** creează cheia SSH. Apasă Enter la locul fișierului (implicit `C:\Users\VLAD\.ssh\id_ed25519`), apoi alege o **parolă pentru cheie** (o tastezi de două ori, nu apare pe ecran).
   **Rezultat corect:** `Your identification has been saved in C:\Users\VLAD/.ssh/id_ed25519` și o „imagine” din caractere.
2. Fișierul `id_ed25519` (fără `.pub`) **nu se trimite nimănui**. Fișierul `id_ed25519.pub` e cel public.

### A2. Repo GitHub privat

1. **Unde:** github.com, logat în contul tău → **New repository**.
   Nume: `servicerotirapid`, vizibilitate **Private**, fără README / .gitignore / licență (le avem deja). → **Create repository**.
2. **Unde:** PowerShell, în folderul proiectului (`C:\Users\VLAD\Documents\ClaudeProjects\servicerotirapid`).
   ```
   git remote add origin https://github.com/NUMELE-TAU/servicerotirapid.git
   ```
   **Ce face:** spune lui Git unde e repo-ul de pe GitHub („remote” = copia de pe internet). Înlocuiește `NUMELE-TAU`.
   **Rezultat corect:** nicio ieșire.
3. Push-ul (trimiterea codului pe GitHub) îl facem **împreună, când îmi spui**, după ce ultima fază e îmbinată în `main`:
   ```
   git push -u origin main
   ```
   **Ce face:** urcă ramura `main` pe GitHub. Prima dată se deschide browserul pentru logarea în GitHub.
   **Rezultat corect:** `branch 'main' set up to track 'origin/main'`.
   Repo-ul nu conține secrete: `.env` e exclus, iar istoricul a fost verificat (vezi [securitate.md](securitate.md)).

---

## Partea B — serverul

### B0. Verificare (doar citire, nu modifică nimic)

1. **Unde:** panoul OVH → VPS-ul tău. Notează **IP-ul**, **sistemul de operare** și **locația** (trebuie să fie în UE, ex. Gravelines, Strasbourg, Varșovia, Frankfurt).
2. **Unde:** PowerShell.
   ```
   ssh ubuntu@IP-UL-VPS
   ```
   **Ce face:** te conectează la server. Utilizatorul e cel din emailul OVH de livrare (de obicei `ubuntu`).
   **Rezultat corect:** un prompt de forma `ubuntu@vps-xxxx:~$`.
3. **Unde:** în aceeași fereastră (acum ești pe server). Rulează pe rând și **trimite-mi tot ce afișează**:
   ```
   lsb_release -ds
   free -h
   df -h /
   sudo ss -tlnp
   sudo docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}"
   ```
   **Ce face:** arată versiunea sistemului, memoria, spațiul pe disc, ce programe ascultă pe porturi și ce containere Docker rulează (aici vedem cum e instalat n8n).
   **Rezultat corect:** text cu informații. Dacă ultima comandă spune `command not found`, Docker nu e instalat (n8n rulează altfel); trimite-mi și asta.

**Aici te oprești.** Pe baza rezultatului decidem pasul B1.

### B1. Ce facem cu n8n (decidem după B0)

Coolify are nevoie de porturile 80 și 443. Documentația Coolify recomandă un server curat, fără alte aplicații. Variantele:

| Variantă | Pro | Contra |
|---|---|---|
| **Mut n8n în Coolify** (Coolify are n8n gata configurat) | Un singur server; HTTPS automat și pentru n8n; totul administrat din același panou. | O mutare de făcut atent: backup n8n înainte, păstrarea cheii de criptare n8n, n8n oprit câteva minute. |
| **VPS separat pentru aplicație** | Zero risc pentru n8n; server curat, cum recomandă Coolify. | Cost lunar în plus pentru încă un VPS (îl verificăm în panoul OVH înainte să decizi). |
| **Coolify alături de n8n, fără mutare** | Nimic de mutat. | Merge doar dacă n8n **nu** folosește porturile 80/443. Vedem asta în B0. |

Îți dau pașii exacți pentru varianta aleasă.

### B2. Securizarea serverului

> **Atenție:** pașii 4–6 schimbă modul de logare. Păstrează sesiunea SSH deschisă până la verificarea din pasul 6.

1. **Unde:** server (SSH).
   ```
   sudo apt update && sudo apt full-upgrade -y
   ```
   **Ce face:** instalează actualizările de securitate. **Rezultat corect:** se termină fără `E:` (erori). Dacă scrie că e nevoie de restart: `sudo reboot`, aștepți un minut și te reconectezi.
2. **Utilizator non-root:** pe OVH lucrezi deja cu `ubuntu` (are `sudo`), iar `root` e dezactivat pentru logarea cu parolă. Nu e nimic de creat.
3. **Unde:** PowerShell pe PC (o fereastră **nouă**, nu cea cu serverul).
   ```
   type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh ubuntu@IP-UL-VPS "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
   ```
   **Ce face:** copiază cheia publică pe server. Îți cere parola serverului o ultimă dată.
   **Rezultat corect:** nicio eroare. Apoi `ssh ubuntu@IP-UL-VPS` îți cere **parola cheii** (cea din A1), nu parola serverului.
4. **Unde:** server.
   ```
   sudo nano /etc/ssh/sshd_config.d/00-securizare.conf
   ```
   **Ce face:** deschide un fișier nou de setări SSH. Numele începe cu `00-` ca să aibă prioritate față de setările implicite. Scrie în el exact:
   ```
   PubkeyAuthentication yes
   PasswordAuthentication no
   KbdInteractiveAuthentication no
   PermitRootLogin prohibit-password
   ```
   Salvezi cu `Ctrl+O`, Enter, ieși cu `Ctrl+X`.
   `PermitRootLogin prohibit-password`: root nu poate intra cu parolă, doar cu cheie. E necesar pentru Coolify, care se conectează la propriul server cu o cheie (documentația Coolify cere exact această setare).
5. **Unde:** server.
   ```
   sudo sshd -t && sudo systemctl restart ssh && sudo sshd -T | grep -E "^(passwordauthentication|permitrootlogin|pubkeyauthentication)"
   ```
   **Ce face:** verifică fișierul, repornește SSH și afișează setările active.
   **Rezultat corect:** `pubkeyauthentication yes`, `passwordauthentication no` și `permitrootlogin without-password` (sau `prohibit-password`; sunt două nume pentru aceeași setare).
6. **Unde:** PowerShell, fereastră nouă: `ssh ubuntu@IP-UL-VPS`. Dacă intri cu parola cheii, e bine; abia acum poți închide sesiunea veche.
7. **Firewall (unde:** server**):**
   ```
   sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 8000/tcp && sudo ufw --force enable && sudo ufw status
   ```
   **Ce face:** permite doar SSH (22), web (80, 443) și, temporar, panoul Coolify (8000). Restul e blocat.
   **Rezultat corect:** `Status: active` și cele patru reguli.
   **De știut:** porturile publicate de containerele Docker ocolesc `ufw`. De aceea aplicația noastră nu publică niciun port: totul trece prin proxy-ul Coolify, iar baza de date nu are port public. Portul 8000 al Coolify îl închidem în B4.
8. **Fail2ban (unde:** server**):**
   ```
   sudo apt install -y fail2ban && sudo systemctl enable --now fail2ban && sudo fail2ban-client status sshd
   ```
   **Ce face:** blochează temporar IP-urile care încearcă des parole/chei greșite pe SSH.
   **Rezultat corect:** `Status for the jail: sshd`.
9. **Actualizări automate de securitate (unde:** server**):**
   ```
   sudo apt install -y unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades
   ```
   **Ce face:** instalează singur actualizările de securitate. Pe ecranul albastru alegi **Yes**.
   **Rezultat corect:** `cat /etc/apt/apt.conf.d/20auto-upgrades` arată două linii cu `"1"`.

### B3. Domeniul (DNS)

1. Alegem subdomeniile, de exemplu `programari.DOMENIU` (aplicația) și `coolify.DOMENIU` (panoul Coolify).
2. **Unde:** la firma unde e administrat domeniul Propheet AIgency (secțiunea DNS). Adaugi două înregistrări **A** cu valoarea **IP-ul VPS-ului**: una pentru `programari`, una pentru `coolify`.
3. **Unde:** PowerShell.
   ```
   Resolve-DnsName programari.DOMENIU
   ```
   **Rezultat corect:** apare IP-ul VPS-ului (poate dura de la câteva minute la câteva ore).

### B4. Instalarea Coolify (după decizia din B1)

1. **Unde:** server.
   ```
   curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
   ```
   **Ce face:** scriptul oficial Coolify instalează Docker (dacă lipsește) și Coolify.
   **Rezultat corect:** la final un mesaj „Congratulations” cu adresa `http://IP-UL-VPS:8000`.
2. **Imediat**, în browser: `http://IP-UL-VPS:8000` → creezi contul de administrator (email-ul tău, parolă lungă, salvată în managerul de parole). **Primul care ajunge pe pagină devine administrator**, de aceea nu amâni.
3. **Unde:** server. Salvează secretele instalării:
   ```
   sudo cat /data/coolify/source/.env
   ```
   Copiezi tot conținutul în managerul de parole (o notă „Coolify .env”). Fără el, Coolify nu poate fi restaurat.
4. **Unde:** panoul Coolify → **Settings** → domeniul instanței: `https://coolify.DOMENIU`. Salvezi și verifici că `https://coolify.DOMENIU` se deschide cu lacăt (HTTPS).
5. Abia după ce merge pe domeniu, închidem portul 8000 (unde: server):
   ```
   sudo nano /data/coolify/source/docker-compose.custom.yml
   ```
   Conținut:
   ```
   services:
     coolify:
       ports:
         - "127.0.0.1:8000:8080"
   ```
   Apoi:
   ```
   cd /data/coolify/source && sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.custom.yml config > /dev/null && curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash && sudo ufw delete allow 8000/tcp
   ```
   **Ce face:** verifică fișierul, reaplică instalarea cu panoul legat doar de server (accesibil numai prin domeniu), apoi scoate regula 8000 din firewall. Este metoda din documentația Coolify („Compose overrides”).
   **Rezultat corect:** `https://coolify.DOMENIU` merge, iar în PowerShell pe PC `Test-NetConnection IP-UL-VPS -Port 8000` arată `TcpTestSucceeded : False`.
   Porturile 6001 și 6002 (actualizări în timp real și terminalul din panou) rămân deschise, dar cer logarea în Coolify. Le putem închide ulterior din firewall-ul de rețea OVH (Edge Network Firewall), dacă vrei.

### B5. Aplicația în Coolify

1. **GitHub:** în Coolify, **+ New** → resursă din **repository privat (GitHub App)** → urmezi pașii care creează aplicația Coolify în contul tău GitHub și îi dai acces **doar** la repo-ul `servicerotirapid`. Ramura: `main`.
2. **Build pack:** **Docker Compose**. Docker Compose Location: `/docker-compose.prod.yml`. Salvezi.
3. **Environment Variables** (Coolify le creează singur din fișier):
   - `APP_BASE_URL` = `https://programari.DOMENIU` (fără `/` la final). **Obligatoriu.**
   - `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`: cheile din pasul B9.
   - `SERVICE_PASSWORD_64_POSTGRES`, `SERVICE_PASSWORD_64_APPUSER`, `SERVICE_BASE64_64_AUTH`, `SERVICE_BASE64_64_BOOKINGLINK`: **le generează Coolify** (parole și chei de 64 de caractere). Nu le schimba după primul deploy: `SERVICE_BASE64_64_BOOKINGLINK` invalidează linkurile clienților, iar parolele bazei de date sunt deja scrise în ea.
   - `BACKUP_*`: în pasul B7.
4. **Domains:** la serviciul **app**: `https://programari.DOMENIU:3000` (`:3000` spune proxy-ului pe ce port ascultă aplicația; vizitatorii folosesc adresa normală, fără port).
5. **Deploy automat la push:** recomand să-l lași **oprit**. Fiecare deploy în producție îl pornești tu, cu butonul **Deploy**.
6. **Deploy.** Primul durează câteva minute (construiește imaginile).
   **Rezultat corect:** în jurnalul de deploy apar, în ordine: `db` healthy → `ops` cu „Migrările au fost aplicate” → `app` healthy.
7. **Verificare (unde:** PowerShell**):**
   ```
   curl.exe -s https://programari.DOMENIU/api/health
   ```
   **Rezultat corect:** `{"status":"ok"}`. Apoi `https://programari.DOMENIU/roti-rapid` arată „Pagina nu există” (normal: încă nu am creat service-ul, pasul B6).

**Dacă aplicația nu pornește:** jurnalul `app` spune exact motivul, de exemplu `Pornire oprită: Lipsesc TURNSTILE_SITE_KEY...` (completezi cheile) sau `Lipsește APP_BASE_URL`.

### B6. Datele de pornire și conturile

**Unde:** Coolify → aplicația → **Terminal** → containerul **ops**.

1. ```
   seed.sh
   ```
   **Ce face:** creează service-ul `roti-rapid` din catalog (o singură dată; a doua rulare nu schimbă nimic).
   **Rezultat corect:** `Am creat service-ul „roti-rapid”: 32 servicii...`.
2. ```
   create-user.sh --rol patron --service roti-rapid --telefon "0766 777 130" --nume "Patron"
   ```
   **Ce face:** contul patronului, cu o **parolă temporară afișată o singură dată**. I-o dai patronului personal (nu prin SMS sau email); la prima logare e obligat s-o schimbe.
3. ```
   create-user.sh --rol superadmin --telefon "07xx xxx xxx" --nume "Vlad"
   ```
   Contul tău de super-admin. Te loghezi pe `https://programari.DOMENIU/admin/login`, schimbi parola și activezi verificarea în doi pași (cod din aplicația de autentificare de pe telefon).

### B7. Backup criptat

**Cheia de criptare (o singură dată).** Unde: terminalul containerului **ops**:
```
age-keygen
```
**Ce face:** afișează o pereche de chei. **Nu o salvează nicăieri.**
- Linia `AGE-SECRET-KEY-1...` = cheia **privată**. O copiezi în managerul de parole (notă „Backup servicerotirapid – cheie privată”) și, ideal, o printezi și o păstrezi în siguranță. **Fără ea, backup-urile nu pot fi deschise de nimeni, nici de tine.**
- Linia `# public key: age1...` = cheia **publică**. O pui în Coolify la `BACKUP_AGE_RECIPIENT` (fără `# public key: `), apoi **Redeploy**.

**Programarea zilnică.** Coolify → aplicația → **Scheduled Tasks** → **+ Add**, de două ori:

| Nume | Comandă | Frecvență | Container |
|---|---|---|---|
| Ștergere date vechi (GDPR) | `retention.sh` | `0 2 * * *` | `ops` |
| Backup criptat | `backup.sh` | `30 2 * * *` | `ops` |

Orele sunt în fusul orar al serverului (de obicei UTC; 02:00 UTC = 04:00 sau 05:00 în România).

**Primul backup + testul de restaurare (obligatoriu).** Unde: terminalul **ops**:
1. ```
   backup.sh
   ```
   **Rezultat corect:** `Backup local: db-....dump.age (... KB), fisiere-....tar.gz.age (... KB).` Până alegi stocarea externă apare și `ATENȚIE: ... doar pe acest server`.
2. ```
   restore-test.sh
   ```
   **Ce face:** cere cheia privată (lipești linia `AGE-SECRET-KEY-...`; nu apare pe ecran), restaurează cel mai nou backup într-o bază **temporară**, afișează ce conține, apoi o șterge. Baza reală nu e atinsă.
   **Rezultat corect:** un tabel cu numărul de service-uri, servicii, programări, clienți și `Test de restaurare REUȘIT`.
3. Notezi rezultatul în tabelul „Jurnalul testelor de restaurare” de la finalul acestui ghid. Repetă testul **o dată pe lună** și după orice schimbare de server.

**Copia în afara serverului (când alegi furnizorul).** În contul furnizorului (OVH Object Storage sau altul compatibil S3, într-o regiune din UE) creezi:
- un **bucket** privat (ex. `servicerotirapid-backup`),
- o **cheie de acces** (Access Key + Secret Key) cu drept doar pe acel bucket.

Apoi în Coolify completezi `BACKUP_S3_ENDPOINT` (adresa S3 dată de furnizor, cu `https://`), `BACKUP_S3_REGION`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` → **Redeploy** → în terminalul **ops**: `backup.sh`.
**Rezultat corect:** `Copie în afara serverului: gata (servicerotirapid-backup).` Copiile mai vechi de 30 de zile se șterg singure.

### B8. Verificări finale

| Ce | Cum | Rezultat corect |
|---|---|---|
| HTTPS | `https://programari.DOMENIU/roti-rapid` | lacăt în browser, pagina de programare |
| Header-e de securitate | PowerShell: `curl.exe -sI https://programari.DOMENIU/roti-rapid` | `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options: DENY` |
| Baza de date închisă | PowerShell: `Test-NetConnection IP-UL-VPS -Port 5432` | `TcpTestSucceeded : False` |
| Programare de test | o faci de pe telefon, apoi o anulezi din link | confirmare, apoi „Programarea a fost anulată” |
| Panou | logare patron, „Azi” / „Mâine” | programarea de test apare |
| IP-ul real al vizitatorilor | Coolify → Servers → localhost → Proxy → configurația | nu conține `forwardedHeaders.insecure` (altfel limitele anti-spam pot fi ocolite) |
| Backup | Scheduled Tasks → ultima execuție a `backup.sh` | Success |

### B9. Cloudflare Turnstile (anti-spam, gratuit)

1. Cont gratuit pe cloudflare.com → **Turnstile** → **Add widget**.
2. Hostname: `programari.DOMENIU`. Widget mode: **Managed**.
3. Copiezi **Site Key** în `TURNSTILE_SITE_KEY` și **Secret Key** în `TURNSTILE_SECRET_KEY` (Coolify) → **Redeploy**.
4. **Rezultat corect:** o programare de test merge; în politica de confidențialitate apare paragraful despre Cloudflare.

---

## Partea C — după lansare

### Un deploy nou (o versiune nouă a aplicației)
1. Codul nou ajunge în `main` pe GitHub (doar cu acordul tău).
2. Coolify → **Deploy**. Containerul `ops` aplică singur migrările noi **înainte** ca aplicația nouă să pornească. Migrările doar adaugă (nu șterg date) și rulează fiecare într-o tranzacție: dacă una eșuează, nu se aplică nimic, iar deploy-ul se oprește cu eroarea în jurnalul `ops`.
3. În timpul deploy-ului aplicația poate fi indisponibilă câteva secunde.

### Restaurare în caz de dezastru

> **Atenție:** restaurarea **înlocuiește** baza de date. Tot ce s-a salvat după momentul backup-ului se pierde. Se folosește doar dacă datele actuale sunt stricate sau pierdute.

**Unde:** terminalul containerului **ops**.
1. Alegi backup-ul: `ls -l /backups` (copiile locale) sau, dacă serverul e nou, îl descarci din copia externă:
   ```
   s3.sh ls "extern:$BACKUP_S3_BUCKET/servicerotirapid"
   s3.sh copy "extern:$BACKUP_S3_BUCKET/servicerotirapid/db-DATA.dump.age" /backups
   ```
2. ```
   restore-db.sh /backups/db-DATA.dump.age
   ```
   Cere confirmarea `DA` și cheia privată. Blochează câteva secunde aplicația, restaurează totul într-o singură tranzacție (dacă eșuează, baza rămâne cum era) și redeschide aplicația.
3. Pozele (dacă e nevoie): `restore-files.sh /backups/fisiere-DATA.tar.gz.age`.
4. Verifici în panou că datele sunt cele așteptate.

Testat pe calculatorul de dezvoltare (22.10.2026): o modificare făcută după backup a dispărut după restaurare, iar aplicația a mers mai departe fără repornire.

### Jurnalul testelor de restaurare

| Data | Backup testat | Rezultat (service-uri / programări / clienți) | Cine |
|---|---|---|---|
| 22.10.2026 | backup de test, pe PC (Docker) | REUȘIT (1 / 1 / 1) | Claude, la construirea Fazei 7 |
| | | | |
