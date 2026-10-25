# Copia backup-ului în afara serverului (OVH Object Storage)

**De ce:** acum backup-ul criptat se face în fiecare noapte, dar stă **pe același server**. Dacă serverul se strică de tot sau e compromis, se pierd și datele, și copiile. Cu pasul ăsta, fiecare backup e copiat automat și într-un loc separat, păstrat 30 de zile.

**Cost:** OVH Object Storage e **plătit**, la consum: cam **0,007 € / GB / lună + TVA** (verifici prețul exact în panoul OVH înainte să confirmi). Backup-urile noastre au sub 1 GB, deci ar fi sub **0,10 € pe lună**. **Nu activa nimic până nu ești de acord cu costul.**

**Ce rămâne la fel:** fișierele sunt criptate **înainte** să plece de pe server. OVH (sau oricine ar avea acces la spațiul de stocare) nu le poate citi fără cheia privată din nota 5.

---

## Pasul 1: spațiul de stocare (panoul OVH)

> Denumirile din panoul OVH se pot schimba puțin în timp. Dacă nu găsești ceva, trimite-mi o captură.

1. **ovh.com → Manager**, logat în contul tău.
2. Sus: **Public Cloud**. Dacă nu ai încă un proiect Public Cloud, panoul te ghidează să creezi unul. Poate cere o metodă de plată.
3. În proiect, în stânga: **Object Storage**.
4. **Utilizatorul (cheia de acces):** fila **Users** (Utilizatori) → creezi un utilizator nou pentru Object Storage, cu descrierea `backup-servicerotirapid`. La final primești:
   - **Access key**;
   - **Secret key**.
   Le copiezi imediat într-o notă nouă în managerul de parole, **„7. OVH Object Storage – backup”**.
5. **Containerul (bucket-ul):** **Create Object Container** / **Creează un container**:
   - tipul **S3 API**, clasa **Standard**;
   - **regiune din UE**, de preferat **Varșovia (WAW)**, aceeași cu VPS-ul. Dacă nu e disponibilă: Gravelines (GRA), Strasbourg (SBG) sau Frankfurt (DE);
   - nume: `servicerotirapid-backup` (dacă e luat, adaugă câteva cifre);
   - îl legi de utilizatorul de la punctul 4;
   - acces **privat** (nu public).
6. Deschizi detaliile containerului și copiezi **Endpoint**-ul (o adresă de forma `https://s3.<regiune>.io.cloud.ovh.net`) și **regiunea** (de ex. `waw`). Le pui în aceeași notă 7.

## Pasul 2: datele de acces pe server

**Unde:** PowerShell pe PC.
```
ssh -t vps "nano /opt/servicerotirapid/.env"
```
Completezi liniile goale de la final (te miști cu săgețile, **End** duce la capătul rândului, **click dreapta** lipește):
```
BACKUP_S3_ENDPOINT=https://s3.waw.io.cloud.ovh.net
BACKUP_S3_REGION=waw
BACKUP_S3_BUCKET=servicerotirapid-backup
BACKUP_S3_ACCESS_KEY_ID=[Access key]
BACKUP_S3_SECRET_ACCESS_KEY=[Secret key]
```
Endpoint-ul, regiunea și numele containerului sunt cele din nota 7. Salvezi cu **Ctrl+O**, **Enter**, ieși cu **Ctrl+X**.

Apoi repornești containerul de backup cu noile setări (aplicația nu se oprește):
```
ssh vps "cd /opt/servicerotirapid && docker compose -f docker-compose.prod.yml up -d --no-deps ops"
```
**Rezultat corect:** `Container servicerotirapid-ops-1 Started`.

## Pasul 3: probă

```
ssh vps "docker exec servicerotirapid-ops-1 backup.sh"
```
**Rezultat corect:** ultima linie e **`Copie în afara serverului: gata (servicerotirapid-backup).`** (fără `ATENȚIE`).

Verifici și ce e în container:
```
ssh vps "docker exec servicerotirapid-ops-1 sh -c 's3.sh ls extern:\$BACKUP_S3_BUCKET/servicerotirapid'"
```
**Rezultat corect:** fișierele `db-....dump.age` și `fisiere-....tar.gz.age`.

**Dacă apare o eroare** (de ex. `AccessDenied`, `NoSuchBucket`): trimite-mi ultimele rânduri. De obicei e o literă greșită în cheie, în numele containerului sau în endpoint.

## Pasul 4: actualizezi nota 3

```
ssh vps "cat /opt/servicerotirapid/.env"
```
Înlocuiești conținutul notei 3 cu ce afișează și salvezi.

---

De acum, fiecare backup de noapte ajunge și în OVH Object Storage. Copiile mai vechi de 30 de zile se șterg singure. Dacă serverul e pierdut, restaurarea pe un server nou e descrisă în `docs/productie.md`, la „Restaurare în caz de dezastru”.
