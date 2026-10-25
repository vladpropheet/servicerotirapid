# Ghid de producție: VPS OVH (lângă n8n) + Caddy + backup

> **Adresa aplicației:** `https://programari.n8n-propheetai.xyz` (din 25.10.2026). Adresa veche, `rotirapid.n8n-propheetai.xyz`, trimite automat la cea nouă, cu aceeași cale, deci linkurile vechi merg în continuare.

Ghid pas cu pas pentru punerea aplicației pe internet. Fiecare pas spune **unde** rulezi comanda, **ce face** și **cum arată un rezultat corect**. Dacă ceva arată altfel, oprește-te și trimite-mi exact ce vezi.

> **Reguli de siguranță pe tot parcursul**
> - Nu închide sesiunea SSH deschisă până nu ai verificat că o sesiune **nouă** merge. Așa nu rămâi blocat pe dinafară.
> - Dacă totuși rămâi blocat: panoul OVH → VPS-ul tău → **KVM** (consola din browser) te lasă să intri oricum.
> - Parolele, cheile și fișierul `.env` de pe server nu ajung niciodată în chat, email sau Git. Le ții în managerul de parole (Bitwarden, 1Password etc.).
> - n8n nu se atinge, cu o excepție: adăugăm un bloc la configurația Caddy (cu copie de siguranță înainte).

## Cum arată totul pe server (decizia din 23.10.2026: fără Coolify)

```
Internet ──HTTPS──> Caddy (din /opt/n8n-docker, porturile 80/443, certificate Let's Encrypt automate)
                     ├──> n8n, cal-webhook-gateway          (neschimbate)
                     └──> app  (aplicația de programări, contul app_user, supus Row-Level Security)
                            │  rețea internă proprie, invizibilă pentru restul serverului
                          db   (PostgreSQL 16, fără port public)
                            ▲
                          ops  (migrări la fiecare pornire, backup criptat, ștergere automată)
                            └──> backup criptat: local (7 zile) + în afara serverului (30 de zile)
```

Totul e descris în [docker-compose.prod.yml](../docker-compose.prod.yml), [Dockerfile](../Dockerfile) și [docker/server/](../docker/server/). Aplicația stă în `/opt/servicerotirapid`, lângă `/opt/n8n-docker`.

**Termeni noi:**
- **SSH**: conexiunea securizată prin care dai comenzi serverului din PowerShell.
- **Cheie SSH**: o pereche de fișiere. Cea **privată** rămâne pe PC-ul tău, cea **publică** se pune pe server. Înlocuiește parola la logare.
- **Container**: un program izolat, cu tot ce-i trebuie, pornit de Docker.
- **Variabilă de mediu**: o setare (ex. o parolă) dată aplicației la pornire, din afara codului. Pe server stau în `/opt/servicerotirapid/.env`.
- **Deploy**: serverul ia codul din GitHub, construiește aplicația și o (re)pornește.
- **Cron**: programul care rulează comenzi singur, la ore fixe (backup, ștergere automată).

## Ce știm deja despre server (verificat pe 23.10.2026)

| | |
|---|---|
| Locație | Varșovia (UE) |
| Sistem | Ubuntu 24.04.5 LTS |
| Memorie / disc | 3,7 GB RAM + 2 GB swap / 22 GB liberi |
| Rulează | n8n (+ task runners, Postgres, cal-webhook-gateway), Caddy pe 80/443, Evolution API pe 8080 |
| Firewall (ufw) | activ: 22, 80, 443, 8080 |
| SSH | `passwordauthentication yes` (de închis), `permitrootlogin no` (bine) |

---

## Partea A — pe PC-ul tău

### A1. O cheie SSH nouă (cea veche cere o parolă pe care nu o mai știi)

1. **Unde:** PowerShell pe Windows.
   ```
   ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\id_ed25519_vps -C "vlad-pc"
   ```
   **Ce face:** creează o cheie SSH nouă. Îți cere o **parolă pentru cheie** de două ori (nu apare pe ecran). Salveaz-o **întâi** în managerul de parole, apoi tasteaz-o.
   **Rezultat corect:** `Your identification has been saved in C:\Users\VLAD\.ssh\id_ed25519_vps`.
