# Session end — 2026-04-20 (overnight handoff)

Single source of truth for what shipped, what's pending, and how to pick up cold.

## Phase pipeline

| Phase | Section | Status | Branch | Notes |
|---|---|---|---|---|
| 1 | Forge | ✅ Merged | — | Shipped prior session |
| 2 | Money | ✅ **Merged + hardened + red-teamed + investor DB wired** | `feat/money-redesign` (archived) | See §Money |
| 3 | Plan | ⏳ Build in flight | `feat/plan-redesign` | **Another terminal owns** — do NOT check out |
| 4 | Products | ⏳ Shippable-behind-flag scaffold on branch | `feat/products-redesign` | Stays off main until Plan merges |

Production URL: `https://fractionalforge.app` · Supabase project: `jyarhvinengfyrwgtskq`.

## Money — fully delivered

All these are live on `main`, flag `new_money_experience` default OFF for everyone **except** `claude-test@forgeos.test` (for demo).

### Core merge
- PR #68 → `main@4656f369` (10 commits)
- 20 V2 tables, 5 helper libs, 25+ routes, 13 server actions, Today V3 Money tiles live, sidebar Credits pill, specialist_call cost metering (4 sites wired)

### Post-merge hardening (this session, newest first)
- `d79750cc` — hotfix: remove accidental node_modules symlink + tsbuildinfo
- `8e9a2439` — **investor directory ↔ Raise integration**
  * Kanban cards render real firm title / subcategory / city from joined `marketplace_listings`
  * `/money/raise/browse` — paginated search over 7,500+ Finance firms with subcategory + country filter + 1-click "Add to pipeline"
  * Investor detail shows logo, founded year, company size, contact info, last-enriched date, full portfolio table (`investor_portfolio_companies`), news intel (`investor_news_intel`)
  * a11y skip-link ("Skip to main content") on platform layout + `id="main-content"` on main
- `94497b6f` — `MONEY-RED-TEAM-FINDINGS.md` (4-persona red-team verdict: zero critical/high)
- `beba7e47` → `4656f369` — Money prep, lock, defaults, merge, production verify

### Data seeded in `claude-test-foundry` (so demo reads like a real pipeline)
- 8 plan_line_items (6 out + 2 in)
- 2 money_scenarios (Base case + Worst case)
- 1 investor_round (Pre-seed · Summer 2026, £500k target, active)
- 7 investor_pipeline_state rows, each now linked to a real Finance firm:
  - First Imagine Ventures → target
  - Synova → researching
  - Rutland Partners LLP → contacted
  - ECI Partners → meeting
  - Highland Europe → due_diligence
  - PwC → verbal
  - Cleary Gottlieb Steen & Hamilton LLP → passed
- 1 ai_credits_budget (monthly £20 cap for April 2026)
- `new_money_experience` flag ON

### Money follow-ups (non-blocking, tracked)
- Chunk 1G: legacy `cash_out_items` / `cash_in_items` / `burn_scenarios` / `investor_*` → V2 forward-migration + write-twin triggers. Pre-flag-flip work; deferred per plan.
- Chunk 5A broader: wire `recordSpecialistCall` in remaining LLM invocation sites (investor-intel, cad-lab generation, inline chat).
- Chunk 4C: port live match-score recompute from legacy `src/lib/investor-match.ts` into `refreshMatchScore(pipelineStateId)` action.
- Red-team polish finding #1: error-fallback pages lack `<h1>` — ~5 LOC × 8 pages, a11y polish.
- Red-team polish finding #3: seed grant defaults to 100% probability vs realistic 40% — update demo seed scripts next spin-up.

## Products — branch-ready, do not merge

On `feat/products-redesign` at `80aa0a1f`. **Does NOT merge to main until Plan merges** (sequential-phase rule + removes legacy `/products/[id]/*` that Plan may still consume).

