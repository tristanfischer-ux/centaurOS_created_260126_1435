# Handover — Phase 4 Products build

**Date:** 2026-04-19
**Handoff from:** Prep terminal (schema + mockups + gap audit)
**Branch to create:** `feat/products-redesign`
**Status:** review locked — build-approved (locked autonomously 2026-04-19 per Tristan sign-off). Build terminal picks up AFTER Plan (Phase 3) merges to main.
**Picked up by:** Build terminal — after Forge PR #1.5/#2 + Money + Plan all merge
**Companion docs:** [`PRODUCTS-SCHEMA.md`](./PRODUCTS-SCHEMA.md) · [`PRODUCTS-MOCKUP-INDEX.html`](./PRODUCTS-MOCKUP-INDEX.html) · [`PRODUCTS-MOCKUP-GAP-AUDIT.html`](./PRODUCTS-MOCKUP-GAP-AUDIT.html) · [`SHARED-SCHEMA.md`](./SHARED-SCHEMA.md) · [`PHASE-PLAN.md`](./PHASE-PLAN.md) · [`COORDINATION-STATUS.md`](./COORDINATION-STATUS.md)

---

## Pickup command (fresh terminal)

```
cd "/Users/tristanfischer/Developer/CentaurOS created 260126 1435" \
  && cat COORDINATION-STATUS.md \
  && cat HANDOVER-products.md \
  && cat PRODUCTS-SCHEMA.md
```

Then open `PRODUCTS-MOCKUP-INDEX.html` and `PRODUCTS-MOCKUP-GAP-AUDIT.html` in the browser to orient on the surface. Start reading the 10 existing Products mockups top-to-bottom.

**DO NOT start building until:**
- Phases 1 (Forge), 2 (Money), and 3 (Plan) are merged to `main` with flags flipped on.
- `COORDINATION-STATUS.md` shows all three earlier phases = `merged to main`.

Products prep was locked autonomously 2026-04-19 (see §Locked decisions below). **Tristan sign-off step is DONE**; you do not need to wait on him for anything pre-build. The only remaining gate is sequential phase order.

Per PHASE-PLAN.md: **no parallel phase work.** If you open this and Plan isn't merged yet, stand down and wait. Check COORDINATION-STATUS.md state machine — you only claim Products when no earlier phase is in flight.

---

## What's ready for you (prep deliverables shipped)

The prep session landed four docs on `main`:

1. **`PRODUCTS-SCHEMA.md`** (canonical data model, ~450 lines) — 8 new tables (`hypotheses`, `market_sizings`, `competitors`, `customer_interviews`, `lois`, `assumptions`, `experiments`, `readiness_items`, `hypothesis_archive_reasons`, `hypothesis_migration_archive`), 9-role permissions matrix, event_log contract, full data-preservation plan for existing `products` rows, migration DDL sketch. **Read this before writing a single line of code.**
2. **`PRODUCTS-MOCKUP-INDEX.html`** — site-map of 10 built mockups + 8 flagged gaps, keyed to the 5-tab structure (Hypothesis · Market · Evidence · Economics · Action). Points to the 1393-line `FORGE-MOCKUP-PRODUCTS-V2.html` as the main surface.
3. **`PRODUCTS-MOCKUP-GAP-AUDIT.html`** — 18 gaps (6 MUST / 8 NICE / 2 DEFER) + 5 red-team critiques (2 critical / 2 high / 1 medium) + proposed 16-item build list + explicit V1-cuts list. **Tristan red-teams THIS. Build doesn't start until he replies `locked`.**
4. **This doc** (`HANDOVER-products.md`) — pickup command, prereq reading, open questions, first 3 build chunks, pitfalls.

---

## Prereq reading order (before writing code)

