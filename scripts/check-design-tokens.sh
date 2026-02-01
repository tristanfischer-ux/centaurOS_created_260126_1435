#!/bin/bash
# CentaurOS Design Token Enforcement Script
# Run before committing UI changes to catch design system violations
#
# Usage: ./scripts/check-design-tokens.sh [path]
# If path is provided, only checks that path. Otherwise checks all of src/

set -e

TARGET="${1:-src/}"
VIOLATIONS=0
WARNINGS=0

echo "🎨 CentaurOS Design Token Check"
echo "================================"
echo "Checking: $TARGET"
echo ""

# Color codes for output
RED='\033[0;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Function to check for pattern and report
check_pattern() {
    local pattern="$1"
    local message="$2"
    local suggestion="$3"
    local severity="${4:-error}"  # error or warning
    
    # Use ripgrep if available, otherwise grep
    if command -v rg &> /dev/null; then
        local count=$(rg -c "$pattern" "$TARGET" --type tsx --type ts 2>/dev/null | awk -F: '{sum += $2} END {print sum+0}')
    else
        local count=$(grep -r -E "$pattern" "$TARGET" --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')
    fi
    
    if [ "$count" -gt 0 ]; then
        if [ "$severity" = "error" ]; then
            echo -e "${RED}❌ VIOLATION:${NC} $message"
            echo "   Found: $count instances"
            echo "   Fix: $suggestion"
            echo ""
            VIOLATIONS=$((VIOLATIONS + count))
        else
            echo -e "${YELLOW}⚠️  WARNING:${NC} $message"
            echo "   Found: $count instances"
            echo "   Consider: $suggestion"
            echo ""
            WARNINGS=$((WARNINGS + count))
        fi
    fi
}

echo "Checking for forbidden patterns..."
echo ""

# === CRITICAL: Text Colors ===
check_pattern "text-slate-[0-9]" \
    "Hardcoded slate text colors" \
    "Use text-foreground or text-muted-foreground"

check_pattern "text-gray-[0-9]" \
    "Hardcoded gray text colors" \
    "Use text-foreground or text-muted-foreground"

# === CRITICAL: Status Text Colors ===
check_pattern "text-red-[0-9]" \
    "Hardcoded red text (status)" \
    "Use text-destructive"

check_pattern "text-green-[0-9]" \
    "Hardcoded green text (status)" \
    "Use text-status-success"

check_pattern "text-emerald-[0-9]" \
    "Hardcoded emerald text (status)" \
    "Use text-status-success"

check_pattern "text-amber-[0-9]" \
    "Hardcoded amber text (status)" \
    "Use text-status-warning" \
    "warning"  # Warning because amber is sometimes used for stars

check_pattern "text-blue-[0-9]" \
    "Hardcoded blue text (status)" \
    "Use text-status-info"

# === CRITICAL: Background Colors ===
check_pattern 'bg-white[^/]' \
    "Hardcoded white background" \
    "Use bg-background (bg-white/opacity is OK for overlays)"

check_pattern "bg-slate-[0-9]" \
    "Hardcoded slate background" \
    "Use bg-muted or bg-secondary"

# === CRITICAL: Status Background Colors ===
check_pattern "bg-red-[0-9]" \
    "Hardcoded red background (status)" \
    "Use bg-status-error-light or bg-destructive"

check_pattern "bg-green-[0-9]" \
    "Hardcoded green background (status)" \
    "Use bg-status-success-light"

check_pattern "bg-emerald-[0-9]" \
    "Hardcoded emerald background (status)" \
    "Use bg-status-success-light"

check_pattern "bg-amber-[0-9]" \
    "Hardcoded amber background (status)" \
    "Use bg-status-warning-light"

check_pattern "bg-blue-[0-9]" \
    "Hardcoded blue background (status)" \
    "Use bg-status-info-light"

# === CRITICAL: Dark Mode (Dead Code) ===
check_pattern "dark:" \
    "Dark mode variants (dead code - app enforces light mode)" \
    "Remove dark: variants entirely"

# === CRITICAL: Theme Configuration ===
check_pattern 'defaultTheme.*system' \
    "ThemeProvider using system theme" \
    "Use defaultTheme=\"light\" in src/app/layout.tsx"

check_pattern 'enableSystem.*true' \
    "ThemeProvider with system preference enabled" \
    "Use enableSystem={false} in src/app/layout.tsx"

# === Summary ===
echo "================================"
if [ $VIOLATIONS -gt 0 ]; then
    echo -e "${RED}FAILED:${NC} Found $VIOLATIONS violation(s)"
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}Plus $WARNINGS warning(s) to review${NC}"
    fi
    echo ""
    echo "Fix all violations before committing."
    echo "See .cursor/rules/color-consistency.mdc for token mappings."
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}PASSED with warnings:${NC} $WARNINGS item(s) to review"
    echo ""
    echo "Warnings are not blocking but should be reviewed."
    exit 0
else
    echo -e "${GREEN}PASSED:${NC} No design token violations found!"
    exit 0
fi
