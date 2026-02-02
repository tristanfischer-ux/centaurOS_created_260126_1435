---
name: refactoring-audit
description: Systematic workflow for auditing code hygiene and flagging messy areas. Use when auditing code, checking code hygiene, finding messy code, doing a refactoring audit, hunting code smells, or when the user mentions technical debt, cleanup, or code quality assessment.
---

# Refactoring Audit Skill

This skill provides a systematic workflow for auditing code hygiene, identifying technical debt, and prioritizing refactoring efforts.

## When to Use This Skill

**Trigger phrases:**
- "audit code"
- "check code hygiene"
- "find messy code"
- "refactoring audit"
- "code smell hunt"
- "technical debt assessment"
- "cleanup audit"
- "code quality scan"

## Audit Workflow Overview

```
Phase 1: Automated Scans → Phase 2: Manual Review → Phase 3: Prioritize → Report → Remediate
```

---

## Phase 1: Automated Scans

Run these commands to gather objective metrics. All commands use ripgrep (`rg`) which is pre-installed.

### 1.1 Missing Documentation

```bash
# Find exported functions/classes without JSDoc (TypeScript/JavaScript)
rg "^export (async )?(function|const|class) \w+" src/ -l | while read f; do
  rg -B1 "^export (async )?(function|const|class)" "$f" | rg -v "/\*\*|^\-\-$" && echo "Missing JSDoc: $f"
done

# Quick count of exports vs documented exports
echo "Total exports:"
rg "^export (async )?(function|const|class) \w+" src/ -c | awk -F: '{sum += $2} END {print sum}'

echo "Documented exports (with JSDoc):"
rg -B1 "^export (async )?(function|const|class)" src/ | rg "/\*\*" -c
```

### 1.2 TypeScript Escape Hatches

```bash
# Find @ts-nocheck usage (file-level type bypass)
echo "=== @ts-nocheck files ==="
rg "@ts-nocheck" src/ -l

# Find @ts-ignore/@ts-expect-error usage (line-level type bypass)
echo "=== @ts-ignore/@ts-expect-error usage ==="
rg "@ts-ignore|@ts-expect-error" src/ -c

# Show context for each
rg "@ts-ignore|@ts-expect-error" src/ -B2 -A1
```

### 1.3 `any` Type Usage

```bash
# Count files with explicit 'any' type
echo "=== Files using 'any' type ==="
rg ": any\b|<any>|as any" src/ --type ts --type tsx -c | sort -t: -k2 -rn | head -20

# Total count
echo "Total 'any' usages:"
rg ": any\b|<any>|as any" src/ --type ts -c | awk -F: '{sum += $2} END {print sum}'

# Show each usage with context
rg ": any\b|<any>|as any" src/ -n --type ts | head -50
```

### 1.4 Silent Error Handling

```bash
# Find empty catch blocks (swallowed errors)
echo "=== Empty catch blocks ==="
rg "catch\s*\([^)]*\)\s*\{\s*\}" src/ -n

# Find catch blocks with only console.log (no rethrow or handling)
echo "=== Catch blocks with only console.log ==="
rg -U "catch\s*\([^)]*\)\s*\{[^}]*console\.(log|error)[^}]*\}" src/ -n --multiline

# Find catches that don't use the error parameter
echo "=== Catch blocks ignoring error ==="
rg "catch\s*\(\s*_?\s*\)" src/ -n

# Count all suspect error handling
echo "Total suspect catches:"
rg "catch\s*\([^)]*\)\s*\{\s*\}" src/ -c | awk -F: '{sum += $2} END {print sum}'
```

### 1.5 TODO/FIXME/HACK Comments

