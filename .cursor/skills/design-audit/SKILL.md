---
name: design-audit
description: Systematic audit of codebase for design inconsistencies, with quantified metrics and actionable fix plans. Use when the user asks to audit design, check consistency, find UI inconsistencies, review design system usage, or mentions design debt, visual inconsistency, or UX audit.
---

# Design Consistency Audit

Systematic methodology for identifying and fixing design inconsistencies across a codebase.

## Audit Workflow

### Step 1: Scan for Inconsistencies

Run these searches to quantify issues:

```bash
# Color inconsistencies (hardcoded vs semantic tokens)
rg "text-slate-|text-gray-|bg-slate-|bg-gray-|bg-white" src/ --count-matches | wc -l
rg "text-red-|text-green-|text-blue-|text-amber-" src/ --count-matches | wc -l

# Form validation patterns
rg "border-red-|text-red-" src/ --count-matches
rg "border-destructive|text-destructive" src/ --count-matches

# Component usage
rg 'className=".*rounded-lg.*border' src/ --count-matches  # Custom cards
rg "DialogContent.*className.*max-w" src/ --count-matches  # Custom dialog widths

# Navigation active states
rg "bg-cyan-|text-cyan-" src/components/ --count-matches
rg "international-orange" src/components/ --count-matches
```

### Step 2: Categorize Findings

Use this severity framework:

| Severity | Definition | Examples |
|----------|------------|----------|
| 🔴 Critical | Breaks functionality or accessibility | Missing ARIA, broken dark mode |
| 🟡 Inconsistent | Multiple patterns for same thing | 3 different error colors |
| 🟢 Minor | Style preferences | Spacing variations |

### Step 3: Generate Audit Report

Use this template:

```markdown
# Design Consistency Audit

**Date:** [DATE]
**Status:** [🔴 Critical / 🟡 Needs Work / 🟢 Good]

## Executive Summary

| Metric | Count | Status |
|--------|-------|--------|
| Hardcoded colors | [N] instances | [Status] |
| Form validation patterns | [N] approaches | [Status] |
| Custom component overrides | [N] instances | [Status] |
| Navigation inconsistencies | [N] patterns | [Status] |

## What's Working Well
- [Strength 1]
- [Strength 2]

## Critical Issues Found

### Issue 1: [Title]
**Problem:** [Description]
**Impact:** [User/developer impact]
**Examples:**
\`\`\`tsx
// Found in codebase
[code example]
\`\`\`
**Solution:** [How to fix]

## Implementation Plan

### Phase 1: Immediate (High Priority)
| Task | Effort | Files |
|------|--------|-------|
| [Task 1] | [Hours] | [File count] |

### Phase 2: Systematic (Medium Priority)
[...]

### Phase 3: Refinement (Low Priority)
[...]
```

## Common Inconsistency Patterns

### 1. Color Inconsistencies

**What to find:**
```bash
# Hardcoded text colors
rg "text-slate-900|text-slate-800|text-slate-700" src/

# Hardcoded backgrounds
rg "bg-white|bg-slate-50|bg-slate-100" src/

# Hardcoded status colors
rg "bg-green-|bg-red-|bg-amber-|bg-blue-" src/
```

**Standard replacements:**
| Hardcoded | Semantic Token |
|-----------|----------------|
| `text-slate-900` | `text-foreground` |
| `text-slate-600` | `text-muted-foreground` |
| `bg-white` | `bg-background` |
| `bg-slate-50` | `bg-muted` |
| `border-slate-200` | `border` |
| `text-red-600` | `text-destructive` |
| `bg-green-100` | `bg-status-success-light` |

### 2. Form Validation Inconsistencies

**What to find:**
```bash
# Error styling variations
rg "border-red-" src/
rg "text-red-" src/

# Missing accessibility
rg "aria-invalid|aria-describedby|aria-required" src/ --count-matches
```

**Standard pattern:**
```tsx
<Label htmlFor="field-id">
  Field Name
  {required && <span className="text-destructive" aria-label="required">*</span>}
</Label>
<Input
  id="field-id"
  aria-required={required}
  aria-invalid={hasError}
  aria-describedby={hasError ? "field-id-error" : undefined}
  className={cn(hasError && "border-destructive")}
/>
{hasError && (
  <p id="field-id-error" role="alert" className="text-sm text-destructive">
    {error}
  </p>
)}
```

### 3. Component Usage Inconsistencies

**What to find:**
```bash
# Custom cards instead of Card component
rg 'className=".*rounded.*border.*p-[0-9]' src/

# Custom dialog widths instead of size prop
rg "sm:max-w-\[|max-w-[0-9]" src/

# Badge with custom colors instead of StatusBadge
rg 'Badge.*className.*bg-' src/
```

### 4. Navigation Inconsistencies

**What to find:**
```bash
# Multiple active state colors
rg "bg-cyan-|text-cyan-" src/components/
rg "text-international-orange|bg-orange-" src/components/

# Inconsistent icon sizes
rg "h-[3-6] w-[3-6]" src/components/Sidebar
rg "h-[3-6] w-[3-6]" src/components/MobileNav
```

## Creating Cursor Rules

When audit reveals patterns, create rules to prevent recurrence:

### Rule Template

```markdown
# [Rule Name]

## When This Applies
[Trigger conditions]

## Required Pattern
\`\`\`tsx
// ✅ CORRECT
[good example]

// ❌ WRONG
[bad example]
\`\`\`

## Quick Checklist
- [ ] Check 1
- [ ] Check 2
```

### Rule Naming Convention
- `color-consistency.mdc` - Color token usage
- `form-consistency.mdc` - Form patterns
- `component-patterns.mdc` - Component usage
- `layout-spacing.mdc` - Spacing and layout
- `navigation-consistency.mdc` - Navigation patterns

## Audit Checklist

Before completing audit:

- [ ] Quantified all inconsistencies with actual counts
- [ ] Categorized by severity (Critical/Inconsistent/Minor)
- [ ] Identified what's working well (not just problems)
- [ ] Provided specific file paths for worst offenders
- [ ] Created implementation plan with effort estimates
- [ ] Recommended Cursor rules to prevent recurrence
- [ ] Defined success metrics (before/after targets)

## Output Deliverables

1. **Audit Report** (`DESIGN_CONSISTENCY_AUDIT.md`)
   - Executive summary with metrics
   - Detailed findings
   - Implementation plan

2. **New Cursor Rules** (`.cursor/rules/`)
   - One rule per category of inconsistency
   - Always-applied for enforcement

3. **Migration Commands** (optional)
   - Search/replace patterns
   - Prioritized file list
