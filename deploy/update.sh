#!/bin/sh
# Runs ON THE SERVER: pull the latest code from GitHub and rebuild the API.
#   /srv/politiscale-api/deploy/update.sh
# The votes (SQLite file in Docker volume "politiscale-api_data") and .env (admin password) are never touched.
set -e
cd "$(dirname "$0")/.."
git fetch --quiet origin main
git reset --hard --quiet origin/main     # the server copy always mirrors GitHub
echo "==> Code at $(git log -1 --format='%h %s')"

if [ ! -f .env ] || ! grep -q '^ADMIN_PASSWORD=' .env; then
  umask 077
  echo "ADMIN_PASSWORD=$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)" >> .env
  echo "==> Admin password created: see $(pwd)/.env"
fi

docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null
sleep 5
docker compose ps
