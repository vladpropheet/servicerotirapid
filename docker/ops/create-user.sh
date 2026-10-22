#!/bin/sh
# Scurtătură: rulează scripts/create-user.ts (împachetat) din folderul aplicației.
set -eu
cd /app
exec node dist/scripts/create-user.mjs "$@"
