---
name: comprehensive-code-review
description: Deep code review analyzing architecture, security, performance, maintainability, and patterns. Use when reviewing code, analyzing files, assessing code quality, or when the user mentions code review, review this, analyze code, or check this code.
---

# Comprehensive Code Review

Systematic methodology for deep code analysis across multiple quality dimensions.

## Review Workflow

### Step 1: Scope the Review

Determine what's being reviewed:

| Scope | Approach |
|-------|----------|
| **Single file** | Full analysis of all dimensions |
| **Feature/PR** | Focus on changes + adjacent impact |
| **Module/directory** | Architecture focus + sampling |
| **Full codebase** | High-level patterns + spot checks |

### Step 2: Run Analysis

Execute relevant checks based on scope:

```bash
# Complexity analysis
npx eslint src/path/to/file.tsx --rule 'complexity: [error, 10]'

# Find large files (potential complexity)
find src/ -name "*.tsx" -exec wc -l {} + | sort -rn | head -20

# Check for TODO/FIXME debt
rg "TODO|FIXME|HACK|XXX" src/ --count-matches

# Find duplicate code patterns
rg -c "const \w+ = async \(.*\) =>" src/ | sort -t: -k2 -rn | head -10

# Check test coverage
npm run test -- --coverage --collectCoverageFrom='src/path/**/*.{ts,tsx}'
```

### Step 3: Generate Review Report

Use this template for findings:

```markdown
# Code Review: [Scope]

**Reviewed:** [Date]
**Overall Grade:** [A-F]
**Risk Level:** [Low/Medium/High/Critical]

## Summary

| Dimension | Grade | Key Finding |
|-----------|-------|-------------|
| Architecture | [A-F] | [One line] |
| Security | [A-F] | [One line] |
| Performance | [A-F] | [One line] |
| Maintainability | [A-F] | [One line] |
| Test Coverage | [A-F] | [One line] |

## Critical Issues (Must Fix)
🔴 [Issue with file:line reference]

## Recommendations (Should Fix)
🟡 [Recommendation with context]

## Suggestions (Nice to Have)
🟢 [Optional improvement]

## What's Done Well
✅ [Strength worth noting]
```

---

## Review Dimensions

### 1. Architecture Analysis

**What to check:**
- Single Responsibility: Does each file/function do one thing?
- Dependency direction: Do dependencies flow correctly?
- Layer separation: Are concerns properly separated?
- Abstraction levels: Is complexity hidden appropriately?

**Patterns to find:**

```bash
# Files with too many imports (coupling)
rg "^import" src/path/ | cut -d: -f1 | sort | uniq -c | sort -rn | head -10

# Circular dependencies
npx madge --circular src/

# God components (too many responsibilities)
rg -l "useState.*useState.*useState.*useState" src/components/
```

**Red flags:**
- 🔴 Circular dependencies between modules
- 🔴 Business logic in UI components
- 🟡 Components over 300 lines
- 🟡 Files importing from 10+ different modules

### 2. Security Analysis

**What to check:**
- Input validation and sanitization
- Authentication/authorization patterns
- Sensitive data handling
- SQL/NoSQL injection vectors
- XSS vulnerabilities

**Patterns to find:**

```bash
# Potential SQL injection (string interpolation in queries)
rg "\$\{.*\}" src/ -g "*.ts" | rg -i "select|insert|update|delete|from|where"

# Hardcoded secrets
rg "(password|secret|api.?key|token)\s*[:=]" src/ -i

# Unsafe innerHTML
rg "dangerouslySetInnerHTML|innerHTML" src/

# Missing input validation
rg "req\.(body|params|query)\." src/actions/ | head -20

# Exposed error details
rg "catch.*error.*message" src/ | rg -v "console"
```

**Red flags:**
- 🔴 Hardcoded credentials or API keys
- 🔴 SQL queries with string interpolation
- 🔴 Missing RLS policies on new tables
- 🟡 Error messages exposing internals
- 🟡 Missing input sanitization

### 3. Performance Analysis

**What to check:**
- N+1 query patterns
- Unnecessary re-renders
- Missing memoization
- Large bundle contributions
- Expensive operations in render

**Patterns to find:**

```bash
# Potential N+1 queries (loops with await)
rg "for.*await|\.forEach.*await|\.map.*await" src/

# Missing useMemo/useCallback in complex components
rg -l "useState" src/components/ | xargs rg -L "useMemo|useCallback"

# Large imports (bundle impact)
rg "import \* as|import {[^}]{100,}" src/

# Expensive operations in JSX
rg "\.filter\(|\.map\(|\.reduce\(" src/components/ | rg "return.*<"
```

**Red flags:**
- 🔴 Await inside loops without batching
- 🔴 Large data transformations on every render
- 🟡 Missing React.memo on list items
- 🟡 Importing entire libraries for single functions

### 4. Maintainability Analysis

**What to check:**
- Code clarity and readability
- Naming conventions
- Documentation quality
- Consistent patterns
- Technical debt markers

