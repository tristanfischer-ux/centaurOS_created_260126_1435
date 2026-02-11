---
name: accessibility-remediation
description: Systematic checklist for fixing accessibility issues in ForgeOS. Use when fixing a11y, accessibility, WCAG compliance, screen reader support, keyboard navigation, or when audit identifies accessibility gaps.
---

# Accessibility Remediation

This skill provides a systematic approach to fixing accessibility issues found in audits.

## Quick Reference: Priority Issues

| Issue | Severity | Effort | Impact |
|-------|----------|--------|--------|
| Missing breadcrumbs on detail pages | Critical | Low | High |
| `window.confirm()` usage | Critical | Low | High |
| Div onClick without keyboard | Critical | Medium | High |
| Touch targets < 44px | Critical | Medium | High |
| Missing `aria-label` on icon buttons | High | Low | High |
| Missing `sr-only` text | Medium | Low | Medium |
| Missing `autoFocus` on dialogs | Low | Low | Medium |

---

## Issue 1: Missing Breadcrumbs

### Detection

```bash
# Find detail pages (routes with [id])
rg -l "\[id\]" src/app --type tsx

# Check breadcrumb usage
rg "Breadcrumb|breadcrumb|ChevronRight.*text-sm" src/app --count-matches
```

### Fix Pattern

Add breadcrumb navigation to ALL detail pages:

```tsx
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

// At the top of the page content
<nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm mb-6">
  <Link 
    href="/team" 
    className="text-muted-foreground hover:text-foreground transition-colors"
  >
    Team
  </Link>
  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
  <span className="text-foreground font-medium">{memberName}</span>
</nav>
```

### Files Requiring Breadcrumbs

Check these routes:

- [ ] `/team/[id]/page.tsx`
- [ ] `/objectives/[id]/page.tsx`
- [ ] `/advisory/[id]/page.tsx`
- [ ] `/orders/[id]/page.tsx`
- [ ] `/marketplace/[id]/page.tsx`
- [ ] `/rfq/[id]/page.tsx`
- [ ] `/retainers/[id]/page.tsx`

---

## Issue 2: window.confirm() Usage

### Detection

```bash
# Find all confirm() usage
rg "window\.confirm|confirm\(" src/app src/components --type tsx
```

### Fix Pattern

Replace with AlertDialog:

```tsx
// ❌ BEFORE
const handleDelete = () => {
  if (window.confirm("Delete this item?")) {
    deleteItem()
  }
}

// ✅ AFTER
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const [showDeleteDialog, setShowDeleteDialog] = useState(false)

// Trigger
<Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
  Delete
</Button>

// Dialog
<AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete item?</AlertDialogTitle>
      <AlertDialogDescription>
        This action cannot be undone.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## Issue 3: Div onClick Without Keyboard Support

### Detection

```bash
# Find div onClick without keyboard support
rg "<div[^>]*onClick" src/ --type tsx | rg -v "onKeyDown"
```

### Fix Pattern

**Option A: Use Button (Preferred)**

```tsx
// ❌ BEFORE
<div onClick={handleClick} className="cursor-pointer">
  Click me
</div>

// ✅ AFTER - Use button element
<button 
  onClick={handleClick} 
  className="text-left w-full cursor-pointer"
>
  Click me
</button>
```

**Option B: Add Full Keyboard Support**

```tsx
// If div is necessary for styling reasons
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }}
  className="cursor-pointer"
>
  Click me
</div>
```

### Required Attributes Checklist

- [ ] `role="button"` - Announces as button
- [ ] `tabIndex={0}` - Makes focusable
- [ ] `onClick` - Mouse interaction
- [ ] `onKeyDown` - Keyboard interaction (Enter + Space)

---

## Issue 4: Touch Targets Below 44px

### Detection

```bash
# Check touch target enforcement
rg "min-h-\[44px\]|min-w-\[44px\]" src/ --count-matches

# Find small interactive elements
rg 'size="icon"|p-1|p-2' src/components --type tsx
```

### Fix Pattern

```tsx
// ❌ BEFORE - Too small
<button className="p-1">
  <X className="h-4 w-4" />
</button>

// ✅ AFTER - 44px minimum
<button className="min-h-[44px] min-w-[44px] p-2 flex items-center justify-center">
  <X className="h-4 w-4" />
</button>

// ✅ ALTERNATIVE - Extend tap area with negative margin
<button className="p-3 -m-1">
  <X className="h-4 w-4" />
</button>
```

### Button Component Already Handles This

The Button component with `size="icon"` already has 44px minimum:

```tsx
// ✅ This is already accessible
<Button variant="ghost" size="icon" aria-label="Close">
  <X className="h-4 w-4" />
</Button>
```

---

## Issue 5: Missing aria-label on Icon Buttons

### Detection

```bash
# Find icon buttons without aria-label
rg 'size="icon">' src/ --type tsx | rg -v "aria-label"
```

### Fix Pattern

```tsx
// ❌ BEFORE
<Button variant="ghost" size="icon">
  <X className="h-4 w-4" />
