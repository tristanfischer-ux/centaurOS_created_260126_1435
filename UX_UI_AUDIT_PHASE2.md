# CentaurOS UX/UI Audit - Phase 2 (Deep Analysis)

**Date:** January 31, 2026  
**Status:** 🟡 NEEDS WORK  
**Focus:** Issues Not Caught in Phase 1 Audit

---

## Executive Summary

Phase 1 audit focused on color consistency and basic ARIA attributes. This Phase 2 audit reveals **critical UX gaps** in navigation, keyboard accessibility, mobile usability, and interaction patterns.

| Category | Status | Priority |
|----------|--------|----------|
| **Navigation & Wayfinding** | 🔴 Critical | P0 |
| **Keyboard Accessibility** | 🔴 Critical | P0 |
| **Mobile Touch Targets** | 🔴 Critical | P0 |
| **Screen Reader Support** | 🔴 Critical | P0 |
| **Interaction Feedback** | 🟡 Needs Work | P1 |
| **Form UX** | 🟡 Needs Work | P1 |
| **Visual Hierarchy** | 🟢 Good | P2 |
| **Loading States** | 🟢 Good | - |
| **Toast Notifications** | 🟢 Good | - |

---

## Critical Issues Found

### 🔴 Issue 1: Missing Breadcrumb Navigation

**Severity:** Critical  
**Impact:** Users get lost on detail pages with no way to understand context or navigate back

**Current State:**
- Only **1 file** uses Breadcrumb component (`blueprint-detail-view.tsx`)
- **15+ detail pages** have no breadcrumb or back navigation
- Only **79 instances** of any navigation aids (ChevronRight, ArrowLeft, etc.)

**Affected Pages:**
- `/team/[id]` - Team member detail (NO back navigation)
- `/objectives/[id]` - Objective detail
- `/advisory/[id]` - Advisory question detail
- `/orders/[id]` - Order detail  
- `/marketplace/[id]` - Listing detail
- `/rfq/[id]` - RFQ detail
- `/retainers/[id]` - Retainer detail
- `/retainers/[id]/timesheet` - Nested page (2 levels deep!)
- `/marketplace/[id]/book` - Booking page (nested)

**Example Problem (team member page):**

```tsx
// Current: src/app/(platform)/team/[id]/page.tsx
// NO breadcrumb, NO back button, user is stranded!
return (
  <div className="space-y-8">
    {/* Profile Card - but HOW does user get back to /team? */}
    <div className="bg-background border...">
```

**Required Pattern:**

```tsx
// ✅ CORRECT - Add breadcrumb navigation
<nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm mb-6">
  <Link href="/team" className="text-muted-foreground hover:text-foreground">
    Team
  </Link>
  <ChevronRight className="h-4 w-4 text-muted-foreground" />
  <span className="text-foreground font-medium">{profile.full_name}</span>
</nav>
```

---

### 🔴 Issue 2: Critically Low Touch Target Coverage

**Severity:** Critical  
**Impact:** Mobile users cannot reliably tap interactive elements

**Current State:**
- Only **18 instances** of `min-h-[44px]` across 11 files
- Only **11 files** have proper mobile touch targets
- Button component correctly has `min-h-[44px]` (good)
- But many custom interactive elements don't

**Files With Touch Targets (only 11):**
- `src/components/ui/button.tsx` ✅
- `src/components/MobileNav.tsx` ✅
- `src/components/timeline/GanttView.tsx`
- `src/components/tasks/attachment-list.tsx`
- UI primitives (input, checkbox, select, sheet, dropdown)

**Missing Touch Targets:**
- Table row actions
- Icon buttons throughout
- Card click handlers
- Navigation items on mobile
- Most custom interactive elements

**Required Pattern:**

```tsx
// ✅ All clickable elements need 44px minimum
<button className="min-h-[44px] min-w-[44px] ...">
  <TrashIcon />
</button>

// ✅ For inline actions, add touch-friendly padding
<button className="p-2 -m-2"> {/* Extends tap area */}
  <MoreVertical />
</button>
```

---

### 🔴 Issue 3: Native Browser Confirm() Usage

**Severity:** Critical  
**Impact:** Inconsistent UX, no styling, potentially confusing for users

**Current State:**
- **5 instances** of `window.confirm()` found
- AlertDialog component exists and is used elsewhere (453 instances)
- These 5 are outliers breaking the pattern

**Affected Files:**
1. `src/app/(platform)/tasks/tasks-view.tsx`
2. `src/app/(platform)/provider-portal/case-studies/page.tsx`
3. `src/app/(platform)/blueprints/blueprints-view.tsx`
4. `src/components/gdpr/DataRequestStatus.tsx`
5. `src/components/tasks/attachment-list.tsx`

**Solution:** Replace with AlertDialog:

