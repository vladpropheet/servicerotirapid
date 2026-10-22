#!/bin/sh
# Restaurează pozele încărcate (folderul storage) dintr-un backup „fisiere-....tar.gz.age”.
# Fișierele existente cu același nume se suprascriu; cele noi rămân.
#
#   restore-files.sh /backups/fisiere-....tar.gz.age
set -eu -o pipefail
file="${1:-}"
if [ -z "$file" ] || [ ! -f "$file" ]; then
  echo "Folosire: restore-files.sh /backups/fisiere-....tar.gz.age" >&2
  exit 1
fi
printf 'Lipește cheia privată age (începe cu AGE-SECRET-KEY-) și apasă Enter: '
stty -echo 2>/dev/null || true
read -r secret
stty echo 2>/dev/null || true
echo
printf '%s\n' "$secret" | age --decrypt -i - "$file" | tar -C /app/storage -xzf -
echo "Pozele au fost restaurate în /app/storage."
