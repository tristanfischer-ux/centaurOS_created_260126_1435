---
name: bug-fix-workflow
description: Systematic approach to debugging and fixing bugs in CentaurOS. Use when investigating errors, fixing bugs, debugging issues, troubleshooting problems, or when the user mentions bug, error, broken, not working, issue, or crash.
role: |
  You are a senior debugging engineer with 10+ years diagnosing production systems.
  You are methodical: understand before changing, never guess.
  You make ONE direct fix attempt. If it fails, you stop and write a test.
  No shotgun debugging. No "try this and see." No random changes hoping something works.
---

# Bug Fix Workflow

This skill provides a systematic approach to identifying, fixing, and verifying bug fixes in CentaurOS.

## CRITICAL: Escalation Rule

**If your first fix attempt doesn't work and the user says "it still doesn't work":**

1. **STOP IMMEDIATELY** - Do NOT try another fix
2. **SWITCH TO PLAN MODE** - Use the SwitchMode tool to enter plan mode
3. **Think through the problem systematically:**
   - What exactly did you try?
   - Why did you think it would work?
   - What evidence shows it didn't work?
   - What assumptions might be wrong?
   - What other root causes are possible?
4. **Create a structured debugging plan** before making any more code changes

**Why this matters:** Repeated failed attempts waste time and can introduce new bugs. If your mental model of the problem is wrong, more attempts with the same model will keep failing. Plan mode forces you to step back and re-evaluate.

```
First attempt failed?
       │
       ▼
   STOP. Don't try again.
       │
       ▼
   Switch to Plan Mode
       │
       ▼
   Re-analyze the problem from scratch
       │
       ▼
   Create explicit debugging plan
       │
       ▼
   Execute plan with fresh approach
```

## CRITICAL: Safety Requirements (Don't Break What Works)

**Debugging must NEVER break existing functionality.** Follow these three mandatory checkpoints:

### 1. Establish Baseline (BEFORE any code changes)

**Know what works before you touch anything:**

```bash
# Run and record test state BEFORE changes
npm run test 2>&1 | tee /tmp/baseline-tests.txt
npm run build  # Verify build works

# Record what's working
npx tsc --noEmit  # Type check passes
```

**Baseline checklist:**
- [ ] Note which tests currently pass
- [ ] Verify build succeeds
- [ ] List features that MUST still work after your fix
- [ ] If no tests exist, manually verify core functionality works

**Why this matters:** If you don't know what worked before, you can't know if you broke it.

### 2. Impact Analysis (BEFORE modifying each file)

**Before editing ANY file, check what depends on it:**

```bash
# What imports this file?
rg "from ['\"].*filename" src/

# What calls this function?
rg "functionName" src/ --type ts

# How many files use this?
rg "ComponentName" src/ --type tsx -c
```

**Impact rules:**

| Dependents | Risk Level | Required Action |
|------------|------------|-----------------|
| 1-2 files | Low | Proceed with caution |
| 3-4 files | Medium | List all consumers, test each after |
| 5+ files | High | Consider more targeted fix, document all consumers |

**If a file is used by 5+ other files:**
1. Ask: Can the fix be more targeted/isolated?
2. List ALL dependent features that need testing after
3. Consider creating a new function instead of modifying shared one

### 3. Regression Gate (BEFORE claiming "fixed")

**You CANNOT say "fixed" until this checklist passes:**

- [ ] **Baseline tests still pass** - Run the SAME tests from step 1
- [ ] **Build still works** - `npm run build` succeeds
- [ ] **Git diff justified** - Review every changed line, justify each one
- [ ] **Happy path works** - Manually test the main use case
- [ ] **Consumers tested** - If you touched shared code, test at least 2 consumers
- [ ] **No unrelated changes** - Diff contains ONLY bug fix, nothing else

```bash
# Regression check commands
npm run test                    # Must match or exceed baseline
npm run build                   # Must succeed
git diff --stat                 # Review what changed
git diff                        # Justify EVERY line
```

**If ANY regression is found:**
1. **STOP** - Do not proceed
2. **Revert** - `git checkout -- <file>` or `git stash`
3. **Re-approach** - Try a more targeted fix that doesn't break existing code

## Debugging Anti-Patterns (FORBIDDEN)

These behaviors are **strictly forbidden** during debugging:

| Anti-Pattern | Why It's Dangerous | Do This Instead |
|--------------|-------------------|-----------------|
| "While I'm here, let me also fix X" | Scope creep breaks unrelated things | Separate commit for unrelated fixes |
| Refactoring during debugging | Muddies the waters, hard to isolate cause | Fix first, refactor in separate PR |
| Changing shared utilities without checking consumers | Breaks features you don't even know about | Always run impact analysis first |
| Skipping test run because "it's a small change" | Small changes cause big breaks | ALWAYS run baseline comparison |
| Multiple changes without testing between | Can't isolate which change broke things | One change, one test, repeat |
| Modifying files not directly related to bug | Introduces regressions | Only touch necessary files |
| Assuming your fix didn't break anything | It probably did | PROVE it didn't with tests |