2. **Unde:** PowerShell.
   ```
   type $env:USERPROFILE\.ssh\id_ed25519_vps.pub | ssh ubuntu@51.83.185.231 "cat >> ~/.ssh/authorized_keys"
   ```
   **Ce face:** pune cheia publică pe server. Îți cere parola serverului (ultima dată).
   **Rezultat corect:** nicio eroare.
3. **Verificare (unde:** PowerShell, fereastră nouă**):**
   ```
   ssh -i $env:USERPROFILE\.ssh\id_ed25519_vps ubuntu@51.83.185.231
   ```
   **Rezultat corect:** îți cere **parola cheii** (`Enter passphrase for key`), nu parola serverului, și intri.

### A2. Repo GitHub privat

1. **Unde:** github.com → **New repository**. Nume `servicerotirapid`, **Private**, fără README / .gitignore / licență. → **Create repository**.
2. **Unde:** PowerShell, în folderul proiectului (`C:\Users\VLAD\Documents\ClaudeProjects\servicerotirapid`).
   ```
   git remote add origin https://github.com/NUMELE-TAU/servicerotirapid.git
   ```
   **Ce face:** spune lui Git unde e copia de pe GitHub („remote”). **Rezultat corect:** nicio ieșire.
3. Când îmi spui, îmbin Faza 7 în `main`; apoi urci codul:
   ```
   git push -u origin main
   ```
   **Rezultat corect:** `branch 'main' set up to track 'origin/main'`. Prima dată se deschide browserul pentru logarea în GitHub. Repo-ul nu conține secrete (verificat, vezi [securitate.md](securitate.md)).

---

## Partea B — serverul

Toate comenzile din partea B le rulezi **pe server**, în sesiunea SSH (`ssh -i $env:USERPROFILE\.ssh\id_ed25519_vps ubuntu@51.83.185.231`).

### B1. Actualizări și securizare

> **Atenție:** pasul 1 repornește serverul, deci **n8n se oprește cam un minut**. Alege o oră fără automatizări importante.

1. ```
   sudo apt update && sudo apt full-upgrade -y && sudo reboot
   ```
   **Ce face:** instalează cele 26 de actualizări și repornește serverul. Conexiunea se închide.
   **Rezultat corect:** după un minut te reconectezi; mesajul de bun venit nu mai spune `System restart required`, iar `docker ps` arată containerele n8n pornite (`Up`).
2. **Logarea doar cu cheie** (doar după ce A1 merge!):
   ```
   echo "PasswordAuthentication no
   KbdInteractiveAuthentication no" | sudo tee /etc/ssh/sshd_config.d/00-securizare.conf && sudo sshd -t && sudo systemctl restart ssh && sudo sshd -T | grep -E "^(passwordauthentication|permitrootlogin)"
   ```
   **Ce face:** oprește logarea cu parolă. Numele `00-...` face ca setarea să aibă prioritate.
   **Rezultat corect:** `passwordauthentication no` și `permitrootlogin no`. Apoi, **într-o fereastră nouă**, verifici că intri cu cheia. Abia după asta închizi sesiunea veche.
3. **Fail2ban:**
   ```
   sudo apt install -y fail2ban && sudo systemctl enable --now fail2ban && sudo fail2ban-client status sshd
   ```
   **Ce face:** blochează temporar IP-urile care încearcă des logări greșite. **Rezultat corect:** `Status for the jail: sshd`.
4. **Actualizări automate de securitate:**
   ```
   sudo apt install -y unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades
   ```
   Pe ecranul albastru alegi **Yes**. **Rezultat corect:** `cat /etc/apt/apt.conf.d/20auto-upgrades` arată două linii cu `"1"`.
