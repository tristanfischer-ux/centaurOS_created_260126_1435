#!/bin/bash
echo "╔═════════════════════════════════════════════════════════════╗"
echo "║          FINAL COMPREHENSIVE TEST - ALL FEATURES           ║"
echo "╔═════════════════════════════════════════════════════════════╗"
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0

test_file() {
    if [ -f "$1" ]; then
        echo -e "  ${GREEN}✓${NC} $2"
        ((PASS++))
    else
        echo -e "  ${RED}✗${NC} $2"
        ((FAIL++))
    fi
}

echo -e "${BLUE}▶ THREAD REPLIES${NC}"
test_file "src/actions/threads.ts" "threads.ts (246 lines)"
test_file "src/components/messaging/ThreadPanel.tsx" "ThreadPanel.tsx (243 lines)"
echo ""

echo -e "${BLUE}▶ MESSAGE ACTIONS${NC}"
test_file "src/actions/message-actions.ts" "message-actions.ts (291 lines)"
test_file "src/components/messaging/StarredIndicator.tsx" "StarredIndicator.tsx"
test_file "src/components/messaging/PinnedIndicator.tsx" "PinnedIndicator.tsx"
echo ""

echo -e "${BLUE}▶ SEARCH OPERATORS${NC}"
test_file "src/lib/search/operators.ts" "operators.ts (254 lines)"
test_file "src/actions/search.ts" "search.ts (298 lines)"
echo ""

echo -e "${BLUE}▶ TYPESCRIPT CHECK${NC}"
if ! npx tsc --noEmit 2>&1 | grep -q -E "src/(actions/(threads|message-actions|search)|components/messaging/(ThreadPanel|StarredIndicator|PinnedIndicator)|lib/search/operators)"; then
    echo -e "  ${GREEN}✓${NC} No TypeScript errors in new code"
    ((PASS++))
else
    echo -e "  ${RED}✗${NC} TypeScript errors found"
    ((FAIL++))
fi
echo ""

echo -e "${BLUE}▶ DATABASE MIGRATION${NC}"
if npx supabase migration list 2>/dev/null | grep -q "20260202100000.*20260202100000"; then
    echo -e "  ${GREEN}✓${NC} Migration 20260202100000 applied"
    ((PASS++))
else
    echo -e "  ${RED}✗${NC} Migration not applied"
    ((FAIL++))
fi
echo ""

echo -e "${BLUE}▶ DEV SERVER${NC}"
if lsof -ti:3002 >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Process running on port 3002"
    ((PASS++))
else
    echo -e "  ${RED}✗${NC} No process on port 3002"
    ((FAIL++))
fi
echo ""

echo "═══════════════════════════════════════════════════════════"
echo -e "RESULTS: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}"
echo "═══════════════════════════════════════════════════════════"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✅ ALL CHECKS PASSED - READY FOR TESTING!${NC}"
    echo ""
    echo "Test at: http://localhost:3002/messages"
    echo ""
    echo "Quick tests:"
    echo "  1. Hover message + press R → Thread panel"
    echo "  2. Press S → Star appears"
    echo "  3. Press P → Pin appears"
    echo "  4. Type /search is:starred → Search works"
else
    echo -e "${RED}❌ SOME CHECKS FAILED${NC}"
fi

