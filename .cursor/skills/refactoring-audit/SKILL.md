---
name: refactoring-audit
description: Systematic workflow for auditing code hygiene and flagging areas needing refactoring. Use when the user asks to audit code, find messy code, code hygiene check, refactoring audit, technical debt scan, find smells, clean up code, or identify refactoring candidates.
---

# Refactoring Audit Skill

This skill provides a systematic workflow for auditing code hygiene and identifying areas that need refactoring. It combines automated scans with manual review to produce an actionable prioritized report.

## Trigger Phrases

Use this skill when you hear:
- "audit code"
- "find messy code"
- "code hygiene check"
- "refactoring audit"
- "technical debt scan"
- "find code smells"
- "what needs cleanup"
- "identify refactoring candidates"

---

## Phase 1: Automated Scans

Run these commands to gather metrics. Each scan targets a specific code hygiene concern.

### 1.1 Functions Missing JSDoc

Find exported functions without documentation:

```bash
# Find exported functions/const without JSDoc (no /** above them)
rg -B 2 "^export (async )?(function|const) \w+" src/ --type ts --type tsx | rg -v "/\*\*" | rg "^export"

# Count functions missing JSDoc per file
rg -l "^export (async )?(function|const) \w+" src/ | while read f; do
  total=$(rg -c "^export (async )?(function|const) \w+" "$f" 2>/dev/null || echo 0)
  documented=$(rg -cB 1 "^export (async )?(function|const) \w+" "$f" 2>/dev/null | rg -c "/\*\*" || echo 0)
  missing=$((total - documented))
  [ $missing -gt 0 ] && echo "$f: $missing missing"
done
```

### 1.2 TypeScript Escape Hatches

Find `@ts-nocheck`, `@ts-ignore`, and `@ts-expect-error` usage:

```bash
# Find all TypeScript escape hatches
rg "@ts-nocheck|@ts-ignore|@ts-expect-error" src/ --type ts --type tsx

# Count by type
echo "=== @ts-nocheck ===" && rg -c "@ts-nocheck" src/ 2>/dev/null || echo "0"
echo "=== @ts-ignore ===" && rg -c "@ts-ignore" src/ --count-matches 2>/dev/null
echo "=== @ts-expect-error ===" && rg -c "@ts-expect-error" src/ --count-matches 2>/dev/null
```

### 1.3 `any` Type Usage

Find explicit `any` types that weaken type safety:

```bash
# Find all any type usages
rg ": any|<any>|as any|\bany\b" src/ --type ts --type tsx

# Count any usages per file (sorted by count)
rg -c ": any|as any" src/ --type ts --type tsx 2>/dev/null | sort -t: -k2 -rn | head -20

# Find particularly bad patterns
rg "Record<string, any>|Promise<any>|\[\]: any" src/
```

### 1.4 Empty Catch Blocks (Silent Error Handling)

Find catch blocks that swallow errors:

```bash
# Find empty catch blocks
rg "catch\s*\([^)]*\)\s*\{\s*\}" src/ --type ts --type tsx

# Find catch blocks with only comments
rg -U "catch\s*\([^)]*\)\s*\{\s*//.*\s*\}" src/ --multiline

# Find catch blocks that do nothing meaningful
rg "\.catch\(\(\) => \{\}\)|\.catch\(\(\) => null\)|\.catch\(\(\) => undefined\)" src/

# Find try-catch with empty/minimal catch
rg -U "catch.*\{[\s\n]*\}" src/ --multiline
```

### 1.5 TODO/FIXME/HACK Comments

Find technical debt markers:

```bash
# Find all debt markers
rg "TODO|FIXME|HACK|XXX|KLUDGE|TEMP|TEMPORARY" src/ --type ts --type tsx

# Count by type
echo "=== TODOs ===" && rg -c "TODO" src/ --count-matches 2>/dev/null | awk -F: '{sum+=$2} END {print sum}'
echo "=== FIXMEs ===" && rg -c "FIXME" src/ --count-matches 2>/dev/null | awk -F: '{sum+=$2} END {print sum}'
echo "=== HACKs ===" && rg -c "HACK" src/ --count-matches 2>/dev/null | awk -F: '{sum+=$2} END {print sum}'

# Find old TODOs (with dates if present)
rg "TODO.*20[0-2][0-9]|FIXME.*20[0-2][0-9]" src/

# List files with most debt markers
rg -c "TODO|FIXME|HACK" src/ --type ts --type tsx 2>/dev/null | sort -t: -k2 -rn | head -15
```

### 1.6 Long Functions (>50 lines)

Find functions that are too long:

```bash
# Count lines in each function (approximate)
rg -n "^(export )?(async )?(function \w+|const \w+ = (\([^)]*\)|async \([^)]*\)) =>)" src/ --type tsx --type ts

# Find large files (often contain long functions)
find src/ -name "*.tsx" -o -name "*.ts" | xargs wc -l | sort -rn | head -20

# Check component sizes
find src/components -name "*.tsx" -exec wc -l {} + | sort -rn | head -15

# Find functions with many lines between { and }
rg -U "^(export )?(async )?function \w+[^{]*\{[\s\S]{2000,}?\n\}" src/ --multiline 2>/dev/null | head -30
```

### 1.7 Deeply Nested Code

Find code with excessive nesting:

```bash
# Find deeply indented lines (proxy for nesting)
rg "^(\t{4,}|    {4,})" src/ --type ts --type tsx | head -30

# Find nested callbacks (callback hell)
rg "=>\s*\{[\s\S]*=>\s*\{[\s\S]*=>\s*\{" src/ --multiline 2>/dev/null | head -20

# Find nested ternaries
rg "\?.*\?.*\?.*:" src/ --type ts --type tsx

# Find files with high cyclomatic complexity indicators
rg "if.*if.*if|else.*if.*else.*if" src/ --type ts --type tsx | head -20
```

### 1.8 Additional Code Smells

```bash
# Magic numbers (numbers that should be constants)
rg "[^a-zA-Z_]([0-9]{4,}|[0-9]+\.[0-9]+)[^a-zA-Z0-9]" src/ --type ts --type tsx | rg -v "test|spec|\.d\.ts" | head -20

# Console logs left in code
rg "console\.(log|debug|info|warn|error)" src/ --type ts --type tsx | rg -v "lib/logger|utils/log" | head -20

# Duplicate string literals (possible constants)
rg -o '"[^"]{10,}"' src/ --type ts --type tsx | sort | uniq -c | sort -rn | head -15

# Functions with many parameters (>4)
rg "function \w+\([^)]*,[^)]*,[^)]*,[^)]*,[^)]*\)|const \w+ = \([^)]*,[^)]*,[^)]*,[^)]*,[^)]*\)" src/

# Large switch statements
rg -c "case " src/ --type ts --type tsx | sort -t: -k2 -rn | head -10

# Unused imports (basic check)
npx eslint src/ --rule '@typescript-eslint/no-unused-vars: error' --format compact 2>/dev/null | head -30
```

---

## Phase 2: Manual Review Checklist

After running automated scans, manually review using this checklist. Each category has specific checks with "Flag If" criteria.

### Documentation

| Check | What to Look For | Flag If |
|-------|------------------|---------|
| **JSDoc on exports** | All exported functions/types have JSDoc | >20% exports missing docs |
| **README accuracy** | README reflects current architecture | README is stale or missing sections |
| **Inline comments** | Complex logic has explanatory comments | Complex algorithms have no explanation |
| **API documentation** | API routes have request/response docs | No API documentation exists |
| **Type documentation** | Complex types have descriptions | Type aliases are unclear |

### Typing

