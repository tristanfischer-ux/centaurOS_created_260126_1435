---
name: kaizen
description: Continuous improvement methodology applied to CentaurOS development. Use when implementing features, refactoring, designing systems, making architecture decisions, handling errors, or when the user mentions improve, simplify, clean up, iterative, incremental, quality, or error-proof. Guides quality through small improvements, error-proofing by design, following patterns, and building only what is needed.
---

# Kaizen: Continuous Improvement

Small improvements, continuously. Error-proof by design. Follow what works. Build only what's needed.

**Core principle:** Many small improvements beat one big change. Prevent errors at design time, not with fixes.

## The Four Pillars

### 1. Continuous Improvement

Small, frequent improvements compound into major gains.

**Incremental over revolutionary:**
- Make the smallest viable change that improves quality
- One improvement at a time
- Verify each change before the next
- Build momentum through small wins

**Always leave code better:**
- Fix small issues as you encounter them (within scope)
- Update outdated comments
- Remove dead code when you see it

**Iterative refinement:**
1. First version: make it work
2. Second pass: make it clear
3. Third pass: make it robust
4. Don't try all three at once

```typescript
// Iteration 1: Make it work
const calculateTotal = (items: Item[]) => {
  let total = 0
  for (const item of items) {
    total += item.price * item.quantity
  }
  return total
}

// Iteration 2: Make it clear
const calculateTotal = (items: Item[]): number => {
  return items.reduce((total, item) => total + item.price * item.quantity, 0)
}

// Iteration 3: Make it robust
const calculateTotal = (items: Item[]): number => {
  if (!items?.length) return 0
  return items.reduce((total, item) => {
    if (item.price < 0 || item.quantity < 0) {
      throw new Error('Price and quantity must be non-negative')
    }
    return total + item.price * item.quantity
  }, 0)
}
```

**When implementing features:**
1. Start with simplest version that works
2. Add one improvement (error handling, validation, etc.)
3. Test and verify
4. Repeat if time permits

**When refactoring:**
- Fix one smell at a time
- Commit after each improvement
- Keep tests passing throughout
- Stop when "good enough" (diminishing returns)

### 2. Poka-Yoke (Error Proofing)

Design systems that prevent errors at compile/design time, not runtime.

**Make errors impossible via types:**

```typescript
// BAD: string status can be any value
type OrderStatus = string

// GOOD: Only valid states possible
type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered'

// BETTER: States with associated data
type Order =
  | { status: 'pending'; createdAt: Date }
  | { status: 'processing'; startedAt: Date; estimatedCompletion: Date }
  | { status: 'shipped'; trackingNumber: string; shippedAt: Date }
  | { status: 'delivered'; deliveredAt: Date; signature: string }
// Now impossible to have shipped without trackingNumber
```

**Validate at boundaries, trust internally:**

```typescript
// BAD: Validation after use
const processPayment = (amount: number) => {
  const fee = amount * 0.03 // Used before validation!
  if (amount <= 0) throw new Error('Invalid amount')
}

// GOOD: Validate at system boundary
const handlePaymentRequest = (req: Request) => {
  const amount = validatePositive(req.body.amount) // Validate once
  processPayment(amount) // Internal function trusts validated input
}
```

**Fail at startup, not in production:**

```typescript
// GOOD: Required config, fails early
const loadConfig = (): Config => {
  const apiKey = process.env.API_KEY
  if (!apiKey) {
    throw new Error('API_KEY environment variable required')
  }
  return { apiKey, timeout: 5000 }
}

// App fails at startup if config invalid, not during request
const config = loadConfig()
```

**CentaurOS patterns to follow:**
- Use Zod schemas for input validation at API boundaries
- Use TypeScript discriminated unions for task/objective status
- Use `satisfies` for typed object literals (see `code-hygiene.mdc`)
- Validate `foundry_id` at the start of every server action
- RLS policies as defense-in-depth, not sole protection

### 3. Standardised Work

Follow established patterns. Document what works. Make good practices easy.

**Consistency over cleverness:**
- Follow existing codebase patterns (check before creating new ones)
- Don't reinvent solved problems
- New pattern only if significantly better

**CentaurOS established patterns:**
- Server actions in `src/actions/` with `createClient()` + auth check + foundry check
- Types in `src/types/` mirroring DB schema
- Components in `src/components/` using shadcn/ui primitives
- Semantic color tokens (never hardcoded colors)
- `UserAvatar` for all user avatars (never raw `Avatar`)
- `StatusBadge` for all status indicators
- Card/Dialog/Button from design system

**Before adding new patterns:**
1. Search codebase for similar problems already solved
2. Check `.cursor/rules/` for project conventions
3. Match existing file structure and naming
4. Follow same error handling approach

### 4. Just-In-Time (JIT)

Build what's needed now. No more, no less.

**YAGNI (You Aren't Gonna Need It):**

```typescript
// GOOD: Current requirement - log errors to console
const logError = (error: Error) => {
  console.error(error.message)
}

// BAD: Over-engineered for imaginary future
class Logger {
  private transports: LogTransport[] = []
  private queue: LogEntry[] = []
  private rateLimiter: RateLimiter
  // 200 lines for "maybe we'll need it"
}
```

**When to add complexity:**
- Current requirement demands it
- Pain points identified through actual use
- Measured performance issues
- 3+ similar cases emerged (Rule of Three)

**Premature abstraction is worse than duplication:**

```typescript
// BAD: Generic CRUD framework for one entity
abstract class BaseCRUDService<T> { /* 300 lines */ }

// GOOD: Simple functions for current needs
const getUsers = async (): Promise<User[]> => {
  return db.query('SELECT * FROM users')
}
// Abstract only when pattern proven across 3+ entities
```

**Performance optimisation:**
- Profile first, optimise second
- Measure before and after
- Accept "good enough" performance
- Document why optimisation was needed

## Red Flags

**Violating Continuous Improvement:**
- "I'll refactor it later" (it never happens)
- Leaving code worse than you found it
- Big bang rewrites instead of incremental changes

**Violating Poka-Yoke:**
- "Users should just be careful"
- Validation after use instead of before
- Optional config with no validation at startup

**Violating Standardised Work:**
- "I prefer to do it my way" (ignoring project patterns)
- Not checking existing patterns before writing new code
- Ignoring `.cursor/rules/` conventions

**Violating Just-In-Time:**
- "We might need this someday"
- Building frameworks before using them
- Optimising without measuring

## Decision Checklist

Before writing code, ask:

- [ ] Am I making the smallest viable improvement?
- [ ] Can the type system prevent this class of error?
- [ ] Am I validating at the boundary, not deep inside?
- [ ] Does this follow an existing project pattern?
- [ ] Am I building only what's needed right now?
- [ ] Would I bet my lunch that this is needed today?

## Remember

**Kaizen is about:**
- Small improvements continuously
- Preventing errors by design
- Following proven patterns
- Building only what's needed

**Not about:**
- Perfection on first try
- Massive refactoring projects
- Clever abstractions
- Premature optimisation

**Mindset:** Good enough today, better tomorrow. Repeat.
