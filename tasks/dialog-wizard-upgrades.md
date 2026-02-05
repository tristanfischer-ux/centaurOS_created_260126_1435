# Dialog Wizard Upgrade Plan

Based on auditing all dialog components in the codebase, this document tracks which dialogs should be upgraded to the "Purpose Dialog Quality" wizard pattern.

## Reference Implementation

**Gold Standard:** `src/components/objectives/company-purpose-dialog.tsx`
- 5-step wizard with visual stepper
- Conversational typography
- One focused concept per step
- International-orange branding

## Already Using Wizard/Multi-Step

These dialogs already follow the pattern:

| Dialog | Location | Pattern |
|--------|----------|---------|
| Company Purpose | `src/components/objectives/company-purpose-dialog.tsx` | 5-step wizard (reference) |
| Top Up Credits | `src/components/billing/TopUpDialog.tsx` | Multi-step (amount → payment → success) |
| Member Offboarding | `src/components/admin/OffboardingDialog.tsx` | Multi-step (review → reassign → confirm) |

## High Priority Upgrades

### 1. Create Objective Dialog

**File:** `src/app/(platform)/objectives/create-objective-dialog.tsx` (~843 lines)

**Current State:** Mode switching (manual/pack/import) with tabs, confusing flow

**Proposed Wizard Flow:**
1. **Choose Method** - Manual, Pack, or Import
2. **Configure** - Mode-specific configuration:
   - Manual: Title, description
   - Pack: Browse and select pack
   - Import: Select from business plan
3. **Set Details** - Dates, assignees (if applicable)
4. **Review & Create** - Summary and confirmation

**Status:** 🔄 IN PROGRESS

---

### 2. Enrollment Create Dialog

**File:** `src/components/apprenticeship/enrollment-create-dialog.tsx`

**Current State:** Single form with 7 fields

**Proposed Wizard Flow:**
1. **Apprentice & Programme** - Who and what
2. **Schedule** - Dates and hours
3. **Compensation** - Wage details
4. **Mentors** - Assign mentors (optional)
5. **Review & Create** - Summary and confirmation

**Status:** ⏳ Pending

---

## Medium Priority Upgrades

### 3. Create Task Dialog

**File:** `src/app/(platform)/tasks/create-task-dialog.tsx`

**Current State:** Single form with advanced toggle

**Proposed Wizard Flow:**
1. **Basic Info** - Title, objective, assignees
2. **Details** - Description, deadline, attachments

**Status:** ⏳ Pending

---

### 4. Create Blueprint Dialog

**File:** `src/components/blueprints/create-blueprint-dialog.tsx`

**Current State:** Uses tabs (describe/template)

**Decision:** Tabs work, but wizard could improve clarity. Lower priority.

**Status:** ⏳ Pending

---

## No Upgrade Needed

These dialogs are simple enough or serve different purposes:

| Dialog | Reason |
|--------|--------|
| Edit Task Dialog | Simple 3-field form |
| Edit Objective Dialog | Simple edit form |
| Quick Compose Dialog | Simple 2-field form |
| Create Team Dialog | Simple 2-field form |
| Invite Member Dialog | Simple 3-field form |
| Add Payment Method | Stripe handles complexity |
| Marketplace Listing Dialog | Display only |
| Create Subsystem Objective | Selection only |
| Create RFQ Dialog | Simple enough |

---

## Implementation Checklist

For each upgrade:

- [ ] Use `WizardStepper` component from `@/components/ui/wizard-stepper`
- [ ] Use `useWizardSteps` hook for state management
- [ ] Apply typography from `typography.wizardStepTitle` and `typography.wizardStepDescription`
- [ ] Follow patterns from `.cursor/rules/wizard-pattern-standards.mdc`
- [ ] Validate each step before allowing "Next"
- [ ] Auto-focus first input on step change
- [ ] Character counters for long text fields
- [ ] Test keyboard navigation

---

## Progress Tracking

| Dialog | Priority | Status | Notes |
|--------|----------|--------|-------|
| Create Objective | High | 🔄 In Progress | First exemplar |
| Enrollment Create | High | ⏳ Pending | |
| Create Task | Medium | ⏳ Pending | |
| Create Blueprint | Medium | ⏳ Pending | |

---

Last updated: 2026-02-05
