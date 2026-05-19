#!/usr/bin/env bash
# scripts/pre-commit-drift-gate.sh
#
# Pre-commit gate that BLOCKS engine work from being committed to the wrong
# code path. The 2026-05-19 audit established that the production chain is
# scripts/serial-design-chain-v2.tsx (+ 3 sub-process scripts), and that
# ~20 stage files under src/lib/pdf-engine-v2/stages/ were dead code that
# nobody had bridged. Weeks of K10 + Engine A + compliance-gate work landed
# in those dormant stages and never reached production PDFs.
#
# This gate runs `knip --include files` with the repo's knip.config.ts
# (which is the production-entry-aware config). If any STAGED file under
# src/lib/pdf-engine-v2/ is in knip's "unused" list, the commit fails with
# a clear pointer to bridge it into the chain.
#
# Bypass: --no-verify (use sparingly — bypass announces drift, doesn't fix it).
#
# Exit: 0 if no staged engine files are unreachable; 1 if drift detected.

set -e

# Only run if any staged file lives under src/lib/pdf-engine-v2/
STAGED_ENGINE=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep -E '^src/lib/pdf-engine-v2/.+\.(ts|tsx)$' | grep -v '\.test\.' || true)

if [ -z "$STAGED_ENGINE" ]; then
  exit 0
fi

# Reachability scan via knip. The config at knip.config.ts is configured with
# the production entry points (scripts/serial-design-chain-v2.tsx + 3 sub-
# process scripts) so an "unused" report from knip means "this file is not
# reachable from production".
ORPHANS=$(npx --yes knip --include files --no-progress 2>/dev/null | grep -E '^src/lib/pdf-engine-v2/.+\.(ts|tsx)$' || true)

if [ -z "$ORPHANS" ]; then
  # No orphans anywhere — staged engine work must be reachable.
  exit 0
fi

# Cross-reference: any staged engine file that ALSO appears in the orphan list = drift.
DRIFT=""
while IFS= read -r staged; do
  if echo "$ORPHANS" | grep -qFx "$staged"; then
    DRIFT="${DRIFT}${staged}\n"
  fi
done <<< "$STAGED_ENGINE"

if [ -z "$DRIFT" ]; then
  exit 0
fi

# DRIFT DETECTED — print a clear bridge-or-bypass message and fail.
echo ""
echo "════════════════════════════════════════════════════════════════════════"
echo "❌ DRIFT GATE: engine work staged but UNREACHABLE from production"
echo "════════════════════════════════════════════════════════════════════════"
echo ""
echo "These staged files are NOT imported by the production chain"
echo "(scripts/serial-design-chain-v2.tsx + estimate-missing-prices.tsx +"
echo "enrich-state-with-reference-anchor.tsx + render-minimal-pdf.tsx):"
echo ""
echo -e "$DRIFT" | sed 's/^/  • /'
echo ""
echo "If you commit them as-is, this is the 2026-05-18 K10 pattern repeating:"
echo "great engineering work that never reaches a customer's PDF because no"
echo "one bridged it into the chain."
echo ""
echo "TO FIX:"
echo "  1. Import the new symbol from scripts/serial-design-chain-v2.tsx (or"
echo "     one of the 3 sub-process scripts), AND call it from the pipeline."
echo "  2. Re-stage the chain file: git add scripts/serial-design-chain-v2.tsx"
echo "  3. Re-run the commit."
echo ""
echo "TO BYPASS (rare, with caveat):"
echo "  git commit --no-verify  # registers the drift as deliberate; you must"
echo "                            log the follow-up bridge task explicitly."
echo ""
echo "Reference: forgeos_decisions/481e056e8dbfcd65 (PA-vs-chain divergence)."
echo "════════════════════════════════════════════════════════════════════════"
exit 1