5. **Firewall:** e deja activ (22, 80, 443, 8080). Aplicația nu are nevoie de alte porturi. Portul 8080 (Evolution API) îl discutăm separat.

### B2. Subdomeniul (DNS)

1. Alegi subdomeniul aplicației, de exemplu `programari.n8n-propheetai.xyz`.
2. **Unde:** la firma unde e administrat domeniul (secțiunea DNS). Adaugi:
   - înregistrare **A**: `programari` → `51.83.185.231`;
   - înregistrare **AAAA**: `programari` → `2001:41d0:601:1100::6844`.
3. **Verificare (unde:** PowerShell pe PC**):** `Resolve-DnsName programari.n8n-propheetai.xyz`. **Rezultat corect:** apar cele două adrese (poate dura de la câteva minute la câteva ore).

### B3. Codul pe server (cheie GitHub doar pentru citire)

1. ```
   ssh-keygen -t ed25519 -f ~/.ssh/github_servicerotirapid -N "" -C "vps-deploy" && cat ~/.ssh/github_servicerotirapid.pub
   ```
   **Ce face:** creează pe server o cheie cu care serverul poate **doar citi** repo-ul. Afișează partea publică (o linie `ssh-ed25519 ...`).
2. **Unde:** github.com → repo-ul `servicerotirapid` → **Settings** → **Deploy keys** → **Add deploy key**. Titlu `VPS`, lipești linia, **nu** bifezi „Allow write access”. → **Add key**.
3. ```
   printf 'Host github-servicerotirapid\n  HostName github.com\n  User git\n  IdentityFile ~/.ssh/github_servicerotirapid\n  IdentitiesOnly yes\n' >> ~/.ssh/config && chmod 600 ~/.ssh/config && sudo mkdir -p /opt/servicerotirapid && sudo chown ubuntu:ubuntu /opt/servicerotirapid && git clone git@github-servicerotirapid:NUMELE-TAU/servicerotirapid.git /opt/servicerotirapid
   ```
   **Ce face:** spune lui SSH ce cheie să folosească pentru GitHub, creează folderul și descarcă codul.
   **Rezultat corect:** la prima conexiune scrii `yes`, apoi `Receiving objects: 100%`.

### B4. Fișierul cu secrete (.env)

1. ```
   cd /opt/servicerotirapid && sh docker/server/generate-env.sh https://programari.n8n-propheetai.xyz
   ```
   **Ce face:** creează `.env` cu parole și chei aleatorii de 64 de caractere. Nu le afișează și nu suprascrie un `.env` existent.
   **Rezultat corect:** `Am creat .env (doar proprietarul îl poate citi).`
2. Până ai cheile Cloudflare (B9), oprești conștient verificarea anti-robot:
   ```
   sed -i 's/^#TURNSTILE_DISABLED=1/TURNSTILE_DISABLED=1/' .env
   ```
   Limitele de cereri pe IP și pe telefon rămân active.
3. **Copie de siguranță a `.env`:** `cat .env`, copiezi tot în managerul de parole (notă „servicerotirapid .env”). Fără el, backup-urile bazei de date se pot restaura, dar parolele trebuie refăcute.

### B5. Prima pornire

```
sh docker/server/deploy.sh
```
**Ce face:** construiește imaginile (prima dată durează câteva minute; n8n merge mai departe) și pornește `db` → `ops` (aplică migrările) → `app`.
**Rezultat corect:** la final, un tabel cu `app`, `db`, `ops` toate `Up ... (healthy)`.
**Dacă `app` nu pornește:** `docker compose -f docker-compose.prod.yml logs app` arată motivul (de exemplu `Pornire oprită: Lipsesc TURNSTILE_SITE_KEY...`).

### B6. Caddy: adresa publică și HTTPS

> **Atenție:** modificăm configurația Caddy, care servește și n8n. Facem întâi o copie, verificăm fișierul înainte de aplicare, iar reîncărcarea nu oprește n8n.

1. ```
   sudo cp /opt/n8n-docker/caddy_config/Caddyfile /opt/n8n-docker/caddy_config/Caddyfile.inainte-de-programari
   ```
   **Ce face:** copie de siguranță a configurației actuale.
