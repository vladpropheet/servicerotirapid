#!/bin/sh
# Pornirea containerului `ops` la fiecare deploy: aplică migrările (dacă există unele noi),
# apoi rămâne pornit pentru task-urile programate (backup, ștergere automată) și comenzile manuale.
# Aplicația (`app`) pornește doar după ce migrările au reușit (vezi healthcheck în Dockerfile).
set -eu
rm -f /tmp/migrations-ok
migrate.sh
touch /tmp/migrations-ok
echo "Containerul ops e pregătit."
exec tail -f /dev/null
