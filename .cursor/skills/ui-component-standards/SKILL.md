---
name: ui-component-standards
description: Standards for UI components including semantic color tokens, accessibility requirements, and component usage patterns. Use when creating UI components, styling elements, using colors, creating forms, working with dialogs, breadcrumbs, touch targets, or when the user mentions colors, styling, UI, form, dialog, badge, accessibility, ARIA, breadcrumb, touch target, or keyboard navigation.
---

# UI Component Standards

This skill ensures consistent, accessible UI components in CentaurOS. **ALWAYS consult this before writing UI code.**

## Design Philosophy

This skill provides implementation patterns and standards. For design THINKING and evaluation:
→ [visual-design-philosophy](~/.cursor/skills/visual-design-philosophy/SKILL.md)

Use the philosophy skill first to determine WHAT should change, then use this skill for HOW to implement it.

## Color Token Reference

**IMPORTANT:** For all color usage, see `.cursor/rules/color-consistency.mdc` which is the single source of truth.

**Before committing UI code, run:**

```bash
./scripts/check-design-tokens.sh
```

### Quick Summary (See color-consistency.mdc for full details)

| Pattern | Semantic Token |
|---------|----------------|
| Gray text | `text-foreground` or `text-muted-foreground` |
| Error/danger | `text-destructive`, `bg-status-error-light` |
| Success | `text-status-success`, `bg-status-success-light` |
| Warning | `text-status-warning`, `bg-status-warning-light` |
| Info | `text-status-info`, `bg-status-info-light` |
| Page background | `bg-background` |
| Card/muted surface | `bg-muted`, `bg-card` |
| Borders | `border` (no color class), `border-destructive` for errors |

**NEVER use:** `text-slate-*`, `text-gray-*`, `text-red-*`, `bg-white`, `bg-slate-*`, `dark:*` variants

### Common Violations Found in Codebase Audit

Based on a comprehensive audit, these patterns are the **MOST FREQUENTLY VIOLATED**:

```tsx
// ❌ #1 MOST COMMON: Success/verification icons
<CheckCircle2 className="text-green-600" />  // WRONG
<CheckCircle2 className="text-status-success" />  // CORRECT

// ❌ #2: Status badges with hardcoded colors  
<Badge className="bg-green-100 text-green-800">Complete</Badge>  // WRONG
<StatusBadge status="success">Complete</StatusBadge>  // CORRECT

// ❌ #3: Required field asterisks
<span className="text-red-500">*</span>  // WRONG
<span className="text-destructive" aria-label="required">*</span>  // CORRECT

// ❌ #4: Info/scheduling colors
<div className="bg-blue-50 text-blue-800">Info</div>  // WRONG
<div className="bg-status-info-light text-status-info-dark">Info</div>  // CORRECT

// ❌ #5: White backgrounds
<Card className="!bg-white">  // WRONG
<Card className="bg-background">  // CORRECT
```

**Full mapping for dark variants:**
| Hardcoded | Semantic Token |
|-----------|----------------|
| `text-green-700`, `text-green-800` | `text-status-success-dark` |
| `text-emerald-700`, `text-emerald-800` | `text-status-success-dark` |
| `text-blue-700`, `text-blue-800` | `text-status-info-dark` |
| `text-amber-700`, `text-amber-800` | `text-status-warning-dark` |
| `text-red-700`, `text-red-800` | `text-status-error-dark` or `text-destructive` |

---

## Form Accessibility Requirements

### REQUIRED Pattern for All Form Fields

```tsx
<div className="space-y-2">
  <Label htmlFor="field-id" className="text-sm font-medium">
    Field Label
    {isRequired && (
      <span className="text-destructive ml-1" aria-label="required">*</span>
    )}
  </Label>
  <Input
    id="field-id"
    name="fieldName"
    value={value}
    onChange={handleChange}
    aria-required={isRequired}
    aria-invalid={!!error}
    aria-describedby={error ? "field-id-error" : undefined}
    className={cn(error && "border-destructive")}
  />
  {error && (
    <p id="field-id-error" role="alert" className="text-sm text-destructive">
      {error}
    </p>
  )}
</div>
```

