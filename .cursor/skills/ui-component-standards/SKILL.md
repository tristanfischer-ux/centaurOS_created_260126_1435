---
name: ui-component-standards
description: Standards for UI components including semantic color tokens, accessibility requirements, and component usage patterns. Use when creating UI components, styling elements, using colors, creating forms, working with dialogs, or when the user mentions colors, styling, UI, form, dialog, badge, accessibility, or ARIA.
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