```bash
# Find all action comments by type
echo "=== TODO comments ==="
rg "// TODO|/\* TODO" src/ -c | sort -t: -k2 -rn

echo "=== FIXME comments ==="
rg "// FIXME|/\* FIXME" src/ -c | sort -t: -k2 -rn

echo "=== HACK comments ==="
rg "// HACK|/\* HACK" src/ -c | sort -t: -k2 -rn

# Show all with context
echo "=== All action comments with context ==="
rg "(TODO|FIXME|HACK|XXX|BUG):" src/ -n -A1

# Summary counts
echo "=== Summary ==="
echo "TODOs: $(rg "TODO" src/ -c | awk -F: '{sum += $2} END {print sum}')"
echo "FIXMEs: $(rg "FIXME" src/ -c | awk -F: '{sum += $2} END {print sum}')"
echo "HACKs: $(rg "HACK" src/ -c | awk -F: '{sum += $2} END {print sum}')"
```

### 1.6 Long Functions (>50 lines)

```bash
# Find functions longer than 50 lines (approximate via brace counting)
# This script counts lines between function start and closing brace
rg -n "^(export )?(async )?(function \w+|const \w+ = (async )?(function|\([^)]*\) =>))" src/ --type ts --type tsx | while read line; do
  file=$(echo "$line" | cut -d: -f1)
  linenum=$(echo "$line" | cut -d: -f2)
  funcname=$(echo "$line" | cut -d: -f3-)
  
  # Count lines until matching brace (simplified)
  remaining=$(tail -n +$linenum "$file" 2>/dev/null | head -100 | wc -l)
  if [ "$remaining" -gt 50 ]; then
    echo "LONG: $file:$linenum - $funcname (>${remaining} lines)"
  fi
done 2>/dev/null | head -20

# Alternative: Find files with very long continuous code blocks
echo "=== Files with 50+ line code blocks (potential long functions) ==="
for f in $(find src -name "*.ts" -o -name "*.tsx" 2>/dev/null); do
  lines=$(wc -l < "$f")
  if [ "$lines" -gt 200 ]; then
    echo "$f: $lines lines total"
  fi
done | sort -t: -k2 -rn | head -20
```

### 1.7 Deeply Nested Code

```bash
# Find deeply nested code (4+ levels of indentation)
echo "=== Deeply nested code (4+ levels) ==="
rg "^(\t{4,}|[ ]{16,})\S" src/ -n | head -30

# Find nested ternaries (hard to read)
echo "=== Nested ternary operators ==="
rg "\?[^:]+\?[^:]+:" src/ -n | head -20

# Find callback hell patterns
echo "=== Potential callback hell (nested callbacks) ==="
rg -U "\.then\([^)]*\{[^}]*\.then\(" src/ -n --multiline | head -20

# Find deeply nested conditionals
echo "=== Files with many if statements (potential complexity) ==="
rg "^\s*if\s*\(" src/ --type ts -c | sort -t: -k2 -rn | head -10
```

### 1.8 Console Statements (Debug Leftovers)

```bash
# Find console.log/debug statements (should be removed before commit)
echo "=== Console statements ==="
rg "console\.(log|debug|info|warn|error|trace)" src/ -c | sort -t: -k2 -rn | head -20

# Total count
echo "Total console statements:"
rg "console\.(log|debug|info|warn|error|trace)" src/ -c | awk -F: '{sum += $2} END {print sum}'
```

### 1.9 Duplicate Code Patterns

```bash
# Find similar import patterns (potential shared module candidates)
echo "=== Most common imports (potential for barrel exports) ==="
rg "^import .* from ['\"]@/lib/" src/ -o | sort | uniq -c | sort -rn | head -15

# Find repeated code blocks (exact matches)
echo "=== Duplicate string literals ==="
rg "\"[^\"]{30,}\"" src/ -o | sort | uniq -c | sort -rn | head -10
```

### 1.10 Quick Audit Summary Script