### Accessibility Checklist

- [ ] `Label` has `htmlFor` matching `Input` `id`
- [ ] Required fields have `aria-required={true}`
- [ ] Required asterisk has `aria-label="required"`
- [ ] Error states have `aria-invalid={true}`
- [ ] Error messages have `aria-describedby` link and `role="alert"`
- [ ] Error styling uses `text-destructive` and `border-destructive`

---

## Dialog Standards

### CRITICAL: Dialogs MUST Have Solid Backgrounds

**NEVER use translucent backgrounds on dialogs.** This makes content unreadable.

```tsx
// ✅ CORRECT - Solid background
<DialogContent size="md">
  {/* bg-background is solid by default */}
</DialogContent>

// ✅ CORRECT - Explicit solid background
<DialogContent className="bg-background">
  {/* Explicitly solid */}
</DialogContent>

// ❌ WRONG - Translucent backgrounds
<DialogContent className="bg-background/95"> // Wrong - translucent
<DialogContent className="bg-white/90"> // Wrong - translucent
<DialogContent className="backdrop-blur bg-background/50"> // Wrong
```

### ALWAYS Use the `size` Prop

```tsx
// ✅ CORRECT - Use size prop
<DialogContent size="sm">   // 425px - confirmations
<DialogContent size="md">   // 600px - standard forms
<DialogContent size="lg">   // 800px - complex forms

// ❌ WRONG - Don't use custom widths
<DialogContent className="sm:max-w-[600px]">  // Use size="md"
<DialogContent className="max-w-3xl">         // Use size="lg"
```

### When to Use Each Size

| Size | Width | Use For |
|------|-------|---------|
| `sm` | 425px | Confirmations, simple forms, delete dialogs |
| `md` | 600px | Standard forms, most dialogs |
| `lg` | 800px | Complex forms, multi-step wizards |
| Default | 512px | If not specified |

---

## CRITICAL: NEVER Use Sheet/Side Panels

### ALWAYS Use Centered Dialog Instead of Sheet

**Side panels that slide in from the right or left are FORBIDDEN in CentaurOS.**

Users find side panels disruptive and jarring. Always use centered `Dialog` components instead.

```tsx
// ❌ WRONG - NEVER use Sheet components
import { Sheet, SheetContent } from '@/components/ui/sheet'

<Sheet>
  <SheetContent side="right" className="w-[480px]">
    {/* Content */}
  </SheetContent>
</Sheet>

// ✅ CORRECT - Always use centered Dialog
import { Dialog, DialogContent } from '@/components/ui/dialog'

<Dialog>
  <DialogContent size="lg">
    {/* Content */}
  </DialogContent>
</Dialog>
```

### Why Dialogs Are Better Than Sheets

| Sheet Problems | Dialog Benefits |
|----------------|-----------------|
| Slides in from side (jarring) | Appears centered (smooth) |
| Disrupts spatial orientation | Maintains focus on center |
| Feels like a separate UI context | Feels like natural flow |
| Users hate them | Users prefer them |

### When Converting Sheet to Dialog

If you find existing Sheet components, convert them to Dialog:

1. Replace `Sheet` → `Dialog`
2. Replace `SheetContent` → `DialogContent`
3. Replace `SheetHeader` → `DialogHeader`
4. Replace `SheetTitle` → `DialogTitle`
5. Remove `side="right"` prop (not needed)
6. Add appropriate `size` prop (`sm`, `md`, or `lg`)
7. Update state variable names from `isSheetOpen` → `isDialogOpen`

```tsx
// ✅ CORRECT - Converted from Sheet to Dialog
const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false)

<Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
  <DialogContent size="lg" className="max-h-[90vh] flex flex-col">
    <ScrollArea className="max-h-[85vh]">
      <div className="p-6">
        <DialogHeader>
          <DialogTitle>Detail View</DialogTitle>
        </DialogHeader>
        {/* Content */}
      </div>
    </ScrollArea>
  </DialogContent>
</Dialog>
```

---

## Status Indicators: Badge vs StatusBadge

### Use `StatusBadge` for Status Indicators