</Button>

// ✅ AFTER
<Button variant="ghost" size="icon" aria-label="Close">
  <X className="h-4 w-4" />
</Button>
```

### Common aria-label Values

| Icon | aria-label |
|------|------------|
| X | "Close" or "Close [dialog name]" |
| Trash2 | "Delete" or "Delete [item name]" |
| Edit / Pencil | "Edit" or "Edit [item name]" |
| Menu | "Open menu" |
| MoreVertical | "More options" |
| ChevronDown | "Expand" |
| ChevronUp | "Collapse" |
| RefreshCw | "Refresh" |
| Search | "Search" |
| Plus | "Add" or "Create [item]" |
| Copy | "Copy to clipboard" |

---

## Issue 6: Missing Screen Reader Text

### Detection

```bash
# Check sr-only usage
rg "sr-only" src/ --count-matches

# Find status indicators without text
rg "rounded-full bg-" src/ --type tsx | rg -v "sr-only"
```

### Fix Pattern

**Progress Bars:**

```tsx
// ❌ BEFORE - No accessible value
<div className="h-2 bg-muted rounded-full">
  <div className="h-full bg-status-success" style={{ width: '60%' }} />
</div>

// ✅ AFTER - Screen reader can announce progress
<div 
  className="h-2 bg-muted rounded-full" 
  role="progressbar" 
  aria-valuenow={60}
  aria-valuemin={0}
  aria-valuemax={100}
>
  <div className="h-full bg-status-success" style={{ width: '60%' }} />
  <span className="sr-only">60% complete</span>
</div>
```

**Status Indicators:**

```tsx
// ❌ BEFORE - Visual only
<div className="h-2 w-2 rounded-full bg-status-success" />

// ✅ AFTER - With text label nearby (preferred)
<div className="flex items-center gap-2">
  <div className="h-2 w-2 rounded-full bg-status-success" aria-hidden="true" />
  <span>Active</span>
</div>

// ✅ AFTER - With sr-only if no visible text
<div className="relative">
  <div className="h-2 w-2 rounded-full bg-status-success" aria-hidden="true" />
  <span className="sr-only">Status: Active</span>
</div>
```

**Decorative Icons:**

```tsx
// Icons next to text should be hidden from screen readers
<div className="flex items-center gap-2">
  <CheckCircle className="h-4 w-4 text-status-success" aria-hidden="true" />
  <span>Verified</span>
</div>
```

---

## Issue 7: Missing autoFocus on Dialogs

### Detection

```bash
# Find dialogs
rg "DialogContent|AlertDialogContent" src/ --type tsx -l

# Check autoFocus usage
rg "autoFocus" src/ --count-matches
```

### Fix Pattern

```tsx
// Form dialogs - focus first input
<Dialog>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Create Item</DialogTitle>
    </DialogHeader>
    <Input autoFocus placeholder="Item name" />
    <DialogFooter>
      <Button>Create</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

// Confirmation dialogs - focus primary action
<AlertDialog>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Confirm?</AlertDialogTitle>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction autoFocus>Confirm</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## Remediation Workflow

### Step 1: Audit

Run detection commands to quantify issues:

```bash
# Create audit report
echo "=== Accessibility Audit ===" > a11y-audit.txt
echo "\nBreadcrumbs:" >> a11y-audit.txt
rg "Breadcrumb|ChevronRight.*text-sm" src/app --count-matches >> a11y-audit.txt

echo "\nwindow.confirm:" >> a11y-audit.txt
rg "window\.confirm|confirm\(" src/ --count-matches >> a11y-audit.txt

echo "\nDiv onClick:" >> a11y-audit.txt
rg "<div[^>]*onClick" src/ --count-matches >> a11y-audit.txt

echo "\nTouch targets:" >> a11y-audit.txt
rg "min-h-\[44px\]" src/ --count-matches >> a11y-audit.txt

echo "\nIcon buttons without aria-label:" >> a11y-audit.txt
rg 'size="icon">' src/ | rg -v "aria-label" | wc -l >> a11y-audit.txt
```

### Step 2: Prioritize

Fix in this order:
1. **Critical**: Breadcrumbs, window.confirm, div onClick
2. **High**: Touch targets, aria-labels
3. **Medium**: sr-only text, autoFocus

### Step 3: Fix

Address each file systematically:

```bash
# Get list of files needing fixes
rg "window\.confirm" src/ -l > files-to-fix.txt
```

### Step 4: Verify

Re-run audit commands to confirm fixes:

```bash
# Should return 0 matches
rg "window\.confirm" src/ --count-matches
```

---

## WCAG 2.1 Compliance Checklist

### Level A (Minimum)

- [ ] All interactive elements keyboard accessible
- [ ] Focus order logical
- [ ] No keyboard traps
- [ ] Images have alt text (or aria-hidden if decorative)
- [ ] Form inputs have labels
- [ ] Error messages identified

### Level AA (Standard)

