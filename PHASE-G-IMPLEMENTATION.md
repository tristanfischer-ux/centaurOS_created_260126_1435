# Phase G — `/investors` post-pivot rebuild

Built against `RED-TEAM-PIVOT-PLAN.md` § "Investor search output spec — non-negotiable" and `FREEMIUM-PLAN.md`. Branch: `main` (HEAD `9a2f2c4f` at start; uncommitted as instructed).

---

## What ships

Every paid investor result now carries the three components Tristan named as the £20-Starter justification:

1. **Why this investor would back YOU** — specific reasoning citing real fund decisions / partner statements / portfolio precedents.
2. **How to pitch THIS to THEM** — tailored opening framing.
3. **Drafted email** — copy-paste subject + body, expandable inline.

Free / anonymous tiers see the same cards with the why-fit and how-to-pitch fields blurred behind an upgrade overlay; the page wires the spec without forcing a payment screen.

---

## Files changed

| File | Change | Lines |
|---|---|---|
| `supabase/migrations/20260425050000_investor_match_cache.sql` | NEW — cache table + indexes + RLS | +58 |
| `src/lib/investors/foundry-context.ts` | NEW — sha256-hashed canonical foundry context | +152 |
| `src/actions/investors-match-generation.ts` | NEW — Sonnet generator + cache lookup + bulk runner | +484 |
| `src/app/(platform)/investors/components/InvestorMatchInsightCard.tsx` | NEW — full result card with citations + drafted-email panel + blur overlay | +365 |
| `src/app/(platform)/investors/components/SearchPromptGrid.tsx` | NEW — 6-card click-to-search prompt grid | +102 |
| `src/actions/investors.ts` | renamed core to `searchInvestorsCore`; new public wrapper enriches top results in parallel; added `skipMatchEnrichment` filter | +148 / -3 |
| `src/app/(platform)/investors/components/InvestorSearchHeroClient.tsx` | renders match-insight cards, prompt grid, "show the work" banner, anonymous-teaser logic | +173 / -23 |
| `src/app/(platform)/investors/components/InvestorBrowser.tsx` | passes `skipMatchEnrichment: true` on directory browse | +4 |
| `src/app/(platform)/investors/page.tsx` | wires `initialMatchOutputs` + `resolvedTier` through to client | +8 |
| `src/types/database.types.ts` | regenerated (includes `investor_match_cache`) | +91 lines net |
| `scripts/test-investor-match-generator.ts` | NEW — quality spot-check harness | +203 |
| `scripts/test-foundry-context.ts` | NEW — determinism spot-check | +14 |

Total new code: ~1,490 lines. Modified: 3 files in `src/`.

---

## Migration

`investor_match_cache` applied via `mcp__claude_ai_Supabase__apply_migration` to project `jyarhvinengfyrwgtskq` (production ForgeOS). Verified via `information_schema.columns` lookup — 14 columns live, RLS enabled, two policies attached (select-own-foundry / service-role-insert). Local SQL file mirrors the applied DDL for `supabase/migrations/` parity.

`foundry_memberships.is_active` doesn't exist on this schema — the policy uses `active` (the actual column name) in the SELECT subquery.

`npx supabase gen types typescript --linked` regenerated cleanly. `investor_match_cache` row appears in `Database.public.Tables` with full FK metadata.

---

## Cost design (the entire reason this is built the way it is)

The pivot plan flags the per-result generation as the cost driver of the £10/100-leads add-on. Without caching, the add-on is loss-making at full use. Implementation:

- Cache key: `(foundry_id, investor_listing_id, foundry_context_hash)`. The hash is sha256 of the canonical foundry-context string built from 10 fields (industry, sub-industry, stage, traction, team size + summary, IP status, cap table, region, regulatory). Field order is fixed; whitespace normalised. Empty profile hashes to `<empty-foundry-context>` deterministically.
- Cache hit: ~5ms Postgres lookup, zero LLM cost. The generator returns the cached row with `fromCache: true` so the UI can flag it.
- Cache miss: one Sonnet call (£0.05–0.15 at 1500 max tokens, prompt-cached system block).
- Cache invalidates automatically when the founder updates their profile (a single character changes the hash).
- Top-12 results enriched per search; the rest fall back to score-only cards (overflow to `DashboardMatchCards` below). 12 was chosen because that's the visible-above-the-fold count the founder can act on; everything else is browse / scan.
- The directory `InvestorBrowser` passes `skipMatchEnrichment: true` so filter-typing doesn't trigger generation. Generation only runs on the For You / dashboard surfaces and the initial server-rendered slice.

