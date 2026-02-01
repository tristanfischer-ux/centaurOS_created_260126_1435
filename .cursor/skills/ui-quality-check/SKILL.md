# UI Quality Check Skill

**WHEN TO USE:** Run this checklist BEFORE committing ANY UI changes. Use proactively for all component/styling work.

## Quick Command

```bash
./scripts/check-design-tokens.sh
```

If this fails, fix all violations before proceeding.

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
