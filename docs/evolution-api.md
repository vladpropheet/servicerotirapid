# Evolution API pe portul 8080 (nu ține de aplicația de programări)

**Ce am observat (23–25.10.2026):** containerul `evolution_api` e publicat direct pe internet, la `51.83.185.231:8080` (IPv4 și IPv6), **fără HTTPS**.
- Cine cunoaște adresa poate încerca să acceseze API-ul (protejat doar de cheia lui API), iar traficul, inclusiv cheia, circulă **necriptat**.
- Firewall-ul `ufw` nu îl poate opri: porturile publicate de Docker ocolesc `ufw`.

**Atenție:** Evolution API e folosit de automatizările tale (WhatsApp, n8n). O schimbare greșită le poate opri. De aceea nu modificăm nimic până nu știm exact cum e folosit.

## Pasul 1: aflăm cum e configurat (doar citire)

**Unde:** PowerShell pe PC.
```
ssh vps "docker inspect evolution_api --format 'proiect: {{index .Config.Labels \"com.docker.compose.project.working_dir\"}}{{println}}retele: {{range \$k, \$v := .NetworkSettings.Networks}}{{\$k}} {{end}}{{println}}porturi: {{json .HostConfig.PortBindings}}'"
```
**Ce face:** arată folderul cu configurația Evolution API, rețelele Docker la care e conectat și porturile publicate. Nu modifică nimic.

Apoi, în **n8n**, verifici ce adresă folosesc nodurile sau credențialele pentru Evolution API, de exemplu `http://51.83.185.231:8080`, `http://evolution_api:8080` sau alt domeniu.

**Trimite-mi** rezultatul comenzii și adresa folosită în n8n, **fără cheia API**.

## Pasul 2: variantele (alegem după pasul 1)

| Variantă | Ce se schimbă | Pro | Contra |
|---|---|---|---|
| **A. Doar intern** | Portul 8080 nu mai e publicat; n8n vorbește cu Evolution prin rețeaua Docker comună (`http://evolution_api:8080`) | Nimic expus pe internet | Merge doar dacă nimic din afara serverului nu trebuie să acceseze Evolution API |
| **B. În spatele lui Caddy, cu HTTPS** | Un subdomeniu nou (de ex. `evolution.n8n-propheetai.xyz`) prin Caddy, iar portul 8080 nu mai e publicat | Trafic criptat; merge și din afara serverului | Trebuie actualizată adresa în n8n și în alte locuri care folosesc Evolution |
| **C. Rămâne cum e** | nimic | zero risc pentru automatizări acum | API expus, fără HTTPS |

Pentru A și B îți dau pașii exacți, cu copie de siguranță și verificare după fiecare pas, după ce vedem rezultatul de la pasul 1.