| Check | What to Look For | Flag If |
|-------|------------------|---------|
| **any usage** | Explicit `any` types | >10 `any` usages in codebase |
| **Type assertions** | `as` casts | Frequent `as unknown as X` patterns |
| **Type coverage** | All functions have return types | Functions missing return types |
| **Generic constraints** | Generics are properly constrained | `T extends any` or unconstrained generics |
| **Null handling** | Proper null/undefined handling | Missing optional chaining or nullish coalescing |

### Error Handling

| Check | What to Look For | Flag If |
|-------|------------------|---------|
| **Empty catches** | Catch blocks handle errors | Any empty catch blocks exist |
| **Error types** | Typed error handling | `catch (e: any)` or `catch (e)` without type guard |
| **User feedback** | Errors shown to users appropriately | Silent failures with no UI feedback |
| **Error logging** | Errors logged for debugging | Errors caught but not logged |
| **Error boundaries** | React error boundaries in place | Missing error boundaries for critical sections |

### Complexity

| Check | What to Look For | Flag If |
|-------|------------------|---------|
| **Function length** | Functions <50 lines | Any function >50 lines |
| **Nesting depth** | Max 3 levels of nesting | >3 levels of indentation |
| **Cyclomatic complexity** | Simple control flow | Functions with >10 branches |
| **Component size** | Components <300 lines | Components >300 lines |
| **File organization** | Single responsibility per file | Files with multiple unrelated exports |

### Duplication

| Check | What to Look For | Flag If |
|-------|------------------|---------|
| **Copy-paste code** | DRY principle followed | Same logic in multiple places |
| **Similar components** | Components are composed/shared | Near-duplicate components |
| **Repeated queries** | Database queries centralized | Same query in multiple files |
| **Utility extraction** | Common patterns extracted | >3 occurrences of same pattern |
| **Constants** | Magic values extracted | Same literal used multiple times |

### Naming

| Check | What to Look For | Flag If |
|-------|------------------|---------|
| **Descriptive names** | Names reveal intent | Single-letter or cryptic names |
| **Consistent conventions** | camelCase/PascalCase followed | Mixed naming conventions |
| **Boolean naming** | Booleans start with is/has/can/should | Unclear boolean names like `flag`, `check` |
| **Function naming** | Verbs for actions, nouns for getters | Vague names like `process`, `handle`, `do` |
| **File naming** | Consistent file naming pattern | Mix of kebab-case and camelCase files |

### Security

| Check | What to Look For | Flag If |
|-------|------------------|---------|
| **Input validation** | All inputs validated | Missing validation on user inputs |
| **SQL injection** | Parameterized queries | String interpolation in queries |
| **XSS prevention** | No dangerouslySetInnerHTML | Unescaped user content rendered |
| **Auth checks** | All routes protected | Routes missing auth middleware |
| **Secrets exposure** | No hardcoded secrets | Any credentials in code |

---

## Phase 3: Prioritization Matrix

Use this matrix to prioritize findings. Impact measures business/user effect, Effort measures fix complexity.

```
                    EFFORT
                    Low         Medium      High
            ┌───────────────┬───────────┬───────────┐
    High    │ 🔴 DO FIRST   │ 🟠 PLAN   │ 🟡 PLAN   │
            │               │ NEXT      │ CAREFULLY │
I   ────────┼───────────────┼───────────┼───────────┤
M   Medium  │ 🟢 QUICK WIN  │ 🔵 BATCH  │ 🟣 DEFER  │
P           │               │ TOGETHER  │ OR SPLIT  │
A   ────────┼───────────────┼───────────┼───────────┤
C   Low     │ ⚪ IF TIME    │ 🔘 SKIP   │ ❌ DON'T  │
T           │ PERMITS       │ FOR NOW   │ DO        │
            └───────────────┴───────────┴───────────┘
```

### Recommended Actions by Quadrant

