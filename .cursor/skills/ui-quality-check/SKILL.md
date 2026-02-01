# UI Quality Check Skill

**WHEN TO USE:** Run this checklist BEFORE committing ANY UI changes. Use proactively for all component/styling work.

## Quick Command

```bash
./scripts/check-design-tokens.sh
```

If this fails, fix all violations before proceeding.

## Most Common Violations (From Codebase Audit)

Based on a comprehensive audit of 72 pages and 100+ components, these are the **MOST FREQUENTLY OCCURRING** violations:

### 1. Hardcoded Status Colors (60+ instances found)

```tsx
// ❌ VERY COMMON MISTAKE
<CheckCircle2 className="text-green-600" />
<Badge className="bg-green-100 text-green-800">Complete</Badge>
<div className="text-emerald-600">Verified</div>
<span className="text-amber-600">Pending</span>

// ✅ CORRECT - Use semantic tokens
<CheckCircle2 className="text-status-success" />
<StatusBadge status="success">Complete</StatusBadge>
<div className="text-status-success">Verified</div>
<span className="text-status-warning">Pending</span>
```

### 2. Error Red Colors (15+ instances found)

```tsx
// ❌ FOUND IN AUDIT
<span className="text-red-500">*</span>  // Required asterisk
<p className="text-red-600">{error}</p>
<Badge className="bg-red-100 text-red-800">Failed</Badge>

// ✅ CORRECT
<span className="text-destructive" aria-label="required">*</span>
<p className="text-destructive">{error}</p>
<StatusBadge status="error">Failed</StatusBadge>
```

### 3. Info/Scheduling Blues (37+ instances found)

```tsx
// ❌ FOUND IN AUDIT
<Calendar className="text-blue-600" />
<Badge className="bg-blue-100 text-blue-800">Scheduled</Badge>
<div className="p-3 bg-blue-50 text-blue-800">Info message</div>

// ✅ CORRECT
<Calendar className="text-status-info" />
<Badge className="bg-status-info-light text-status-info-dark">Scheduled</Badge>
<div className="p-3 bg-status-info-light text-status-info-dark">Info message</div>
```

### 4. Background White (20+ instances found)

```tsx
// ❌ FOUND IN AUDIT
<Card className="!bg-white">
<div className="bg-white rounded-lg">

// ✅ CORRECT
<Card className="bg-background">
<div className="bg-background rounded-lg">
```

### 5. Missing Required Field Accessibility

```tsx
// ❌ FOUND IN AUDIT - Missing aria-label
<Label>Name <span className="text-red-500">*</span></Label>

// ✅ CORRECT - Proper accessibility
<Label>Name <span className="text-destructive" aria-label="required">*</span></Label>
```

## Pre-Commit Checklist

### 1. Z-Index Hierarchy (Most Common Issue)

**Never override z-index on UI primitives:**

```tsx
// ❌ FORBIDDEN
<PopoverContent className="z-50">
<SelectContent className="z-50">
<DropdownMenuContent className="z-50">

// ✅ CORRECT
<PopoverContent>
<SelectContent>
<DropdownMenuContent>
```

**Z-Index Scale:**
| Level | Value | Components |
|-------|-------|------------|
| Modals | `z-50` | Dialog, Sheet, AlertDialog, Drawer |
| Dropdowns | `z-[200]` | Popover, Select, DropdownMenu, HoverCard |
| Tooltips | `z-[300]` | Tooltip |

### 2. Overlay Opacity

**Dialog/AlertDialog overlays must be dark enough to block content:**

```tsx
// ❌ TOO WEAK - content bleeds through
<DialogOverlay className="bg-black/20" />

// ✅ CORRECT
<DialogOverlay className="bg-black/80" />  // Dialogs
<SheetOverlay className="bg-black/50" />   // Sheets/Drawers
```

### 3. Semantic Color Tokens

**Never use hardcoded colors:**

```tsx
// ❌ FORBIDDEN
<div className="bg-white text-slate-600">
<span className="text-red-500">
<Badge className="bg-green-100">

// ✅ CORRECT
<div className="bg-background text-muted-foreground">
<span className="text-destructive">
<StatusBadge status="success">
```

### 4. Background Override Pattern

**Never use `!bg-white`:**

```tsx
// ❌ FORBIDDEN
<div className="!bg-white">

// ✅ CORRECT
<div className="bg-background">
```

### 5. Dialog/Modal Testing

After creating or modifying any modal:

1. **Open the dialog** - Does backdrop appear and cover ALL content?
2. **Open a Select/Popover inside** - Does dropdown appear ABOVE dialog?
3. **Hover for tooltip** - Does tooltip appear above everything?
4. **Click outside** - Does dialog close properly?

### 6. Component Nesting

When using UI components inside modals:

```tsx
// Inside a Dialog, these work automatically:
<Dialog>
  <DialogContent>
    <Select>
      <SelectContent>  {/* z-[200], appears above dialog */}
    </Select>
    <Popover>
      <PopoverContent>  {/* z-[200], appears above dialog */}
    </Popover>
  </DialogContent>
</Dialog>
```

**DO NOT** add z-index classes to these - they're already configured.

## Automated Checks

The `check-design-tokens.sh` script catches:

- ❌ Hardcoded colors (`text-slate-*`, `bg-white`, etc.)
- ❌ Invalid z-index values (`z-[100]`, `z-[999]`)
- ❌ Z-index overrides on UI primitives
- ❌ `!bg-white` patterns
- ❌ Weak overlay opacities (`bg-black/20`)
- ❌ Dark mode variants (`dark:*`)
- ❌ Wrong theme configuration

## Complete Color Token Reference

**Run this grep to find violations in your changes:**

```bash
# Check for all forbidden patterns at once
rg "(text-red-|text-green-|text-emerald-|text-amber-|text-blue-|bg-white\"|bg-green-|bg-red-|bg-blue-|bg-amber-)" src/
```

**Replacement Table:**

| Forbidden Pattern | Replace With |
|-------------------|--------------|
| `text-red-*` | `text-destructive` |
| `text-green-*` | `text-status-success` |
| `text-emerald-*` | `text-status-success` |
| `text-amber-*` | `text-status-warning` |
| `text-blue-*` | `text-status-info` |
| `bg-white` | `bg-background` |
| `bg-green-*` | `bg-status-success-light` |
| `bg-emerald-*` | `bg-status-success-light` |
| `bg-red-*` | `bg-status-error-light` |
| `bg-blue-*` | `bg-status-info-light` |
| `bg-amber-*` | `bg-status-warning-light` |
| `text-green-700/800` | `text-status-success-dark` |
| `text-blue-700/800` | `text-status-info-dark` |
| `text-amber-700/800` | `text-status-warning-dark` |

**Exceptions (allowed):**
- `text-amber-400` / `fill-amber-400` for star ratings
- `border-slate-100` for ultra-light page header dividers
- Role colors in `user-avatar.tsx` (intentional brand distinction)

## If You Find a Bug

If you find a z-index or overlay issue:

1. **Fix the UI primitive** (in `src/components/ui/`)
2. **Don't add workarounds** in consumer components
3. **Run the check script** to ensure no regressions
4. **Update z-index-hierarchy.mdc** if adding new patterns

## Files to Know

- `.cursor/rules/z-index-hierarchy.mdc` - Z-index scale documentation
- `.cursor/rules/component-patterns.mdc` - Component usage patterns
- `.cursor/rules/color-consistency.mdc` - Color token mappings
- `scripts/check-design-tokens.sh` - Automated violation checker
