#!/bin/sh
# RESTAURARE REALĂ (doar în caz de dezastru): înlocuiește baza de date cu cea dintr-un backup.
# ATENȚIE: tot ce s-a salvat după momentul backup-ului se PIERDE.
#
#   restore-db.sh /backups/db-....dump.age
#
# Ce face: blochează temporar contul aplicației (vizitatorii văd o eroare câteva secunde),
# restaurează totul într-o singură tranzacție (dacă ceva eșuează, baza rămâne cum era),
# apoi reaplică migrările și redeschide contul aplicației.
set -eu -o pipefail

: "${MIGRATION_DATABASE_URL:?Lipsește MIGRATION_DATABASE_URL.}"
file="${1:-}"
if [ -z "$file" ] || [ ! -f "$file" ]; then
  echo "Folosire: restore-db.sh /backups/db-....dump.age" >&2
  exit 1
fi

echo "ATENȚIE: baza de date va fi ÎNLOCUITĂ cu backup-ul $file."
echo "Programările și modificările făcute după acel moment se pierd."
printf 'Scrie DA (cu majuscule) ca să continui: '
read -r answer
[ "$answer" = "DA" ] || { echo "Oprit. Nu am modificat nimic."; exit 1; }

printf 'Lipește cheia privată age (începe cu AGE-SECRET-KEY-) și apasă Enter: '
stty -echo 2>/dev/null || true
read -r secret
stty echo 2>/dev/null || true
echo

reopen() {
  migrate.sh || echo "ATENȚIE: migrările nu au rulat. Rulează manual: migrate.sh" >&2
}
trap reopen EXIT

psql --dbname="$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 --quiet <<SQL
alter role app_user nologin;
select pg_terminate_backend(pid) from pg_stat_activity where usename = 'app_user';
SQL
printf '%s\n' "$secret" | age --decrypt -i - "$file" \
  | pg_restore --clean --if-exists --single-transaction --exit-on-error --dbname="$MIGRATION_DATABASE_URL"
echo "Restaurarea a reușit."
