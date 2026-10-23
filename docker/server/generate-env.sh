#!/bin/sh
# Creează fișierul .env de producție cu parole și chei aleatorii (o singură dată, pe server).
#
#   sh docker/server/generate-env.sh https://programari.domeniul-tau.ro
#
# Nu suprascrie un .env existent: parolele bazei de date sunt deja scrise în ea, iar schimbarea
# BOOKING_LINK_SECRET ar opri linkurile date clienților.
set -eu
cd "$(dirname "$0")/../.."
url="${1:-}"
case "$url" in
  https://*) ;;
  *) echo "Folosire: sh docker/server/generate-env.sh https://programari.domeniul-tau.ro" >&2; exit 1 ;;
esac
if [ -e .env ]; then
  echo "Există deja un .env. Nu îl suprascriu." >&2
  exit 1
fi
umask 077
secret() { openssl rand -hex 32; }
cat > .env <<ENV
# Producție. Generat pe $(date -u +%Y-%m-%d). NU se copiază nicăieri, NU intră în Git.
APP_BASE_URL=${url%/}
POSTGRES_PASSWORD=$(secret)
APP_DB_PASSWORD=$(secret)
AUTH_SECRET=$(secret)
BOOKING_LINK_SECRET=$(secret)

# Cloudflare Turnstile (pasul din docs/productie.md). Până atunci aplicația nu pornește,
# decât dacă scoți # din fața liniei TURNSTILE_DISABLED=1 (oprire conștientă, temporară).
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
#TURNSTILE_DISABLED=1

# Backup: cheia PUBLICĂ age (linia age1...). Cheia privată NU se pune aici.
BACKUP_AGE_RECIPIENT=
# Copia în afara serverului (S3), când alegi furnizorul.
BACKUP_S3_ENDPOINT=
BACKUP_S3_REGION=
BACKUP_S3_BUCKET=
BACKUP_S3_ACCESS_KEY_ID=
BACKUP_S3_SECRET_ACCESS_KEY=
ENV
echo "Am creat .env (doar proprietarul îl poate citi). Secretele nu se afișează."