| Quadrant | Impact | Effort | Action |
|----------|--------|--------|--------|
| 🔴 **Do First** | High | Low | Fix immediately. These are high-value, easy wins. |
| 🟠 **Plan Next** | High | Medium | Schedule for next sprint. Worth the investment. |
| 🟡 **Plan Carefully** | High | High | Break into smaller tasks. May need architecture changes. |
| 🟢 **Quick Win** | Medium | Low | Batch together. Fix during regular development. |
| 🔵 **Batch Together** | Medium | Medium | Group similar fixes. Address in dedicated cleanup sprint. |
| 🟣 **Defer or Split** | Medium | High | Consider if worth doing. Split if possible. |
| ⚪ **If Time Permits** | Low | Low | Address opportunistically during related work. |
| 🔘 **Skip for Now** | Low | Medium | Not worth prioritizing. May fix if already touching file. |
| ❌ **Don't Do** | Low | High | Not worth the effort. Accept the tech debt. |

### Impact Assessment Criteria

| Impact Level | Criteria |
|--------------|----------|
| **High** | Affects user experience, causes bugs, security vulnerability, blocks features |
| **Medium** | Slows development, makes code harder to understand, inconsistent behavior |
| **Low** | Code style preference, minor inconsistency, theoretical concern |

### Effort Assessment Criteria

| Effort Level | Criteria |
|--------------|----------|
| **Low** | <30 minutes, single file, no testing changes needed |
| **Medium** | 30min-2hrs, multiple files, may need test updates |
| **High** | >2hrs, architectural change, significant test changes, risk of regression |

---

## Phase 4: Report Generation

After completing Phases 1-3, generate a comprehensive report using this template.

### Report Template

```markdown
# Refactoring Audit Report

**Project:** [Project Name]
**Audited:** [Date]
**Scope:** [Files/directories audited]
**Auditor:** [Agent/Person]

---

## Executive Summary

**Overall Code Health:** [A/B/C/D/F]

| Metric | Count | Status |
|--------|-------|--------|
| Files Scanned | X | - |
| Functions Missing JSDoc | X | 🟡/🔴/🟢 |
| TypeScript Escapes | X | 🟡/🔴/🟢 |
| `any` Types | X | 🟡/🔴/🟢 |
| Empty Catch Blocks | X | 🟡/🔴/🟢 |
| TODO/FIXME/HACK | X | 🟡/🔴/🟢 |
| Long Functions (>50 lines) | X | 🟡/🔴/🟢 |
| Deep Nesting Issues | X | 🟡/🔴/🟢 |

**Health Score Thresholds:**
- 🟢 Green: Within acceptable limits
- 🟡 Yellow: Needs attention
- 🔴 Red: Critical, fix soon

---

## Critical Issues (Must Fix)

Issues that should be fixed immediately due to high impact.

| # | Issue | Location | Impact | Effort | Priority |
|---|-------|----------|--------|--------|----------|
| 1 | [Description] | `file:line` | High | Low | 🔴 Do First |
| 2 | [Description] | `file:line` | High | Medium | 🟠 Plan Next |

### Issue Details

#### 1. [Issue Title]

**Location:** `src/path/file.tsx:42`
**Problem:** [Detailed description]
**Risk:** [What could go wrong]
**Fix:** [How to fix it]

```typescript
// Before
[problematic code]