- [ ] Touch targets 44x44px minimum
- [ ] Color contrast 4.5:1 for text
- [ ] Text resizable to 200%
- [ ] Focus visible
- [ ] Consistent navigation
- [ ] Error suggestions provided

---

## Quick Fixes Reference

| Issue | One-Line Fix |
|-------|--------------|
| Add aria-label | `aria-label="Description"` |
| Hide decorative | `aria-hidden="true"` |
| Add sr-only | `<span className="sr-only">Text</span>` |
| Add touch target | `className="min-h-[44px] min-w-[44px]"` |
| Make div focusable | `role="button" tabIndex={0} onKeyDown={...}` |

---

## When to Use This Skill

Use this skill when:

1. **Design audit reveals a11y issues** - After running design-audit and finding accessibility gaps
2. **WCAG compliance required** - When legal or business requirements mandate accessibility standards
3. **User reports accessibility problems** - When users with disabilities report barriers
4. **Automated testing flags issues** - When axe, Lighthouse, or CI tools report violations
5. **Adding new interactive elements** - When creating clickable components that need keyboard/screen reader support
6. **Fixing detail page navigation** - When users get lost due to missing breadcrumbs

---

## When NOT to Use

| Instead of this skill... | Use this skill... |
|--------------------------|-------------------|
| Finding a11y issues (before fixing) | [design-audit](../design-audit/SKILL.md) |
| Writing new accessible components | [ui-component-standards](../ui-component-standards/SKILL.md) |
| Building accessible forms | [multi-step-form](../multi-step-form/SKILL.md) |
| General code quality issues | [code-quality](../code-quality/SKILL.md) |
| Security vulnerabilities | [security-review](../security-review/SKILL.md) |

---

## Quick Reference

| Issue | Detection | Fix |
|-------|-----------|-----|
| Missing breadcrumbs | `find src/app -path "*[id]*" -name "page.tsx"` | Add `<nav aria-label="Breadcrumb">` with links |
| window.confirm | `rg "window\\.confirm" src/` | Replace with `<AlertDialog>` component |
| Div onClick no keyboard | `rg "<div[^>]*onClick" \| rg -v "onKeyDown"` | Add `role="button" tabIndex={0} onKeyDown` |
| Small touch targets | `rg "p-1\|p-2" src/components` | Add `min-h-[44px] min-w-[44px]` |
| Missing aria-label | `rg 'size="icon">' \| rg -v "aria-label"` | Add `aria-label="Description"` |
| No sr-only text | `rg "rounded-full bg-" \| rg -v "sr-only"` | Add `<span className="sr-only">Status</span>` |
| Missing autoFocus | Compare Dialog count to autoFocus count | Add `autoFocus` to first input or primary button |

---

## Troubleshooting

### Issue: Keyboard handler doesn't fire on Space key

**Cause:** Space key default behavior (scrolling) not prevented.

**Fix:** Add `e.preventDefault()` in the keydown handler:
```tsx
onKeyDown={(e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()  // ← Required for Space key
    handleClick()
  }
}}
```

---

### Issue: Screen reader announces button twice

**Cause:** Both visible text and aria-label present, or icon not hidden.

**Fix:** Use `aria-hidden="true"` on icons next to text:
```tsx
// ❌ Screen reader: "Delete Delete button"
<button aria-label="Delete">
  <Trash2 /> Delete
</button>

// ✅ Screen reader: "Delete button"
<button>
  <Trash2 aria-hidden="true" /> Delete
</button>
```

---

### Issue: Focus trap in modal

**Cause:** Focus escapes modal to elements behind it.

**Fix:** Use Dialog/AlertDialog from shadcn/ui which handles focus trapping automatically:
```tsx
// shadcn Dialog already manages focus
<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent>
    {/* Focus is trapped here */}
  </DialogContent>
</Dialog>
```

---

### Issue: Touch target visually too large

**Cause:** Adding `min-h-[44px]` makes element appear bigger.

**Fix:** Use negative margin to extend tap area without visual change:
```tsx
// ✅ Visual size unchanged, tap area extended
<button className="p-3 -m-1">
  <X className="h-4 w-4" />
</button>
```

---

## Related Skills

- [visual-design-philosophy](~/.cursor/skills/visual-design-philosophy/SKILL.md) - For holistic design evaluation (not just a11y)
- [design-audit](../design-audit/SKILL.md) - Run audit first to identify a11y issues to remediate
- [ui-component-standards](../ui-component-standards/SKILL.md) - Reference for correct accessible component patterns
- [multi-step-form](../multi-step-form/SKILL.md) - Accessible form wizard patterns
- [feature-implementation-guide](../feature-implementation-guide/SKILL.md) - Ensure new features follow a11y standards

### Related Cursor Rules

- `.cursor/rules/form-consistency.mdc` - Form accessibility requirements (aria-invalid, aria-describedby)
- `.cursor/rules/component-patterns.mdc` - Component accessibility (aria-label on icon buttons)
- `.cursor/rules/navigation-consistency.mdc` - Navigation accessibility (breadcrumbs on detail pages)
