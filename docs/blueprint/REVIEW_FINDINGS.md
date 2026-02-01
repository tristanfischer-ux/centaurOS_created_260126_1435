# Blueprint Spec Review Findings

> **Consolidated report from 4 parallel review agents**
> Generated: 2026-02-01

---

## Executive Summary

| Category | Score | Status |
|----------|-------|--------|
| Design System Compliance | 15 violations (8 critical) | Needs fixes |
| Internal Consistency | 8 issues (2 critical) | Needs fixes |
| Bug Risk Analysis | 18 risks (5 critical) | Needs fixes |
| PRD Completeness | 53% (45/85 FRs) | MVP-scoped |

**Overall Assessment:** CONDITIONALLY READY after fixes applied.

**Blocking Issues (status):**
1. ~~Form accessibility violations~~ - FIXED (02-ux-spec.md updated)
2. RLS policy gap on `blueprint_domain_coverage` - PENDING (requires migration)
3. Race conditions in coverage updates - PENDING (requires code implementation)
4. ~~Table name inconsistency~~ - FIXED (3 docs updated)
5. ~~AI approval rules unclear~~ - FIXED (INDEX.md canonical rules added)

---

## Part 1: Design System Violations

### Critical (8)

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 1 | Status badges use color names ("Green badge") instead of `StatusBadge` component | 02-ux-spec.md lines 122-125 | Use `<StatusBadge status="success">` |
| 2 | Dialog missing `size` prop | 02-ux-spec.md lines 436, 618 | Add `size="md"` to DialogContent |
| 3 | Dialog footer missing Cancel button | 02-ux-spec.md lines 460, 653 | Add `<Button variant="secondary">Cancel</Button>` |
| 4 | Form fields missing `htmlFor`/`id` linkage | 02-ux-spec.md lines 625-656 | Add proper Label-Input associations |
| 5 | Form fields missing `aria-required` | 02-ux-spec.md lines 627, 635 | Add asterisk with `aria-label="required"` |
| 6 | Form fields missing error states | 02-ux-spec.md lines 625-656 | Add `aria-invalid`, error messages with `role="alert"` |
| 7 | Missing focus management on validation | 02-ux-spec.md lines 623-656 | Focus first error field on submit |
| 8 | Badge without variant | 02-ux-spec.md lines 641-642 | Add `variant="secondary"` |

### Minor (7)

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 9 | EmptyState not explicitly specified | 02-ux-spec.md line 73 | Specify EmptyState component usage |
| 10 | Alert variant needs verification | 02-ux-spec.md line 1168 | Verify `variant="warning"` exists |
| 11 | Sheet width OK | 02-ux-spec.md line 142 | No change needed |
| 12 | Form spacing OK | 02-ux-spec.md line 624 | Verify space-y-4 is correct |
| 13 | Status token names need verification | 02-ux-spec.md line 130 | Verify token names |
| 14 | Button variant implicit | 02-ux-spec.md line 461 | Add explicit `variant="default"` |
| 15 | Breadcrumb separator styling | 02-ux-spec.md lines 343-374 | Add `text-muted-foreground` to ChevronRight |

---

## Part 2: Consistency Issues

### Critical (2)

#### 1. Table Name Inconsistency
- **Docs affected:** 3 documents use `domain_coverage` instead of `blueprint_domain_coverage`
- **Fix:** Global find/replace in affected docs

#### 2. AI Auto-Approval Contradiction
- **Issue:** Conflicting statements about when AI can auto-approve vs require human review
- **Docs involved:** 01-prd.md, 06-monetization-trust.md, 12-rfq-starter-pack.md, 13-ai-confidence-verification.md
- **Fix:** Establish single source of truth in INDEX.md, update all docs to reference it

### Minor (6)

| # | Issue | Resolution |
|---|-------|------------|
| 3 | Stage gate enforcement ambiguity | Clarify: gates are advisory with warnings, not blocking |
| 4 | Risk threshold inconsistency | Standardize risk gating thresholds across docs |
| 5 | Confidence threshold differences | Document intentional difference (RFQ: 80, marketplace: 60) |
| 6 | Template fork sync | Already resolved in 15-template-governance.md |
| 7 | Enum consistency | All enums match INDEX.md - verified |
| 8 | Backlog coverage | Add FR number mapping to backlog stories |

---

## Part 3: Bug Risks

### Critical (5) - Must Fix Before Launch

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| 1 | **RLS Policy Gap** - `blueprint_domain_coverage` lacks `foundry_id` | Cross-foundry data leakage | Add `foundry_id` column with RLS policy |
| 2 | **Race Condition** - Concurrent coverage updates | Lost updates, inconsistent state | Add optimistic locking with `updated_at` check |
| 3 | **Race Condition** - Multiple AI task approvals | Duplicate approvals | Use atomic status transition in UPDATE |
| 4 | **JSONB Validation** - No schema enforcement | Data corruption, query failures | Add CHECK constraint + Zod validation |
| 5 | **Migration Risk** - tasks.metadata breaks queries | Runtime errors | Audit for SELECT *, add DEFAULT '{}' |

