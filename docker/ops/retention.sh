#!/bin/sh
# Scurtătură: rulează scripts/retention.ts (împachetat) din folderul aplicației.
set -eu
cd /app
exec node dist/scripts/retention.mjs "$@"
