---
name: code-quality
description: Ensure code quality through linting, type checking, testing, and code review best practices. Use when checking code quality, running linters, fixing type errors, reviewing code, or when the user mentions lint, types, quality, review, or standards.
---

# Code Quality Skill

This skill ensures code quality in ForgeOS through automated checks and best practices.

## Quality Check Workflow

Run these checks before committing:

```bash
# Full quality check (run all in sequence)
npm run lint && npm run typecheck && npm run test && npm run build

# With coverage report
npm run test:coverage
```

### UI Standards Check (for UI changes)

When modifying UI code, also verify:

```bash
# Check for hardcoded status colors (should return 0 matches in your changed files)
rg "text-red-|text-green-|text-amber-|text-blue-" src/path/to/your/file.tsx
rg "bg-red-|bg-green-|bg-amber-|bg-blue-" src/path/to/your/file.tsx
```

See the **ui-component-standards** skill for the complete color token mapping.

## Linting

### Run ESLint

```bash
# Check for lint errors
npm run lint

# Fix auto-fixable errors
npx eslint --fix src/

# Check specific file
npx eslint src/components/MyComponent.tsx

# Check with specific rules
npx eslint --rule 'no-console: error' src/
```

### Common Lint Errors

| Error | Fix |
|-------|-----|
| `'x' is defined but never used` | Remove unused variable or add `// eslint-disable-next-line` |
| `Missing return type` | Add return type annotation |
| `Unexpected any` | Replace `any` with specific type |
| `React Hook useEffect has missing dependency` | Add dependency or use `// eslint-disable-next-line react-hooks/exhaustive-deps` |

### ESLint Disable Comments

```typescript
// Disable for next line
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const unused = 'needed';

// Disable for entire file (at top)
/* eslint-disable @typescript-eslint/no-explicit-any */

// Disable specific rule for block
/* eslint-disable no-console */
console.log('debug');
/* eslint-enable no-console */
```

## Type Checking

### Run TypeScript Check

```bash
# Check for type errors (preferred - uses project script)
npm run typecheck

# Equivalent manual command
npx tsc --noEmit

# Check with verbose output
npx tsc --noEmit --pretty
```

**Note:** `strictNullChecks` and `noImplicitAny` are enabled in `tsconfig.json`. All new code must handle nullable types and provide explicit type annotations.

### Fixing Type Errors

**Pattern: Missing type annotation**
```typescript
// BEFORE
function process(data) { ... }

// AFTER
function process(data: ProcessData): Result { ... }
```

**Pattern: Null/undefined handling**
```typescript
// BEFORE (error: possibly undefined)
const name = user.profile.name;

// AFTER
const name = user?.profile?.name ?? 'Unknown';
```

**Pattern: Type assertion (use sparingly)**
```typescript
// When you know better than TypeScript
const element = document.getElementById('app') as HTMLDivElement;
```

**Pattern: Update database types**
```bash
# Regenerate types from Supabase
npx supabase gen types typescript --linked > src/types/database.types.ts
```

## Code Review Standards

### Before Submitting Code

Checklist:
- [ ] No lint errors
- [ ] No type errors
- [ ] Tests pass
- [ ] Build succeeds
- [ ] Self-reviewed the diff

### Self-Review Checklist

**Functionality:**
- [ ] Code does what it's supposed to
- [ ] Edge cases handled
- [ ] Error cases handled

**Code Quality:**
- [ ] No commented-out code
- [ ] No console.log statements (unless intentional)
- [ ] No TODO comments that should be addressed now
- [ ] Variable/function names are descriptive
- [ ] Exported functions have JSDoc documentation
- [ ] Complex logic has explanatory comments
- [ ] Security-sensitive code is annotated

**Security:**
- [ ] No sensitive data hardcoded
- [ ] Input validation in place
- [ ] RLS policies cover new tables

**Performance:**
- [ ] No obvious N+1 queries
- [ ] No unnecessary re-renders
- [ ] Large lists use virtualization if needed

**UI Standards (for UI changes):**
- [ ] No hardcoded status colors (`text-red-*`, `bg-green-*`, etc.)
- [ ] Semantic tokens used (`text-destructive`, `text-status-success`, etc.)
- [ ] Forms have ARIA accessibility (`aria-required`, `aria-invalid`, `aria-describedby`)
- [ ] Error messages use `text-destructive` and `role="alert"`
- [ ] Dialogs use `size` prop (not custom `max-w-[]`)
- [ ] Status indicators use `StatusBadge` component
- [ ] Icon-only buttons have `aria-label`

### Code Style Guidelines

**Naming:**
```typescript
// Components: PascalCase
function TaskCard() { }

// Functions/variables: camelCase
const taskCount = 0;
function getTaskById() { }

// Constants: UPPER_SNAKE_CASE
const MAX_TASKS = 100;

// Types/Interfaces: PascalCase
interface TaskData { }
type TaskStatus = 'pending' | 'active';
```

**Imports:**
```typescript
// Order: external, internal, relative
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TaskCard } from './task-card';

// Group by category
import { createClient } from '@/lib/supabase/server';
import { getTask } from '@/lib/tasks/service';
import type { Task } from '@/types/tasks';
```

**Component Structure:**
```typescript
// 1. Imports
import { ... } from '...';

// 2. Types
interface Props { ... }

// 3. Component
export function Component({ prop1, prop2 }: Props) {
  // 3a. Hooks
  const [state, setState] = useState();
  
  // 3b. Derived state
  const derived = useMemo(() => ..., []);
  
  // 3c. Callbacks
  const handleClick = useCallback(() => {}, []);
  
  // 3d. Effects
  useEffect(() => {}, []);
  
  // 3e. Render
  return <div>...</div>;
}
```

