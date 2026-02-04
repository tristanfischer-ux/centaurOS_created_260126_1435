#!/bin/bash

echo "🔍 Checking for avatar anti-patterns..."

errors=0

# Check for direct Avatar usage (excluding ui/avatar.tsx and user-avatar.tsx)
echo ""
echo "Checking for direct Avatar imports..."
direct_avatar=$(rg "import.*Avatar.*from.*['\"]@/components/ui/avatar['\"]" \
  --type tsx --type ts \
  -g '!src/components/ui/avatar.tsx' \
  -g '!src/components/ui/user-avatar.tsx' \
  --files-with-matches 2>/dev/null || true)

if [ -n "$direct_avatar" ]; then
  echo "❌ Found direct Avatar imports (use UserAvatar instead):"
  echo "$direct_avatar" | sed 's/^/   /'
  echo ""
  echo "   Fix: Replace with 'import { UserAvatar } from \"@/components/ui/user-avatar\"'"
  errors=$((errors + 1))
else
  echo "✅ No direct Avatar imports found"
fi

# Check for hardcoded avatar backgrounds
echo ""
echo "Checking for hardcoded avatar backgrounds..."
hardcoded_bg=$(rg "AvatarFallback.*className=.*['\"].*bg-(muted|slate|foundry|blue|orange|transparent)" \
  --type tsx --type ts \
  -g '!src/components/ui/avatar.tsx' \
  -g '!src/components/ui/user-avatar.tsx' \
  2>/dev/null || true)

if [ -n "$hardcoded_bg" ]; then
  echo "❌ Found hardcoded avatar backgrounds:"
  echo "$hardcoded_bg" | head -10 | sed 's/^/   /'
  echo ""
  echo "   Fix: Use UserAvatar with role-based colors"
  errors=$((errors + 1))
else
  echo "✅ No hardcoded avatar backgrounds found"
fi

# Check for custom getInitials functions
echo ""
echo "Checking for duplicate getInitials functions..."
custom_getInitials=$(rg "(const|function) getInitials" \
  --type tsx --type ts \
  -g '!src/lib/utils.ts' \
  2>/dev/null || true)

if [ -n "$custom_getInitials" ]; then
  echo "❌ Found duplicate getInitials functions:"
  echo "$custom_getInitials" | head -10 | sed 's/^/   /'
  echo ""
  echo "   Fix: Use centralized utility: import { getInitials } from '@/lib/utils'"
  errors=$((errors + 1))
else
  echo "✅ No duplicate getInitials functions found"
fi

# Check for custom getAvatarColor functions
echo ""
echo "Checking for custom getAvatarColor functions..."
custom_getAvatarColor=$(rg "(const|function) getAvatarColor" \
  --type tsx --type ts \
  2>/dev/null || true)

if [ -n "$custom_getAvatarColor" ]; then
  echo "❌ Found custom getAvatarColor functions:"
  echo "$custom_getAvatarColor" | head -5 | sed 's/^/   /'
  echo ""
  echo "   Fix: Use UserAvatar with role-based colors (no manual color assignment)"
  errors=$((errors + 1))
else
  echo "✅ No custom getAvatarColor functions found"
fi

# Check for custom avatar stack implementations
echo ""
echo "Checking for custom avatar stack implementations..."
custom_stack=$(rg "AvatarStack|AssigneeAvatarStack" \
  --type tsx --type ts \
  -g '!src/components/ui/user-avatar.tsx' \
  2>/dev/null || true)

if [ -n "$custom_stack" ]; then
  echo "⚠️  Found custom avatar stack implementations:"
  echo "$custom_stack" | head -5 | sed 's/^/   /'
  echo ""
  echo "   Fix: Use UserAvatarStack from '@/components/ui/user-avatar'"
  # Don't increment errors - this is a warning, not an error
else
  echo "✅ No custom avatar stack implementations found"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $errors -eq 0 ]; then
  echo "✅ No avatar anti-patterns detected!"
  echo ""
  exit 0
else
  echo "❌ Found $errors avatar anti-pattern(s)"
  echo ""
  echo "Fix avatar issues before committing."
  echo "See .cursor/rules/avatar-standard.mdc for guidance"
  echo ""
  exit 1
fi
