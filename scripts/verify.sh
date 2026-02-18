#!/bin/bash
#
# verify.sh - Pre-commit verification for ForgeOS
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

# ─── Tier 1: Static Analysis ─────────────────────────────────────────────

echo -e "${BOLD}Tier 1: Static Analysis${NC}"
echo ""

# Security-focused type checking
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

# Baseline TypeScript regression check
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

# ESLint
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

if [ "$FAILED" = true ]; then
  echo -e "${RED}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${RED}${BOLD}  VERIFICATION FAILED — Tier 1 (Static Analysis)${NC}"
  echo -e "${RED}${BOLD}  Fix the errors above before committing.${NC}"
  echo -e "${RED}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  exit 1
fi

echo -e "  ${GREEN}${BOLD}Tier 1: All static checks passed${NC}"
echo ""

if [ "$STATIC_ONLY" = true ]; then
  echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}${BOLD}  VERIFICATION PASSED (static only)${NC}"
  echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  exit 0
fi

# ─── Tier 2: Page Smoke Tests ────────────────────────────────────────────

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

if SMOKE_ROUTES="$ROUTES" PLAYWRIGHT_SKIP_WEB_SERVER=1 npx playwright test e2e/smoke.spec.ts --project=smoke --reporter=list 2>&1; then
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
echo -e "${GREEN}${BOLD}  VERIFICATION PASSED — All tiers green${NC}"
echo -e "${GREEN}${BOLD}  Safe to commit.${NC}"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
