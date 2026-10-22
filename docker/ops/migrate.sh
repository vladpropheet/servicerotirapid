#!/bin/sh
# Scurtătură: rulează scripts/migrate.ts (împachetat) din folderul aplicației.
set -eu
cd /app
exec node dist/scripts/migrate.mjs "$@"
