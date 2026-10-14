#!/bin/sh
# The daily backup, run on the host (by d2m-backup.timer, or cron): a consistent copy of the database
# into the data volume's backups/ (the newest 14 kept), then the newest copy off the server into R2
# when D2M_BACKUP_URL is set in deploy/.env.
#
#   sudo /opt/d2m/deploy/backup/d2m-backup.sh
set -eu

# deploy/, where docker-compose.yml and .env are (this script lives in deploy/backup/)
cd "$(dirname "$0")/.."

docker compose exec -T app npm run --silent backup

if grep -Eq '^D2M_BACKUP_URL=.+' .env; then
  docker compose exec -T app npm run --silent backup:r2
else
  echo "backup: D2M_BACKUP_URL is not set in deploy/.env: the copy stays on this server only"
fi
