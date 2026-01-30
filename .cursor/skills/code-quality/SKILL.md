---
name: code-quality
description: Ensure code quality through linting, type checking, testing, and code review best practices. Use when checking code quality, running linters, fixing type errors, reviewing code, or when the user mentions lint, types, quality, review, or standards.
---

# Code Quality Skill

This skill ensures code quality in CentaurOS through automated checks and best practices.

## Quality Check Workflow

Run these checks before committing:

```bash
# Full quality check (run all in sequence)
npm run lint && npx tsc --noEmit && npm run test && npm run build
```

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
# Check for type errors
npx tsc --noEmit

# Check with verbose output
npx tsc --noEmit --pretty

# Generate declaration files (doesn't check)
npx tsc --declaration --emitDeclarationOnly
```

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

**Security:**
- [ ] No sensitive data hardcoded
- [ ] Input validation in place
- [ ] RLS policies cover new tables

**Performance:**
- [ ] No obvious N+1 queries
- [ ] No unnecessary re-renders
- [ ] Large lists use virtualization if needed

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

## Unit Testing

### Run Tests

```bash
# Run all tests
npm run test

# Run in watch mode
npm run test -- --watch

# Run specific file
npm run test -- src/lib/__tests__/utils.test.ts

# Run with coverage
npm run test -- --coverage
```

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

### Pre-commit Hook (if using Husky)

```bash
# .husky/pre-commit
npm run lint
npx tsc --noEmit
```

### CI Pipeline Checks

The GitHub Actions workflow runs:
1. `npm ci` - Install dependencies
2. `npm run lint` - Lint check
3. `npm run test` - Unit tests (when enabled)
4. Docker build

## Quick Quality Commands

```bash
# Fix all auto-fixable issues
npx eslint --fix src/ && npx prettier --write src/

# Check everything
npm run lint && npx tsc --noEmit && npm run test

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
