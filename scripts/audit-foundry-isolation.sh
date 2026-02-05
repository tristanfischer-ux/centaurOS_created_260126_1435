#!/bin/bash

# Security Audit: Foundry Isolation
# Scans for database queries that might leak data across foundries

set -e

WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$WORKSPACE_ROOT"

echo "🔍 FOUNDRY ISOLATION SECURITY AUDIT"
echo "===================================="
echo ""

# Tables that MUST be filtered by foundry_id
MULTI_TENANT_TABLES=(
    "tasks"
    "objectives"
    "teams"
    "messages"
    "task_comments"
    "task_assignees"
    "objective_links"
    "foundries"
)

# Tables that should be filtered by foundry_id via JOIN or RLS
PROFILE_TABLES=(
    "profiles"
)

VIOLATIONS=0

for table in "${MULTI_TENANT_TABLES[@]}"; do
    echo "📋 Checking: $table"
    echo "-----------------------------------"
    
    # Find all queries for this table
    TOTAL=$(grep -r "\.from('$table')" src/app --include="*.tsx" --include="*.ts" | wc -l | xargs)
    
    # Find queries WITH foundry_id filter
    FILTERED=$(grep -r "\.from('$table')" src/app --include="*.tsx" --include="*.ts" -A5 | grep "\.eq('foundry_id" | wc -l | xargs)
    
    UNFILTERED=$((TOTAL - FILTERED))
    
    echo "  Total queries: $TOTAL"
    echo "  Filtered: $FILTERED"
    echo "  ⚠️  Potentially unfiltered: $UNFILTERED"
    
    if [ $UNFILTERED -gt 0 ]; then
        echo ""
        echo "  🚨 VIOLATIONS FOUND:"
        grep -rn "\.from('$table')" src/app --include="*.tsx" --include="*.ts" | \
            grep -v "\.eq('foundry_id" | \
            grep -v "// SECURITY:" | \
            head -10
        echo ""
        VIOLATIONS=$((VIOLATIONS + UNFILTERED))
    fi
    
    echo ""
done

# Check profiles separately (different pattern due to RLS being disabled)
echo "📋 Checking: profiles (CRITICAL - RLS DISABLED)"
echo "-----------------------------------"

PROFILE_TOTAL=$(grep -r "\.from('profiles')" src/app --include="*.tsx" --include="*.ts" | wc -l | xargs)
PROFILE_FILTERED=$(grep -r "\.from('profiles')" src/app --include="*.tsx" --include="*.ts" -A3 | grep "\.eq('foundry_id" | wc -l | xargs)
PROFILE_SELF=$(grep -r "\.from('profiles')" src/app --include="*.tsx" --include="*.ts" -A3 | grep "\.eq('id'" | wc -l | xargs)

PROFILE_UNFILTERED=$((PROFILE_TOTAL - PROFILE_FILTERED - PROFILE_SELF))

echo "  Total queries: $PROFILE_TOTAL"
echo "  Filtered by foundry_id: $PROFILE_FILTERED"
echo "  Self-queries (user's own profile): $PROFILE_SELF"
echo "  ⚠️  Potentially unfiltered: $PROFILE_UNFILTERED"

if [ $PROFILE_UNFILTERED -gt 0 ]; then
    echo ""
    echo "  🚨 VIOLATIONS FOUND:"
    grep -rn "\.from('profiles')" src/app --include="*.tsx" --include="*.ts" | \
        grep -v "\.eq('foundry_id" | \
        grep -v "\.eq('id'" | \
        grep -v "// SECURITY:" | \
        head -15
    echo ""
    VIOLATIONS=$((VIOLATIONS + PROFILE_UNFILTERED))
fi

echo ""
echo "===================================="
echo "AUDIT SUMMARY"
echo "===================================="
echo "🚨 Total Violations: $VIOLATIONS"
echo ""

if [ $VIOLATIONS -gt 0 ]; then
    echo "❌ SECURITY AUDIT FAILED"
    echo ""
    echo "Action required:"
    echo "1. Review each unfiltered query"
    echo "2. Add .eq('foundry_id', foundry_id) where appropriate"
    echo "3. Add // SECURITY: comment if foundry_id filtering is not needed (with justification)"
    echo "4. Re-run this script until violations = 0"
    exit 1
else
    echo "✅ SECURITY AUDIT PASSED"
    echo "All multi-tenant queries appear to be properly filtered."
    exit 0
fi