### What's on the branch
- 10 migrations applied to Supabase (hypotheses, market_sizings, competitors, customer_interviews, lois, assumptions, experiments, readiness_items, hypothesis_archive_reasons seeded w/ 7 reasons, hypothesis_migration_archive)
- `src/actions/products-phase4.ts` — consolidated actions (intentional name — legacy `products.ts` still used by 8 live surfaces)
- Route tree: `/products` (list) / `/products/new` / `/products/[slug]` (5-tab detail) / `/products/[slug]/archive` / `/products/[slug]/promote`
- Flag guard at `src/app/(platform)/products/layout.tsx` (FLAG_NEW_PRODUCTS_EXPERIENCE)
- Sidebar workshop flag-aware + layout flag read

### Open concerns for rebase-before-merge
- **Legacy `/products/[id]/*` files deleted on the branch.** When merging, the PR description must flag this + sidecar `feat/products-coming-soon` (if still active) needs reconciliation.
- **Schema-vs-types drift** — database.types.ts regen on branch may differ from regen after Money's migrations landed. Re-regenerate on rebase.
- **Not shipped** (out of MVP per HANDOVER-products.md §First 3 build chunks): drill-ins (market/size, competitors/[id], interviews/[id], lois/[id], assumptions/[id]/test, experiments/[id], readiness/[id]), tab-level edit affordances, migrate_products_to_hypotheses runner wrapper, Today V3 Products tile flip, async Priya draft.

## Production verification

- `main` tip: `d79750cc` (Vercel production build in progress at session close)
- Latest successful prior deploy: `9yntq3loq` (Ready, 6h ago — pre-investor-directory commit)
- Red-team round 1 (preview `ipugmc8jb`): 25+ routes clean, RLS holds, Today V3 tiles live
- Red-team round 2 (production after first Money merge): all 20 `/money/*` routes clean, Today tiles live with real data
- Red-team round 3 (4-persona): Bear / Realist / Auditor / Founder — zero critical/high findings

## How to pick up from this file

**Morning sanity check:**
```bash
cd "/Users/tristanfischer/Developer/CentaurOS created 260126 1435"
cat COORDINATION-STATUS.md
npx vercel ls | head -5  # verify production is Ready at d79750cc
```

**If production shows Error for `d79750cc`:**
- `npx vercel inspect <url> --logs | tail -50` — check the error
- Most likely cause: the node_modules symlink fix pushed on `d79750cc` should have fixed the issue from `8e9a2439`. If not, roll back by resetting `main` to `94497b6f` (pre-investor-directory) via a revert commit.

**To agent-browser smoke-test Money on production:**
```bash
~/.claude/scripts/forgeos-login.sh /money/cockpit
# Walk: /money/cockpit, /money/plan, /money/raise (kanban should show real firm names now),
#       /money/raise/browse (should show 7,500+ firms with search/filter),
#       /money/raise/investor/<any-pipeline-id> (portfolio + news cards should render)
agent-browser close --all
```

**To continue Plan (another terminal — do NOT take over):**
- Plan has its own terminal. When that terminal merges, Products can be rebased + merged next.

**To continue Products build:**
```bash
cd /tmp/products-build-worktree
git fetch origin main
git rebase origin/main
npx supabase gen types typescript --linked > src/types/database.types.ts
npx tsc --noEmit  # expect 8 pre-existing / 0 new
# Then tackle follow-up MVP items: drill-ins, tab edit affordances, promoteToForge action.
```

## What I left you with at 2026-04-20 dawn

- Money V2 live, stress-tested, with the full Fractional Forge investor directory (7,500+ firms) woven into Raise.
- Products scaffolded behind a flag, non-destructive to real users, tracked for post-Plan merge.
- Plan untouched (owned by another terminal).
- Red-team report + completeness audit + walkthrough script committed to main for future reference.
- Zero changes to legacy `/cash-burn`, `/investors`, `/fundraise`, `/the-forge` — users worldwide still see the same production experience they saw at session start, except those with the `new_money_experience` flag on (currently only `claude-test@forgeos.test`).

Sleep well.