1. `COORDINATION-STATUS.md` — confirm Products is `build-approved`, and that Phases 1/2/3 are merged.
2. `PHASE-PLAN.md` §Phase 4 — scope and exit criteria.
3. `SHARED-SCHEMA.md` — especially §3 (project spine, PROMOTE_TO_FORGE), §5 (cross-cutting contracts, `target_unit_price` vs `unit_cost_ceiling` naming), §6 Q4 (9-role permissions matrix deferred work).
4. `PRODUCTS-SCHEMA.md` — the whole doc. §3 (data preservation) and §5 (PROMOTE_TO_FORGE handoff) and §6 (permissions) are the highest-risk sections.
5. `PRODUCTS-MOCKUP-GAP-AUDIT.html` — confirm the red-team items are addressed in the mocks Tristan red-teamed. If mocks changed since, reconcile.
6. The 10 existing Products mockups in sequence:
   - `FORGE-MOCKUP-PRODUCTS-V2.html` (main — 5 tabs)
   - `FORGE-MOCKUP-EMPTY-PRODUCTS-V2.html` (empty state)
   - `FORGE-MOCKUP-MARKET-SIZING.html`
   - `FORGE-MOCKUP-COMPETITOR-DETAIL.html`
   - `FORGE-MOCKUP-INTERVIEW-DETAIL.html`
   - `FORGE-MOCKUP-LOI-DETAIL.html`
   - `FORGE-MOCKUP-ASSUMPTION-TEST.html`
   - `FORGE-MOCKUP-READINESS-ACTION.html`
   - `FORGE-MOCKUP-PROMOTE-TO-FORGE.html`
   - `FORGE-MOCKUP-ARCHIVE-PRODUCT.html`
7. MemPalace drawer `forgeos/decisions` (search: "Products redesign red-team synthesis 2026-04-19") — the three red-team rounds that landed the current scope.
8. `PRODUCTS-RED-TEAM-TRACKER.md` — the 5-round red-team that already ran against the OLD products page. **Do not re-hit those issues.** Many of the UX rules Tristan codified (severity framing, empty-state copy, UUID validation, tab-bar a11y) apply to the new surface too.

Total: ~3000 lines of dense doc reading. Budget 60–90 minutes before first commit.

---

## What Phase 4 must ship

Reference: `PHASE-PLAN.md` §Phase 4. Summarised here with build-chunk ordering.

### Scope

1. Replace the Pre-Phase Coming Soon route guard at `/products/*`. Products routes now serve the real redesigned experience.
2. Remove the SOON badge from the Products sidebar item.
3. Products routes:
   - `/products` — list view (gap 1.1 mockup)
   - `/products/new` — hypothesis-create (gap 1.2 mockup with If/Then/Because grammar)
   - `/products/[slug]` — 5-tab detail (FORGE-MOCKUP-PRODUCTS-V2 surface)
   - `/products/[slug]/market` — Market tab
   - `/products/[slug]/evidence` — Evidence tab
   - `/products/[slug]/economics` — Economics tab
   - `/products/[slug]/action` — Action tab
4. Drill-ins:
   - `/products/[slug]/market/size` (MARKET-SIZING)
   - `/products/[slug]/market/competitors/[id]` (COMPETITOR-DETAIL)
   - `/products/[slug]/evidence/interviews/[id]` (INTERVIEW-DETAIL)
   - `/products/[slug]/evidence/lois/[id]` (LOI-DETAIL)
   - `/products/[slug]/evidence/assumptions/[id]/test` (ASSUMPTION-TEST)
   - `/products/[slug]/evidence/experiments/[id]` (gap 3.4 — NEW)
   - `/products/[slug]/action/readiness/[id]` (READINESS-ACTION)
5. State transitions:
   - `promoteToForge(hypothesisId)` — writes projects row + project_transitions row + event_log + audit_log; flips hypotheses.project_id and lifecycle_stage
   - `archiveHypothesis(hypothesisId, reasonId)` — ARCHIVE-PRODUCT
   - `unarchiveHypothesis(hypothesisId)` — NEW (gap 6.1)