```tsx
import { StatusBadge } from '@/components/ui/status-badge'

// ✅ CORRECT - StatusBadge for statuses
<StatusBadge status="success">Completed</StatusBadge>
<StatusBadge status="warning">Pending</StatusBadge>
<StatusBadge status="error">Failed</StatusBadge>
<StatusBadge status="info">In Progress</StatusBadge>

// ❌ WRONG - Don't use Badge with hardcoded colors
<Badge className="bg-green-100 text-green-800">Completed</Badge>
```

### Use `Badge` for Non-Status Labels

```tsx
import { Badge } from '@/components/ui/badge'

// ✅ CORRECT - Badge variants for non-status
<Badge variant="secondary">Draft</Badge>
<Badge variant="outline">Category</Badge>
<Badge variant="default">New</Badge>
```

---

## Icon Button Accessibility

### ALL Icon-Only Buttons MUST Have aria-label

```tsx
// ✅ CORRECT - Has aria-label
<Button variant="ghost" size="icon" aria-label="Close">
  <X className="h-4 w-4" />
</Button>

<Button variant="ghost" size="icon" aria-label="Delete item">
  <Trash2 className="h-4 w-4" />
</Button>

<Button variant="ghost" size="icon" aria-label="Open menu">
  <Menu className="h-4 w-4" />
</Button>

// ❌ WRONG - Missing aria-label
<Button variant="ghost" size="icon">
  <X className="h-4 w-4" />
</Button>
```

### Common aria-label Values

| Icon | aria-label |
|------|------------|
| X / Close | `"Close"` |
| Trash2 | `"Delete"` or `"Delete [item]"` |
| Edit / Pencil | `"Edit"` or `"Edit [item]"` |
| Menu | `"Open menu"` |
| MoreVertical | `"More options"` |
| ChevronDown | `"Expand"` |
| ChevronUp | `"Collapse"` |
| RefreshCw | `"Refresh"` |
| Search | `"Search"` |

---

## Loading States

### Use Consistent Loading Pattern

```tsx
// ✅ CORRECT - Consistent loading
<Button disabled={isLoading}>
  {isLoading ? (
    <>
      <Loader2 className="h-4 w-4 animate-spin mr-2" />
      Loading...
    </>
  ) : (
    'Submit'
  )}
</Button>

// For data loading, use Skeleton
{isLoading ? (
  <Skeleton className="h-12 w-full" />
) : (
  <DataContent />
)}
```

---

## Card Component Usage

### ALWAYS Use Card Component

```tsx
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'

// ✅ CORRECT - Use Card component
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>Content</CardContent>
</Card>

// ❌ WRONG - Don't create custom card divs
<div className="rounded-lg border p-6">
  <h3>Title</h3>
  <p>Content</p>
</div>
```

---

## Navigation Active States

### Use International Orange for Active States

```tsx
// ✅ CORRECT - International orange for active nav
<Link
  className={cn(
    "transition-colors",
    isActive
      ? "text-international-orange font-semibold"
      : "text-muted-foreground hover:text-foreground"
  )}
>
  Dashboard
</Link>

// ❌ WRONG - Don't use cyan or other colors
<Link className={isActive ? "text-cyan-600" : ""}>
```

---

## Breadcrumb Navigation (REQUIRED for Detail Pages)

### ALL Routes with `[id]` MUST Have Breadcrumbs

Detail pages (any route containing `[id]`) must include breadcrumb navigation for wayfinding.

```tsx
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

// ✅ REQUIRED - Breadcrumb for detail pages
<nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm mb-6">
  <Link 
    href="/team" 
    className="text-muted-foreground hover:text-foreground transition-colors"
  >
    Team
  </Link>
  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
  <span className="text-foreground font-medium">{profile.full_name}</span>
</nav>

// For nested routes (2+ levels deep)
<nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm mb-6">
  <Link href="/retainers" className="text-muted-foreground hover:text-foreground">
    Retainers
  </Link>
  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
  <Link href={`/retainers/${retainerId}`} className="text-muted-foreground hover:text-foreground">
    {retainerName}
  </Link>
  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
  <span className="text-foreground font-medium">Timesheet</span>
</nav>
```

