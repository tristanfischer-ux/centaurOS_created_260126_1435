#!/bin/bash
#
# verify.sh - Pre-commit verification for ForgeOS
#
# Contract-aware verification: reads harness-contract.json to determine
# which checks are required based on the risk tier of changed files.
#
# Runs tiered checks to catch bugs before committing:
#   Tier 1: Static analysis (typecheck + lint) — catches type errors, broken imports
#   Tier 2: Page smoke tests (Playwright) — catches runtime render failures
#
# Usage:
#   npm run verify              # Full verification (Tier 1 + Tier 2)
#   npm run verify -- --static  # Tier 1 only (no browser needed)
#   npm run verify -- --ref main  # Diff against main branch
#
# Requirements:
#   - Tier 2 requires dev server running on localhost:3000
#   - Tier 2 requires auth setup (run: npx playwright test --project=auth-setup)

# NOTE: Not using set -e because we capture exit codes manually
# to provide friendly error reporting for each tier.

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Parse arguments
STATIC_ONLY=false
REF_ARG=""

for arg in "$@"; do
  case $arg in
    --static)
      STATIC_ONLY=true
      shift
      ;;
    --ref)
      shift
      REF_ARG="--ref $1"
      shift
      ;;
  esac
done

echo ""
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${CYAN}  ForgeOS Pre-Commit Verification${NC}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

FAILED=false

# ─── Risk Tier Classification ────────────────────────────────────────────
# Read the harness contract to determine what level of checks are needed.

RISK_TIER="unknown"
REQUIRED_CHECKS=""
REQUIRES_HUMAN_REVIEW="false"

echo -e "${BOLD}Risk Classification (from harness-contract.json)${NC}"
echo ""

RISK_JSON=$(npx tsx scripts/harness-risk-tier.ts $REF_ARG 2>/dev/null)
if [ $? -eq 0 ] && [ -n "$RISK_JSON" ]; then
  RISK_TIER=$(echo "$RISK_JSON" | jq -r '.tier' 2>/dev/null || echo "unknown")
  REQUIRED_CHECKS=$(echo "$RISK_JSON" | jq -r '.requiredChecks | join(",")' 2>/dev/null || echo "")
  REQUIRES_HUMAN_REVIEW=$(echo "$RISK_JSON" | jq -r '.requiresHumanReview' 2>/dev/null || echo "false")
  FILE_COUNT=$(echo "$RISK_JSON" | jq -r '.fileCount' 2>/dev/null || echo "0")
  HEAD_SHA=$(echo "$RISK_JSON" | jq -r '.headSha' 2>/dev/null || echo "unknown")

  # Color the tier label
  case "$RISK_TIER" in
    critical) TIER_COLOR="${RED}" ;;
    high)     TIER_COLOR="${YELLOW}" ;;
    medium)   TIER_COLOR="${CYAN}" ;;
    low)      TIER_COLOR="${GREEN}" ;;
    *)        TIER_COLOR="${NC}" ;;
  esac

  echo -e "  Risk tier:    ${BOLD}${TIER_COLOR}${RISK_TIER}${NC}"
  echo -e "  Head SHA:     ${HEAD_SHA}"
  echo -e "  Files changed: ${FILE_COUNT}"
  echo -e "  Required:     ${REQUIRED_CHECKS}"
  if [ "$REQUIRES_HUMAN_REVIEW" = "true" ]; then
    echo -e "  ${YELLOW}⚠ Human review required for this tier${NC}"
  fi
else
  echo -e "  ${YELLOW}⚠${NC} Could not classify risk tier. Running all checks."
  RISK_TIER="unknown"
  REQUIRED_CHECKS="security-typecheck,baseline-typecheck,lint,unit-tests,smoke-tests"
fi
echo ""

# Helper: check if a specific check is required
check_required() {
  echo "$REQUIRED_CHECKS" | grep -q "$1"
}

# ─── Tier 1: Static Analysis ─────────────────────────────────────────────

echo -e "${BOLD}Tier 1: Static Analysis${NC}"
echo ""

# Security-focused type checking (required for critical + high tiers)
if check_required "security-typecheck"; then
  echo -e "  ${CYAN}→${NC} Running security TypeScript check..."
  SECURITY_TYPECHECK_OUTPUT=$(npm run typecheck:security 2>&1)
  SECURITY_TYPECHECK_EXIT=$?
  echo "$SECURITY_TYPECHECK_OUTPUT" | tail -5
  if [ $SECURITY_TYPECHECK_EXIT -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} Security TypeScript: passed"
  else
    echo -e "  ${RED}✗${NC} Security TypeScript: failed — fix security-path type errors before committing"
    FAILED=true
  fi
  echo ""
else
  echo -e "  ${CYAN}⏭${NC} Security TypeScript: skipped (not required for ${RISK_TIER} tier)"
  echo ""
fi

# Baseline TypeScript regression check (required for all tiers)
if check_required "baseline-typecheck"; then
  echo -e "  ${CYAN}→${NC} Running baseline TypeScript regression check..."
  BASELINE_TYPECHECK_OUTPUT=$(npm run typecheck:baseline 2>&1)
  BASELINE_TYPECHECK_EXIT=$?
  echo "$BASELINE_TYPECHECK_OUTPUT" | tail -5
  if [ $BASELINE_TYPECHECK_EXIT -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} Baseline TypeScript: passed (no new errors)"
  else
    echo -e "  ${RED}✗${NC} Baseline TypeScript: failed — new type errors introduced"
    FAILED=true
  fi
  echo ""
