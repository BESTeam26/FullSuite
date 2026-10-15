#!/usr/bin/env bash
# The release gate: types, tests, build — and the exit status is THEIRS.
#
# Dee, 2026-09-30: "The failed-suite push should not be possible again. Fix
# the actual commit/release gate so the command returns the test process
# exit status, not head, tee, or another downstream pipeline command."
#
# What went wrong on 2026-09-29: `vitest run | grep | head` — a pipeline's
# status is its LAST command's, and head always succeeds, so four failing
# tests sailed through. This script has no pipelines around the checks. Each
# runs on its own line under `set -e`, so the first failure stops the script
# with that failure's status, and `pipefail` covers any pipe that is ever
# added later.
#
# Run it as `npm run gate`. Nothing below it decides whether to ship.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== typecheck =="
npx tsc --noEmit

echo "== tests =="
npx vitest run --reporter=dot

echo "== build =="
npm run build --silent

# Dee, 2026-09-30: "I want performance treated as a hard release gate for
# every CreditOps change… measured from an actual agent account." Every
# CreditOps path, timed in the live database as an executive AND as an
# agent, each against its threshold. Over threshold = no release.
echo "== creditops latency (live, as executive and agent) =="
node supabase/scripts/fullsuite-latency-probe.mjs

# Dee, 2026-10-15: "ensure all working functions are LOCKED and don't make
# them not working again." Every write an agent makes in a day, as every
# ACTIVE agent on the live roster, rolled back. One refusal = no release.
echo "== creditops agent walk (live, as every active agent, rolled back) =="
node supabase/scripts/creditops-agent-walk.mjs

echo "== GATE PASSED =="
