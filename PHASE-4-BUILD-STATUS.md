# Phase 4 Products — Build Status (post-compaction anchor)

**Date:** 2026-04-20
**Purpose:** Single source of truth for ANY fresh session (including the one after `/compact`). Read this first.
**Supersedes:** The "sidecar lifted" banner in `STATE-OF-PRODUCTS.md` — that was reverted. Current state is sidecar RESTORED, Phase 4 real build in progress.

---

## TL;DR

1. **Production is locked behind Coming Soon.** `/products` → Coming Soon bridge; `/products/[id]` → 307 middleware redirect to `/products/legacy/[id]`; `/products/legacy/*` → read-only view of v1 data. Users are safe while the real Phase 4 is built.
2. **Phase 4 real build is IN PROGRESS** on branch `feat/products-redesign` (commit `0a3f469b`). Not merged. Scaffold + route stubs + 9 server-action stubs (all throw `not yet implemented`) + 10 migrations.
3. **Production DB is ready.** All 10 Phase 4 tables applied cleanly (hypotheses, market_sizings, competitors, customer_interviews, lois, assumptions, experiments, readiness_items, hypothesis_archive_reasons, hypothesis_migration_archive). RLS enabled, CHECK constraints active, 0 rows.
4. **Global CLAUDE.md has a new MANDATORY rule** at line 25: mockup-faithful build. Every production page MUST match its mockup section-by-section. Parity gate via agent-browser screenshot diff. "Inspired by the mockup" is not acceptable. 8 mockup-faithful pages beat 30 scaffolds.
5. **Waiting on Tristan to answer 3 questions** before building:
   - (a) Which page first — list view (entry point) or 5-tab detail view (highest value)?
   - (b) Server-action sequencing — per-page as needed or all server actions first?
   - (c) Create `PRODUCTS-V2-BUILD-TRACKER.md` for the per-page parity `✓/⚠` log?

---

## Production main commits (relevant today)

| Commit | State |
|---|---|
| `f4c15bb7` + others | Unrelated (Forge sidebar fix by another terminal, etc.) |
| `7133f1bc` | **Revert of "unhide Products" — sidecar restored, current user-facing state** |
| `330fcce0` | (REVERTED) had lifted the sidecar; undone |
| `d3ccb6b7` | Middleware moved to `src/middleware.ts` (activates deep-link redirect) |
| `1d4d88b7` | (Earlier) Coming Soon sidecar merged |

**Branch `feat/products-redesign`** at `0a3f469b`: Phase 4 scaffold, rebased onto main, 10 migrations renumbered `20260424010000–100000` + 9 action modules (stubs) + 14 route stubs + readiness template + type shapes.

---

## Files a post-compaction session should read

**Must read first:**
1. **THIS FILE** — current state
2. `~/.claude/CLAUDE.md` — global rules (auto-loaded) — especially the mockup-faithful rule at line 25
3. `~/.claude/projects/-Users-tristanfischer/memory/MEMORY.md` — auto-loaded session memory
4. MemPalace drawer `drawer_forgeos_decisions_4591f9e1ae3db653` — the session pivot narrative

**Reference / design:**
- `PRODUCTS-SCHEMA.md` — canonical data model, locked decisions, RT1/RT2 constraints
- `PRODUCTS-MOCKUP-INDEX.html` — index of all 16 mockups (browser)
- `PRODUCTS-MOCKUP-GAP-AUDIT.html` — 18 gaps + 5 red-team + V1 cuts
- `HANDOVER-products.md` — original Phase 4 pickup doc
- `STATE-OF-PRODUCTS.md` — HISTORICAL ONLY. Its "sidecar lifted" banner was reverted. Current state is THIS file.

**Mockups (16 files, filesystem-only, open in browser):**
- `FORGE-MOCKUP-PRODUCTS-V2.html` — 1393-line 5-tab detail view (the main surface)
- `FORGE-MOCKUP-PRODUCTS-LIST.html` — list view
- `FORGE-MOCKUP-EMPTY-PRODUCTS-V2.html` — empty state
- `FORGE-MOCKUP-HYPOTHESIS-CREATE.html` — If/Then/Because form
- `FORGE-MOCKUP-MARKET-SIZING.html`, `-COMPETITOR-DETAIL.html`
- `FORGE-MOCKUP-INTERVIEW-DETAIL.html`, `-INTERVIEW-CREATE.html`
- `FORGE-MOCKUP-LOI-DETAIL.html`
- `FORGE-MOCKUP-ASSUMPTION-TEST.html`
- `FORGE-MOCKUP-EXPERIMENT-DETAIL.html`
- `FORGE-MOCKUP-READINESS-ACTION.html`
- `FORGE-MOCKUP-PROMOTE-TO-FORGE.html`, `-ARCHIVE-PRODUCT.html`, `-UNARCHIVE.html`
- `FORGE-MOCKUP-PRODUCTS-LEGACY.html`

---

## Mockup-faithful build protocol (per the new global rule)

For EACH page I build:

1. **Open the mockup file** with Read. It stays in my context.
2. **Open the target TSX** with Read.
3. **Port top-to-bottom.** Section-by-section. Every `<section>`, card, stat tile, button, sidebar item, tab from the mockup gets a direct React equivalent. Copy matches exactly — no paraphrase.
4. **Write the server action(s)** this page needs to render real data. Use `withAuth` + foundry scoping + audit_log writes per PRODUCTS-SCHEMA.
5. **Feature-flag-gate the route** behind `new_products_experience` so it only renders for Tristan's claude-test account during build.
6. **Parity gate before marking the page done:**
   - `agent-browser open file:///path/to/FORGE-MOCKUP-NAME.html --headless --viewport 1440x900`
   - `agent-browser screenshot /tmp/mockup-<page>.png`
   - `agent-browser open <vercel-preview-url>/products-v2/<page> --headless --viewport 1440x900` (authenticated via forgeos-login.sh)
   - `agent-browser screenshot /tmp/prod-<page>.png`
   - Visual diff. Log `Mockup parity: ✓` or `⚠ <diffs>` in `PRODUCTS-V2-BUILD-TRACKER.md`.
   - ⚠ entries must be fixed SAME session before moving on.
7. **Self-check before commit:** "If Tristan opens this URL right now, will he see what the mockup shows him?" If no → STOP.

**Banned:**
- Empty Card shells where the mockup shows populated grids
- Coming-soon placeholder copy where the mockup shows real content
- Paraphrased copy
- Single-panel page where mockup shows tabs
- Scaffold calling itself a "V1"

**"Finish" means page-to-mockup parity before next.** 8 mockup-faithful pages + handover of 22 remaining beats 30 scaffolds.

---

## DB state (verified 2026-04-20)

| Table | Columns | Rows | RLS | Notes |
|---|---:|---:|:---:|---|
| hypotheses | 23 | 0 | ✓ | RT4 grammar columns (if_change/then_impact/because_assumption NOT NULL) + Q6 traction_explainer |
| market_sizings | 15 | 0 | ✓ | UNIQUE(hypothesis_id); CHECK source_url OR methodology LIKE '%founder-estimate%' |
| competitors | 13 | 0 | ✓ | tags text[] |
| customer_interviews | 14 | 0 | ✓ | |
| lois | 14 | 0 | ✓ | status enum draft/sent/signed/declined |
| assumptions | 10 | 0 | ✓ | RT2: CHECK status != 'valid' OR linked_experiment_id IS NOT NULL |
| experiments | 13 | 0 | ✓ | decision keep/iterate/kill |
| readiness_items | 12 | 0 | ✓ | RT1: CHECK status != 'closed' OR evidence_ref non-empty OR status = not_applicable |
| hypothesis_archive_reasons | 7 | 0 | ✓ | |
| hypothesis_migration_archive | 6 | 0 | ✓ SELECT only | SECURITY DEFINER writes only |

**Migration runner `migrate_products_to_hypotheses(text)` installed** — invoked per-foundry at flag-flip time. Not yet fired. `products` table untouched — will migrate 1:1 by id when ready.

**`src/types/database.types.ts` is STALE** — does not yet include the 10 new tables. Regenerate via `NODE_OPTIONS="--max-old-space-size=8192" npx supabase gen types typescript --linked 2>/dev/null > src/types/database.types.ts` BEFORE writing server actions that use `supabase.from('hypotheses')` etc.

---

## 3 open questions for Tristan (answered → I proceed)

**Q1. Which page first?**
- Option A: `/products-v2` list view — entry point. Medium complexity. Mockup at `FORGE-MOCKUP-PRODUCTS-LIST.html` (640 lines).
- Option B: `/products-v2/[slug]` 5-tab detail — highest-value single surface. Large. Mockup at `FORGE-MOCKUP-PRODUCTS-V2.html` (1393 lines).

**Q2. Server-action sequencing?**
- Option A: per-page as needed — write `listHypotheses` when building list, etc. Faster to first shipped page.
- Option B: all 9 action modules real first, then UI — no front-end blockers later, but no visible progress until action work is done.

**Q3. Tracker?**
- Create `PRODUCTS-V2-BUILD-TRACKER.md` with per-page rows + parity `✓/⚠` log + screenshot paths.

---

## What a post-compaction session should do

1. Read this file + global CLAUDE.md + MEMORY.md
2. Check git state: `git log origin/main --oneline -5` + `git log origin/feat/products-redesign --oneline -3`
3. Check MemPalace: `mempalace_search` for "Phase 4 Products" with `wing: forgeos`
4. Wait for Tristan to answer Q1/Q2/Q3 OR ask him to confirm
5. When answered — create a worktree for `feat/products-redesign`, regenerate types, start building mockup-faithfully with the parity-gate discipline

**Do NOT:**
- Merge `feat/products-redesign` to main until real pages are mockup-parity-verified
- Lift the Coming Soon sidecar until Phase 4 pages are verified working
- Ship scaffolds that don't match the mockups
- Drop or modify any of the 10 new Phase 4 tables (they're clean + production-ready)

**Sidecar can be reverted any time via** `git revert 7133f1bc` if you need to switch direction — but do NOT do that without explicit sign-off from Tristan.
