#!/bin/sh
# Backup criptat: baza de date (pg_dump) + pozele încărcate (folderul storage).
#
# - Se criptează cu cheia PUBLICĂ age din BACKUP_AGE_RECIPIENT, înainte să fie scris pe disc.
#   Cheia privată (pentru restaurare) NU stă pe server.
# - O copie rămâne local în /backups (BACKUP_LOCAL_KEEP_DAYS zile, implicit 7).
# - Dacă BACKUP_S3_BUCKET e completat, o copie merge în afara serverului (S3), păstrată
#   BACKUP_S3_KEEP_DAYS zile (implicit 30).
# Rulat zilnic de un task programat în Coolify. Se poate rula și manual: backup.sh
set -eu -o pipefail
umask 077

: "${MIGRATION_DATABASE_URL:?Lipsește MIGRATION_DATABASE_URL.}"
if [ -z "${BACKUP_AGE_RECIPIENT:-}" ]; then
  echo "EROARE: lipsește BACKUP_AGE_RECIPIENT (cheia publică age). Nu fac backup necriptat." >&2
  exit 1
fi

dir=/backups
stamp=$(date -u +%Y-%m-%dT%H-%M-%SZ)
db_file="db-$stamp.dump.age"
files_file="fisiere-$stamp.tar.gz.age"

pg_dump --format=custom --dbname="$MIGRATION_DATABASE_URL" | age --encrypt -r "$BACKUP_AGE_RECIPIENT" > "$dir/$db_file.partial"
mv "$dir/$db_file.partial" "$dir/$db_file"
tar -C /app/storage -czf - . | age --encrypt -r "$BACKUP_AGE_RECIPIENT" > "$dir/$files_file.partial"
mv "$dir/$files_file.partial" "$dir/$files_file"
echo "Backup local: $db_file ($(du -k "$dir/$db_file" | cut -f1) KB), $files_file ($(du -k "$dir/$files_file" | cut -f1) KB)."

find "$dir" -maxdepth 1 -name '*.age' -mtime +"${BACKUP_LOCAL_KEEP_DAYS:-7}" -delete
find "$dir" -maxdepth 1 -name '*.partial' -mmin +60 -delete

if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  remote="extern:$BACKUP_S3_BUCKET/servicerotirapid"
  s3.sh copyto --s3-no-check-bucket "$dir/$db_file" "$remote/$db_file"
  s3.sh copyto --s3-no-check-bucket "$dir/$files_file" "$remote/$files_file"
  s3.sh delete --min-age "${BACKUP_S3_KEEP_DAYS:-30}d" "$remote/"
  echo "Copie în afara serverului: gata ($BACKUP_S3_BUCKET)."
else
  echo "ATENȚIE: BACKUP_S3_BUCKET nu e setat, deci backup-ul există doar pe acest server."
fi