### Pages That MUST Have Breadcrumbs

- `/team/[id]` - Team member detail
- `/objectives/[id]` - Objective detail
- `/advisory/[id]` - Advisory question detail
- `/orders/[id]` - Order detail
- `/marketplace/[id]` - Listing detail
- `/rfq/[id]` - RFQ detail
- `/retainers/[id]` - Retainer detail
- Any nested `[id]` route

---

## Touch Targets (44px Minimum)

### ALL Interactive Elements MUST Have 44x44px Touch Target

This is a WCAG accessibility requirement for mobile usability.

```tsx
// ✅ CORRECT - Button component already has min-h-[44px]
<Button>Click me</Button>

// ✅ CORRECT - Icon button with proper size
<Button variant="ghost" size="icon" aria-label="Delete">
  <Trash2 className="h-4 w-4" />
</Button>

// ✅ CORRECT - Custom interactive element
<button className="min-h-[44px] min-w-[44px] p-2 ...">
  <MoreVertical className="h-4 w-4" />
</button>

// ✅ CORRECT - Extend tap area with negative margin
<button className="p-3 -m-1">
  <X className="h-4 w-4" />
</button>

// ❌ WRONG - Too small for touch
<button className="p-1">
  <X className="h-4 w-4" />
</button>
```

### Elements That Need Touch Target Verification

- Table row action buttons
- Card action buttons
- Icon-only buttons
- Mobile navigation items
- Dropdown triggers
- Custom clickable elements

---

## AlertDialog Pattern (NEVER use window.confirm)

### Replace ALL `window.confirm()` with AlertDialog

Native browser dialogs break the user experience and cannot be styled.

```tsx
// ❌ WRONG - Never use window.confirm()
const handleDelete = () => {
  if (window.confirm("Are you sure you want to delete?")) {
    deleteItem()
  }
}

// ✅ CORRECT - Use AlertDialog component
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

<Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
  Delete
</Button>

<AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete item?</AlertDialogTitle>
      <AlertDialogDescription>
        This action cannot be undone. This will permanently delete the item.
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

## Keyboard Accessibility

### NEVER Use `<div onClick>` Without Keyboard Support

Clickable divs without keyboard support exclude keyboard-only users.

```tsx
// ❌ WRONG - Div with click only (keyboard users can't activate)
<div onClick={handleClick} className="cursor-pointer">
  Click me
</div>

// ✅ CORRECT - Use actual button element (PREFERRED)
<button onClick={handleClick} className="...">
  Click me
</button>

// ✅ CORRECT - If div is necessary, add full keyboard support
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

### Required Attributes for Interactive Divs

| Attribute | Required | Purpose |
|-----------|----------|---------|
| `role="button"` | Yes | Announces as button to screen readers |
| `tabIndex={0}` | Yes | Makes element focusable |
| `onClick` | Yes | Mouse interaction |
| `onKeyDown` | Yes | Keyboard interaction (Enter/Space) |

---

## Screen Reader Support

### Use `sr-only` for Screen Reader Text

Provide text alternatives for visual-only information.

```tsx
// ✅ CORRECT - Status indicator with screen reader text
<div className="flex items-center gap-2">
  <div 
    className="h-2 w-2 rounded-full bg-status-success" 
    aria-hidden="true" 
  />
  <span>Active</span>
</div>

// ✅ CORRECT - Progress bar with screen reader announcement
<div className="h-2 bg-muted rounded-full" role="progressbar" aria-valuenow={60}>
  <div className="h-full bg-status-success rounded-full" style={{ width: '60%' }} />
  <span className="sr-only">60% complete</span>
</div>

// ✅ CORRECT - Icon with visible text alternative
<div className="flex items-center gap-2">
  <CheckCircle className="h-4 w-4 text-status-success" aria-hidden="true" />
  <span>Verified</span>
</div>

// ✅ CORRECT - Visual-only decorative icon
<Star className="h-4 w-4 text-amber-400" aria-hidden="true" />
```

### When to Use `aria-hidden="true"`

- Decorative icons next to text labels
- Visual indicators that have text equivalents
- Purely decorative elements