else
  echo -e "  ${CYAN}⏭${NC} Baseline TypeScript: skipped (not required for ${RISK_TIER} tier)"
  echo ""
fi

# ESLint (required for all tiers)
if check_required "lint"; then
  echo -e "  ${CYAN}→${NC} Running ESLint..."
  LINT_OUTPUT=$(npm run lint -- --quiet 2>&1)
  LINT_EXIT=$?
  echo "$LINT_OUTPUT" | tail -5
  if [ $LINT_EXIT -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} ESLint: passed"
  else
    echo -e "  ${RED}✗${NC} ESLint: failed — fix lint errors before committing"
    FAILED=true
  fi
  echo ""
else
  echo -e "  ${CYAN}⏭${NC} ESLint: skipped (not required for ${RISK_TIER} tier)"
  echo ""
fi

# Unit tests (required for high + critical tiers)
if check_required "unit-tests"; then
  echo -e "  ${CYAN}→${NC} Running unit tests..."
  UNIT_OUTPUT=$(npm test 2>&1)
  UNIT_EXIT=$?
  echo "$UNIT_OUTPUT" | tail -10
  if [ $UNIT_EXIT -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} Unit tests: passed"
  else
    echo -e "  ${RED}✗${NC} Unit tests: failed — fix test failures before committing"
    FAILED=true
  fi
  echo ""
fi

if [ "$FAILED" = true ]; then
  echo -e "${RED}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${RED}${BOLD}  VERIFICATION FAILED — Tier 1 (Static Analysis)${NC}"
  echo -e "${RED}${BOLD}  Fix the errors above before committing.${NC}"
  echo -e "${RED}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  exit 1
fi

echo -e "  ${GREEN}${BOLD}Tier 1: All required static checks passed${NC}"
echo ""

if [ "$STATIC_ONLY" = true ]; then
  echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}${BOLD}  VERIFICATION PASSED (static only — ${RISK_TIER} tier)${NC}"
  echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  exit 0
fi

# ─── Tier 2: Page Smoke Tests ────────────────────────────────────────────

# Skip smoke tests if the contract says they're not required for this tier
if ! check_required "smoke-tests" && ! check_required "e2e-critical-paths"; then
  echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}${BOLD}  VERIFICATION PASSED (${RISK_TIER} tier — smoke tests not required)${NC}"
  echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  exit 0
fi

echo -e "${BOLD}Tier 2: Page Smoke Tests${NC}"
echo ""

# Check if dev server is running
echo -e "  ${CYAN}→${NC} Checking dev server on localhost:3000..."
if ! curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200\|302\|301"; then
  echo -e "  ${YELLOW}⚠${NC} Dev server not running on localhost:3000"
  echo -e "  ${YELLOW}⚠${NC} Skipping smoke tests. Start the dev server and re-run to include Tier 2."
  echo ""
  echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}${BOLD}  VERIFICATION PASSED (Tier 1 only — dev server not running)${NC}"
  echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  exit 0
fi
echo -e "  ${GREEN}✓${NC} Dev server is running"
echo ""

# Map changed files to routes
echo -e "  ${CYAN}→${NC} Mapping changed files to routes..."
ROUTES=$(npx tsx scripts/route-mapper.ts $REF_ARG 2>/dev/null)

if [ -z "$ROUTES" ]; then
  echo -e "  ${YELLOW}⚠${NC} No routes detected from changes, skipping smoke tests"
  echo ""
  echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}${BOLD}  VERIFICATION PASSED (Tier 1 only — no mapped routes)${NC}"
  echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  exit 0
fi

# Show the routes being tested (route-mapper logs to stderr, ROUTES has stdout)
echo -e "  ${GREEN}✓${NC} Routes to test: ${ROUTES}"
echo ""

# Check if auth state exists
AUTH_FILE=".playwright/auth/founder.json"
if [ ! -f "$AUTH_FILE" ]; then
  echo -e "  ${YELLOW}⚠${NC} Auth state not found at ${AUTH_FILE}"
  echo -e "  ${YELLOW}⚠${NC} Run: npx playwright test --project=auth-setup"
  echo -e "  ${YELLOW}⚠${NC} Skipping smoke tests."
  echo ""
  echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}${BOLD}  VERIFICATION PASSED (Tier 1 only — no auth state)${NC}"
  echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  exit 0
fi

# Run smoke tests
echo -e "  ${CYAN}→${NC} Running Playwright smoke tests..."
echo ""

if SMOKE_ROUTES="$ROUTES" npx playwright test e2e/smoke.spec.ts --project=smoke --reporter=list 2>&1; then
  echo ""
  echo -e "  ${GREEN}✓${NC} Smoke tests: all pages render correctly"
else
  echo ""
  echo -e "  ${RED}✗${NC} Smoke tests: one or more pages failed to render"
  FAILED=true
fi
echo ""

if [ "$FAILED" = true ]; then
  echo -e "${RED}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${RED}${BOLD}  VERIFICATION FAILED — Tier 2 (Smoke Tests)${NC}"
  echo -e "${RED}${BOLD}  One or more pages crashed or failed to render.${NC}"
  echo -e "${RED}${BOLD}  Fix the errors and re-run: npm run verify${NC}"
  echo -e "${RED}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  exit 1
fi

echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  VERIFICATION PASSED — All tiers green (${RISK_TIER} tier)${NC}"
echo -e "${GREEN}${BOLD}  Head SHA: ${HEAD_SHA}${NC}"
echo -e "${GREEN}${BOLD}  Safe to commit.${NC}"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
