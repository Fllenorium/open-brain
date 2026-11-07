#!/usr/bin/env bash
# Resets the local store, seeds it, boots the app, and drives the rubric
# through the acceptance checklist. PGlite is single-process, so the seed
# has to run with the dev server down.
set -uo pipefail
cd "$(dirname "$0")/.."

pkill -f "next dev" >/dev/null 2>&1
pkill -f next-server >/dev/null 2>&1
perl -e 'select(undef,undef,undef,2)'

rm -rf .openbrain/pgdata && mkdir -p .openbrain
DATABASE_URL= ./node_modules/.bin/tsx lib/db/migrate.ts
NODE_OPTIONS=--conditions=react-server OPENBRAIN_GIT_MIRROR=off DATABASE_URL= \
  ./node_modules/.bin/tsx scripts/seed.ts

DATABASE_URL= OPENBRAIN_GIT_MIRROR=off pnpm dev > /tmp/openbrain-dev.log 2>&1 &
for _ in $(seq 1 60); do
  curl -sf -o /dev/null http://localhost:3000/workspace/engineering/deploys && break
  perl -e 'select(undef,undef,undef,1)'
done

node scripts/rubric-check.mjs