### When to Use `sr-only`

- Progress percentages not shown visually
- Additional context for screen readers
- Descriptions of visual states

---

## Dialog AutoFocus

### Dialogs SHOULD AutoFocus First Interactive Element

```tsx
// ✅ CORRECT - AutoFocus on first input
<Dialog>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Create Item</DialogTitle>
    </DialogHeader>
    <div className="space-y-4">
      <Input 
        autoFocus  // Focus here when dialog opens
        placeholder="Item name" 
      />
      <Textarea placeholder="Description" />
    </div>
    <DialogFooter>
      <Button variant="secondary">Cancel</Button>
      <Button>Create</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

// ✅ CORRECT - For confirmation dialogs, autoFocus on primary action
<AlertDialog>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Confirm action?</AlertDialogTitle>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction autoFocus>Confirm</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## Pre-Commit Checklist

**Before committing any UI code, run:**

```bash
./scripts/check-design-tokens.sh
```

This automatically checks for color violations. If it fails, fix all issues before committing.

### Manual Verification

### Forms
- [ ] All Labels have `htmlFor` matching Input `id`
- [ ] Required fields have `aria-required` and asterisk with `aria-label`
- [ ] Error states use `aria-invalid`, `aria-describedby`, `role="alert"`
- [ ] Error styling uses `text-destructive`, `border-destructive`

### Components
- [ ] **CRITICAL: No Sheet/side panels** - Use Dialog instead
- [ ] **User avatars use `UserAvatar` component (not direct `Avatar`)**
- [ ] **No hardcoded avatar backgrounds (`bg-muted`, `bg-slate-*`, `bg-foundry-*`)**
- [ ] **Database queries include `role` field for avatar coloring**
- [ ] Status indicators use `StatusBadge` (not Badge with colors)
- [ ] Cards use `Card` component (not custom divs)
- [ ] Dialogs have solid backgrounds (no opacity < 100%)
- [ ] Dialogs use `size` prop (not custom `max-w-[]`)
- [ ] Icon-only buttons have `aria-label`

### Navigation
- [ ] Active states use `text-international-orange`
- [ ] No cyan colors for navigation
- [ ] Detail pages (`[id]` routes) have breadcrumb navigation

### Accessibility (NEW)
- [ ] Interactive elements have 44px minimum touch target
- [ ] No `window.confirm()` - use AlertDialog instead
- [ ] No `<div onClick>` without `role="button"`, `tabIndex`, and `onKeyDown`
- [ ] Dialogs autoFocus first input or primary action
- [ ] Visual-only icons have `aria-hidden="true"`
- [ ] Progress indicators have `sr-only` text or `aria-valuenow`

---

## Quick Migration Commands

If you find hardcoded colors in existing code, see `.cursor/rules/color-consistency.mdc` for the complete migration strategy.

**Quick reference:**

| Hardcoded | Semantic Token |
|-----------|----------------|
| `text-slate-900` | `text-foreground` |
| `text-slate-600/500/400` | `text-muted-foreground` |
| `text-red-*` | `text-destructive` |
| `text-green-*` | `text-status-success` |
| `text-amber-*` | `text-status-warning` |
| `text-blue-*` | `text-status-info` |
| `bg-white` | `bg-background` |
| `bg-slate-*` | `bg-muted` or `bg-secondary` |
| `bg-red-*` | `bg-status-error-light` |
| `bg-green-*` | `bg-status-success-light` |
| `dark:*` | Remove entirely |

---

## When to Use This Skill

Use this skill when:

1. **Creating new UI components** - Before writing any component with colors, forms, dialogs, buttons, or interactive elements
2. **Reviewing existing components** - When auditing or fixing design consistency issues in React/TSX files
3. **Styling with colors** - Any time you need to apply text colors, backgrounds, borders, or status indicators
4. **Building forms** - When creating inputs, labels, validation, and error states
5. **Adding navigation** - When implementing nav items, active states, breadcrumbs, or tab interfaces
6. **Accessibility compliance** - When adding ARIA attributes, keyboard support, touch targets, or screen reader text

---

## When NOT to Use

| Instead of this skill... | Use this skill... |
|--------------------------|-------------------|
| Auditing entire codebase for design issues | [design-audit](../design-audit/SKILL.md) |
| Fixing accessibility violations found in audit | [accessibility-remediation](../accessibility-remediation/SKILL.md) |
| Creating multi-step wizard forms | [multi-step-form](../multi-step-form/SKILL.md) |
| Implementing status state machines | [status-workflow](../status-workflow/SKILL.md) |
| Database schema or API design | [feature-implementation-guide](../feature-implementation-guide/SKILL.md) |

---

## Quick Reference

| Task | Pattern | Example |
|------|---------|---------|
| Primary text | `text-foreground` | `<p className="text-foreground">` |
| Secondary text | `text-muted-foreground` | `<span className="text-muted-foreground">` |
| Error styling | `text-destructive` + `border-destructive` | `className={cn(error && "border-destructive")}` |
| Success status | `<StatusBadge status="success">` | `<StatusBadge status="success">Active</StatusBadge>` |
| Icon button | `aria-label` required | `<Button size="icon" aria-label="Close">` |
| Touch target | `min-h-[44px] min-w-[44px]` | `<button className="min-h-[44px]">` |
| Dialog size | Use `size` prop | `<DialogContent size="md">` |
| Active nav | `text-international-orange` | `className={isActive ? "text-international-orange" : ""}` |
| Form error | `aria-invalid` + `role="alert"` | `<Input aria-invalid={!!error} />` |
| Clickable div | Add `role`, `tabIndex`, `onKeyDown` | `<div role="button" tabIndex={0} onKeyDown={...}>` |

---

## Troubleshooting

### Issue: Dark mode colors look wrong

**Cause:** Using hardcoded colors instead of semantic tokens.

**Fix:** Replace hardcoded values with semantic tokens:
```tsx
// ❌ Breaks in dark mode
<div className="bg-white text-slate-900">