### High (7) - Fix in MVP

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| 6 | Concurrent OptionSet commits | Data corruption | Use SELECT FOR UPDATE in RPC |
| 7 | Orphaned records on template deletion | Broken blueprints | Change to ON DELETE RESTRICT |
| 8 | AI task timeout handling | Stuck tasks | Add timeout with system log + retry |
| 9 | Template deleted while blueprint uses it | Unusable blueprints | Prevent deletion if referenced |
| 10 | User deactivated during approval | Broken workflow | Check user status before approval |
| 11 | TypeScript types don't match schema | Type errors | Update types immediately |
| 12 | Index creation locks table | Downtime | Use CREATE INDEX CONCURRENTLY |

### Medium (6) - Fix Post-MVP

| # | Risk | Mitigation |
|---|------|------------|
| 13 | Stage transition during active operations | Snapshot stage at task creation |
| 14 | JSONB size limits | Implement truncation rules |
| 15 | objectives.blueprint_id NULL handling | Handle NULL in all queries |
| 16 | Concurrent OptionSet status updates | Atomic status transitions |
| 17 | Domain deleted while coverage exists | Prevent deletion if referenced |
| 18 | Missing OptionSet JSONB validation | Add CHECK constraint |

---

## Part 4: Completeness Gaps

### PRD Coverage: 53% (45/85 FRs)

40 functional requirements are in the "tightened MVP" cut but not explicitly deferred:
- Expert Packet: FR-033 to FR-045 (cut to essentials)
- OptionSets: FR-046 to FR-055 (v1 scope)
- RFQ: FR-056 to FR-070 (partial)
- Marketplace: FR-071 to FR-085 (reduced scope)

### Red Team Coverage: 53% (8/15)

Missing mitigations for:
- RLS bypass detection (addressed in bug section)
- Template staleness monitoring
- AI hallucination detection
- Marketplace bias transparency
- Coverage "checkbox theater" prevention
- Performance degradation under load
- Export data sanitization

### Missing Technical Items

| Category | Gap | Priority |
|----------|-----|----------|
| Error States | Not comprehensive for all flows | High |
| Empty States | Partially defined | Medium |
| Loading States | Partially defined | Medium |
| Offline Support | Missing entirely | Low (post-MVP) |
| Caching Strategy | Mentioned but not specified | Medium |
| Rate Limiting | Mentioned but no implementation plan | High |
| Database Indexes | Many critical indexes missing | High |
| Analytics Implementation | Events defined but no tracking code | Medium |

---

## Recommended Actions

### Priority 1: Blocking (Do First)

1. **Fix RLS policy gap** - Add `foundry_id` to `blueprint_domain_coverage`
2. **Fix form accessibility** - Add all ARIA attributes to 02-ux-spec.md
3. **Fix table name inconsistency** - Global replace in 3 docs
4. **Add race condition handling** - Optimistic locking for coverage updates

### Priority 2: High (Before Implementation)

5. Fix Dialog size props and footer patterns
6. Clarify AI auto-approval rules in INDEX.md
7. Add JSONB validation constraints to migration
8. Update TypeScript types to match schema changes
9. Add timeout handling for AI tasks

### Priority 3: Medium (During Implementation)

10. Add comprehensive error/empty/loading states
11. Document rate limiting strategy
12. Add missing database indexes
13. Implement analytics tracking

### Priority 4: Low (Post-MVP)

14. Offline support
15. Template staleness monitoring
16. AI hallucination detection improvements

---

## Go/No-Go Assessment

**Current Status: CONDITIONAL GO** (spec docs ready, implementation has requirements)

**Completed:**
- [x] Fix all 8 critical design system violations (02-ux-spec.md)
- [x] Fix 2 critical consistency issues (table names, AI rules)
- [x] Add missing ARIA attributes for WCAG compliance

**Required Before Implementation:**
- [ ] Add `foundry_id` to `blueprint_domain_coverage` (migration)
- [ ] Add optimistic locking for race conditions (code)
- [ ] Add JSONB validation constraints (migration)
- [ ] Update TypeScript types to match schema

**Remaining effort:** 2-3 hours of implementation work (not spec fixes)

---

## Changes Made

- Created: `docs/blueprint/REVIEW_FINDINGS.md`
- Fixed: `docs/blueprint/02-ux-spec.md` (8 critical design violations)
- Fixed: `docs/blueprint/ORCHESTRATION.md` (table name)
- Fixed: `docs/blueprint/08-backlog.md` (table names)
- Fixed: `docs/blueprint/00-repo-assessment.md` (table name)
- Added: `docs/blueprint/INDEX.md` (AI Approval Rules canonical section)
