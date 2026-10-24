#!/bin/sh
# Generează cheia de criptare pentru backup (age), o singură dată, pe server.
#
#   sh docker/server/setup-backup-key.sh
#
# - Cheia PRIVATĂ se afișează o singură dată și NU se salvează nicăieri pe server.
#   O copiezi în managerul de parole: fără ea, backup-urile nu pot fi deschise de nimeni.
# - Cheia PUBLICĂ se scrie în .env (BACKUP_AGE_RECIPIENT); cu ea se criptează backup-urile.
# - Nu înlocuiește o cheie existentă: backup-urile vechi s-ar putea deschide doar cu cheia veche.
set -eu
cd "$(dirname "$0")/../.."
ops="${OPS_CONTAINER:-servicerotirapid-ops-1}"

[ -f .env ] || { echo "EROARE: lipsește .env. Rulează întâi docker/server/generate-env.sh." >&2; exit 1; }
if grep -q '^BACKUP_AGE_RECIPIENT=age1' .env; then
  echo "Există deja o cheie de backup în .env. Nu o schimb." >&2
  exit 1
fi

keys=$(docker exec "$ops" age-keygen 2>/dev/null)
public=$(printf '%s\n' "$keys" | sed -n 's/^# public key: //p')
secret=$(printf '%s\n' "$keys" | grep '^AGE-SECRET-KEY-' || true)
case "$public" in age1*) ;; *) echo "EROARE: cheia nu a putut fi generată." >&2; exit 1 ;; esac
[ -n "$secret" ] || { echo "EROARE: cheia nu a putut fi generată." >&2; exit 1; }

if grep -q '^BACKUP_AGE_RECIPIENT=' .env; then
  sed -i "s|^BACKUP_AGE_RECIPIENT=.*|BACKUP_AGE_RECIPIENT=$public|" .env
else
  printf 'BACKUP_AGE_RECIPIENT=%s\n' "$public" >> .env
fi
grep -q "^BACKUP_AGE_RECIPIENT=$public\$" .env || { echo "EROARE: cheia publică nu a putut fi scrisă în .env." >&2; exit 1; }

# Containerul ops pornește din nou, cu cheia publică (aplicația nu se oprește).
docker compose -f docker-compose.prod.yml up -d --no-deps ops > /dev/null 2>&1

cat <<MESAJ

==========================================================================
 CHEIA PRIVATĂ DE BACKUP - copiaz-o ACUM în managerul de parole

 $secret

 Nu se mai afișează și nu e salvată pe server.
 Fără ea, nimeni (nici tu) nu poate deschide backup-urile.
==========================================================================

Cheia publică a fost salvată în .env, iar containerul ops a pornit din nou cu ea.
MESAJ