// After
[fixed code]
```

---

## Recommended Fixes (Should Fix)

Medium-priority issues that improve code quality.

| # | Issue | Location | Impact | Effort | Priority |
|---|-------|----------|--------|--------|----------|
| 1 | [Description] | `file.tsx` | Medium | Low | 🟢 Quick Win |

---

## Suggestions (Nice to Have)

Low-priority improvements to consider.

| # | Suggestion | Location | Notes |
|---|------------|----------|-------|
| 1 | [Description] | `file.tsx` | [Context] |

---

## Technical Debt by Category

| Category | Count | Severity | Estimated Effort |
|----------|-------|----------|------------------|
| Documentation | X issues | 🟡 Medium | ~Xh |
| Typing | X issues | 🔴 High | ~Xh |
| Error Handling | X issues | 🟡 Medium | ~Xh |
| Complexity | X issues | 🔴 High | ~Xh |
| Duplication | X issues | 🟡 Medium | ~Xh |
| Naming | X issues | 🟢 Low | ~Xh |
| Security | X issues | 🔴 Critical | ~Xh |

---

## Files Needing Most Attention

Ranked by number of issues found:

| Rank | File | Issues | Categories |
|------|------|--------|------------|
| 1 | `src/path/file.tsx` | X | Typing, Complexity |
| 2 | `src/path/other.ts` | X | Error Handling |

---

## Recommended Action Plan

### Immediate (This Sprint)
1. [ ] [Action item]
2. [ ] [Action item]

### Short-term (Next 2-4 Sprints)
1. [ ] [Action item]
2. [ ] [Action item]

### Long-term (Backlog)
1. [ ] [Action item]

---

## Effort Estimates

| Priority | Issues | Estimated Total |
|----------|--------|-----------------|
| 🔴 Critical | X | ~Xh |
| 🟠 High | X | ~Xh |
| 🟢 Medium | X | ~Xh |
| ⚪ Low | X | ~Xh |
| **Total** | **X** | **~Xh** |

---

## Appendix: Raw Scan Results

<details>
<summary>Click to expand full scan output</summary>

### Any Type Usage
[Paste rg output]

### TODO/FIXME Comments
[Paste rg output]

### Empty Catch Blocks
[Paste rg output]

</details>
```

---

## Quick Audit Commands

Run these for a fast overview:

```bash
# Quick health check - run all key scans
echo "=== Code Hygiene Summary ===" && \
echo "any types:" && rg -c ": any|as any" src/ 2>/dev/null | awk -F: '{sum+=$2} END {print sum}' && \
echo "TODOs:" && rg -c "TODO|FIXME|HACK" src/ 2>/dev/null | awk -F: '{sum+=$2} END {print sum}' && \
echo "empty catches:" && rg -c "catch.*\{\s*\}" src/ 2>/dev/null | awk -F: '{sum+=$2} END {print sum}' && \
echo "ts-ignore:" && rg -c "@ts-ignore|@ts-nocheck" src/ 2>/dev/null | awk -F: '{sum+=$2} END {print sum}' && \
echo "console.log:" && rg -c "console\.log" src/ 2>/dev/null | awk -F: '{sum+=$2} END {print sum}'
```

```bash
# Top 10 files needing attention
(rg -c "any|TODO|FIXME|catch.*\{\}" src/ --type ts --type tsx 2>/dev/null || echo "") | sort -t: -k2 -rn | head -10
```

```bash
# Audit specific directory
TARGET_DIR="src/components"
echo "=== Auditing $TARGET_DIR ===" && \
echo "Files:" && find $TARGET_DIR -name "*.tsx" | wc -l && \
echo "any types:" && rg -c ": any|as any" $TARGET_DIR 2>/dev/null | awk -F: '{sum+=$2} END {print sum}' && \
echo "TODOs:" && rg -c "TODO|FIXME" $TARGET_DIR 2>/dev/null | awk -F: '{sum+=$2} END {print sum}'
```

---

## Integration with Other Skills

This skill works well with:

- **code-quality**: Run after audit to fix lint/type issues
- **comprehensive-code-review**: For deeper analysis of flagged files
- **security-review**: When security issues are flagged
- **bug-fix-workflow**: When audit reveals bugs

---

## Audit Workflow Summary

1. **Run Phase 1 scans** → Collect metrics
2. **Review Phase 2 checklist** → Manual inspection
3. **Apply Phase 3 matrix** → Prioritize findings
4. **Generate Phase 4 report** → Actionable document
5. **Create tasks** → Add high-priority items to backlog
6. **Track progress** → Re-audit periodically
