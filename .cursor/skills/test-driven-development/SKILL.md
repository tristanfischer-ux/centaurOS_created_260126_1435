---
name: test-driven-development
description: Test-driven development discipline for CentaurOS. Use when implementing any new feature, fixing bugs, adding server actions, creating API routes, or when the user mentions TDD, test first, write tests, red green refactor, or test-driven. Enforces writing failing tests before implementation code.
---

# Test-Driven Development (TDD)

Write the test first. Watch it fail. Write minimal code to pass.

**Core principle:** If you didn't watch the test fail, you don't know if it tests the right thing.

## When to Use

**Always:**
- New features (server actions, API routes, components)
- Bug fixes (reproduce the bug as a failing test first)
- Behaviour changes
- Refactoring (ensure tests pass before and after)

**Exceptions (ask the user):**
- Throwaway prototypes
- Pure UI/styling changes with no logic
- Configuration-only changes

## The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Write code before the test? Delete it. Start over.

## Red-Green-Refactor Cycle

### RED - Write Failing Test

Write one minimal test showing what should happen.

```typescript
// GOOD: Clear name, tests real behaviour, one thing
test('rejects empty email on form submit', async () => {
  const result = await submitForm({ email: '' })
  expect(result.error).toBe('Email required')
})

// BAD: Vague name, tests mock not code
test('form works', async () => {
  const mock = jest.fn().mockResolvedValueOnce('ok')
  await submitForm(mock)
  expect(mock).toHaveBeenCalled()
})
```

**Requirements:**
- One behaviour per test
- Clear, descriptive name
- Real code (no mocks unless unavoidable)

### Verify RED - Watch It Fail

**MANDATORY. Never skip.**

Run the test. Confirm:
- Test **fails** (not errors from syntax/import issues)
- Failure message matches what you expect
- It fails because the feature is missing, not because of a typo

**Test passes immediately?** You're testing existing behaviour. Fix the test.

### GREEN - Minimal Code

Write the simplest code to make the test pass.

```typescript
// GOOD: Just enough to pass
async function submitForm(data: FormData) {
  if (!data.email?.trim()) {
    return { error: 'Email required' }
  }
  // ... rest of implementation
}

// BAD: Over-engineered beyond test requirements
async function submitForm(
  data: FormData,
  options?: {
    validateAsync?: boolean
    customRules?: ValidationRule[]
    onProgress?: (step: number) => void
  }
) {
  // YAGNI - test didn't ask for any of this
}
```

Don't add features, refactor other code, or "improve" beyond what the test requires.

### Verify GREEN - Watch It Pass

**MANDATORY.**

Run the test. Confirm:
- The test passes
- Other tests still pass
- No warnings or errors in output

### REFACTOR - Clean Up

After green only:
- Remove duplication
- Improve names
- Extract helpers

Keep tests green throughout. Don't add new behaviour during refactor.

### Repeat

Next failing test for next behaviour.

## CentaurOS Test Patterns

### Server Action Tests

```typescript
import { createClient } from '@/lib/supabase/server'

// Test server actions by calling them directly
test('createReviewGate requires task_id or objective_id', async () => {
  const result = await createReviewGate({
    gate_type: 'expert_review',
    title: 'Test Gate',
    // Missing both task_id and objective_id
  })
  expect(result.error).toBe('A review gate must be attached to a task or objective')
})
```

### E2E Tests (Playwright)

```typescript
import { test, expect } from '@playwright/test'

test('review gate banner shows on task with gates', async ({ page }) => {
  await page.goto('/tasks?taskId=test-task-id')
  await page.waitForLoadState('networkidle')

  // RED: This should fail before we implement the banner
  const banner = page.locator('[data-testid="review-gate-banner"]')
  await expect(banner).toBeVisible()
})
```

### Component Tests

```typescript
import { render, screen } from '@testing-library/react'

test('HireExpertCTA renders expert and apprentice cards', () => {
  render(<HireExpertCTA variant="full" />)

  expect(screen.getByText('Hire an Expert')).toBeInTheDocument()
  expect(screen.getByText('Hire an Apprentice')).toBeInTheDocument()
})
```

## Bug Fix Flow

When fixing a bug:

1. **Write a failing test that reproduces the bug**
2. Watch it fail (confirms you've captured the bug)
3. Fix the code
4. Watch the test pass (confirms the fix works)
5. The test now prevents regression forever

```typescript
// Step 1: Reproduce bug as test
test('task status updates correctly when review gate is approved', async () => {
  // Setup: create task with pending review gate
  const task = await createTestTask({ status: 'Pending_Approval' })
  const gate = await createReviewGate({ task_id: task.id, ... })

  // Act: approve the gate
  await submitReview({ gate_id: gate.id, status: 'approved' })

  // Assert: bug was that task status didn't update
  const updatedTask = await getTask(task.id)
  expect(updatedTask.status).toBe('Approved') // This should fail
})

// Step 2: Watch it fail (confirms bug exists)
// Step 3: Fix the code
// Step 4: Watch it pass (confirms fix works)
```

## Common Rationalisations (and Rebuttals)

| Excuse | Reality |
|--------|---------|
| "Too simple to test" | Simple code breaks. Test takes 30 seconds. |
| "I'll test after" | Tests passing immediately prove nothing. |
| "Tests after achieve the same goals" | Tests-after verify what you built. Tests-first verify what's required. |
| "Already manually tested" | Ad-hoc is not systematic. No record, can't re-run. |
| "TDD will slow me down" | TDD is faster than debugging. Always. |
| "Need to explore first" | Fine. Throw away the exploration, start TDD. |
| "Test is hard to write" | Listen to the test. Hard to test = hard to use = bad design. |

## Red Flags - STOP and Start Over

- Wrote production code before test
- Test passes immediately (not testing anything new)
- Can't explain why the test failed
- Tests added "later"
- Rationalising "just this once"
- "I already manually tested it"

**All of these mean: Delete the code. Start over with a failing test.**

## Verification Checklist

Before marking work complete:

- [ ] Every new function/action has a test
- [ ] Watched each test fail before implementing
- [ ] Each test failed for the expected reason (feature missing, not typo)
- [ ] Wrote minimal code to pass each test
- [ ] All tests pass
- [ ] Tests use real code (mocks only if unavoidable)
- [ ] Edge cases and errors covered
- [ ] Bug fixes have regression tests

## When Stuck

| Problem | Solution |
|---------|----------|
| Don't know how to test | Write the wished-for API. Write the assertion first. Ask the user. |
| Test too complicated | Design too complicated. Simplify the interface. |
| Must mock everything | Code too coupled. Use dependency injection. |
| Test setup is huge | Extract helpers. Still complex? Simplify the design. |