```bash
#!/bin/bash
# Save as audit-summary.sh and run: bash audit-summary.sh

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║               CODE HYGIENE AUDIT SUMMARY                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

echo "📝 DOCUMENTATION"
echo "   Exports without JSDoc: $(rg "^export (async )?(function|const|class)" src/ -l 2>/dev/null | wc -l | tr -d ' ') files"
echo ""

echo "⚠️  TYPE SAFETY"
echo "   @ts-nocheck files: $(rg "@ts-nocheck" src/ -l 2>/dev/null | wc -l | tr -d ' ')"
echo "   @ts-ignore usages: $(rg "@ts-ignore|@ts-expect-error" src/ -c 2>/dev/null | awk -F: '{sum += $2} END {print sum+0}')"
echo "   'any' type usages: $(rg ": any\b|<any>|as any" src/ -c 2>/dev/null | awk -F: '{sum += $2} END {print sum+0}')"
echo ""

echo "🚨 ERROR HANDLING"
echo "   Empty catch blocks: $(rg "catch\s*\([^)]*\)\s*\{\s*\}" src/ -c 2>/dev/null | awk -F: '{sum += $2} END {print sum+0}')"
echo ""

echo "📌 ACTION COMMENTS"
echo "   TODOs: $(rg "// TODO|/\* TODO" src/ -c 2>/dev/null | awk -F: '{sum += $2} END {print sum+0}')"
echo "   FIXMEs: $(rg "// FIXME|/\* FIXME" src/ -c 2>/dev/null | awk -F: '{sum += $2} END {print sum+0}')"
echo "   HACKs: $(rg "// HACK|/\* HACK" src/ -c 2>/dev/null | awk -F: '{sum += $2} END {print sum+0}')"
echo ""

echo "🔧 CODE SMELLS"
echo "   Console statements: $(rg "console\.(log|debug)" src/ -c 2>/dev/null | awk -F: '{sum += $2} END {print sum+0}')"
echo "   Deeply nested (4+): $(rg "^(\t{4,}|[ ]{16,})\S" src/ -c 2>/dev/null | awk -F: '{sum += $2} END {print sum+0}')"
echo ""

echo "═══════════════════════════════════════════════════════════════"
```

---

## Phase 2: Manual Review Checklist

After automated scans, manually review using this checklist:

| Category | Check | Flag If |
|----------|-------|---------|
| **Documentation** | Public APIs have JSDoc | Functions exported without description |
| **Documentation** | Complex logic has comments | Non-obvious code without explanation |
| **Documentation** | README reflects current state | README doesn't match actual behavior |
| **Typing** | No `any` types without justification | `any` used for convenience, not necessity |
| **Typing** | Generic types are constrained | `T` without `extends SomeType` |
| **Typing** | Return types are explicit | Relying on inference for public APIs |
| **Error Handling** | Errors are logged with context | `catch (e) { console.log(e) }` |
| **Error Handling** | Errors propagate or recover | Silently swallowing errors |
| **Error Handling** | User-facing errors are friendly | Stack traces shown to users |
| **Complexity** | Functions have single responsibility | Function does multiple unrelated things |
| **Complexity** | Cyclomatic complexity < 10 | Many branches/conditionals in one function |
| **Complexity** | Nesting depth < 4 levels | Arrow code / deeply nested blocks |
| **Duplication** | No copy-pasted code blocks | Same logic in multiple places |
| **Duplication** | Shared utilities are extracted | Helper functions repeated |
| **Duplication** | Types are not duplicated | Same interface defined multiple times |
| **Naming** | Variables describe content | `data`, `temp`, `x`, `item` |
| **Naming** | Functions describe action | `handle`, `process`, `do` without context |
| **Naming** | No abbreviations without context | `usr`, `mgr`, `btn` in non-UI code |
| **Security** | No hardcoded secrets | API keys, passwords in code |
| **Security** | User input is validated | Direct use of req.body/params |
| **Security** | SQL queries are parameterized | String concatenation in queries |

### Manual Review Questions

Ask these questions for each file/module:

1. **Would a new developer understand this code in 5 minutes?**
2. **If this code broke at 3am, could someone fix it without you?**
3. **Is the "why" documented, not just the "what"?**
4. **Are edge cases handled or explicitly documented as unsupported?**
5. **Would you be comfortable showing this code in an interview?**

---

## Phase 3: Prioritization Matrix

After identifying issues, prioritize using this matrix:

