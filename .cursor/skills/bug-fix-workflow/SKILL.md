---
name: bug-fix-workflow
description: Systematic approach to debugging and fixing bugs in CentaurOS. Use when investigating errors, fixing bugs, debugging issues, troubleshooting problems, or when the user mentions bug, error, broken, not working, issue, or crash.
---

# Bug Fix Workflow

This skill provides a systematic approach to identifying, fixing, and verifying bug fixes in CentaurOS.

## Autonomous Execution Principle

**When given a bug report: just fix it.** Don't ask for hand-holding.

- If you can read the error, you can fix the error
- Point at logs, errors, failing tests - then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

**DO:**
- Read the error message
- Identify the file and line
- Understand the root cause
- Implement the fix
- Verify it works
- Report success

**DON'T:**
- Ask "what should I do?"
- Ask for permission to look at files
- Wait for instructions on each step
- Present options without a recommendation

## Bug Fix Process

```
Bug Fix Progress:
- [ ] 1. Reproduce the bug
- [ ] 2. Identify root cause
- [ ] 3. Implement fix
- [ ] 4. Test the fix
- [ ] 5. Verify no regressions
- [ ] 6. Commit with clear message
```

## Step 1: Reproduce the Bug

**Cannot fix what you cannot reproduce.** First, confirm the bug:

### For UI Bugs

1. Identify the exact page/component
2. List the steps to reproduce
3. Note the expected vs actual behavior
4. Check browser console for errors

### For API/Backend Bugs

1. Identify the endpoint or action
2. Get the exact request that fails
3. Check server logs for errors:
   ```bash
   # Check Vercel logs
   vercel logs [deployment-url] --follow
   
   # Check Supabase logs
   # Go to Dashboard → Logs
   ```

### For Database Bugs

1. Identify the query that fails
2. Run query in Supabase SQL Editor
3. Check for RLS policy blocks
4. Verify data state

## Step 2: Identify Root Cause

### Error Analysis Pattern

1. **Read the full error message** - Don't skim
2. **Find the stack trace** - Identify exact file and line
3. **Check the context** - What data was being processed?
4. **Trace backwards** - What called this code?

### Common Bug Categories

| Category | Symptoms | Where to Look |
|----------|----------|---------------|
| Type error | TypeScript compile error | Check interface definitions |
| Null/undefined | `Cannot read property of undefined` | Add null checks |
| RLS block | Empty data, 403 errors | Check Supabase policies |
| Race condition | Intermittent failures | Check async/await usage |
| State bug | UI shows wrong data | Check React state management |
| API error | 500/400 errors | Check server action logic |

### Debugging Commands

```bash
# Check for TypeScript errors
npx tsc --noEmit

# Check for lint errors
npm run lint

# Search for related code
grep -r "functionName" src/ --include="*.ts" --include="*.tsx"

# Check git blame for recent changes
git log --oneline -20 -- src/path/to/file.tsx
```

## Step 3: Implement Fix

### Before Coding

1. Understand WHY the bug exists, not just WHERE
2. Consider if the fix could break other things
3. Think about edge cases

### Fix Patterns

**Pattern: Add Null Check**
```typescript
// Before (crashes if user is null)
const name = user.name;

// After (safe)
const name = user?.name ?? 'Unknown';
```

**Pattern: Fix Async/Await**
```typescript
// Before (race condition)
fetchData();
processData(data);

// After (correct order)
const data = await fetchData();
processData(data);
```

**Pattern: Fix Type Error**
```typescript
// Before (type mismatch)
function process(id: string) { ... }
process(123);

// After (correct type)
process(String(123));
// Or fix at source
process("123");
```

**Pattern: Fix RLS Issue**
```typescript
// Before (RLS blocks due to missing foundry_id)
const { error } = await supabase
  .from('table')
  .insert({ name: 'test' });

// After (include required fields)
const { error } = await supabase
  .from('table')
  .insert({ 
    name: 'test',
    foundry_id: user.user_metadata.foundry_id 
  });
```

### Making the Change

1. Make the **minimal fix** - Don't refactor unrelated code
2. Add **comments** if the fix isn't obvious
3. Consider adding **logging** for future debugging

## Step 4: Test the Fix

### Manual Testing

1. Reproduce original bug steps - should now work
2. Try variations of the original scenario
3. Try edge cases (empty data, long strings, etc.)

### Run Automated Tests

```bash
# Run unit tests
npm run test

# Run specific test file
npm run test -- src/lib/__tests__/specific.test.ts

# Run E2E tests
npm run test:e2e

# Run specific E2E test
npm run test:e2e -- e2e/specific.spec.ts
```

### Build Test

```bash
# Ensure build passes
npm run build
```

## Step 5: Verify No Regressions

### Quick Regression Check

1. Test the most critical paths:
   - [ ] Login works
   - [ ] Dashboard loads
   - [ ] Can create/edit items
   - [ ] Can view data

2. Test related features:
   - What else uses the code you changed?
   - Test those features too

### Run Full Test Suite

```bash
# Lint + Type check + Unit tests
npm run lint && npx tsc --noEmit && npm run test
```

## Step 6: Commit with Clear Message

Use the `fix:` prefix for bug fixes:

```bash
git add .
git commit -m "fix(component): brief description of what was fixed

- Root cause: explain why the bug existed
- Solution: explain the fix approach
- Tested: list what was tested

Fixes #123"
```

**Example:**
```
fix(tasks): prevent crash when viewing deleted task

- Root cause: Task query didn't handle deleted tasks
- Solution: Added null check and redirect to 404
- Tested: View deleted task, view normal task, create task

Fixes #456
```