**Patterns to find:**

```bash
# Long functions (hard to understand)
rg -A 50 "^(export )?(async )?(function|const) \w+" src/ | rg -c "^--$" | sort -t: -k2 -rn

# Magic numbers/strings
rg "[^a-zA-Z]([0-9]{3,}|[0-9]+\.[0-9]+)[^a-zA-Z0-9]" src/ | rg -v "test|spec"

# Any types (type safety erosion)
rg ": any|as any" src/ --count-matches

# Commented out code (dead code)
rg "^\s*//.*\(|^\s*//.*{|^\s*/\*" src/ | head -20

# Missing error handling
rg "\.catch\(\(\) => \{\}\)" src/
```

**Red flags:**
- 🔴 Functions over 50 lines
- 🔴 Deeply nested conditionals (>3 levels)
- 🟡 Magic numbers without constants
- 🟡 Excessive use of `any` type
- 🟡 Missing JSDoc on exported functions

### 5. Test Coverage Analysis

**What to check:**
- Coverage of critical paths
- Edge case handling
- Integration vs unit balance
- Test quality (not just quantity)

**Patterns to find:**

```bash
# Files without tests
for f in src/**/*.ts; do
  test_file="${f%.ts}.test.ts"
  [ ! -f "$test_file" ] && echo "Missing: $f"
done

# Test file coverage
npm run test -- --coverage --coverageReporters=text-summary

# Weak assertions
rg "expect\(.*\)\.toBeTruthy\(\)|expect\(.*\)\.toBeDefined\(\)" src/
```

**Red flags:**
- 🔴 Zero tests for critical business logic
- 🔴 Tests that only check "truthy"
- 🟡 Low branch coverage (<70%)
- 🟡 No integration tests for API endpoints

---

## Grading Rubric

### Overall Grade

| Grade | Criteria |
|-------|----------|
| **A** | No critical issues, minor suggestions only |
| **B** | No critical issues, some recommendations |
| **C** | 1-2 critical issues, several recommendations |
| **D** | Multiple critical issues, needs significant work |
| **F** | Fundamental problems, not production-ready |

### Dimension Grades

| Grade | Architecture | Security | Performance | Maintainability |
|-------|-------------|----------|-------------|-----------------|
| **A** | Clean separation, proper abstractions | No vulnerabilities, proper validation | Optimized queries, efficient renders | Clear, documented, consistent |
| **B** | Minor coupling issues | Low-risk findings | Minor optimization opportunities | Some unclear areas |
| **C** | Noticeable coupling | Medium-risk findings | Performance issues likely | Inconsistent patterns |
| **D** | Significant architecture issues | High-risk vulnerabilities | Known performance problems | Hard to understand |
| **F** | No clear architecture | Critical security flaws | Severe performance issues | Unmaintainable |

---

## Feedback Format

Use these markers for clarity:

| Marker | Meaning | Action Required |
|--------|---------|-----------------|
| 🔴 **Critical** | Blocks deployment/merge | Must fix |
| 🟡 **Recommendation** | Significant improvement | Should fix |
| 🟢 **Suggestion** | Nice to have | Consider |
| ✅ **Strength** | Worth noting | Keep doing |
| 💡 **Learning** | Educational note | Awareness |

### Example Feedback

```markdown
🔴 **Critical: SQL Injection Risk** (src/actions/users.ts:45)

The user ID is interpolated directly into the query string without sanitization.

```typescript
// Current (vulnerable)
const result = await db.query(`SELECT * FROM users WHERE id = '${userId}'`)

// Fixed
const result = await db.from('users').select().eq('id', userId)
```

---

🟡 **Recommendation: Extract Business Logic** (src/components/OrderForm.tsx)

The component contains 80 lines of order validation logic mixed with UI code.
Extract to `lib/orders/validation.ts` for testability and reuse.

---

✅ **Strength: Excellent Error Boundaries**

The error handling pattern in `src/app/error.tsx` provides great UX with
helpful recovery options. Consider documenting this as the standard pattern.
```

---

## Review Checklist

Before completing review:

- [ ] All 5 dimensions analyzed (Architecture, Security, Performance, Maintainability, Tests)
- [ ] Graded each dimension A-F
- [ ] Listed all critical issues with file:line references
- [ ] Provided code examples for fixes (not just problems)
- [ ] Noted what's done well (balanced feedback)
- [ ] Prioritized recommendations by impact
- [ ] Estimated effort for major fixes
- [ ] Checked for CentaurOS design system compliance

## Quick Review Commands

```bash
# All-in-one quality check
npm run lint && npx tsc --noEmit && npm run test

# Find top issues quickly
rg "TODO|FIXME|any|as any" src/ --count-matches | sort -t: -k2 -rn | head -10

# Component complexity (lines of code)
find src/components -name "*.tsx" -exec wc -l {} + | sort -rn | head -15

# Check for design system violations
rg "text-slate-|bg-slate-|text-gray-|bg-gray-" src/ --count-matches
```