// ✅ Works in dark mode
<div className="bg-background text-foreground">
```

---

### Issue: Form validation not announced to screen readers

**Cause:** Missing ARIA attributes on form fields and error messages.

**Fix:** Add complete accessibility pattern:
```tsx
<Input
  aria-invalid={!!error}
  aria-describedby={error ? "field-error" : undefined}
/>
{error && (
  <p id="field-error" role="alert" className="text-destructive">
    {error}
  </p>
)}
```

---

### Issue: Icon buttons not accessible via keyboard

**Cause:** Missing `aria-label` on icon-only buttons.

**Fix:** Add descriptive aria-label:
```tsx
// ❌ Screen readers say "button"
<Button size="icon"><X /></Button>

// ✅ Screen readers say "Close"
<Button size="icon" aria-label="Close"><X /></Button>
```

---

### Issue: Status badges using wrong colors

**Cause:** Using `Badge` with hardcoded colors instead of `StatusBadge`.

**Fix:** Use StatusBadge component with semantic status:
```tsx
// ❌ Hardcoded colors
<Badge className="bg-green-100 text-green-800">Active</Badge>

// ✅ Semantic status
<StatusBadge status="success">Active</StatusBadge>
```

---

## Related Skills

- [design-audit](../design-audit/SKILL.md) - Systematic audit to find UI inconsistencies across codebase
- [accessibility-remediation](../accessibility-remediation/SKILL.md) - Fix accessibility violations found during audit
- [multi-step-form](../multi-step-form/SKILL.md) - Patterns for wizard forms that use these UI standards
- [feature-implementation-guide](../feature-implementation-guide/SKILL.md) - Full feature implementation including UI components

### Related Cursor Rules

- `.cursor/rules/color-consistency.mdc` - **SINGLE SOURCE OF TRUTH** for all color token mappings
- `.cursor/rules/design-philosophy.mdc` - Core design principles (bright, airy, optimistic)
- `.cursor/rules/form-consistency.mdc` - Form field patterns and validation
- `.cursor/rules/component-patterns.mdc` - Component usage standards
- `.cursor/rules/navigation-consistency.mdc` - Navigation active states and styling

### Enforcement Script

```bash
# Run before committing UI code
./scripts/check-design-tokens.sh
```
