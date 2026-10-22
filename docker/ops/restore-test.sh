#!/bin/sh
# Testul de restaurare: decriptează un backup într-o bază de date TEMPORARĂ, verifică datele
# și apoi șterge baza temporară. Nu atinge baza de date reală.
#
#   restore-test.sh                       -> cel mai nou backup din /backups
#   restore-test.sh /backups/db-....age   -> un backup anume
#
# Cere cheia PRIVATĂ age (linia AGE-SECRET-KEY-...). Cheia nu se salvează pe disc.
set -eu -o pipefail

: "${MIGRATION_DATABASE_URL:?Lipsește MIGRATION_DATABASE_URL.}"
file="${1:-$(ls -1t /backups/db-*.dump.age 2>/dev/null | head -n 1)}"
if [ -z "$file" ] || [ ! -f "$file" ]; then
  echo "EROARE: nu găsesc niciun backup în /backups. Rulează întâi backup.sh." >&2
  exit 1
fi
echo "Backup testat: $file"

printf 'Lipește cheia privată age (începe cu AGE-SECRET-KEY-) și apasă Enter: '
stty -echo 2>/dev/null || true
read -r secret
stty echo 2>/dev/null || true
echo
case "$secret" in
  AGE-SECRET-KEY-*) ;;
  *) echo "EROARE: asta nu pare o cheie privată age." >&2; exit 1 ;;
esac

db="restore_test_$(date +%s)"
test_url=$(printf '%s' "$MIGRATION_DATABASE_URL" | sed "s#/[^/?]*\([?].*\)\{0,1\}\$#/$db\1#")
cleanup() {
  psql --quiet --dbname="$MIGRATION_DATABASE_URL" -c "drop database if exists $db" >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql --quiet --dbname="$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 -c "create database $db" >/dev/null
printf '%s\n' "$secret" | age --decrypt -i - "$file" | pg_restore --no-owner --no-acl --exit-on-error --dbname="$test_url"

echo "Ce conține backup-ul:"
psql --dbname="$test_url" -v ON_ERROR_STOP=1 --no-psqlrc -c "
  select (select count(*) from tenants) as service_uri,
         (select count(*) from services) as servicii,
         (select count(*) from bookings) as programari,
         (select count(*) from customers) as clienti,
         (select max(created_at) from bookings) as ultima_programare_creata,
         (select count(*) from drizzle.__drizzle_migrations) as migrari;"
echo "Test de restaurare REUȘIT. Baza temporară $db se șterge acum."
