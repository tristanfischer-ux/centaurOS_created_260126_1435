#!/bin/bash
# Automated check for silent error handling patterns
# Run this before commits to catch missing error feedback

echo "Checking for silent error handling patterns..."
echo ""

# Pattern 1: result.success without else clause (potential silent failure)
# This finds if (result.success) { ... } without a following else
echo "=== Potential missing error handling ==="
rg -n "if \(result\.success\)" src/components --type tsx -A 10 | \
  grep -B 5 "^\-\-$" | \
  grep -v "else {" | \
  grep -v "toast\.error" | \
  head -50

echo ""
echo "=== Server action calls in startTransition without error handling ==="
# Find startTransition blocks that don't contain toast.error
rg -l "startTransition\(async" src/components --type tsx | while read file; do
  if ! grep -q "toast.error" "$file"; then
    echo "WARNING: $file has startTransition but may lack toast.error"
  fi
done

echo ""
echo "=== Components using server actions without toast import ==="
rg -l "await.*Action\(" src/components --type tsx | while read file; do
  if ! grep -q "from 'sonner'" "$file"; then
    echo "WARNING: $file calls server actions but doesn't import toast"
  fi
done

echo ""
echo "Check complete. Review any warnings above."
