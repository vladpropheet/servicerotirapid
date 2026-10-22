#!/bin/sh
# Scurtătură: rulează scripts/seed.ts (împachetat) din folderul aplicației.
set -eu
cd /app
exec node dist/scripts/seed.mjs "$@"