2. ```
   sudo nano /opt/n8n-docker/caddy_config/Caddyfile
   ```
   Mergi la final (după ultima acoladă `}`), lași un rând liber și adaugi blocul din [docker/server/Caddyfile.snippet](../docker/server/Caddyfile.snippet), cu domeniul tău:
   ```
   programari.n8n-propheetai.xyz {
   	reverse_proxy servicerotirapid-app:3000 {
   		header_up X-Real-IP {remote_host}
   	}
   }
   ```
   Salvezi cu `Ctrl+O`, Enter, ieși cu `Ctrl+X`.
3. ```
   docker exec n8n-docker-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile && docker exec n8n-docker-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
   ```
   **Ce face:** verifică noua configurație și, doar dacă e corectă, o aplică fără să oprească n8n.
   **Rezultat corect:** `Valid configuration`, apoi nicio eroare.
   **Dacă apare o eroare:** nu se aplică nimic. Pui copia înapoi: `sudo cp /opt/n8n-docker/caddy_config/Caddyfile.inainte-de-programari /opt/n8n-docker/caddy_config/Caddyfile` și îmi trimiți mesajul.
4. **Verificare (unde:** PowerShell pe PC**):**
   ```
   curl.exe -s https://programari.n8n-propheetai.xyz/api/health
   ```
   **Rezultat corect:** `{"status":"ok"}` (prima cerere poate dura câteva secunde: Caddy cere certificatul). Verifică și că n8n merge în continuare la adresa lui.
5. **Dacă Caddy nu „vede” blocul nou** (așa s-a întâmplat pe 24.10.2026): `docker exec n8n-docker-caddy-1 tail -7 /etc/caddy/Caddyfile` nu arată blocul, deși e în fișierul de pe server. Cauza: containerul e legat de o versiune veche a fișierului. Verifici întâi că singura diferență e blocul nou:
   ```
   docker exec n8n-docker-caddy-1 cat /etc/caddy/Caddyfile | sudo diff - /opt/n8n-docker/caddy_config/Caddyfile.inainte-de-programari && echo IDENTIC
   ```
   Doar dacă afișează `IDENTIC`, recreezi containerul Caddy (n8n e inaccesibil câteva secunde):
   ```
   cd /opt/n8n-docker && docker compose up -d --force-recreate --no-deps caddy
   ```
   > **Atenție:** în `/opt/n8n-docker` nu rula niciodată `--remove-orphans`. Docker afișează un avertisment despre `task-runners` și `cal-webhook-gateway`, iar opțiunea aceea le-ar șterge (automatizările s-ar opri).

### B7. Datele de pornire și conturile

1. ```
   docker exec servicerotirapid-ops-1 seed.sh
   ```
   **Rezultat corect:** `Am creat service-ul „roti-rapid”: 32 servicii...`.
2. ```
   docker exec servicerotirapid-ops-1 create-user.sh --rol patron --service roti-rapid --telefon "0766 777 130" --nume "Patron"
   ```
   **Ce face:** contul patronului, cu o **parolă temporară afișată o singură dată**. I-o dai personal (nu prin SMS sau email); la prima logare trebuie s-o schimbe.
3. ```
   docker exec servicerotirapid-ops-1 create-user.sh --rol superadmin --telefon "07xx xxx xxx" --nume "Vlad"
   ```
   Contul tău. Te loghezi pe `https://programari.n8n-propheetai.xyz/admin/login`, schimbi parola și activezi verificarea în doi pași.
4. **Parolă uitată sau predarea contului către patron:**
   ```
   docker exec servicerotirapid-ops-1 reset-password.sh --telefon "0766 777 130"
   ```
   Afișează o parolă temporară nouă, o singură dată, și deconectează contul de pe toate dispozitivele. La logare se cere o parolă nouă.

### B8. Backup criptat și task-urile zilnice

