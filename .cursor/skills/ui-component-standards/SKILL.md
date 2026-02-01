---
name: ui-component-standards
description: Standards for UI components including semantic color tokens, accessibility requirements, and component usage patterns. Use when creating UI components, styling elements, using colors, creating forms, working with dialogs, breadcrumbs, touch targets, or when the user mentions colors, styling, UI, form, dialog, badge, accessibility, ARIA, breadcrumb, touch target, or keyboard navigation.
---

# UI Component Standards

This skill ensures consistent, accessible UI components in CentaurOS. **ALWAYS consult this before writing UI code.**

## Quick Reference: Color Token Mapping

### 🚨 CRITICAL: Never Use Hardcoded Status Colors

| ❌ DON'T USE | ✅ USE INSTEAD | Purpose |
|--------------|----------------|---------|
| `text-red-*` | `text-destructive` | Errors, danger |
| `text-green-*` | `text-status-success` | Success states |
| `text-amber-*` | `text-status-warning` | Warnings |
| `text-blue-*` | `text-status-info` | Information |
| `bg-red-*` | `bg-status-error-light` | Error backgrounds |
| `bg-green-*` | `bg-status-success-light` | Success backgrounds |
| `bg-amber-*` | `bg-status-warning-light` | Warning backgrounds |
| `bg-blue-*` | `bg-status-info-light` | Info backgrounds |
| `border-red-*` | `border-destructive` | Error borders |
| `border-green-*` | `border-status-success` | Success borders |
| `border-amber-*` | `border-status-warning` | Warning borders |

### Text Colors

| ❌ DON'T USE | ✅ USE INSTEAD | Purpose |
|--------------|----------------|---------|
| `text-slate-900` | `text-foreground` | Primary text |
| `text-slate-600/500/400` | `text-muted-foreground` | Secondary text |
| `text-gray-*` | `text-muted-foreground` | Secondary text |
| `text-white` (on dark) | `text-*-foreground` | Text on colored bg |

### Background Colors

| ❌ DON'T USE | ✅ USE INSTEAD | Purpose |
|--------------|----------------|---------|
| `bg-white` | `bg-background` | Page background |
| `bg-slate-50` | `bg-muted` | Secondary surface |
| `bg-slate-100` | `bg-secondary` | Subtle backgrounds |

### Extended Status Tokens

```tsx
// Success variations
text-status-success       // Icon/text color
text-status-success-dark  // Darker text (on light bg)
bg-status-success         // Solid background
bg-status-success-light   // Light background
border-status-success     // Border color

// Warning variations
text-status-warning
text-status-warning-dark
bg-status-warning
bg-status-warning-light
border-status-warning

// Error variations (use destructive)
text-destructive
bg-destructive
bg-status-error-light
border-destructive

// Info variations
text-status-info
text-status-info-dark
bg-status-info
bg-status-info-light
border-status-info
```

### Brand Colors (Use Sparingly)

```tsx
// Primary CTA and active states
bg-international-orange
text-international-orange
hover:bg-international-orange-hover

// Secondary accent
text-electric-blue
bg-electric-blue
```

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

## Dialog Size Guidelines

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

Before committing any UI code:

### Colors
- [ ] No `text-red-*`, `text-green-*`, `text-amber-*`, `text-blue-*` for status
- [ ] No `bg-red-*`, `bg-green-*`, `bg-amber-*`, `bg-blue-*` for status
- [ ] No `text-slate-*` or `text-gray-*` (use semantic tokens)
- [ ] No `bg-white` (use `bg-background`)

### Forms
- [ ] All Labels have `htmlFor` matching Input `id`
- [ ] Required fields have `aria-required` and asterisk with `aria-label`
- [ ] Error states use `aria-invalid`, `aria-describedby`, `role="alert"`
- [ ] Error styling uses `text-destructive`, `border-destructive`

### Components
- [ ] Status indicators use `StatusBadge` (not Badge with colors)
- [ ] Cards use `Card` component (not custom divs)
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

If you find hardcoded colors in existing code, use these replacements:

```bash
# Text colors
text-red-500 → text-destructive
text-red-600 → text-destructive
text-green-500 → text-status-success
text-green-600 → text-status-success
text-amber-500 → text-status-warning
text-amber-600 → text-status-warning
text-blue-500 → text-status-info
text-blue-600 → text-status-info

# Background colors
bg-red-100 → bg-status-error-light
bg-green-100 → bg-status-success-light
bg-amber-100 → bg-status-warning-light
bg-blue-100 → bg-status-info-light

# Border colors
border-red-500 → border-destructive
border-green-500 → border-status-success
border-amber-500 → border-status-warning
```
