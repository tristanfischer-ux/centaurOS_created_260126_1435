# Agent Handover Document
**Date:** 2026-02-11
**Task:** Fix all technical debt identified in comprehensive codebase audit (30 items)
**Status:** Partially complete (Group 1 of 7 done)

---

## Context

A thorough codebase audit identified 30 issues across CRITICAL, HIGH, MEDIUM, and LOW severity. The work is organized into 7 groups, executed sequentially with full verification (`typecheck` + `build` + `test`) between each group. Group 1 (CRITICAL security fixes) is complete and verified. Groups 2-7 remain.

**IMPORTANT CONSTRAINT:** The user is actively working on the Forge page. Do NOT modify any files under `src/app/(platform)/the-forge/` or forge-related components/services.

---

## COMPLETED ✅

### Group 1: CRITICAL Security Fixes (6 items)

**1a. Removed `@ts-nocheck` from 4 files + regenerated Supabase types**
- Files modified: `src/actions/billing.ts`, `src/actions/money-map.ts`, `src/actions/pitch-prep.ts`, `src/app/api/webhooks/stripe/route.ts`
- Types regenerated: `src/types/database.types.ts` (cleaned CLI output artifacts)
- Type errors fixed in: `src/types/billing.ts` (7 interfaces updated for nullable DB columns), `src/actions/billing.ts` (2 runtime null checks), `src/actions/money-map.ts` (removed broken `getFoundryId` helper, replaced with `getFoundryIdCached`, fixed `MoneyMapSnapshot` type to use `Json`, added type guard), `src/actions/pitch-prep.ts` (split FK query into two separate queries, mapped team info to `Json`-compatible shape)
- Also fixed: `src/app/api/webhooks/stripe/route.ts` (moved `type` into `metadata` field for `sendNotification`)

**1b. Secured QA callback endpoint**
- File: `src/app/api/admin/qa-tests/callback/route.ts`
- Added `QA_CALLBACK_SECRET` Bearer token verification
- Rejects all requests if secret not configured (503)

**1c. Fixed webhook auth bypasses (2 endpoints)**
- `src/app/api/google/calendar/webhook/route.ts`: Changed from "skip if no secret" to "reject if no secret"
- `src/app/api/email/inbound/route.ts`: Same fix

**1d. Added auth + foundry isolation to `getTaskAssignees`**
- File: `src/actions/team.ts` (lines ~707-750)
- Added `supabase.auth.getUser()`, `getFoundryIdCached()`, and task-foundry verification

**1e. Added foundry isolation to `getPendingApprovals` and `triggerAIWorker`**
- File: `src/actions/tasks.ts`
- `getPendingApprovals`: Added `getFoundryIdCached()` and `.eq('foundry_id', foundry_id)` filter
- `triggerAIWorker`: Added foundry_id check and `.eq('foundry_id', foundry_id)` filter on task query

**1f. Added rate limiting to AI execution endpoint**
- File: `src/app/api/agents/execute/route.ts`
- Added `rateLimit('api', 'agent-execute:${user.id}', { limit: 30, window: 3600 })`

### Verification Results
- `npm run typecheck`: Zero errors in modified files (345 pre-existing errors in other files)
- `npm run build`: Successful (exit code 0, needs `NODE_OPTIONS="--max-old-space-size=8192"`)
- `npm run test`: 17/17 suites, 182/182 tests passing

---

## REMAINING TASKS 🔧

### Group 2: Structural Auth (withAuth migration)
**Problem:** ~100 action files duplicate the same 4-line auth boilerplate. `withAuth` wrapper exists in `src/lib/server-action-utils.ts` but only 5 files use it.
**Files to migrate (highest risk first):** `src/actions/tasks.ts`, `src/actions/team.ts`, `src/actions/orders.ts`, `src/actions/billing.ts`, `src/actions/messaging.ts`, `src/actions/marketplace.ts`, `src/actions/foundry.ts`, `src/actions/objectives.ts`
**Also fix:** `getOrCreateAutoTeam` in `team.ts` (line ~221) missing auth
**Approach:** Replace manual `createClient()` + `getUser()` + `getFoundryIdCached()` with `return withAuth(async ({ supabase, user, foundryId }) => { ... })`
**Reference:** See `src/actions/canvas.ts` for the good pattern