1. **Cheia de criptare (o singură dată):**
   ```
   cd /opt/servicerotirapid && sh docker/server/setup-backup-key.sh
   ```
   Generează cheia, afișează **o singură dată** cheia privată (linia `AGE-SECRET-KEY-1...`) și salvează singur cheia publică în `.env`. Cheia privată o copiezi imediat în managerul de parole (notă „Backup servicerotirapid – cheie privată”); pe server nu rămâne. **Fără ea, backup-urile nu pot fi deschise de nimeni.** Scriptul refuză să înlocuiască o cheie existentă.
2. **Primul backup:**
   ```
   docker exec servicerotirapid-ops-1 backup.sh
   ```
   **Rezultat corect:** `Backup local: db-....dump.age (... KB), fisiere-....tar.gz.age (... KB).` Până alegi stocarea externă apare și `ATENȚIE: ... doar pe acest server`.
3. **Testul de restaurare (obligatoriu):**
   ```
   docker exec -it servicerotirapid-ops-1 restore-test.sh
   ```
   Lipești cheia privată (nu apare pe ecran) și Enter. Restaurează cel mai nou backup într-o bază **temporară**, afișează ce conține, apoi o șterge. Baza reală nu e atinsă.
   **Rezultat corect:** un tabel cu service-uri, servicii, programări, clienți și `Test de restaurare REUȘIT`. Notezi rezultatul în jurnalul de la final.
4. **Task-urile zilnice (cron):**
   ```
   sudo cp /opt/servicerotirapid/docker/server/cron /etc/cron.d/servicerotirapid && sudo chmod 644 /etc/cron.d/servicerotirapid
   ```
   **Ce face:** în fiecare noapte rulează ștergerea datelor vechi (02:00 UTC) și backup-ul (02:30 UTC).
   **Verificare a doua zi:** `sudo tail -n 5 /var/log/servicerotirapid.log` arată `Ștergere automată gata...` și `Backup local: ...`.
5. **Copia în afara serverului (când alegi furnizorul):** ghid separat, pas cu pas, în [backup-extern.md](backup-extern.md) (OVH Object Storage, cost estimat sub 0,10 €/lună).
   **Rezultat corect:** `Copie în afara serverului: gata (...)`. Copiile mai vechi de 30 de zile se șterg singure.

### B9. Cloudflare Turnstile (anti-spam, gratuit)

1. Cont gratuit pe cloudflare.com → **Turnstile** → **Add widget**. Hostname: `programari.n8n-propheetai.xyz`, mod **Managed**.
2. În `/opt/servicerotirapid/.env`: completezi `TURNSTILE_SITE_KEY` și `TURNSTILE_SECRET_KEY` și pui `#` în fața liniei `TURNSTILE_DISABLED=1`.
3. `cd /opt/servicerotirapid && docker compose -f docker-compose.prod.yml up -d`
4. **Rezultat corect:** o programare de test merge; în politica de confidențialitate apare paragraful despre Cloudflare.

### B10. Verificări finale

| Ce | Cum | Rezultat corect |
|---|---|---|
| HTTPS | `https://programari.n8n-propheetai.xyz/roti-rapid` pe telefon | lacăt, pagina de programare |
| Header-e de securitate | PowerShell: `curl.exe -sI https://programari.n8n-propheetai.xyz/roti-rapid` | `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options: DENY` |
| Baza de date închisă | PowerShell: `Test-NetConnection 51.83.185.231 -Port 5432` | `TcpTestSucceeded : False` |
| Programare de test | o faci de pe telefon, apoi o anulezi din link | confirmare, apoi „Programarea a fost anulată” |
| Panou | logare patron, „Azi” / „Mâine” | programarea de test apare |
| n8n | adresa n8n | merge ca înainte |
| Backup de noapte | `sudo tail /var/log/servicerotirapid.log` | `Backup local: ...` |

---

## Partea C — după lansare

