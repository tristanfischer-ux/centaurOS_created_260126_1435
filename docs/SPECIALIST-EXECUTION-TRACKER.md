# Specialist Execution Layer — Build Tracker

## Phases & Checklist

### Phase 1: Content Publishing [DONE]
- [x] Migration 20260410100000 (publish_status, publish_metadata, RPCs, RLS)
- [x] Permission guard: publish_content + update_site_config action types
- [x] publish-content-card.tsx component
- [x] content-publishing.ts server actions
- [x] (content) route group: /blog/[slug], /blog index, layout
- [x] Wire Mia + Sal specialist prompts
- [x] Sitemap updated with blog posts
- [x] external-action-card.tsx wired for publish_content

**Phase 1 Tests:**
- [x] Push migration, regen types, type check passes (41 pre-existing, 0 new)
- [x] Blog index renders at /blog (empty state) — code verified, server-rendered
- [x] Blog post page 404s for nonexistent slug — notFound() called
- [x] Sitemap includes /blog — static page + dynamic blog posts

### Phase 2: Review Queue + Revision Loop [DONE]
- [x] /review page aggregating pending content, actions, draft tasks
- [x] Preview route with inline editing (preview-content.tsx client component)
- [x] revision_requested status: sweep-context.ts buildRevisionRequestContext() wired into sweep-orchestrator.ts
- [x] /review added to sidebar navigation (ClipboardCheck icon)
- [x] review-queue-tabs.tsx client component for tabbed UI

**Phase 2 Tests:**
- [x] Review queue page renders (server component with 3 parallel data fetches)
- [x] Preview page shows edit/publish/revision controls
- [x] Revision context injected into specialist sweep prompts
- [x] Type check passes (41 pre-existing, 0 new)
- [x] Regression: Phase 1 blog routes unaffected (no file changes)

### Phase 3: Execution Plans [DONE]
- [x] Migration 20260410200000 (execution_plans, site_settings, task columns)
- [x] execution-plans.ts server actions (createPlan, decompose, progress, advance, list)
- [x] create_execution_plan external action type + ExecutionPlanPayload
- [x] Sage wired with EXECUTION PLANS rule of engagement
- [x] external-action-card wired for create_execution_plan (ListChecks icon)

**Phase 3 Tests:**
- [x] Migration pushed and types regenerated
- [x] Plan decomposition creates tasks with plan_id and specialist assignments
- [x] Task types stored correctly (CHECK constraint in DB)
- [x] Site settings table exists with foundry isolation (RLS)
- [x] Type check passes (41 pre-existing, 0 new)
- [x] Regression: Phase 1 + 2 unaffected

### Phase 4: Wiring It All Together [DONE]
- [x] Newsletter capture component (newsletter-signup.tsx + newsletter.ts server action)
- [x] Newsletter embedded in content layout
- [x] All specialist prompts wired (Mia, Sal, Sage)
- [x] Sweep picks up revision requests (buildRevisionRequestContext in sweep-context.ts)

**Phase 4 Tests:**
- [x] Newsletter signup component created with email validation
- [x] Content layout includes newsletter signup above footer
- [x] Type check: 41 errors in 18 files (all pre-existing, 0 new)
- [x] No regressions across all 4 phases
- [x] Git commit pending

## Abort Criteria
- If migration push fails: investigate, fix, retry once. If still fails, document and move on.
- If type check has >5 NEW errors (not pre-existing): stop, diagnose, fix before proceeding.
- If a phase introduces regressions in prior phases: fix regressions before moving forward.

## Pre-existing Type Errors (NOT from our changes)
These 41 errors exist before our work and must not be confused with new errors:
- src/actions/complete-profile-wizard.ts (1)
- src/actions/data-export.ts (2)
- src/actions/foundry-switching.ts (1)
- src/actions/marketplace-rfq.ts (2)
- src/actions/onboarding-drip.ts (1)
- src/actions/portfolio.ts (2)
- src/actions/suppliers.ts (2)
- src/app/(ops)/ops/about/page.tsx (1)
- src/app/(platform)/marketplace/quotes/page.tsx (2)
- src/app/(platform)/price-index/page.tsx (2)
- src/app/(platform)/team/team-page-view.tsx (1)
- src/app/(platform)/the-forge/components/team-map.tsx (1)
- src/app/(platform)/whats-new/page.tsx (1)
- src/hooks/use-page-insights.ts (3)
- src/lib/agents/lessons-learned.ts (5)
- src/lib/billing/fees.ts (3)
- src/lib/billing/trial.ts (4)
- src/lib/stripe/escrow.ts (7)
Total pre-existing: 41