## Documentation Quality

### JSDoc Check

Before committing, verify exported functions have documentation:

```bash
# Find exported functions missing JSDoc (manual check required)
rg "^export (async )?(function|const) \w+" src/path/to/file.tsx -B 3 | rg -v "^\s*\*|^\s*/\*\*"
```

### Documentation Checklist

- [ ] Exported functions have JSDoc with @param and @returns
- [ ] Complex business logic has "why" comments
- [ ] Security-sensitive code has `// SECURITY:` annotations
- [ ] Auth checks have `// AUTH:` annotations
- [ ] Non-obvious decisions are explained
- [ ] No outdated comments or TODOs that should be fixed

### Security Annotation Requirements

When writing security-sensitive code, use these standardized annotations:

```typescript
// SECURITY: Validates foundry_id ownership before modification
// AUTH: Requires task:write permission
// RLS: Protected by tasks_foundry_isolation policy
// VALIDATION: Sanitizes user input to prevent XSS
```

### Business Logic Comments

```typescript
// Business rule: Tasks can only be nudged once every 24 hours
// This prevents notification spam while maintaining urgency
const NUDGE_COOLDOWN_MS = 24 * 60 * 60 * 1000

// State transition: pending -> active requires owner approval
// Exception: Auto-approval for tasks created by the owner themselves
if (task.created_by === userId) { ... }
```

See **documentation-standards** rule for full requirements.

## Unit Testing

### Run Tests

```bash
# Run all tests
npm run test

# Run in watch mode
npm run test -- --watch

# Run specific file
npm run test -- src/lib/__tests__/utils.test.ts

# Run with coverage report
npm run test:coverage
```

### Coverage Thresholds

Jest enforces minimum coverage for critical shared code. Thresholds are defined in `jest.config.ts`:

| File | Branches | Functions | Lines | Statements |
|------|----------|-----------|-------|------------|
| Global minimum | 1% | 1% | 1% | 1% |
| `src/lib/utils.ts` | 80% | 100% | 90% | 90% |
| `src/lib/supabase/foundry-context.ts` | 50% | 60% | 60% | 60% |
| `src/lib/server-action-utils.ts` | 80% | 100% | 90% | 90% |

**When adding critical shared code**, add a coverage threshold entry in `jest.config.ts` to prevent regressions. Ratchet thresholds upward as coverage improves.

### Writing Tests

```typescript
// src/lib/__tests__/utils.test.ts
import { formatDate, calculateTotal } from '../utils';

describe('formatDate', () => {
  it('should format ISO date to readable format', () => {
    const result = formatDate('2026-01-30T10:00:00Z');
    expect(result).toBe('January 30, 2026');
  });

  it('should handle null input', () => {
    const result = formatDate(null);
    expect(result).toBe('');
  });
});

describe('calculateTotal', () => {
  it('should sum items correctly', () => {
    const items = [{ price: 10 }, { price: 20 }];
    expect(calculateTotal(items)).toBe(30);
  });

  it('should return 0 for empty array', () => {
    expect(calculateTotal([])).toBe(0);
  });
});
```

### Test Patterns

**Testing async functions:**
```typescript
it('should fetch data', async () => {
  const result = await fetchData('123');
  expect(result).toEqual({ id: '123', name: 'Test' });
});
```

**Testing errors:**
```typescript
it('should throw on invalid input', () => {
  expect(() => processData(null)).toThrow('Invalid input');
});

it('should reject on API error', async () => {
  await expect(fetchData('bad-id')).rejects.toThrow();
});
```

**Mocking:**
```typescript
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => ({ data: mockData, error: null })),
        })),
      })),
    })),
  })),
}));
```

## Build Check

### Run Build

```bash
# Production build
npm run build

# Analyze bundle
npm run build -- --analyze
```

### Common Build Failures

| Error | Solution |
|-------|----------|
| Type errors | Fix TypeScript issues |
| Import errors | Check path aliases, case sensitivity |
| Missing env vars | Add to `.env.local` |
| Out of memory | Increase Node memory: `NODE_OPTIONS='--max-old-space-size=4096' npm run build` |

## Automated Quality Gates

### Pre-commit Hook (Husky)

The pre-commit hook automatically runs:
```bash
# .husky/pre-commit
npm run lint
```

### CI Pipeline Checks

The GitHub Actions workflow (`.github/workflows/docker-build.yml`) runs:
1. `npm ci` - Install dependencies
2. `npm audit` - Security audit
3. `npm run typecheck` - TypeScript type checking (non-blocking until pre-existing errors resolved)
4. `npm run lint` - ESLint check
5. `npm run test` - Unit tests
6. E2E tests (`@critical` tagged) - **Blocks deployment on failure**
7. Docker build and push

## Quick Quality Commands

```bash
# Fix all auto-fixable issues
npx eslint --fix src/ && npx prettier --write src/

# Check everything
npm run lint && npm run typecheck && npm run test

# Find unused exports
npx ts-prune

# Find circular dependencies
npx madge --circular src/

# Check bundle size
npx size-limit
```

## Quality Metrics

### What to Monitor

- **Build time**: Should be < 3 minutes
- **Bundle size**: Monitor growth over time
- **Test coverage**: Aim for > 70% on critical paths
- **Lint errors**: Should be 0 in CI

### Checking Bundle Size

```bash
# After build, check output
ls -la .next/static/chunks/

# Analyze with @next/bundle-analyzer
ANALYZE=true npm run build
```