```
                     HIGH IMPACT
                         │
    ┌────────────────────┼────────────────────┐
    │                    │                    │
    │   QUICK WINS       │   MUST DO          │
    │   Do these first   │   Plan & schedule  │
    │                    │                    │
LOW ├────────────────────┼────────────────────┤ HIGH
EFFORT                   │                    EFFORT
    │                    │                    │
    │   IGNORE           │   CONSIDER         │
    │   Not worth it     │   If time permits  │
    │                    │                    │
    └────────────────────┼────────────────────┘
                         │
                     LOW IMPACT
```

### Classification Guide

| Quadrant | Impact | Effort | Action | Examples |
|----------|--------|--------|--------|----------|
| **Quick Wins** | High | Low | Do immediately | Remove console.logs, add missing return types, rename unclear variables |
| **Must Do** | High | High | Plan sprints | Extract duplicate code to shared utils, refactor complex functions, add comprehensive tests |
| **Consider** | Low | High | Backlog | Major architectural changes for minor improvements, rewriting working legacy code |
| **Ignore** | Low | Low | Skip | Stylistic preferences, minor naming tweaks in stable code |

### Impact Criteria

**High Impact:**
- Security vulnerabilities
- Production bugs waiting to happen
- Blocks feature development
- Significantly impacts maintainability
- Affects multiple files/modules

**Low Impact:**
- Aesthetic/stylistic issues
- Isolated to single file
- Working correctly (just messy)
- No security implications

### Effort Criteria

**Low Effort (<30 min):**
- Single file change
- Automated fix available
- No test updates needed
- Clear solution

**High Effort (>30 min):**
- Multiple files affected
- Requires new tests
- Needs design decisions
- Risk of regression

---

## Output Format

### Severity Levels

| Level | Symbol | Criteria | SLA |
|-------|--------|----------|-----|
| **Critical** | 🔴 | Security vulnerability, data loss risk, production breakage | Fix immediately |
| **High** | 🟠 | Likely to cause bugs, significant tech debt, blocks features | Fix this sprint |
| **Medium** | 🟡 | Code smell, maintainability concern, minor tech debt | Fix within quarter |
| **Low** | 🟢 | Stylistic, minor improvement, nice-to-have | Opportunistic |

### Audit Report Template

```markdown
# Code Hygiene Audit Report

**Date:** YYYY-MM-DD
**Scope:** [Files/directories audited]
**Auditor:** [Name or "Automated"]

## Executive Summary

- **Critical Issues:** X
- **High Issues:** X
- **Medium Issues:** X
- **Low Issues:** X
- **Total Technical Debt Estimate:** X hours

## Critical Issues 🔴

### [CRIT-001] [Short Title]
- **File:** `path/to/file.ts:123`
- **Description:** [What's wrong]
- **Impact:** [Why it matters]
- **Fix:** [How to fix]
- **Effort:** [Low/Medium/High]

## High Issues 🟠

### [HIGH-001] [Short Title]
...

## Medium Issues 🟡

### [MED-001] [Short Title]
...

## Low Issues 🟢

### [LOW-001] [Short Title]
...

## Metrics Summary

| Metric | Count | Threshold | Status |
|--------|-------|-----------|--------|
| `any` types | X | <10 | ⚠️ |
| Empty catches | X | 0 | ❌ |
| TODOs | X | <20 | ✅ |
| Console.logs | X | 0 | ⚠️ |

## Recommended Actions

1. **Immediate:** [Action items]
2. **This Sprint:** [Action items]
3. **Backlog:** [Action items]

## Appendix

[Raw command outputs, additional context]
```

### Issue Template (for filing individual issues)

```markdown
## [SEVERITY] [Category]: [Short description]

**Location:** `file:line`
**Detected by:** [Automated scan / Manual review]
**Severity:** [Critical/High/Medium/Low]

### Problem
[Describe what's wrong]

### Current Code
\`\`\`typescript
// problematic code here
\`\`\`

### Expected Code
\`\`\`typescript
// fixed code here
\`\`\`

### Impact
[Why this matters, what could go wrong]

### Fix Effort
- [ ] Time estimate: X minutes/hours
- [ ] Files affected: X
- [ ] Tests needed: Yes/No
- [ ] Risk level: Low/Medium/High

### Related
- Blocks: #XXX
- Related to: #XXX
```

