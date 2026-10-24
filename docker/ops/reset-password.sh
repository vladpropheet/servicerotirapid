#!/bin/sh
# Scurtătură: rulează scripts/reset-password.ts (împachetat) din folderul aplicației.
set -eu
cd /app
exec node dist/scripts/reset-password.mjs "$@"
