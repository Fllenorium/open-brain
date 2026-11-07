#!/usr/bin/env bash
# Everything that can be checked by running the thing. CI runs exactly this.
set -uo pipefail
cd "$(dirname "$0")/.."
fail=0

# These checks reseed from scratch. Pointing them at a real database would wipe
# it, so every server they start is forced onto the local PGlite file.
if [ -n "${DATABASE_URL:-}" ] && [ "${DATABASE_URL#pglite:}" = "${DATABASE_URL}" ]; then
  echo "Refusing to run: DATABASE_URL points at ${DATABASE_URL%%:*}, and this suite wipes the store."
  echo "Unset it first:  env -u DATABASE_URL ./scripts/check-all.sh"
  exit 1
fi

# Its own port, and it only ever stops the server it started. Other projects'
# dev servers on this machine are none of its business.
PORT="${PORT:-3456}"
export BASE="http://localhost:${PORT}"
stop() {
  pkill -f "next dev -p ${PORT}" >/dev/null 2>&1
  lsof -ti "tcp:${PORT}" -sTCP:LISTEN 2>/dev/null | xargs kill >/dev/null 2>&1
  perl -e 'select(undef,undef,undef,2)'
}
trap stop EXIT

echo "── build ──────────────────────────────────────────────"
pnpm build > /tmp/openbrain-build.log 2>&1 \
  && echo "PASS  pnpm build, zero type errors" \
  || { echo "FAIL  pnpm build"; tail -20 /tmp/openbrain-build.log; fail=1; }

echo
echo "── unit ───────────────────────────────────────────────"
pnpm test 2>&1 | grep -E "^# (tests|pass|fail)" || fail=1

echo
echo "── boot ───────────────────────────────────────────────"
stop
rm -rf .openbrain/pgdata && mkdir -p .openbrain
DATABASE_URL= ./node_modules/.bin/tsx lib/db/migrate.ts
export OPENBRAIN_MASTER_KEY="${OPENBRAIN_MASTER_KEY:-$(openssl rand -base64 32)}"
NODE_OPTIONS=--conditions=react-server OPENBRAIN_GIT_MIRROR=off DATABASE_URL= \
  ./node_modules/.bin/tsx scripts/seed.ts | tail -1
OPENBRAIN_MASTER_KEY="${OPENBRAIN_MASTER_KEY:-$(openssl rand -base64 32)}" \
  DATABASE_URL= OPENBRAIN_GIT_MIRROR=off pnpm dev -p "${PORT}" > /tmp/openbrain-dev.log 2>&1 &
for _ in $(seq 1 60); do
  curl -sf -o /dev/null "${BASE}/workspace/engineering/deploys" && break
  perl -e 'select(undef,undef,undef,1)'
done

for check in mcp tree ingest connections rubric; do
  echo
  echo "── ${check} ──────────────────────────────────────────"
  if node "scripts/${check}-check.mjs" > "/tmp/openbrain-${check}.log" 2>&1; then
    grep -E "^(PASS|FAIL)|checks passed" "/tmp/openbrain-${check}.log"
  else
    grep -E "^(PASS|FAIL)|checks passed" "/tmp/openbrain-${check}.log"
    echo "FAIL  the ${check} suite did not finish"
    tail -12 "/tmp/openbrain-${check}.log"
    fail=1
  fi
  # Every destructive check needs a clean store.
  if [ "$check" != "rubric" ]; then
    stop
    rm -rf .openbrain/pgdata && mkdir -p .openbrain
    DATABASE_URL= ./node_modules/.bin/tsx lib/db/migrate.ts > /dev/null
    NODE_OPTIONS=--conditions=react-server OPENBRAIN_GIT_MIRROR=off DATABASE_URL= \
      ./node_modules/.bin/tsx scripts/seed.ts > /dev/null 2>&1
    OPENBRAIN_MASTER_KEY="${OPENBRAIN_MASTER_KEY:-$(openssl rand -base64 32)}" \
      DATABASE_URL= OPENBRAIN_GIT_MIRROR=off pnpm dev -p "${PORT}" > /tmp/openbrain-dev.log 2>&1 &
    for _ in $(seq 1 60); do
      curl -sf -o /dev/null "${BASE}/workspace/engineering/deploys" && break
      perl -e 'select(undef,undef,undef,1)'
    done
  fi
done

echo
echo "── console ────────────────────────────────────────────"
node scripts/console-check.mjs > /tmp/openbrain-console.log 2>&1 || fail=1
grep -vE "^$" /tmp/openbrain-console.log | tail -16

exit $fail
