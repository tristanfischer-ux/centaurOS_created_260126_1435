---
name: security-bug-hunt
description: Systematically hunt for security bugs across the ForgeOS codebase. Use when asked to find bugs, audit security, check for vulnerabilities, hunt for issues, or when investigating patterns of bugs that might exist elsewhere. Finds IDOR, missing foundry isolation, silent error handling, column mismatches, and similar issues.
role: |
  You are a security researcher who hunts vulnerabilities systematically.
  When you fix one bug, you immediately search for the same pattern elsewhere.
  You assume bugs are never isolated - if it happened once, it happened again.
  You use grep patterns to find issues at scale, not manual file-by-file review.
---

# Security Bug Hunt Skill

This skill provides a systematic approach to finding and fixing security bugs across the codebase. Use it proactively after fixing any bug to check if the same pattern exists elsewhere.

## IMPORTANT: Always Hunt After Fixing

**When you fix a bug, ALWAYS search for the same pattern elsewhere.** The bug you just fixed likely exists in other places.

## Quick Commands

```bash
# Check for missing foundry isolation
./scripts/check-foundry-isolation.sh

# Check for silent error handling
./scripts/check-error-handling.sh

# Run both
./scripts/check-foundry-isolation.sh && ./scripts/check-error-handling.sh
```

## Bug Hunt Workflow

```
Bug Hunt Progress:
- [ ] 1. Identify the bug pattern
- [ ] 2. Search for same pattern across codebase
- [ ] 3. Fix all instances found
- [ ] 4. Create/update automated check script
- [ ] 5. Update relevant skill to prevent recurrence
```

## Common Bug Patterns to Hunt

### 1. Column Name Mismatches

**Pattern:** Code uses wrong column name that doesn't exist in database.

**Example found:** `conversation_participants` table uses `profile_id`, but code queried `user_id`.

**How to hunt:**
```bash
# Find all tables with profile_id in migrations
rg "profile_id" supabase/migrations --type sql

# Find code querying those tables with user_id
rg "conversation_participants.*user_id|user_id.*conversation_participants" src/

# Cross-reference column names
rg "\.eq\('user_id'" src/actions --type ts | head -20
rg "\.eq\('profile_id'" src/actions --type ts | head -20
```

**Fix pattern:** Verify column name in migration, update code to match.

### 2. Missing Foundry Isolation

**Pattern:** Query fetches/modifies data without filtering by `foundry_id`.

**Example found:** `batchApproveTasks` could update tasks from any foundry.

**How to hunt:**
```bash
# Tables with foundry_id
rg "foundry_id" supabase/migrations --type sql -l

# UPDATE queries without foundry filter
rg "\.update\(" src/actions --type ts -A 5 | grep -E "\.eq\('id'|\.in\('id'" | grep -v foundry_id

# Batch operations without foundry filter
rg "\.in\('id'" src/actions --type ts -B 2 -A 3 | grep -v foundry_id
```

**Fix pattern:**
```typescript
// Always add foundry_id to UPDATE/DELETE queries
await supabase.from('tasks')
  .update({ status: 'Completed' })
  .eq('id', taskId)
  .eq('foundry_id', foundryId)  // Add this
```

### 3. Silent Error Handling

**Pattern:** Server action returns `{ success: false, error }` but UI doesn't show error.

**Example found:** `handleReply` checked `result.success` but had no `else` clause.

**How to hunt:**
```bash
# Find result.success checks without else
rg "if \(result\.success\)" src/components --type tsx -A 10 | grep -v "else"

# Find startTransition without toast.error
rg -l "startTransition\(async" src/components --type tsx | while read f; do
  grep -q "toast.error" "$f" || echo "WARNING: $f may lack error handling"
done
```

**Fix pattern:**
```typescript
if (result.success) {
  toast.success('Action completed')
} else {
  toast.error(result.error || 'Something went wrong')  // Always add this
}
```

### 4. Inconsistent Helper Usage

**Pattern:** A security helper exists but isn't used consistently.

**Example found:** `canModifyTask` existed but only some functions used it.

**How to hunt:**
```bash
# Find the helper definition
rg "async function canModifyTask" src/actions

# Count usages vs potential usages
rg "canModifyTask" src/actions --type ts | wc -l
rg "from\('tasks'\).*update" src/actions/tasks.ts | wc -l
```

**Fix pattern:** Use existing helpers consistently across all similar operations.

### 5. Missing Migration Application

**Pattern:** Migration file exists locally but wasn't pushed to database.

**Example found:** `activity_stream_tables.sql` existed but tables didn't exist in production.

**How to hunt:**
```bash
# Check migration status
npx supabase migration list

# Look for Local-only migrations (empty Remote column)
npx supabase migration list | grep "|                |"
```

