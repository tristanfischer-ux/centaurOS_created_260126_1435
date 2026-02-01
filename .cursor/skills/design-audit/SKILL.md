---
name: design-audit
description: Systematic audit of codebase for design inconsistencies, with quantified metrics and actionable fix plans. Use when the user asks to audit design, check consistency, find UI inconsistencies, review design system usage, accessibility audit, or mentions design debt, visual inconsistency, UX audit, or a11y audit.
---

# Design Consistency Audit

Systematic methodology for identifying and fixing design inconsistencies across a codebase.

## Prevention vs Detection

**For PREVENTING inconsistencies when writing new code:**
→ Use the **ui-component-standards** skill which provides:
- Color token mapping (what to use instead of hardcoded colors)
- Form accessibility requirements
- Dialog size guidelines
- Component usage patterns

**For DETECTING existing inconsistencies (this skill):**
→ Use the audit workflow below to find and fix problems in existing code.

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
| `text-red-*` | `text-destructive` |
| `text-green-*` | `text-status-success` |
| `text-amber-*` | `text-status-warning` |
| `text-blue-*` | `text-status-info` |
| `bg-red-*` | `bg-status-error-light` |
| `bg-green-*` | `bg-status-success-light` |
| `bg-amber-*` | `bg-status-warning-light` |
| `bg-blue-*` | `bg-status-info-light` |

**See ui-component-standards skill for complete mapping.**

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

---

## Phase 2: Accessibility & UX Audit

Phase 2 audit covers navigation, keyboard accessibility, mobile usability, and screen reader support.

### 5. Navigation & Wayfinding

**What to find:**
```bash
# Breadcrumb usage (should match detail page count)
rg "Breadcrumb|breadcrumb" src/app --count-matches
rg "ChevronRight.*text-sm" src/app --count-matches

# Detail pages (routes with [id])
find src/app -name "page.tsx" -path "*\[id\]*" | wc -l

# Back navigation patterns
rg "ArrowLeft|ChevronLeft.*href" src/app --count-matches
```

**Target:** Every `[id]` route should have breadcrumb navigation.

### 6. Keyboard Accessibility

**What to find:**
```bash
# Clickable divs (potential keyboard traps)
rg "<div[^>]*onClick" src/ --type tsx | wc -l

# Keyboard handlers
rg "onKeyDown|onKeyUp|onKeyPress" src/ --count-matches

# Tab index usage
rg "tabIndex" src/ --count-matches

# Role button without keyboard
rg 'role="button"' src/ | rg -v "onKeyDown" | wc -l

# Div onClick without role
rg "<div[^>]*onClick" src/ | rg -v "role=" | wc -l
```

**Target:** Zero clickable divs without keyboard support.

### 7. Mobile Touch Targets

**What to find:**
```bash
# Touch target enforcement (44px minimum)
rg "min-h-\[44px\]|min-w-\[44px\]" src/ --count-matches

# Small interactive elements (potential violations)
rg 'size="icon"' src/ --count-matches
rg "p-1\s|p-1\"" src/components --count-matches

# Button component usage (already has 44px)
rg "Button.*variant" src/ --count-matches
```

**Target:** All interactive elements should have 44x44px minimum touch area.

### 8. Screen Reader Support

**What to find:**
```bash
# Screen reader only text
rg "sr-only" src/ --count-matches

# Aria labels on icon buttons
rg 'size="icon"' src/ | rg "aria-label" | wc -l
rg 'size="icon"' src/ | rg -v "aria-label" | wc -l

# Role alert for error messages
rg 'role="alert"' src/ --count-matches

# Aria hidden for decorative elements
rg 'aria-hidden="true"' src/ --count-matches
```

**Target:** All icon-only buttons have aria-label, all decorative icons have aria-hidden.

### 9. Dialog & Modal UX

**What to find:**
```bash
# window.confirm usage (should be 0)
rg "window\.confirm|confirm\(" src/app src/components --count-matches

# AlertDialog usage (good)
rg "AlertDialog" src/ --count-matches

# AutoFocus in dialogs
rg "autoFocus" src/ --count-matches

# Dialog count (to compare with autoFocus)
rg "DialogContent|AlertDialogContent" src/ -l | wc -l
```

**Target:** Zero window.confirm, all dialogs have autoFocus.

### Phase 2 Audit Template

Add these sections to the audit report:

```markdown
## Phase 2: Accessibility & UX

| Category | Metric | Count | Target | Status |
|----------|--------|-------|--------|--------|
| **Navigation** | Detail pages with breadcrumbs | X/Y | 100% | 🔴/🟡/🟢 |
| **Keyboard** | Div onClick without keyboard | X | 0 | 🔴/🟡/🟢 |
| **Touch** | Elements with 44px target | X | 100% | 🔴/🟡/🟢 |
| **Screen Reader** | Icon buttons with aria-label | X/Y | 100% | 🔴/🟡/🟢 |
| **Dialogs** | window.confirm usage | X | 0 | 🔴/🟡/🟢 |
| **Dialogs** | Dialogs with autoFocus | X/Y | 100% | 🔴/🟡/🟢 |

### Critical Issues (Phase 2)

#### Issue: Missing Breadcrumbs
**Affected:** [List of detail pages]
**Impact:** Users get lost on detail pages
**Fix:** Add breadcrumb navigation component

#### Issue: Div onClick Without Keyboard
**Affected:** [File list]
**Impact:** Keyboard users cannot interact
**Fix:** Add role="button" tabIndex={0} onKeyDown
```

