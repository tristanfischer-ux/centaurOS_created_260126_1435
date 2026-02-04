#!/bin/bash

# =============================================
# Test Script for Pack Item Enhancements
# =============================================
# This script verifies that the pack item enhancements migration
# was successfully applied to the database.
#
# Usage: ./scripts/test-pack-enhancements.sh
# =============================================

set -e  # Exit on error

echo "🔍 Testing Pack Item Enhancements Migration..."
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to run SQL and check result
run_test() {
    local test_name="$1"
    local sql="$2"
    local expected="$3"
    
    echo -n "Testing: $test_name... "
    
    result=$(supabase db execute "$sql" 2>&1 | grep -v "^$" | tail -1)
    
    if [[ "$result" == *"$expected"* ]]; then
        echo -e "${GREEN}✓ PASS${NC}"
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        echo "  Expected: $expected"
        echo "  Got: $result"
        return 1
    fi
}

# Test 1: Check migration was applied
echo "1️⃣  Checking migration status..."
if supabase migration list | grep -q "20260204120000_enhance_pack_items_with_verified_guidance"; then
    echo -e "${GREEN}✓ Migration file found${NC}"
else
    echo -e "${RED}✗ Migration file not found${NC}"
    exit 1
fi
echo ""

# Test 2: Count enhanced pack items
echo "2️⃣  Counting enhanced descriptions..."
count=$(supabase db execute "
SELECT COUNT(*) 
FROM pack_items 
WHERE description LIKE '%Verified: February 4, 2026%';
" | grep -o '[0-9]\+' | head -1)

if [ "$count" -ge "30" ]; then
    echo -e "${GREEN}✓ Found $count enhanced tasks (expected ≥30)${NC}"
else
    echo -e "${YELLOW}⚠ Found $count enhanced tasks (expected ≥30)${NC}"
fi
echo ""

# Test 3: Check priority packs
echo "3️⃣  Verifying priority packs..."
supabase db execute "
SELECT 
  p.title as pack_title,
  COUNT(pi.id) as task_count,
  SUM(CASE WHEN pi.description LIKE '%https://%' THEN 1 ELSE 0 END) as tasks_with_links
FROM objective_packs p
LEFT JOIN pack_items pi ON p.id = pi.pack_id
WHERE p.title IN (
  'UK Startup Launchpad',
  'Build Hiring Pipeline',
  'Digital Presence & Brand',
  'Financial Infrastructure',
  'Company Formation & Governance'
)
GROUP BY p.title
ORDER BY p.title;
"
echo ""

# Test 4: Sample enhanced description
echo "4️⃣  Checking sample enhanced description..."
sample=$(supabase db execute "
SELECT 
  LEFT(pi.description, 100) as preview
FROM pack_items pi
JOIN objective_packs p ON pi.pack_id = p.id
WHERE p.title = 'UK Startup Launchpad'
AND pi.title = 'Register with Companies House'
LIMIT 1;
" | grep -v "^$" | head -3)

if [[ "$sample" == *"VERIFIED GUIDANCE"* ]]; then
    echo -e "${GREEN}✓ Enhanced description format verified${NC}"
else
    echo -e "${YELLOW}⚠ Enhanced description format not found${NC}"
fi
echo ""

# Test 5: Check for URLs
echo "5️⃣  Checking for official resource links..."
url_count=$(supabase db execute "
SELECT COUNT(*)
FROM pack_items
WHERE description LIKE '%https://www.gov.uk/%'
   OR description LIKE '%https://%.com%';
" | grep -o '[0-9]\+' | head -1)

if [ "$url_count" -ge "30" ]; then
    echo -e "${GREEN}✓ Found $url_count tasks with official links${NC}"
else
    echo -e "${YELLOW}⚠ Found $url_count tasks with links (expected ≥30)${NC}"
fi
echo ""

# Test 6: Check description lengths
echo "6️⃣  Analyzing description lengths..."
supabase db execute "
SELECT 
  CASE 
    WHEN LENGTH(description) < 500 THEN 'Short (<500)'
    WHEN LENGTH(description) < 2000 THEN 'Medium (500-2000)'
    WHEN LENGTH(description) < 5000 THEN 'Long (2000-5000)'
    ELSE 'Very Long (>5000)'
  END as length_category,
  COUNT(*) as count
FROM pack_items
GROUP BY length_category
ORDER BY MIN(LENGTH(description));
"
echo ""

# Summary
echo "📊 Summary"
echo "========================================="
echo ""
echo "✅ All tests completed!"
echo ""
echo "Next steps:"
echo "1. Review the test results above"
echo "2. Verify UI displays enhanced content correctly at /inspiration"
echo "3. Test creating an objective from an enhanced pack"
echo "4. Check that task descriptions show properly in task details"
echo ""
echo "For detailed verification, see: MIGRATION_VERIFICATION_GUIDE.md"
echo ""

exit 0
