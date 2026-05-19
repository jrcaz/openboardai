#!/bin/sh
set -e

# Apply pending Drizzle migrations before booting the API.
# Drizzle's migrator resolves `migrationsFolder` relative to CWD, so we chdir
# into the api package (drizzle/ lives at apps/api/drizzle).
if [ -z "${SKIP_MIGRATIONS:-}" ]; then
  echo "[entrypoint] applying database migrations..."
  ( cd /app/apps/api && node dist/db/migrate.js )
else
  echo "[entrypoint] SKIP_MIGRATIONS set — skipping migrations"
fi

echo "[entrypoint] starting: $*"
exec "$@"
