# Cursor Rules - CentaurOS Design System

This directory contains **8 Cursor rules** that automatically enforce design consistency across the CentaurOS codebase.

## 📋 All Rules

### Design Philosophy & Standards

1. **`design-philosophy.mdc`** ⭐ (Existing)
   - Bright, airy, optimistic design principles
   - Light-first approach
   - Generous whitespace
   - **Status:** Active

2. **`color-consistency.mdc`** 🆕
   - Semantic color tokens only
   - No hardcoded colors
   - Dark mode compatibility
   - **Status:** Active - Addresses 1,108 instances

3. **`form-consistency.mdc`** 🆕
   - Standardized validation patterns
   - ARIA attributes required
   - Consistent error states
   - **Status:** Active

4. **`layout-spacing.mdc`** 🆕
   - Page container patterns
   - Spacing scale standards
   - Grid and flex patterns
   - **Status:** Active

5. **`component-patterns.mdc`** 🆕
   - Badge, Button, Card, Dialog usage
   - StatusBadge for statuses
   - EmptyState for zero-data
   - **Status:** Active

6. **`navigation-consistency.mdc`** 🆕
   - International Orange active states
   - Consistent typography & icons
   - Touch-friendly targets
   - **Status:** Active

### Component-Specific Rules

7. **`avatar-standard.mdc`** (Existing)
   - UserAvatar component required
   - Role-based color coding
   - **Status:** Active

8. **`task-completion-icons.mdc`** (Existing)
   - CheckCircle for completed only
   - Clock for active tasks
   - AlertTriangle for overdue
   - **Status:** Active

---

## 🚀 Quick Start

### For New Code

All new code automatically follows these rules when using Cursor. The AI will:
- ✅ Suggest semantic tokens instead of hardcoded colors
- ✅ Apply correct form validation patterns
- ✅ Use design system utilities for spacing
- ✅ Apply consistent component patterns
- ✅ Enforce navigation standards

### For Existing Code

See `DESIGN_CONSISTENCY_AUDIT.md` in the root directory for:
- Comprehensive audit results
- 3-phase implementation plan
- Priority order for refactoring
- Testing strategy

---

## 📖 Rule Usage Examples

### Color Consistency

```tsx
// ✅ CORRECT - Semantic tokens
<div className="bg-background text-foreground">
  <p className="text-muted-foreground">Description</p>
  <span className="text-destructive">Error</span>
</div>

// ❌ WRONG - Hardcoded colors
<div className="bg-white text-slate-900">
  <p className="text-slate-600">Description</p>
  <span className="text-red-500">Error</span>
</div>
```

### Form Consistency

```tsx
// ✅ CORRECT - Complete accessibility
<div className="space-y-2">
  <Label htmlFor="email">
    Email
    <span className="text-destructive ml-1" aria-label="required">*</span>
  </Label>
  <Input
    id="email"
    aria-required
    aria-invalid={hasError}
    aria-describedby={hasError ? "email-error" : undefined}
    className={cn(hasError && "border-destructive")}
  />
  {hasError && (
    <p id="email-error" role="alert" className="text-sm text-destructive">
      {errorMessage}
    </p>
  )}
</div>

// ❌ WRONG - Missing accessibility
<div>
  <Label>Email *</Label>
  <Input className={hasError ? "border-red-500" : ""} />
  {hasError && <p className="text-red-600">{errorMessage}</p>}
</div>
```

### Component Patterns

```tsx
// ✅ CORRECT - StatusBadge for statuses
<StatusBadge status="success" size="md">Active</StatusBadge>

// ❌ WRONG - Badge with hardcoded colors
<Badge className="bg-green-100 text-green-800">Active</Badge>
```

### Navigation

```tsx
// ✅ CORRECT - International Orange active state
<Link
  className={cn(
    "text-sm font-medium transition-colors",
    isActive
      ? "text-international-orange font-semibold"
      : "text-muted-foreground hover:text-foreground"
  )}
>
  Dashboard
</Link>

// ❌ WRONG - Cyan active state
<Link
  className={cn(
    isActive && "bg-cyan-50 text-cyan-600"
  )}
>
  Dashboard
</Link>
```

---

## 🎯 Priority Levels

| Rule | Priority | Impact | Effort |
|------|----------|--------|--------|
| **navigation-consistency** | 🔴 High | High visibility | 2-4 hours |
| **form-consistency** | 🔴 High | Accessibility & UX | 4-6 hours |
| **component-patterns** | 🟡 Medium | Code quality | 8-12 hours |
| **color-consistency** | 🟡 Medium | 1,108 instances | 20-30 hours |
| **layout-spacing** | 🟢 Low | Visual polish | 12-16 hours |

---

## 📊 Current Status

### Rules Coverage

- ✅ **Colors:** Comprehensive token system defined
- ✅ **Forms:** Full validation pattern specified
- ✅ **Layout:** Spacing scale and grid patterns
- ✅ **Components:** Badge, Button, Card, Dialog, StatusBadge
- ✅ **Navigation:** Active states, typography, icons
- ✅ **Avatars:** UserAvatar with role colors
- ✅ **Icons:** Task status icon patterns

### Adoption Status

| Area | Status | Files Compliant | Total Files |
|------|--------|-----------------|-------------|
| **Colors** | 🔴 15% | ~25 | 172 |
| **Forms** | 🟡 60% | ~30 | 50 |
| **Components** | 🟡 70% | ~150 | 215 |
| **Navigation** | 🟡 50% | ~2 | 4 |
| **Layout** | 🟢 80% | ~90 | 110 |

---

## 🛠️ Maintenance

### Adding New Rules

1. Create `{rule-name}.mdc` in this directory
2. Use frontmatter: `alwaysApply: true` for automatic application
3. Include clear examples (✅ correct, ❌ wrong)
4. Update this README

### Updating Rules

1. Edit the `.mdc` file
2. Test with new code to verify AI suggestions
3. Update `DESIGN_CONSISTENCY_AUDIT.md` if needed

### Removing Rules

1. Consider if rule is still needed
2. Check for dependencies in other rules
3. Archive instead of delete (move to `archived/`)

---

## 📚 Additional Resources

- **Design System:** `../DESIGN_SYSTEM_IMPLEMENTATION_COMPLETE.md`
- **Audit Report:** `../DESIGN_CONSISTENCY_AUDIT.md`
- **Design Utilities:** `../src/lib/design-system/`
- **Tailwind Config:** `../tailwind.config.ts`

---

## ✨ Benefits

### For Developers
- Clear guidelines for every design decision
- Reduced decision fatigue
- Faster development with reusable patterns
- Automatic suggestions from Cursor AI

### For Users
- Consistent visual language
- Predictable interactions
- Accessible interface
- Professional polish

### For Maintenance
- Easy global design updates
- Lower technical debt
- Fewer bugs from inconsistency
- Scalable design system

---

**Last Updated:** 2026-01-30  
**Total Rules:** 8 (5 new, 3 existing)  
**Estimated Compliance:** ~60% (improving)
