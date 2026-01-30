#!/bin/bash
# Color Token Migration Script
# Migrates hardcoded colors to semantic tokens

set -e

echo "🎨 Starting color token migration..."
echo ""

# Count before
echo "📊 Counting hardcoded colors before migration..."
BEFORE_TEXT=$(rg "text-slate-[4-9]00" src/ --count-matches | awk -F: '{sum+=$2} END {print sum}')
BEFORE_BG=$(rg "bg-(white|slate-[1-5]0)" src/ --count-matches | awk -F: '{sum+=$2} END {print sum}')
BEFORE_BORDER=$(rg "border-(slate|blue|foundry)-[0-9]+" src/ --count-matches | awk -F: '{sum+=$2} END {print sum}')

echo "  Text colors: $BEFORE_TEXT"
echo "  Background colors: $BEFORE_BG"
echo "  Border colors: $BEFORE_BORDER"
echo ""

echo "🔄 Migrating text colors..."
find src -name "*.tsx" -type f -exec sed -i '' \
  -e 's/text-slate-900/text-foreground/g' \
  -e 's/text-slate-800/text-foreground/g' \
  -e 's/text-slate-700/text-foreground/g' \
  -e 's/text-slate-600/text-muted-foreground/g' \
  -e 's/text-slate-500/text-muted-foreground/g' \
  -e 's/text-slate-400/text-muted-foreground/g' \
  {} +

echo "🔄 Migrating background colors..."
find src -name "*.tsx" -type f -exec sed -i '' \
  -e 's/bg-white /bg-background /g' \
  -e 's/"bg-white"/"bg-background"/g' \
  -e 's/bg-slate-50/bg-muted/g' \
  -e 's/bg-slate-100/bg-muted/g' \
  {} +

echo "🔄 Migrating border colors..."
find src -name "*.tsx" -type f -exec sed -i '' \
  -e 's/border-slate-200 /border /g' \
  -e 's/"border-slate-200"/"border"/g' \
  -e 's/border-blue-200/border/g' \
  -e 's/border-foundry-200/border/g' \
  {} +

# Count after
echo ""
echo "📊 Counting remaining hardcoded colors..."
AFTER_TEXT=$(rg "text-slate-[4-9]00" src/ --count-matches 2>/dev/null | awk -F: '{sum+=$2} END {print sum}' || echo "0")
AFTER_BG=$(rg "bg-(white|slate-[1-5]0)" src/ --count-matches 2>/dev/null | awk -F: '{sum+=$2} END {print sum}' || echo "0")
AFTER_BORDER=$(rg "border-(slate|blue|foundry)-[0-9]+" src/ --count-matches 2>/dev/null | awk -F: '{sum+=$2} END {print sum}' || echo "0")

echo "  Text colors: $AFTER_TEXT (was $BEFORE_TEXT)"
echo "  Background colors: $AFTER_BG (was $BEFORE_BG)"
echo "  Border colors: $AFTER_BORDER (was $BEFORE_BORDER)"
echo ""

echo "✅ Color token migration complete!"
echo ""
echo "Next steps:"
echo "  1. Run: npm run build"
echo "  2. Review changes: git diff src/"
echo "  3. Test the app: npm run dev"
echo "  4. Fix any remaining issues manually"