```tsx
// ❌ Current
if (confirm("Are you sure you want to delete?")) {
  handleDelete()
}

// ✅ Correct - Use AlertDialog
<AlertDialog open={showDelete} onOpenChange={setShowDelete}>
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

### 🔴 Issue 4: Poor Keyboard Accessibility

**Severity:** Critical  
**Impact:** Keyboard-only users cannot navigate or interact with custom elements

**Current State:**
| Pattern | Count | Required |
|---------|-------|----------|
| `onKeyDown` handlers | 19 | ~100+ |
| `tabIndex` usage | 6 | ~50+ |
| `role="button"` | 6 | 13+ (to match div onClick) |
| `<div onClick>` without role | 7 | 0 |

**Clickable Divs Without Keyboard Support:**
1. `src/components/timeline/TimelineListView.tsx` (3 instances)
2. `src/app/(platform)/team/team-comparison-view.tsx`
3. `src/app/(platform)/tasks/task-card.tsx` (2 instances)
4. `src/app/(platform)/marketplace/create-rfq-sheet.tsx`

**Required Pattern:**

```tsx
// ❌ WRONG - Div with click only
<div onClick={handleClick}>
  Click me
</div>

// ✅ CORRECT - Full keyboard support
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
>
  Click me
</div>

// ✅ BEST - Use actual button
<button onClick={handleClick}>
  Click me
</button>
```

---

### 🔴 Issue 5: Low Screen Reader Support

**Severity:** Critical  
**Impact:** Blind/low-vision users miss important context

**Current State:**
- Only **12 instances** of `sr-only` class
- Only **6 instances** of visually hidden text
- Many icons and indicators have no text alternative

**Where sr-only is Needed:**
1. Icon-only buttons (need action description)
2. Status indicators (what does green dot mean?)
3. Progress bars (current percentage)
4. Data visualizations (chart summaries)
5. Loading states (what's loading?)
6. Error/success icons next to inputs

**Required Pattern:**

```tsx
// ✅ Add screen reader text
<Button variant="ghost" size="icon" aria-label="Close">
  <X className="h-4 w-4" />
</Button>

// ✅ For status indicators
<div className="flex items-center gap-2">
  <div className="h-2 w-2 rounded-full bg-status-success" aria-hidden="true" />
  <span>Active</span>
  <span className="sr-only">Status: Active</span>
</div>

// ✅ For progress
<div className="h-2 bg-muted rounded-full">
  <div className="h-full bg-status-success" style={{ width: '60%' }} />
  <span className="sr-only">60% complete</span>
</div>
```

---

### 🟡 Issue 6: Icon Buttons Missing aria-label

**Severity:** High  
**Impact:** Screen readers announce "button" with no context

**Current State:**
- **16 instances** of `size="icon">` (button closes immediately after size)
- Many of these lack `aria-label`
- Only ~4 verified to have proper labels

**Examples Found Without Labels:**
```tsx
// ❌ Missing aria-label
<Button variant="ghost" size="icon">
  <X className="h-4 w-4" />
</Button>

// Files with icon buttons needing review:
- src/components/provider/PortfolioGrid.tsx (2 - prev/next buttons)
- src/components/provider/PortfolioItemDialog.tsx
- src/components/provider/PortfolioForm.tsx
- src/components/tasks/voice-recorder.tsx
- src/app/(platform)/marketplace/create-rfq-dialog.tsx
- src/components/search/SearchBar.tsx
- src/components/timeline/GanttView.tsx
- src/components/provider/VideoIntroUpload.tsx
```

---

### 🟡 Issue 7: Limited AutoFocus for Dialogs

**Severity:** Medium  
**Impact:** Users must manually click into first input field

**Current State:**
- Only **9 instances** of `autoFocus` across dialogs
- 50+ dialogs exist in the codebase
- Most dialogs don't focus first interactive element

**Dialogs With AutoFocus (good):**
1. `create-objective-dialog.tsx` ✅
2. `create-task-dialog.tsx` ✅
3. `login/page.tsx` ✅
4. `add-member-dialog.tsx` ✅
5. `edit-task-dialog.tsx` ✅
6. `create-team-dialog.tsx` ✅
7. `team-comparison-view.tsx` ✅
8. `quick-add-task.tsx` ✅

**Dialogs Missing AutoFocus (need fixing):**
- Most other create/edit dialogs
- All filter/search dialogs
- All confirmation dialogs (should focus primary action)

---

### 🟡 Issue 8: Inconsistent Input Validation Guidance

**Severity:** Medium  
**Impact:** Users don't know input limits until they hit errors

**Current State:**
- Only **32 instances** of `maxLength/minLength/max/min`
- **263 placeholders** defined
- Gap: many inputs have placeholder but no length validation

**Pattern Needed:**

```tsx
// ✅ Show character limits
<div className="space-y-2">
  <Label htmlFor="description">Description</Label>
  <Textarea
    id="description"
    value={description}
    onChange={(e) => setDescription(e.target.value)}
    maxLength={500}
    placeholder="Describe your objective..."
  />
  <p className="text-sm text-muted-foreground text-right">
    {description.length}/500
  </p>
