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

echo "== GATE PASSED =="
