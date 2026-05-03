# Search-Quality + Universe-Parity Tracker — 2026-04-28

> Per CLAUDE.md rule on tracking documents for autonomous work. All 6 phases shipped + verified live.

## Trigger

Tristan, 2026-04-27 morning:
1. *"Quality of the search results seems to be going down… showing zero results or only a few results and the results showing are a few percentage match points rather than 80% Match or 90% Match."*
2. *"Why is the number of Investors in fractional Forge.app different from what we currently have in the main database? … We should stop having different databases with different information."*
3. *"You have not mentioned anything about the suppliers. How accurate is that?"*

## Success criteria — ALL MET

| # | Criterion | Met? | Evidence |
|---|---|---|---|
| S1 | ForgeOS Finance count ≥ 10K (matches "real investors" universe in local SQLite) | ✓ | 11,970 forge_capital rows in `marketplace_listings` (was 8,066) |
| S2 | All Services + Products rows have embeddings | ✓ | 15,121 / 15,121 + 4,807 / 4,807 |
| S3 | Finance rows have embeddings (modulo truly-empty stubs < 50 chars) | ✓ | 11,538 / 12,021 — remaining 483 are skipped-by-design |
| S4 | THESIS pillar > 0 on free-text queries | ✓ | I1 BESS-trucks: 0 → 45-58 across rows |
| S5 | Headline composite % ≥ 65 on strong-match queries | ✓ | I1 composite **76-77%** (was 38-50%); S1 supplier top scores **65-77%** |
| S6 | Cumulative session cost ≤ £0.50 (per cost-discipline rule) | ✓ | ~£0.01 in OpenAI embeddings, £0 frontier-model spend |

## Phases — all shipped

### Phase 1 — Universe parity (count gap) ✓
`research/13-push-forgeos.js:80` — `MIN_QUALITY_SCORE = 3 → 0`. Push backfilled 10,729 investors. ForgeOS Finance now 11,970 forge_capital rows.

### Phase 2 — NULL-embedding sweep ✓
`research/13b-embed-null-finance.mjs` (new). Embedded Services 1,256 + Products 3 + Finance 3,272. Total cost $0.01.

### Phase 3 — THESIS-pillar fix (commits c90f7406 + earlier) ✓
`calculateMatchScore(firm, profile, similarity?)` — thesis pillar now `MAX(structured, cosine × 100)`. `computeMatchScores(ids, similarities?)` accepts the map. UI callers pass it. Verified THESIS rose 0 → 45-58.

### Phase 4 — Composite-total fix (commit 7dc1cfe7) ✓
`breakdown.total` thesis points = `MAX(sectorScore + thesisBonus, cosine × 35)`. Verified composite rose 38-50% → 76-77%.

### Phase 5 — Verification (browser screenshots) ✓
Shots saved at `~/Downloads/forgeos-search-shots-2026-04-27/`:
- `I1-bess-trucks-AFTER.png` — pre-Phase-3
- `I1-bess-trucks-VERIFIED.png` — post-Phase-3 (THESIS fixed, composite still ~38%)
- `I1-bess-trucks-FINAL.png` — post-Phase-4 (composite 76-77%)
- `S1-cnc-aerospace-AFTER.png` — post-Phase-6 (suppliers fixed)

### Phase 6 — Supplier search upgrade (commit f61f9c7d) ✓
`src/actions/suppliers.ts`:
- `match_threshold` 0.3 → 0.0 (parity with investor side)
- `match_count` ~70 → 250 per category × 2 = 500 effective
- v1 RPC → v2 with category filter at DB layer (`Promise.all([v2(Services), v2(Products)])`)
- Verified S1 CNC aerospace UK: 415 results, top 77/70/68/67/65%, on-target supplier names.

## Files touched (load-bearing)

- `research/13-push-forgeos.js` — quality-gate dropped to 0
- `research/13b-embed-null-finance.mjs` — NEW, embeds NULL-embedding rows by category
- `src/lib/investor-match.ts` — similarity fallback in pillar AND total
- `src/actions/investors.ts` — `computeMatchScores` accepts similarities
- `src/actions/suppliers.ts` — v2 migration + threshold + count
- `src/app/(public-investors)/investors/components/InvestorDeckSearchClient.tsx` — passes similarities
- `src/app/(platform)/investors/components/InvestorBrowser.tsx` — passes similarities

## Cost ledger

| Line | Amount |
|---|---|
| OpenAI text-embedding-3-small (Services + Products + Finance) | ~$0.013 |
| Frontier-model calls (Opus / Sonnet / Gemini-Pro / GPT-5.5) | $0 |
| Vercel | $0 (within free tier) |
| **Total** | **~£0.01** |

## Score card

| Metric | Before | After | Change |
|---|---|---|---|
| ForgeOS Finance row count | 8,264 | 12,021 | +45% |
| ForgeOS Finance forge_capital subset | 8,066 | 11,970 | +48% |
| Services rows with embedding | 13,864 / 15,123 | 15,121 / 15,121 | full coverage |
| Products rows with embedding | 4,804 / 4,807 | 4,807 / 4,807 | full coverage |
| I1 BESS-trucks composite (top match) | ~53% | **77%** | +24pp |
| I1 BESS-trucks THESIS pillar (top match) | 0 | **56** | from broken to working |
| S1 CNC aerospace top match score | n/a (broken) | **77%** | working |
| S1 total results returned | very few | 415 | working |

## Lessons learned (filed in MemPalace)

- Two-step `searchInvestors` → `computeMatchScores` UI pattern decouples ranking from displayed pillars (forgeos/gotchas)
- Vercel production-tracking branch is `engine-fixes-wip`, lives in worktree at `/private/tmp/forgeos-engine-fixes` (forgeos/gotchas)
- Three-place scoring split on engine-fixes-wip: server `_fcComposite`, server `computeMatchScores`, UI card layout (forgeos/gotchas)
- JSON-array contamination + 60×-larger-than-visible failure pattern (forge_capital/gotchas)
- FCA `/Permission` (singular) silent-200 trap; correct endpoint is `/Permissions` (plural) (forge_capital/fixes)
- ForgeOS investor count = local SQLite minus (govt_grant + is_investor=0); no quality gate at push layer (forgeos/decisions)
- Monthly-refresh architecture pattern (forge_capital/decisions)

## Status

**Done.** All success criteria met. All deferred work shipped. Session can close.