**The Golden Rule:** Leave the codebase BETTER than you found it, or at minimum, NO WORSE.

## Discovery (Before You Start)

Before investigating, ensure you have answers to these questions. If any are unclear, ask the user:

- [ ] **What is the exact error or symptom?** (error message, unexpected behavior, screenshot)
- [ ] **Steps to reproduce?** (what actions trigger this?)
- [ ] **What changed recently?** (new code, config change, data change)
- [ ] **What have you already tried?** (so we don't repeat failed approaches)
- [ ] **Is this blocking?** (determines urgency of fix vs proper investigation)

## Bug Fix Process

```
Bug Fix Progress:
- [ ] 1. Analyze bug & attempt direct fix
- [ ] 2. If fix fails → Write failing test that reproduces bug
- [ ] 3. Spawn subagent to implement fix (test must pass)
- [ ] 4. Verify no regressions
- [ ] 5. Commit with clear message
```

**Key rule:** Only ONE direct fix attempt. If it doesn't work, STOP guessing and write a test. No shotgun debugging.

## Step 1: Analyze Bug & Attempt Direct Fix

**Understand before fixing.** Analyze the bug, then try ONE direct fix:

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

### Root Cause Analysis

Use these techniques to understand the bug before attempting a fix:

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

### Attempting the Direct Fix

If you understand the root cause, try ONE fix:

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

## Step 2: If Fix Fails → Write Failing Test

**Your direct fix didn't work. STOP guessing.** Write a test that reproduces the bug:

```bash
# For E2E bugs (UI, user flows)
npm run test:e2e -- e2e/new-bug-test.spec.ts

# For unit/integration bugs (logic, API)
npm run test -- src/lib/__tests__/new-bug-test.test.ts
```

The test should:
1. Set up the conditions that trigger the bug
2. Perform the action that fails
3. Assert the expected (correct) behavior
4. **Confirm the test FAILS** - this proves it catches the bug

## Step 3: Spawn Subagent to Fix

Once you have a failing test, spawn a subagent:

```
Task: Fix the bug in [component/feature]
- Failing test: [path to test file]
- Run the test with: npm run test -- [test path]
- Your fix is complete when the test passes
- Do not modify the test, only the implementation
```

The subagent works until the test passes, proving the fix works.

## Step 4: Verify No Regressions

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

## Step 5: Commit with Clear Message

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

## Anti-Patterns

**BAD:** "Let me try changing X and see if it works"
**WHY:** Shotgun debugging wastes time and can introduce new bugs. Understand first, then fix.

**BAD:** "The issue is probably Y" (without verification)
**WHY:** Assumptions lead to wrong fixes. Verify with evidence before concluding.

**BAD:** Making multiple changes at once to "save time"
**WHY:** When it works, you don't know which change fixed it. When it breaks worse, you can't isolate the cause.

**BAD:** "It works on my machine, ship it"
**WHY:** Local state differs from production. Always verify in a clean environment.

**BAD:** Silently catching errors with empty catch blocks
**WHY:** Hides the real problem. Log errors with context, handle gracefully.

## Evaluation (Before Completing)

Before marking a bug fix complete, verify:

- [ ] **Root cause identified?** Can you explain WHY the bug existed, not just WHERE?
- [ ] **Fix tested?** Did you reproduce the bug, apply the fix, and confirm it's resolved?
- [ ] **No regressions?** Did you test related functionality that might be affected?
- [ ] **Minimal change?** Did you only change what was necessary, not refactor unrelated code?
- [ ] **Build passes?** Does `npm run build` succeed without errors?
- [ ] **Commit message clear?** Does it explain the root cause and fix approach?

## Examples

### Example 1: Null Reference Error

**User reports:**
> Getting "Cannot read property 'id' of undefined" when viewing a task

**Discovery:**
- Error occurs on `/tasks/[id]` page
- Stack trace points to `TaskCard.tsx` line 45
- Recent change: Added new task status field

**Analysis:**
```typescript
// Found: task.assignee.id accessed without null check
const assigneeName = task.assignee.id // Crashes if assignee is null
```

**Fix:**
```typescript
// Added optional chaining
const assigneeName = task.assignee?.id ?? 'Unassigned'
```

**Verification:**
- Tested with task that has assignee: works
- Tested with task without assignee: works (shows "Unassigned")
- Ran `npm run build`: passes

---

### Example 2: RLS Policy Blocking Data

**User reports:**
> Created a task but it doesn't show up in the list

**Discovery:**
- Task exists in database (verified via Supabase dashboard)
- No error in console
- User is authenticated

**Analysis:**
```typescript
// Found: Insert missing foundry_id
await supabase.from('tasks').insert({
  title: formData.title,
  // Missing: foundry_id
})
```

**Fix:**
```typescript
const foundryId = await getFoundryIdCached()
await supabase.from('tasks').insert({
  title: formData.title,
  foundry_id: foundryId, // Added
})
```

**Verification:**
- Created new task: appears in list
- Checked RLS policy: confirms foundry_id required
- Tested other foundry: can't see the task (isolation works)

## See Also

- [references/common-errors.md](references/common-errors.md) - Catalog of common errors
