#!/bin/sh
# Runs ON THE SERVER: pull the latest code from GitHub and rebuild the API.
#   /srv/politiscale-api/deploy/update.sh
# The votes (Docker volume "politiscale-api_db") and .env are never touched.
set -e
cd "$(dirname "$0")/.."
git fetch --quiet origin main
git reset --hard --quiet origin/main     # the server copy always mirrors GitHub
echo "==> Code at $(git log -1 --format='%h %s')"

if [ ! -f .env ]; then
  umask 077
  printf 'DB_PASSWORD=%s\n' "$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40)" > .env
  echo "==> Created .env with a random database password"
fi

docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null
sleep 5
docker compose ps