6. Data migration: `migrate_products_to_hypotheses(foundry_id)` runs on flag-flip per foundry.
7. Today V3 Products panel starts populating from Products event_log entries (see §Today contract in PRODUCTS-SCHEMA.md).
8. Feature flag: `new_products_experience` (OFF during dev review; flipped ON per-user for Tristan's review, then for all users at cutover).

### Exit criteria (from PHASE-PLAN §Phase 4)

- All mockup pages rendered as real routes.
- Data migration runs cleanly for at least 2 test foundries (forge-guild + claude-test-foundry).
- Flag on → user sees new Products experience with their existing hypothesis data.
- Flag off → user sees Coming Soon bridge; any new data created in the new experience remains accessible via the bridge's legacy read-only view.
- Tristan approves on Vercel preview URL.
- Flag flipped on for all users.
- Coming Soon sidecar routes removed from `main`.
- This handover doc updated to state `merged — pipeline closed`.

---

## First 3 build chunks (suggested order)

This is the order that minimises blast radius per PR. Each chunk is its own branch-to-PR off `feat/products-redesign`.

### Chunk 1 · Schema foundation (PR #1)

**Goal:** land the 8 new tables + RLS + indexes + triggers behind the feature flag. No UI.

- Migration 1: `hypotheses` (with slug uniqueness, FK to foundries, FK to projects nullable, RLS policies from SHARED-SCHEMA §5.4 templates, `updated_at` trigger).
- Migration 2: `market_sizings` (with the hard CHECK constraint: `source_url IS NOT NULL OR methodology LIKE '%founder-estimate%'`).
- Migration 3: `competitors` (foundry-scoped, hypothesis-cascading).
- Migration 4: `customer_interviews` (same pattern).
- Migration 5: `lois` (same pattern).
- Migration 6: `assumptions` (with the RT2 CHECK: `status != 'valid' OR linked_experiment_id IS NOT NULL` — enforce at DB, not just server action).
- Migration 7: `experiments` (same pattern).
- Migration 8: `readiness_items` (with the RT1 CHECK: `status != 'closed' OR (evidence_ref IS NOT NULL AND jsonb_array_length(evidence_ref) > 0) OR status = 'not_applicable'`).
- Migration 9: `hypothesis_archive_reasons` + `hypothesis_migration_archive`.
- Migration 10: `migrate_products_to_hypotheses(p_foundry_id text)` SQL function (SECURITY DEFINER, idempotent, writes audit_log entries per row).
- Regenerate types: `NODE_OPTIONS="--max-old-space-size=8192" npx supabase gen types typescript --linked 2>/dev/null > src/types/database.types.ts`.
- Verify: `npx tsc --noEmit` clean (baseline pre-existing errors only).

**No UI ships with this PR.** Verification is: can a service-role client successfully insert a hypothesis + 12 readiness_items + a market_sizing with source_url, and fail to insert a readiness_item with `status='closed'` and empty `evidence_ref`.

### Chunk 2 · Server actions + route scaffolding (PR #2)

**Goal:** every server action + every new route exists, flag-gated off. All routes render a "Coming in Phase 4" stub if the flag is off (no regression for flag-off users).

- `src/actions/products/hypotheses.ts` — `createHypothesis`, `updateHypothesis`, `archiveHypothesis`, `unarchiveHypothesis`, `promoteToForge`. Each uses `withAuth({ requiredRole, foundryId })` per PRODUCTS-SCHEMA §6.2.
- `src/actions/products/market-sizings.ts` — `upsertMarketSizing` (singular — one per hypothesis).
- `src/actions/products/competitors.ts` — `addCompetitor`, `updateCompetitor`, `deleteCompetitor`.
- `src/actions/products/interviews.ts` — `logInterview`, `updateInterview`, `deleteInterview`.
- `src/actions/products/lois.ts` — `createLOI`, `updateLOI`, `markLOISigned` (writes event_log with urgency=high).
- `src/actions/products/assumptions.ts` — `createAssumption`, `updateAssumption`, `transitionAssumption(id, newStatus, linkedExperimentId?)`.
- `src/actions/products/experiments.ts` — `createExperiment`, `updateExperiment`, `decideExperiment(id, decision)`.
- `src/actions/products/readiness-items.ts` — `closeReadinessItem(id, evidenceRefs)` (enforces RT1), `reopenReadinessItem`.
- Route stubs under `src/app/(platform)/products/*` for every URL in §Scope above.
- Feature-flag helper wrapping every route: `if (!isNewProductsExperience(userId)) return ComingSoonPage`.
- Verify: `tsc --noEmit` clean + `npm run verify -- --static`.

### Chunk 3 · First real surface — list + detail hero (PR #3)

**Goal:** `/products` list view + `/products/[slug]` detail hero + Hypothesis tab populated, flag-gated on for Tristan's account only.

- `/products` list view — uses gap-1.1 mockup.
- `/products/[slug]` detail layout — 5-tab strip + breadcrumb + lifecycle meta-bar + Priya synthesis ribbon.
- Hypothesis tab content — one_liner, problem, target price, target COGS (with Forge-sourced banner if `project_id IS NOT NULL` per gap 4.1).
- Other 4 tabs render "under construction in PR #4/5" placeholders gated on `canonical_surface === 'products'`.
- **Flag flipped on for Tristan's account via Supabase** (NOT for claude-test, NOT for all users).
- Tristan opens Vercel preview, reviews the list + hypothesis tab + synthesis ribbon. No other tabs active yet.
- Screenshots in PR body. Tristan approves or requests changes.

Chunks 4–8 follow: Market tab · Evidence tab · Economics tab · Action tab · PROMOTE/ARCHIVE flows · data migration runner at flag-flip · cutover + Coming Soon route removal.

---

## Locked decisions (was: Open questions Tristan needs to answer)

**All seven locked autonomously 2026-04-19** per Tristan's verbal sign-off ("I don't really have a massive view on the issues which have been raised. Make the decisions."). Every answer resolves to the prep-draft's recommended default. Build terminal: proceed without reopening these. If you discover a reason to override during build, flag in PR body — Tristan can then course-correct via commit message.

| # | Question | **Locked decision** | Rationale |
|---|---|---|---|
| OQ1 | Composite score: killed entirely, or surface "% of readiness_items closed"? | **Killed entirely.** Show closed count ("7 of 12 closed") — no number ≤ 100. No colour-coded "readiness bar". | Numbers invite gaming. The Fundability composite was the problem; reintroducing ANY aggregate score recreates it. Counts answer the same question without the theatre. |
| OQ2 | `/products/legacy` routes lifetime after Phase 4 cutover? | **Keep for 30 days after flag-flip-on. Then redirect to new route and remove in follow-up PR.** | Rollback safety window. Founder with edge-case bug can read old data. After 30d steady-state, remove. Phase 4 PR #N (last chunk) includes both the removal and the redirect. |
| OQ3 | D/F/V tagging on assumptions? | **NOT in V1. Defer to Phase 4.5.** Re-evaluate after 4 weeks of real usage. If fewer than 30% of founders use the plain assumptions register, don't add more complexity. | Schema creep. Cheap to add later (3 nullable text columns). Expensive to remove if unused. |
| OQ4 | Stale-evidence readiness close: warning or block? | **Warning only. Do not block.** Pill copy: "this close relies on stale evidence — consider a fresh interview / LOI re-confirm." | Blocking is draconian. Founder may have good reason to keep citing an older LOI (e.g. buyer confirmed verbally, LOI refresh pending). Surface risk, let them decide. |
| OQ5 | `promoteToForge` auto-draft Forge Brief via Priya? | **Yes — async Priya draft fires on promote; founder edits on the Forge side.** Priya call is fire-and-forget; if it fails, Brief is empty and the Forge Brief page shows "Run Priya draft" button. | Saves founder ~20 min of typing. Matches specialist-output-attribution pattern. Async so a Priya failure doesn't block the promote. |
| OQ6 | Rollback banner on flag-flip-off? | **Yes.** Copy: *"Products has been rolled back temporarily. Your hypothesis data is preserved and available via /products/legacy. We'll be back shortly."* Banner dismissible, stored in localStorage. | Rollbacks are rare but transparency is cheap. Zero-regress-without-notice rule from CLAUDE.md. |
| OQ7 | Today dedup: `hypothesis_promoted_to_forge` + `brief_locked` within an hour — show both or collapse? | **Show both.** Different events with different semantics. | Promote = initiation; Brief-Lock = terminal gate. Founder wants to see both happen, not a collapsed "promoted + locked" event that hides the two-step commitment. Today urgency on both = medium; decay 1d + 30d respectively. |

---

## Pitfalls learned during prep (do not repeat)

These are mistakes/near-misses from the prep session that would bite the build terminal if not flagged:

1. **Existing `products.id` is a `uuid`; `foundries.id` is `text`.** FK columns on new tables MUST match types exactly. SHARED-SCHEMA §1.1 spells this out but it's easy to miss. `hypotheses.foundry_id` is `text NOT NULL`. `hypotheses.id` stays `uuid` and matches existing `products.id` 1:1 for URL compatibility.

2. **`target_cogs_pence` is read-only when `project_id IS NOT NULL`.** Not just a UI rule — the server action must refuse writes. This is where Forge vs Products ownership boundaries live. If you regress this, Economics tab becomes a lie.

3. **Never embed `/api/today-feed` subscription inside the Products tab layout.** That's Today's concern. Products writes event_log rows; Today reads them via the hook that was mounted in Phase 1 PR #1.

4. **The `ARCHIVED` state is soft — `hypotheses.archived_at IS NOT NULL`, NOT a row delete.** Every RLS policy and server action must filter on `archived_at IS NULL` by default. Archive-visible views explicitly opt in.

5. **Slug generation must dedupe per foundry.** `unique (foundry_id, slug)` in schema. On create, if collision: append `-2`, `-3`, etc. Don't use timestamp suffixes — ugly URLs.

6. **Priya's voice rule (`src/lib/specialists/personalities/product-lead.ts`).** Priya is the Product specialist. Her briefings must follow the voice-sandwich pattern (bold opener → body with SO WHAT lines → action close). CLAUDE.md §Specialist Configuration Protocol is load-bearing. Do NOT regress her baseline 4.37 composite score when changing her prompts — run the benchmark suite first.

7. **Concurrent-agent git staging race (per MEMORY.md feedback).** Another agent may be working on `main` while you're building. Use `git commit --only <specific files>` rather than `git add -A`. Always verify `git show HEAD --stat` after committing to confirm your scope landed.

8. **`"use server"` files can ONLY export async functions.** Don't add `export const maxDuration = 300` to a server-actions file — it'll break the whole module. Route segment config goes in the page file.

9. **Vercel Preview deploys need env vars.** Phase 1 PR #1 added `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` to the Preview scope. Don't regress those when adding new routes.

10. **Don't bundle the migration runner with the flag-flip.** Run it as its own server action Tristan explicitly triggers per-foundry, not as a side effect of flipping the flag. Two separate steps = safer rollback.

11. **The `products` table stays alive forever.** The migration is additive. The old table is preserved as an audit trail; the new tables are where writes go. Do not add `DROP TABLE products` to any migration, ever.

12. **9-role enum expansion is deferred to its own PR.** Phase 4 ships against the current 5-role enum (`Founder / Executive / Apprentice / AI_Agent / Supplier`). Permission matrix in PRODUCTS-SCHEMA §6 collapses the 9 rows onto the 5 enum values — document it in-code so future reviewers see the mapping.

---

## Git state at handoff

```
main: (Forge PR #1 merged at 000be5b3, PR #1.5 WIP on feat/forge-visual-rebuild)
Not yet created: feat/products-redesign
```

The prep session committed:
- `PRODUCTS-SCHEMA.md`
- `PRODUCTS-MOCKUP-INDEX.html`
- `PRODUCTS-MOCKUP-GAP-AUDIT.html`
- `HANDOVER-products.md`

Under one commit. No code changes. No branch creation. Docs-only landing to `main`.

**First build action (AFTER Tristan replies `locked`, AFTER Plan merges):**
```
git checkout -b feat/products-redesign
# Read COORDINATION-STATUS.md to confirm you're next
# Start Chunk 1 (schema foundation)
```

---

## Tasks state at handoff (prep)

- ✅ PRODUCTS-SCHEMA.md — schema + permissions + migration + Today contract
- ✅ PRODUCTS-MOCKUP-INDEX.html — site map of built mocks + gap flags
- ✅ PRODUCTS-MOCKUP-GAP-AUDIT.html — 18 gaps + 5 red-team + 16-item build list + V1 cuts
- ✅ HANDOVER-products.md — this doc
- ✅ COORDINATION-STATUS.md — Products row updated to `prep shipped — awaiting review`
- ✅ MemPalace drawer `forgeos/decisions` — Products prep complete summary filed
- ⏳ Tristan red-teams `PRODUCTS-MOCKUP-GAP-AUDIT.html` and replies `locked`

---

## After this phase ships — DO NOT STOP

Per PHASE-PLAN.md and COORDINATION-STATUS.md §Pipeline rules:

- Products is **the last phase**. When Phase 4 merges to `main` with flag flipped on for all users:
  1. Update `COORDINATION-STATUS.md` to `redesign complete — pipeline closed`.
  2. Write a final MemPalace drawer in `forgeos/decisions` summarising the full 4-phase run.
  3. Notify Tristan via iMessage.
  4. Close out `feat/products-coming-soon` sidecar branch (if still active).
  5. Session may end.

No fifth phase. No auto-kickoff of other work.