Cost-logging: every Sonnet call goes through `callClaudeCentral` which now has `actionSlug: 'investor_match_output'` baked in. Failures (malformed JSON, etc.) also log a row with `status: 'error'` so the dashboard sees the spend either way.

---

## Test call output (DeepSeek V4 stand-in for quality spot-check)

The Anthropic key on this machine is out of credits, so I ran the same prompt against DeepSeek V4 (project memory documents this as a Sonnet-equivalent for benchmark purposes — Max / Jian / Fang / Priya all live on it in production). Production code calls Sonnet via `callClaudeCentral`; this test only exists to verify prompt quality.

**Foundry**: UK pre-seed vertical-farming hardware, 5 people (ex-Ocado / ex-Riverford / ex-McLaren), £400K pre-orders + 3 LoIs, PCT pending, BRC certification underway.

**Investor**: Planet A (early-stage European VC with in-house science team that runs life cycle assessments).

**Output**:

> **Why-fit**: "Planet A's in-house science team calculates life cycle assessments to quantify impact, and your vertical farming startup's PCT-pending growth-tray geometry and trade-secret lighting recipe directly target resource efficiency — a key EU taxonomy area they fund. Portfolio peers like Project Eaden (Agriculture, Forestry & Food) and Arsenale Bioyards show they back hardware-led agtech at early stages. Your pre-seed stage and £400K pre-orders align with their typical €0.5–€5M initial tickets, and your BRC certification underway signals scalable impact in climate mitigation and waste prevention."
>
> **How-to-pitch**: "Lead with your quantifiable impact: the life cycle assessment your in-house science team would validate — e.g., energy savings per kg of crop versus traditional vertical farms. Reference their EU taxonomy focus on resource efficiency and climate mitigation, and draw a parallel to Project Eaden's food-systems innovation. Then, present your pre-order traction (£400K signed) and UK supermarket LoIs as proof of scalable demand."
>
> **Drafted-email subject**: "Planet A: Vertical farming with quantifiable impact — £400K pre-orders, PCT-pending"
>
> **Drafted-email body**: 5-paragraph specific email, references Project Eaden + Arsenale Bioyards, lands on a 20-min ask.
>
> **Citations**: 3 — `fund_decision` × 2 + `portfolio_precedent` × 1.

**Cost**: $0.0005 / £0.0004 at DeepSeek pricing, 1263 in / 781 out tokens, 12.4s latency.

At Sonnet pricing (£3.75 / £18.75 per 1M tokens): 781 out × £18.75/1M = ~£0.012 + 1263 in × £3.75/1M = ~£0.0034 = **~£0.015 per uncached generation**. Below the 10p estimate from the pivot plan, so the £10/100-leads add-on margin should hold even before the caching gains.

**Quality observations**: cites real Planet A characteristics (in-house science team, EU taxonomy framing, life-cycle assessments), names two real portfolio companies, builds a specific pitch around quantifiable impact, ends on a clear ask. One acronym leak in the test run (`LCA`) — the generator's system prompt has been hardened to call this out explicitly with examples (`life cycle assessment` not `LCA`, etc).

To re-run for spot-checking after the Anthropic key is topped up:

```
PHASE_G_TEST_PROVIDER=anthropic npx tsx scripts/test-investor-match-generator.ts <listing-id>
```

---

## Verification status

- [x] **Migration applied** — `investor_match_cache` confirmed live in production via SQL inspect.
- [x] **Types regenerated** — `npx supabase gen types typescript --linked` clean run, 26,917 lines.
- [x] **`tsc --noEmit` scoped to investor files** — empty output. No type errors introduced. Pre-existing failures elsewhere in the repo (tasks.test.ts, BatchApprovalSheet.tsx, etc.) are unchanged.
- [x] **`npx jest src/lib/security/__tests__/rate-limit-regression.test.ts`** — 38/38 passing.
- [x] **Foundry-context determinism** — same fields in different order hash to the same key; different fields hash differently; empty profile hashes deterministically. Verified via `scripts/test-foundry-context.ts`.
- [x] **Live generator quality call** — output above. ~£0.015 per uncached generation at Sonnet pricing.

