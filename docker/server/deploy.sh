#!/bin/sh
# Deploy: ia ultima versiune din GitHub (ramura main) și repornește aplicația.
# Containerul ops aplică migrările noi înainte ca aplicația nouă să pornească.
#
#   sh docker/server/deploy.sh
set -eu
cd "$(dirname "$0")/../.."
[ -f .env ] || { echo "Lipsește .env. Rulează întâi docker/server/generate-env.sh." >&2; exit 1; }
git pull --ff-only
docker compose -f docker-compose.prod.yml up -d --build --remove-orphans
docker image prune -f > /dev/null
docker compose -f docker-compose.prod.yml ps --format "table {{.Service}}\t{{.Status}}"
