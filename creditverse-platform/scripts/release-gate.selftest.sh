#!/usr/bin/env bash
# Proof that the gate refuses a failing suite.
#
# Plants one deliberately failing test, runs the gate, and requires a
# NON-ZERO exit. If the gate ever lets it through, this script fails — so
# the gate's own honesty is checked by a machine, not remembered by a person.
set -uo pipefail
cd "$(dirname "$0")/.."
PLANT="src/__release_gate_selftest__.test.ts"
cleanup() { rm -f "$PLANT"; }
trap cleanup EXIT

cat > "$PLANT" <<'TS'
import { it, expect } from "vitest";
it("release gate self-test: this MUST fail", () => { expect(true).toBe(false); });
TS

if bash scripts/release-gate.sh >/tmp/release-gate.selftest.log 2>&1; then
  echo "SELF-TEST FAILED: the gate passed with a failing test in the suite"
  exit 1
fi
echo "SELF-TEST PASSED: the gate refused a failing suite (exit was non-zero)"