### Phase 2 Severity Framework

| Severity | Phase 2 Examples |
|----------|-----------------|
| 🔴 Critical | Missing breadcrumbs, keyboard traps, window.confirm |
| 🟡 Needs Work | Missing aria-labels, no autoFocus, small touch targets |
| 🟢 Good | Proper screen reader support, full keyboard access |

---

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

### Phase 1: Design Consistency
- [ ] Quantified all color inconsistencies with actual counts
- [ ] Checked form validation patterns
- [ ] Verified component usage (Card, Dialog, Badge)
- [ ] Checked navigation active state colors

### Phase 2: Accessibility & UX
- [ ] Verified breadcrumb coverage on detail pages
- [ ] Checked keyboard accessibility (div onClick)
- [ ] Verified touch targets (44px minimum)
- [ ] Checked screen reader support (aria-labels, sr-only)
- [ ] Verified no window.confirm usage
- [ ] Checked dialog autoFocus

### General
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

---

## When to Use This Skill

Use this skill when:

1. **Starting a design consistency initiative** - When leadership requests a design quality assessment
2. **Before major refactoring** - To quantify current technical debt before planning fixes
3. **After multiple contributors** - When codebase has accumulated inconsistencies from different developers
4. **Periodic health checks** - Quarterly or milestone-based design system compliance reviews
5. **Pre-release audits** - Before major releases to ensure consistent user experience
6. **Onboarding new team members** - To document current state and standards

---

## When NOT to Use

| Instead of this skill... | Use this skill... |
|--------------------------|-------------------|
| Writing new UI components | [ui-component-standards](../ui-component-standards/SKILL.md) |
| Fixing specific a11y issues | [accessibility-remediation](../accessibility-remediation/SKILL.md) |
| Creating forms or wizards | [multi-step-form](../multi-step-form/SKILL.md) |
| Implementing status workflows | [status-workflow](../status-workflow/SKILL.md) |
| Debugging runtime errors | [bug-fix-workflow](../bug-fix-workflow/SKILL.md) |

---

## Quick Reference

| Audit Category | Detection Command | Target |
|----------------|-------------------|--------|
| Hardcoded text colors | `rg "text-slate-\|text-gray-" src/` | 0 instances |
| Hardcoded status colors | `rg "text-red-\|text-green-\|text-amber-" src/` | 0 instances |
| Custom card divs | `rg 'className=".*rounded.*border.*p-[0-9]' src/` | 0 instances |
| Custom dialog widths | `rg "sm:max-w-\\[\|max-w-[0-9]" src/` | 0 instances |
| Missing breadcrumbs | Compare `[id]` routes to breadcrumb usage | 100% coverage |
| Div onClick without keyboard | `rg "<div[^>]*onClick" src/ \| rg -v "onKeyDown"` | 0 instances |
| Icon buttons without aria-label | `rg 'size="icon">' src/ \| rg -v "aria-label"` | 0 instances |
| window.confirm usage | `rg "window\\.confirm" src/` | 0 instances |

---

## Troubleshooting

### Issue: Audit counts don't match between runs

**Cause:** File changes or different grep patterns.

**Fix:** Use consistent commands and document exact patterns:
```bash
# Always use the same pattern - save in audit script
rg "text-slate-[0-9]+" src/ --count-matches 2>/dev/null | wc -l
```

---

### Issue: Too many issues to fix at once

**Cause:** Attempting to fix all categories simultaneously.

**Fix:** Prioritize by severity and create phased plan:
1. Phase 1: Critical (breaks functionality/a11y)
2. Phase 2: Inconsistent (multiple patterns)
3. Phase 3: Minor (style preferences)

---

### Issue: Issues keep recurring after fixes

**Cause:** No enforcement mechanism for standards.

**Fix:** Create Cursor rules to prevent recurrence:
```markdown
# .cursor/rules/color-consistency.mdc
Always use semantic tokens, never hardcoded colors.
```

---

### Issue: Can't find specific file patterns

**Cause:** Patterns don't match codebase conventions.

**Fix:** Adjust patterns based on actual file structure:
```bash
# If tsx extension needed
rg "text-slate-" src/ --type tsx

# If glob needed
rg "text-slate-" --glob "*.tsx" src/
```

---

## Related Skills

- [ui-component-standards](../ui-component-standards/SKILL.md) - Standards to enforce after audit identifies gaps
- [accessibility-remediation](../accessibility-remediation/SKILL.md) - Systematic fixes for a11y issues found in Phase 2 audit
- [code-quality](../code-quality/SKILL.md) - Linting and type checking to complement design audit
- [comprehensive-code-review](../comprehensive-code-review/SKILL.md) - Deep code review including design patterns

### Related Cursor Rules

- `.cursor/rules/color-consistency.mdc` - Prevents hardcoded colors (addresses audit findings)
- `.cursor/rules/form-consistency.mdc` - Enforces form patterns (addresses validation audit)
- `.cursor/rules/component-patterns.mdc` - Enforces component usage (addresses Card/Dialog audit)
- `.cursor/rules/navigation-consistency.mdc` - Enforces nav patterns (addresses active state audit)