---

## Remediation Workflow

### By Issue Type

#### Missing Documentation

```bash
# 1. Identify undocumented exports
rg "^export (async )?(function|const)" src/lib/mymodule.ts

# 2. Add JSDoc above each export
```

```typescript
// BEFORE
export function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// AFTER
/**
 * Calculates the total price of all items.
 * @param items - Array of items with price property
 * @returns Sum of all item prices
 */
export function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}
```

#### Removing `any` Types

```typescript
// BEFORE
function processData(data: any): any {
  return data.map((item: any) => item.value);
}

// AFTER
interface DataItem {
  value: string;
  // ... other properties
}

function processData(data: DataItem[]): string[] {
  return data.map((item) => item.value);
}
```

#### Fixing Silent Error Handling

```typescript
// BEFORE (silent failure)
try {
  await saveData(data);
} catch (e) {
  console.log(e);
}

// AFTER (proper error handling)
try {
  await saveData(data);
} catch (error) {
  console.error('Failed to save data:', { error, data });
  throw new Error(`Save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
}
```

#### Resolving TODOs

```bash
# 1. List all TODOs with context
rg "TODO:" src/ -A2

# 2. For each TODO, decide:
#    - Fix now (if simple)
#    - Create issue (if complex)
#    - Remove (if obsolete)
```

#### Simplifying Long Functions

```typescript
// BEFORE (70+ line function)
async function processOrder(order: Order) {
  // validate
  // calculate totals
  // apply discounts
  // check inventory
  // reserve items
  // process payment
  // send confirmation
  // update analytics
}

// AFTER (composed of focused functions)
async function processOrder(order: Order) {
  const validated = validateOrder(order);
  const totals = calculateOrderTotals(validated);
  const discounted = applyDiscounts(totals);
  await reserveInventory(discounted);
  const payment = await processPayment(discounted);
  await sendConfirmation(order, payment);
  trackOrderAnalytics(order);
}
```

#### Reducing Nesting

```typescript
// BEFORE (deeply nested)
function processItem(item) {
  if (item) {
    if (item.isValid) {
      if (item.hasPermission) {
        if (item.isActive) {
          return doWork(item);
        }
      }
    }
  }
  return null;
}

// AFTER (early returns)
function processItem(item) {
  if (!item) return null;
  if (!item.isValid) return null;
  if (!item.hasPermission) return null;
  if (!item.isActive) return null;
  
  return doWork(item);
}
```

### PR Strategy

| Issue Count | Strategy |
|-------------|----------|
| 1-3 issues | Single PR with clear commits per issue |
| 4-10 issues | Group by file or category |
| 10+ issues | Separate PRs by severity level |

**PR Naming Convention:**
```
refactor(scope): [brief description]

Examples:
refactor(lib): add JSDoc to exported functions
refactor(types): remove any types from order module
refactor(errors): improve error handling in payment flow
chore: resolve TODO comments in dashboard
```

**When to Create Separate PRs:**

- **Always separate:** Security fixes, breaking changes
- **Prefer separate:** Changes to different domains/modules
- **Can combine:** Related fixes in same file, simple cleanup

---

## Quick Reference Commands

```bash
# Full audit (run all scans)
bash audit-summary.sh

# Check specific directory
rg "@ts-ignore|any|TODO|FIXME" src/components/ -c

# Find worst offenders (files with most issues)
rg "any|TODO|console\.log" src/ -c | sort -t: -k2 -rn | head -10

# Pre-commit quick check
rg "console\.log|debugger" src/ && echo "❌ Debug code found" || echo "✅ No debug code"
```

---

## Related Skills

- [code-quality](../code-quality/SKILL.md) - Run linters and type checks
- [comprehensive-code-review](../comprehensive-code-review/SKILL.md) - Deep architectural review
- [security-review](../security-review/SKILL.md) - Security-focused audit
- [bug-fix-workflow](../bug-fix-workflow/SKILL.md) - Fix issues found during audit
