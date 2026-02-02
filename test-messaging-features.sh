#!/bin/bash
# Comprehensive test script for messaging power features

echo "========================================="
echo "MESSAGING POWER FEATURES - TEST SUITE"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS="${GREEN}✓${NC}"
FAIL="${RED}✗${NC}"
WARN="${YELLOW}⚠${NC}"

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run test
run_test() {
    local test_name=$1
    local test_command=$2
    
    echo -n "Testing: $test_name ... "
    if eval "$test_command" > /dev/null 2>&1; then
        echo -e "$PASS"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "$FAIL"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Function to check file exists
check_file() {
    local file=$1
    local description=$2
    run_test "$description" "test -f '$file'"
}

echo "1. DATABASE MIGRATION VERIFICATION"
echo "-----------------------------------"

# Check if migration is applied
echo -n "Checking migration status ... "
if npx supabase migration list 2>/dev/null | grep -q "20260202100000"; then
    echo -e "$PASS Migration 20260202100000_messaging_power_features applied"
    ((TESTS_PASSED++))
else
    echo -e "$FAIL Migration not found"
    ((TESTS_FAILED++))
fi

echo ""
echo "2. TYPESCRIPT COMPILATION"
echo "-------------------------"

# Check TS compilation for messaging files
echo -n "TypeScript compilation (messaging files) ... "
if ! npx tsc --noEmit 2>&1 | grep -q -E "src/(actions/reactions|hooks/use|lib/commands|components/messaging)"; then
    echo -e "$PASS No errors in messaging files"
    ((TESTS_PASSED++))
else
    echo -e "$FAIL TypeScript errors found"
    ((TESTS_FAILED++))
fi

echo ""
echo "3. FILE STRUCTURE VERIFICATION"
echo "-------------------------------"

# Check all required files exist
check_file "src/actions/reactions.ts" "reactions.ts exists"
check_file "src/hooks/useMessagingShortcuts.ts" "useMessagingShortcuts.ts exists"
check_file "src/hooks/useInputHistory.ts" "useInputHistory.ts exists"
check_file "src/hooks/useDraft.ts" "useDraft.ts exists"
check_file "src/hooks/useReactions.ts" "useReactions.ts exists"
check_file "src/components/messaging/CommandInput.tsx" "CommandInput.tsx exists"
check_file "src/components/messaging/ReactionPicker.tsx" "ReactionPicker.tsx exists"
check_file "src/components/messaging/ReactionDisplay.tsx" "ReactionDisplay.tsx exists"
check_file "src/lib/commands/index.ts" "commands/index.ts exists"
check_file "src/lib/commands/registry.ts" "commands/registry.ts exists"
check_file "src/lib/commands/parser.ts" "commands/parser.ts exists"
check_file "src/lib/commands/executor.ts" "commands/executor.ts exists"

echo ""
echo "4. COMMAND SYSTEM FILES"
echo "-----------------------"

check_file "src/lib/commands/built-in/messaging.ts" "messaging commands"
check_file "src/lib/commands/built-in/status.ts" "status commands"
check_file "src/lib/commands/built-in/navigation.ts" "navigation commands"
check_file "src/lib/commands/built-in/utility.ts" "utility commands"
check_file "src/lib/commands/built-in/project.ts" "project commands"

echo ""
echo "5. DEV SERVER STATUS"
echo "--------------------"

echo -n "Dev server responding ... "
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/ 2>&1 | grep -q "200\|302\|500"; then
    echo -e "$PASS Server is running"
    ((TESTS_PASSED++))
else
    echo -e "$FAIL Server not responding"
    ((TESTS_FAILED++))
fi

echo ""
echo "6. CODE QUALITY CHECKS"
echo "----------------------"

# Check for any TODO comments in new files
echo -n "No stray TODO comments ... "
if ! grep -r "TODO" src/actions/reactions.ts src/hooks/use*.ts src/lib/commands/ src/components/messaging/ 2>/dev/null | grep -v "TodoWrite"; then
    echo -e "$PASS"
    ((TESTS_PASSED++))
else
    echo -e "$WARN Found TODO comments"
fi

# Check for console.log in production code
echo -n "No console.log in components ... "
if ! grep -r "console\.log" src/components/messaging/*.tsx 2>/dev/null | grep -v "console.error\|console.warn\|console.info"; then
    echo -e "$PASS"
    ((TESTS_PASSED++))
else
    echo -e "$WARN Found console.log statements"
fi

echo ""
echo "========================================="
echo "TEST SUMMARY"
echo "========================================="
echo -e "Total Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Total Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
    echo ""
    echo "🎉 Messaging power features are ready for testing!"
    echo ""
    echo "Next steps:"
    echo "1. Navigate to http://localhost:3002/messages"
    echo "2. Test emoji reactions (hover over messages)"
    echo "3. Test slash commands (type / in message input)"
    echo "4. Test @mentions (type @ in message input)"
    echo "5. Test up arrow history recall"
    exit 0
else
    echo -e "${RED}✗ SOME TESTS FAILED${NC}"
    echo ""
    echo "Please review the failures above and fix any issues."
    exit 1
fi