### Un deploy nou (o versiune nouă a aplicației)
1. Codul nou ajunge în `main` pe GitHub (doar cu acordul tău).
2. Pe server: `cd /opt/servicerotirapid && sh docker/server/deploy.sh`.
   Containerul `ops` aplică singur migrările noi **înainte** ca aplicația nouă să pornească. Migrările doar adaugă (nu șterg date) și rulează fiecare într-o tranzacție: dacă una eșuează, nu se aplică nimic, aplicația nouă nu pornește, iar `docker compose -f docker-compose.prod.yml logs ops` arată eroarea.
3. În timpul deploy-ului aplicația poate fi indisponibilă câteva secunde.

### Restaurare în caz de dezastru

> **Atenție:** restaurarea **înlocuiește** baza de date. Tot ce s-a salvat după momentul backup-ului se pierde. Se folosește doar dacă datele actuale sunt stricate sau pierdute.

1. Alegi backup-ul: `docker exec servicerotirapid-ops-1 ls -l /backups` sau, dacă serverul e nou, îl descarci din copia externă:
   ```
   docker exec servicerotirapid-ops-1 sh -c 's3.sh ls "extern:$BACKUP_S3_BUCKET/servicerotirapid"'
   docker exec servicerotirapid-ops-1 sh -c 's3.sh copy "extern:$BACKUP_S3_BUCKET/servicerotirapid/db-DATA.dump.age" /backups'
   ```
2. ```
   docker exec -it servicerotirapid-ops-1 restore-db.sh /backups/db-DATA.dump.age
   ```
   Cere confirmarea `DA` și cheia privată. Blochează câteva secunde aplicația, restaurează totul într-o singură tranzacție (dacă eșuează, baza rămâne cum era) și redeschide aplicația.
3. Pozele, dacă e nevoie: `docker exec -it servicerotirapid-ops-1 restore-files.sh /backups/fisiere-DATA.tar.gz.age`.
4. Verifici în panou că datele sunt cele așteptate.

Testat pe calculatorul de dezvoltare (22.10.2026): o modificare făcută după backup a dispărut după restaurare, iar aplicația a mers mai departe fără repornire.

### Jurnalul testelor de restaurare

| Data | Backup testat | Rezultat (service-uri / programări / clienți) | Cine |
|---|---|---|---|
| 22.10.2026 | backup de test, pe PC (Docker) | REUȘIT (1 / 1 / 1) | Claude, la construirea Fazei 7 |
| 25.10.2026 | primul backup de pe server (VPS OVH), cu cheia din managerul de parole | REUȘIT (1 / 0 / 0) | Vlad |
| | | | |

### De discutat separat (nu ține de aplicație)
- **Evolution API** e publicat direct pe portul 8080 (IPv4 și IPv6), fără HTTPS. Porturile publicate de Docker ocolesc `ufw`, deci regula din firewall nu-l poate închide. Variantă: îl pui în spatele lui Caddy (cu HTTPS) și îl legi doar la `127.0.0.1`.

---

## Partea D – documente pentru predare

- [ghid-patron.md](ghid-patron.md): cum folosește patronul panoul (de dat la predare).
- [intrebari-patron.md](intrebari-patron.md): valorile „de verificat” (prețuri, durate, program), de parcurs cu patronul.
- [backup-extern.md](backup-extern.md): copia backup-ului în afara serverului.
- [evolution-api.md](evolution-api.md): portul 8080 deschis de Evolution API (nu ține de aplicație).
- [securitate.md](securitate.md): lista de verificare a securității, cu ce e făcut și ce rămâne.

### Predarea către patron
1. Parola temporară nouă pentru contul lui (din PowerShell pe PC):
   ```
   ssh vps "docker exec servicerotirapid-ops-1 reset-password.sh --telefon '0766 777 130'"
   ```
   I-o dai personal. Parola ta de test nu mai merge din acest moment.
2. El intră pe telefonul lui, își alege parola și instalează aplicația (ghid-patron.md, §1).
3. Îi arăți **Azi**, **Adaugă**, **Zile libere și ore blocate** și **Contul meu**.