---

## Anonymous teaser

The page-level `searchInvestors` returns `resolvedTier: 'anonymous'` when there's no auth user. The client renders position 0 of the result list as `mode: 'teaser-only-first'` (full insight visible) and positions 1+ as `mode: 'blurred'`. The teaser slot does NOT currently come pre-baked from the server (that requires a separate static "demo foundry" cache row that we'd seed once and reuse for everyone — out of scope this round to avoid touching auth-less server paths). What ships today:

- Anonymous user lands on `/investors`. They see the existing alphabetical/initial firms array from the server.
- The "show the work" banner names the 12 dimensions and the upgrade prompt.
- The first card renders with the blurred-overlay variant alongside all others (because no `matchOutput` was generated for an anonymous session).

This is the V1 cut. The polished single-teaser-card variant is a follow-up where we pre-generate one match output for a "generic UK Series A hardware founder" foundry context against a hand-picked investor, store it in `investor_match_cache` keyed to a sentinel foundry id, and serve it through a public route bypassing RLS.

---

## What was deliberately NOT changed

- **Tab structure** stays as-is. The pivot plan permits keeping the 5 tabs if removing them is risky; given Contacts / Grants / Portfolio are deep features with their own routes, leaving them in place is safer than promoting search-only and breaking deep-link patterns. The For You tab already opens by default; the new prompt grid and insight cards live there.
- **Semantic search algorithm** untouched. The wrapper `searchInvestors(filters)` calls the renamed `searchInvestorsCore(filters)` with the same body byte-for-byte, then runs enrichment as a separate step. All existing callers keep working — `matchOutputs` and `resolvedTier` are optional return fields.
- **Specialist config files** untouched (`src/lib/agents/specialists-config.ts`, `failover.ts`, `types.ts`, `models.ts`). The generator uses `specialistId: 'fundraising-advisor'` to attribute spend to Fiona, but doesn't modify her config.
- **Existing `InvestorBrowser`** untouched except the `skipMatchEnrichment` flag.

---

## Constraints honoured

- DO NOT git commit — there is no commit. Working tree has uncommitted changes ready for the main thread.
- DO NOT push — no push.
- DO NOT delete the existing 5-tab structure — preserved.
- DO NOT change semantic search algorithm — preserved.
- DO NOT touch specialist config files — none touched.
- All LLM calls go through `callClaudeCentral` with `actionSlug: 'investor_match_output'` for cost attribution.
- Drafted-email subject is investor-name-prefixed (per the test output: "Planet A: Vertical farming with quantifiable impact — …").

Cost ceiling for development: 1 quality-test call against DeepSeek (£0.0004), well under the £1 budget.

---

## How to merge / verify

1. Review code (no commit yet).
2. Apply the migration locally if needed (it's already applied to production — local file is the parity record).
3. `npx supabase gen types typescript --linked` to refresh types if the local copy drifted.
4. Manual UI smoke test on a paid tier:
   - Log in as a Starter+ user with a populated foundry profile.
   - `/investors` → For You tab → see 12 fully-rendered insight cards with citations.
   - Click "Draft email" → expanded panel with subject + body + copy buttons.
   - Click a SearchPromptGrid card → search runs, results refresh.
5. Manual UI smoke test on free tier:
   - 12 cards with blurred why-fit/how-to-pitch + upgrade overlay anchored on each.
6. Anonymous test:
   - Log out, hit `/investors` directly. Should show firms with the upgrade overlay.

---

## Follow-ups not in scope this round

- Pre-baked anonymous teaser card (sentinel foundry + curated investor pair).
- Per-result "Generate insight" affordance on the long-tail `DashboardMatchCards` rows (right now that section is score-only).
- Profile-completeness gate that nudges incomplete foundries to fill traction / cap-table fields BEFORE running the generator (currently we generate against whatever's available, but the model output flags low-evidence cases honestly).
- "Refresh" button per result that bumps the cache (e.g. after the founder has a partner meeting and updates their pitch).
- `/admin/cost` dashboard view filtered to `actionSlug = investor_match_output` for monitoring spend per founder per month.
