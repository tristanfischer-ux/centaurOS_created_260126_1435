#!/bin/bash
# Security check: Find queries that might be missing foundry_id filters
# Run this before commits to catch potential IDOR/cross-foundry bugs

echo "🔒 Checking for missing foundry isolation..."
echo ""

# Tables that should always be filtered by foundry_id
FOUNDRY_TABLES="tasks|objectives|task_comments|standups|notifications|teams|blueprints"

echo "=== UPDATE queries without foundry_id filter ==="
rg -n "\.update\(" src/actions --type ts -A 5 | \
  grep -E "\.eq\('id'|\.in\('id'" | \
  grep -v "foundry_id" | \
  head -30

echo ""
echo "=== DELETE queries without foundry_id filter ==="
rg -n "\.delete\(\)" src/actions --type ts -A 3 | \
  grep -E "\.eq\('id'" | \
  grep -v "foundry_id" | \
  head -20

echo ""
echo "=== Batch operations (.in) without foundry_id ==="
rg -n "\.in\('id'" src/actions --type ts -B 2 -A 3 | \
  grep -v "foundry_id" | \
  head -30

echo ""
echo "=== SELECT on foundry-scoped tables without foundry_id ==="
for table in tasks objectives task_comments standups teams; do
  matches=$(rg -l "from\('$table'\)" src/actions --type ts 2>/dev/null)
  if [ -n "$matches" ]; then
    for file in $matches; do
      # Check if file has foundry_id filters
      if rg -q "from\('$table'\).*\.eq\('id'" "$file" 2>/dev/null; then
        if ! rg -q "from\('$table'\).*foundry_id" "$file" 2>/dev/null; then
          echo "WARNING: $file queries $table by id but may lack foundry_id filter"
        fi
      fi
    done
  fi
done

echo ""
echo "=== Functions modifying tasks without canModifyTask helper ==="
rg -n "from\('tasks'\).*\.update" src/actions/tasks.ts | \
  grep -v "canModifyTask" | \
  head -20

echo ""
echo "✅ Check complete. Review any warnings above."
echo ""
echo "Tips:"
echo "  - Every UPDATE/DELETE by ID should also filter by foundry_id"
echo "  - Batch operations (.in) are high-risk - always add foundry filter"
echo "  - Use canModifyTask() helper for task operations"