</div>
```

---

## What's Working Well

### ✅ Strengths (Good UX Patterns)

| Category | Count | Assessment |
|----------|-------|------------|
| **Toast Notifications** | 444 instances | ✅ Excellent user feedback |
| **AlertDialog Usage** | 453 instances | ✅ Proper confirmation dialogs |
| **Transitions/Animations** | 681 instances | ✅ Smooth interactions |
| **Hover/Focus States** | 638 instances | ✅ Good interactive feedback |
| **Text Truncation** | 304 instances | ✅ Prevents overflow |
| **Disabled States** | 348 instances | ✅ Clear disabled feedback |
| **Labels with htmlFor** | 443 instances | ✅ Good form accessibility |
| **Placeholders** | 263 instances | ✅ Form guidance present |
| **Date Formatting** | 422 instances | ✅ Consistent patterns |
| **Currency/Number** | 262 instances | ✅ Proper formatting |
| **Scroll Areas** | 74 instances | ✅ Contained scrolling |

---

## Implementation Plan

### Phase 1: Critical Accessibility (Priority P0)

| Task | Effort | Files |
|------|--------|-------|
| Add breadcrumbs to all detail pages | 4 hours | 15 pages |
| Replace 5 window.confirm() with AlertDialog | 1 hour | 5 files |
| Add keyboard support to div onClick handlers | 2 hours | 4 files |
| Add sr-only text to critical indicators | 3 hours | ~20 files |
| Add aria-label to icon buttons | 2 hours | ~15 files |

**Priority Files:**
1. `src/app/(platform)/team/[id]/page.tsx` - Add breadcrumb
2. `src/app/(platform)/objectives/[id]/page.tsx` - Add breadcrumb
3. `src/app/(platform)/tasks/tasks-view.tsx` - Replace confirm()
4. `src/components/timeline/TimelineListView.tsx` - Add keyboard support
5. `src/app/(platform)/tasks/task-card.tsx` - Add keyboard support

### Phase 2: Mobile UX (Priority P0)

| Task | Effort | Files |
|------|--------|-------|
| Add min-h-[44px] to table row actions | 3 hours | ~15 files |
| Add touch targets to card actions | 2 hours | ~10 files |
| Audit sticky elements on mobile | 2 hours | ~24 files |

### Phase 3: Form UX (Priority P1)

| Task | Effort | Files |
|------|--------|-------|
| Add autoFocus to dialog first inputs | 2 hours | ~40 dialogs |
| Add character counters to textareas | 2 hours | ~20 files |
| Add maxLength to all text inputs | 2 hours | ~50 inputs |

---

## Metrics Comparison

### Before Phase 1 vs Current

| Metric | Before Phase 1 | After Phase 1 | Phase 2 Target |
|--------|----------------|---------------|----------------|
| Breadcrumbs | 1 file | 1 file | 15+ files |
| Touch targets (44px) | 18 instances | 18 instances | 60+ instances |
| window.confirm() | 5 uses | 5 uses | 0 uses |
| onKeyDown handlers | 19 | 19 | 50+ |
| sr-only usage | 12 | 12 | 50+ |
| Icon buttons with aria-label | ~4 | ~4 | All 16+ |

---

## Recommended New Cursor Rules

### 1. Breadcrumb Navigation Rule

```markdown
# Breadcrumb Navigation

All detail pages (routes with [id]) MUST include breadcrumb navigation.

## Required Pattern
<nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm mb-6">
  <Link href="/parent">Parent</Link>
  <ChevronRight className="h-4 w-4 text-muted-foreground" />
  <span className="font-medium">{title}</span>
</nav>
```

### 2. Touch Target Rule

```markdown
# Touch Targets

All interactive elements MUST have 44x44px minimum touch target.

## Required Pattern
- Buttons: Already handled via Button component
- Icon buttons: Use size="icon" which has min-h-[44px]
- Custom interactive elements: Add min-h-[44px] min-w-[44px]
- Table row actions: Add p-2 padding
```

### 3. Keyboard Accessibility Rule

```markdown
# Keyboard Accessibility

NEVER use <div onClick> without full keyboard support.

## If you must use div (prefer button):
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleClick()}
>
```

---

## Quick Checklist for New Components

Before committing:

- [ ] Detail pages have breadcrumb navigation
- [ ] All interactive elements have 44px touch targets
- [ ] No window.confirm() - use AlertDialog
- [ ] No div onClick without role="button" and keyboard support
- [ ] Icon-only buttons have aria-label
- [ ] Dialogs autoFocus first input
- [ ] Status indicators have sr-only text
- [ ] Inputs have maxLength and character counter if applicable

---

## Conclusion

Phase 1 audit successfully addressed color consistency and basic ARIA. Phase 2 reveals that **navigation, keyboard accessibility, and mobile usability** are the highest-priority gaps.

The most critical fix is **adding breadcrumb navigation to all detail pages** - this is a fundamental wayfinding issue that affects all users.

Estimated total remediation effort: **20-25 hours** across all phases.