## Debugging Tools & Techniques

### Browser DevTools

- **Console**: Check for errors
- **Network**: Check API requests/responses
- **React DevTools**: Inspect component state
- **Application**: Check localStorage/cookies

### VS Code Debugging

```json
// .vscode/launch.json
{
  "configurations": [
    {
      "name": "Next.js: debug",
      "type": "node-terminal",
      "request": "launch",
      "command": "npm run dev"
    }
  ]
}
```

### Console Logging (Temporary)

```typescript
// Add strategic logs
console.log('=== DEBUG ===');
console.log('Input:', input);
console.log('User:', user);
console.log('Result:', result);
console.log('=============');

// Remove before committing!
```

### Supabase Query Logging

```typescript
// Log the actual query
const query = supabase
  .from('tasks')
  .select('*')
  .eq('id', taskId);

console.log('Query:', query); // See the built query

const { data, error } = await query;
console.log('Error:', error); // Check for RLS errors
```

## Common CentaurOS Bugs

### "Cannot read property 'foundry_id' of null"

**Cause:** User metadata not loaded yet
**Fix:**
```typescript
if (!user?.user_metadata?.foundry_id) {
  redirect('/login');
}
```

### "RLS policy violation"

**Cause:** Missing or wrong foundry_id
**Fix:** Ensure foundry_id is included in insert/update

### "Hydration mismatch"

**Cause:** Server/client render different content
**Fix:** Use `useEffect` for client-only content or add `suppressHydrationWarning`

### "Type 'X' is not assignable to type 'Y'"

**Cause:** Database schema changed but types weren't updated
**Fix:**
```bash
npx supabase gen types typescript --linked > src/types/database.types.ts
```

## Bug Prevention Checklist

After fixing, consider:

- [ ] Should there be a test for this?
- [ ] Can TypeScript catch this?
- [ ] Should there be input validation?
- [ ] Should there be error handling?
- [ ] Is this documented?

## Capture the Lesson

After fixing a bug, document what you learned:

1. **Update `tasks/lessons.md`** if the bug reveals a pattern to avoid
2. **Consider a rule** if the same type of bug could happen elsewhere
3. **Add a regression test** to prevent the bug from returning

See [self-improvement-loop](../self-improvement-loop/SKILL.md) for the lessons.md format.

## See Also

- [references/common-errors.md](references/common-errors.md) - Catalog of common errors

---

## When to Use This Skill

Use this skill when:

1. **Investigating errors** - Error messages, stack traces, or unexpected behavior
2. **User reports "not working"** - Symptoms without clear cause
3. **Production incidents** - Live issues requiring rapid diagnosis
4. **Test failures** - Unit, integration, or E2E tests failing
5. **Regression hunting** - Functionality that previously worked but now doesn't

## When NOT to Use

| Situation | Use Instead |
|-----------|-------------|
| Adding new features | [feature-implementation-guide](../feature-implementation-guide/SKILL.md) |
| Reviewing code quality | [comprehensive-code-review](../comprehensive-code-review/SKILL.md) |
| Database schema changes | [supabase-migration](../supabase-migration/SKILL.md) |
| Running/writing tests | [e2e-testing](../e2e-testing/SKILL.md) |
| Security vulnerabilities | [security-review](../security-review/SKILL.md) |

## Quick Reference

| Bug Category | First Step | Key Tools |
|--------------|------------|-----------|
| **Type error** | `npx tsc --noEmit` | Check interface definitions, regenerate DB types |
| **UI not rendering** | Browser DevTools Console | React DevTools, check component state |
| **API returning 500** | Check server logs | `vercel logs`, Supabase Dashboard → Logs |
| **RLS blocking data** | Check policies in Supabase | Verify `foundry_id`, test with service role |
| **Build failure** | `npm run build` | Check imports, missing dependencies |
| **Hydration mismatch** | Check server vs client render | Use `useEffect` for client-only content |
| **Race condition** | Add logging with timestamps | Verify async/await order |

## Troubleshooting

### Issue: Bug reproduces locally but not in production

**Cause:** Environment differences (env vars, database state, caching)

**Fix:**
1. Check `.env.local` vs production environment variables
2. Compare database data between environments
3. Clear browser cache and Next.js `.next` folder
4. Check if CDN/edge caching is involved

### Issue: Fix works but breaks other tests

**Cause:** Shared state or unintended side effects

**Fix:**
1. Run full test suite: `npm run lint && npx tsc --noEmit && npm run test`
2. Check what else uses the modified code: `rg "functionName" src/`
3. Consider if fix should be more targeted or if tests need updating
4. Add regression test for the original bug

### Issue: Cannot reproduce the bug at all

**Cause:** Missing context, intermittent issue, or already fixed

**Fix:**
1. Get exact steps from reporter (browser, user role, data state)
2. Check if recent commits might have fixed it
3. Add logging to capture state when it next occurs
4. Check for race conditions or timing-dependent behavior

## Related Skills

- [comprehensive-code-review](../comprehensive-code-review/SKILL.md) - Deep analysis when bug indicates architectural issues
- [code-quality](../code-quality/SKILL.md) - Run quality checks after fixing bugs
- [e2e-testing](../e2e-testing/SKILL.md) - Write regression tests for fixed bugs
- [feature-implementation-guide](../feature-implementation-guide/SKILL.md) - Reference patterns when bug reveals missing implementation
- [self-improvement-loop](../self-improvement-loop/SKILL.md) - Capture lessons learned from bugs