### Group 3: Type Safety (remove all `any`)
**Problem:** 52 uses of `any` across actions (25+), components (10), and lib/ (42). 30 of the lib/ occurrences are `(supabase as any)` that should resolve after type regeneration.
**Key files:** `tasks.ts:1469`, `foundry.ts:19`, `certifications.ts` (7 casts), `ratings.ts` (5 casts), `disputes/service.ts`, `badges/badge-rules.ts`, `google/tokens.ts`, `search/service.ts`, `ai-providers/slide-renderer.ts`
**Approach:** Fix with proper types, `unknown` + type guards, or typed helper functions

### Group 4: API Route Hardening
**Problem:** Missing rate limiting on 4 billing endpoints, `Math.random()` for filenames, 6 bare catch blocks, PII logging in Telegram webhook, duplicate dead code, missing Zod validation
**Files:** `billing/portal/route.ts`, `billing/checkout/route.ts`, `billing/test-activate/route.ts`, `settings/telegram/unlink/route.ts`, `messages/upload/route.ts`, `tasks.ts:162`, `orders.ts:408`, `guild-events.ts:546`, `data-export.ts:210`, `smart-goals.ts:130`, `generate-advisory-answer.ts:272`, `bot/telegram/route.ts:105`, `marketplace/compare/route.ts:178-190`

### Group 5: Code Deduplication
**Problem:** 13 duplicate `getInitials` functions, 3 duplicate `formatCurrency`, 2 duplicate `formatAmount`, duplicate routes (`/tasks` vs `/new-tasks`, `/objectives` vs `/new-objectives`)
**Approach:** Create shared utilities, consolidate routes (determine which to keep, redirect the other)

### Group 6: UI/UX Fixes
**Problem:** 2 Sheet usages (forbidden), 4 custom dialog widths, 11 direct Avatar usages, missing loading states on ~15 pages, ~245 hardcoded color violations (worst in agents/ directory), 12 console.log in production
**Key files:** `blueprints/[id]/blueprint-detail-view.tsx`, `tasks/thread-drawer.tsx`, `agents/components/node-inspector.tsx` (~70 violations), `agents/components/prompt-node.tsx` (~40), `blueprints/blueprints-view.tsx` (~35)

### Group 7: Documentation & Cleanup
**Problem:** Missing JSDoc on ~50+ exported functions, missing return types on ~60+, 16 TODOs without tickets, 4 SVG elements without keyboard accessibility, ~20 files with unstructured error logging, 4 unused variables
**Priority files:** `tasks.ts`, `team.ts`, `marketplace.ts`, `onboarding.ts`, `objectives.ts`, `StrategyRiver.tsx`

---

## USEFUL COMMANDS

```bash
# Typecheck (zero errors expected in modified files; 345 pre-existing in other files)
npm run typecheck

# Build (needs 8GB for this codebase)
NODE_OPTIONS="--max-old-space-size=8192" npm run build

# Unit tests (17 suites, 182 tests)
npm run test

# Design token check (for UI groups)
./scripts/check-design-tokens.sh

# E2E tests
npm run test:e2e
```

---

## QUICK START FOR NEXT AGENT

1. Read this document and `~/.memory/master-preferences.md`
2. Read the plan file: `~/.cursor/plans/fix_technical_debt_fd71f706.plan.md`
3. Start with **Group 2** (withAuth migration) -- the `withAuth` pattern is in `src/lib/server-action-utils.ts`
4. After each group, verify with: `npm run typecheck` + `NODE_OPTIONS="--max-old-space-size=8192" npm run build` + `npm run test`
5. **DO NOT touch** any files under `src/app/(platform)/the-forge/` or forge-related components -- user is actively working there
6. Reference `src/actions/canvas.ts` as the gold standard for the withAuth pattern