**Fix pattern:**
```bash
# Push pending migrations
npx supabase db push
```

### 6. Duplicate Migration Timestamps

**Pattern:** Two migration files with same timestamp cause conflicts.

**Example found:** Two files named `20260201300000_*.sql`.

**How to hunt:**
```bash
# Find duplicate timestamps
ls supabase/migrations/*.sql | cut -d'_' -f1 | sort | uniq -d
```

**Fix pattern:** Rename one migration to a different timestamp.

## Hunt Checklist by Area

### Server Actions (`src/actions/`)
- [ ] All functions check authentication (`getUser()`)
- [ ] All functions get foundry context (`getFoundryIdCached()`)
- [ ] All SELECT by ID include `foundry_id` filter
- [ ] All UPDATE by ID include `foundry_id` filter
- [ ] All DELETE by ID include `foundry_id` filter
- [ ] Batch operations include `foundry_id` filter
- [ ] Error responses use `sanitizeErrorMessage()`

### Components (`src/components/`)
- [ ] All server action calls have error handling
- [ ] `toast.error` called when `result.success === false`
- [ ] Loading states shown during pending operations
- [ ] `toast` imported from `sonner` in files using it

### Database (`supabase/migrations/`)
- [ ] All migrations use `IF NOT EXISTS` / `IF EXISTS` for idempotency
- [ ] `DROP POLICY IF EXISTS` before `CREATE POLICY`
- [ ] No duplicate timestamps
- [ ] All migrations pushed to remote

### Library Code (`src/lib/`)
- [ ] Functions verify foundry context before querying
- [ ] Internal helpers don't bypass security checks

## Creating Prevention Scripts

When you find a new bug pattern, create an automated check:

```bash
#!/bin/bash
# scripts/check-new-pattern.sh

echo "Checking for [pattern name]..."

# Pattern detection command
rg "[pattern]" src/ --type ts

echo "Check complete."
```

Make it executable:
```bash
chmod +x scripts/check-new-pattern.sh
```

## Updating Skills After Finding Bugs

After fixing a class of bugs, update the relevant skill:

1. **Column mismatches** → Update `supabase-migration` skill
2. **Missing foundry isolation** → Update `secure-server-actions` skill
3. **Silent error handling** → Update `component-patterns` rule
4. **API security** → Update `secure-api-routes` skill

Add:
- The specific pattern that was wrong
- The correct pattern to use
- Example code showing before/after
- Checklist item to catch it in review

## Example Hunt Session

```
User: "Messages aren't appearing in Today view"

1. INVESTIGATE: Find the query fetching messages
   → Found: activity.ts queries conversation_participants

2. IDENTIFY BUG: Column name mismatch
   → Code uses: .eq('user_id', user.id)
   → Table has: profile_id column

3. FIX THE BUG: Change to .eq('profile_id', user.id)

4. HUNT FOR SAME PATTERN:
   rg "conversation_participants.*user_id" src/
   → Found 2 more instances, fixed them

5. CHECK FOR SIMILAR ISSUES:
   → Compared all table schemas vs code queries
   → No other mismatches found

6. VERIFY MIGRATION APPLIED:
   npx supabase migration list
   → Found migration not pushed, applied it

7. CREATE PREVENTION:
   → Updated supabase-migration skill with timestamp collision check
   → Schema is source of truth for column names

8. VERIFY FIX:
   → Confirmed all migrations synced
   → Confirmed code uses correct column names
```

## Evaluation (Before Completing)

Before marking bug hunt complete, verify:

- [ ] **Pattern searched?** Did you search the entire codebase for the bug pattern?
- [ ] **All instances fixed?** Did you fix every occurrence, not just the reported one?
- [ ] **Similar patterns checked?** Did you check for related issues (e.g., if missing foundry_id, check all queries)?
- [ ] **Migration verified?** If schema-related, did you confirm migrations are applied?
- [ ] **Prevention created?** Did you add a check script or rule to prevent recurrence?
- [ ] **Verification complete?** Did you test that the fix works in all affected locations?

## When to Use This Skill

Use this skill when:

1. **After fixing any bug** - Hunt for same pattern elsewhere
2. **User asks to "find bugs"** - Systematic security audit
3. **User mentions "audit" or "check security"** - Full codebase review
4. **Investigating why feature doesn't work** - May reveal schema/code mismatch
5. **Before major releases** - Comprehensive bug hunt

## Related Skills

- [secure-server-actions](../secure-server-actions/SKILL.md) - Patterns for secure server actions
- [secure-database](../secure-database/SKILL.md) - RLS and database security
- [supabase-migration](../supabase-migration/SKILL.md) - Database schema management
- [security-review](../security-review/SKILL.md) - Pre-commit security checklist
