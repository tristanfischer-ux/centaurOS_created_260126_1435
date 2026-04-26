# Supplier match output — `/the-forge-v2/projects/:id/suppliers` enhancement

Built against `RED-TEAM-PIVOT-PLAN.md` spec 6f. Mirrors Phase G investor pattern (`PHASE-G-IMPLEMENTATION.md`). Branch: `feat/forge-v2-cutover`.

---

## What ships

Every paid supplier match on the V2 suppliers page now carries the two components spec 6f names as the £20-Starter justification:

1. **Why this supplier is relevant to YOU.** Specific reasoning citing real supplier capabilities, certifications, location, lead time, minimum order quantity, and how each intersects with the project's bill of materials and constraints.
2. **Three questions to ask them.** Concrete qualifying questions tailored to this project's risks plus what this supplier has indicated matters in their domain.

Free / anonymous tiers see the first three rows blurred behind an upgrade overlay; the rest of the grid renders the existing compact card with no overlay.

A "show the work" banner sits above the results, naming the search universe, the scoring dimensions, and the top-N count surfaced.

---

## Files changed

| File | Change | Notes |
|---|---|---|
| `supabase/migrations/20260425060000_supplier_match_cache.sql` | NEW | cache table + indexes + RLS, mirrors `investor_match_cache` |
| `src/lib/forge/project-context.ts` | NEW | sha256-hashed canonical project context |
| `src/actions/supplier-match-generation.ts` | NEW | Sonnet generator + cache lookup + bulk runner |
| `src/app/(platform)/the-forge-v2/projects/[id]/suppliers/_components/supplier-match-insight-card.tsx` | NEW | full result card with citations + blur overlay |
| `src/app/(platform)/the-forge-v2/projects/[id]/suppliers/page.tsx` | MOD | tier resolver + match-output enrichment for top-N |
| `src/app/(platform)/the-forge-v2/projects/[id]/suppliers/suppliers-view.tsx` | MOD | renders insight cards for top-N + show-the-work banner |
| `src/app/(platform)/the-forge-v2/projects/[id]/suppliers/suppliers-v2.css` | MOD | adds `.sp2-show-work` and `.sp2-insight-stack` styles |
| `src/types/database.types.ts` | REGEN | now includes `supplier_match_cache` (alongside existing `investor_match_cache`) |
| `scripts/test-supplier-match-generator.ts` | NEW | quality spot-check harness |
| `scripts/test-project-context.ts` | NEW | determinism spot-check |

No files outside this scope touched. Existing investor pattern, marketplace, admin/cost surfaces all unchanged.

---

## Migration

`supplier_match_cache` applied via `mcp__claude_ai_Supabase__apply_migration` to project `jyarhvinengfyrwgtskq` (production ForgeOS). Verified via `information_schema.columns` — 12 columns live: `id`, `project_id`, `supplier_id`, `project_context_hash`, `why_relevant`, `questions_to_ask`, `source_citations`, `model_used`, `input_tokens`, `output_tokens`, `cost_pence`, `created_at`. RLS enabled, two policies attached (foundry-members SELECT via `cad_lab_projects.foundry_id` + service-role-only INSERT).

`supplier_id` is `text` (not uuid) to mirror `forge_supplier_shortlist.supplier_id`, which stringifies `marketplace_listings.id` for legacy localStorage parity. The generator still validates the supplier id against the UUID pattern before querying `marketplace_listings`.

`npx supabase gen types typescript --linked` regenerated cleanly. Both `supplier_match_cache` and `investor_match_cache` rows present in `Database.public.Tables`. File grew to 27,026 lines.

---

## Cost design (the entire reason this is built the way it is)

The pivot plan flags the per-result generation as the cost driver for the post-pivot pricing. Without caching, the £20/month Starter cannot run a refresh-the-suppliers-tab loop without losing margin on heavy users. Implementation:

- **Cache key**: `(project_id, supplier_id, project_context_hash)`. The hash is sha256 of the canonical project-context string built from 9 fields: subject, target industry, mission, target customers, why-now, regulatory hint, bill-of-materials summary (up to 30 rows), module count, cost ceiling. Field order is fixed, BOM rows pre-sorted by parent module, free-text fields trimmed to fixed character ceilings so a runaway subject doesn't change the hash on every render.
- **Cache hit**: ~5ms Postgres lookup, zero LLM cost. The generator returns the cached row with `fromCache: true` so the UI can flag it.
- **Cache miss**: one Sonnet call (~£0.02 at 3,200 / 760 tokens, prompt-cached system block).
- **Cache invalidates automatically** when the founder edits the project's brief or modules (a single character changes the hash). BOM noise (per-render AI cost estimates, render URLs) is intentionally not in the hash, so cosmetic re-saves don't bust cache.
- **Top-12 results enriched per page render**; the rest fall back to the existing compact card. 12 was chosen because that's the visible-above-the-fold count the founder can act on; everything else is browse / scan.
- **Bulk runner** caps concurrent uncached generations at 8, matching the investor pattern's Anthropic rate-limit budget.

Cost-logging: every Sonnet call goes through `callClaudeCentral` with `actionSlug: 'supplier_match_output'` for `/admin/cost` attribution. Failures (malformed JSON) also log a row with `status: 'error'`.

---

## Test call output

Live Sonnet 4.6 call, real production project + real production supplier:

- **Project**: Hedgerow premium garden bird feeder (camera + solar + edge inference). Subject + 8 modules + cost ceiling £155 per unit.
- **Supplier**: SheetMetalPro Ltd. Profile: Birmingham UK sheet metal fabricator, 30+ years, ISO 9001, materials Stainless Steel / Aluminum / Carbon Steel, processes Sheet Metal Fabrication, lead time 7 to 10 business days, minimum order 20 units.

The model returned a tightly-grounded why-relevant paragraph (cites carbon steel + stainless steel materials, ISO 9001 certification, Birmingham location, 7 to 10 business day lead time, 20 unit minimum order quantity, all from the supplier profile; references main shell / sub-chassis / perch bar from the project bill of materials). It correctly flagged that powder coating, laser cutting, and CNC forming are NOT in the supplier profile and require verification, rather than fabricating them. The three questions are concrete (PEM nut tolerances on a 1.5 mm sub-chassis, BS EN 13438 powder coat capability, lead-time stability across 20-unit pilot to 200-unit production scale-up), each tied to a specific supplier-stated fact and a specific project risk. Source citations name the exact supplier-profile field and project-spec entry each claim draws from. One em dash slipped through in a question; the parser now strips em dashes defensively (replaced with comma + space). No fabricated certifications, no fabricated sector experience, no acronym leaks ("intellectual property" not "IP"). Cost: $0.0265 (~£0.021), tokens 3,247 in / 762 out, latency 15.4s. Total dev spend on this implementation: under £0.05.

To re-run for spot-checking:

```
npx tsx scripts/test-supplier-match-generator.ts <projectId> <supplierId>
```

Defaults to the Hedgerow project + SheetMetalPro Ltd pair used above.

---

## Verification

- [x] **Migration applied** — `supplier_match_cache` confirmed live in production via SQL inspect (12 columns, RLS on, two policies).
- [x] **Types regenerated** — `npx supabase gen types typescript --linked` clean run, 27,026 lines. `investor_match_cache` types preserved.
- [x] **`tsc --noEmit` scoped to changed files** — empty output. No type errors introduced.
- [x] **Project-context determinism** — `npx tsx scripts/test-project-context.ts` returns PASS. Same fields in different order hash identically; one-field change produces a different hash; empty profile hashes deterministically.
- [x] **Live generator quality call** — output above. ~£0.021 per uncached generation at Sonnet pricing.

---

## What was deliberately NOT changed

- **Tab structure / scoped CSS namespace** stays as-is. The new `.sp2-show-work` and `.sp2-insight-stack` classes live inside the existing `.sp2` scope so styling does not leak outside the suppliers page.
- **Chase matching algorithm** untouched. The existing `match_marketplace_listings` RPC and ramp-role logic continue to drive which suppliers appear on the shortlist; the new generator only enriches what's already there.
- **Specialist config files** untouched. The generator uses `specialistId: 'vp-supply-chain'` so spend attributes to Chase, but does not modify his config.
- **Existing supplier detail page** (`[supplierId]/page.tsx`) untouched. The insight card links to it via the existing route.

---

## Constraints honoured

- DO NOT push — local commit on `feat/forge-v2-cutover` only.
- All LLM calls go through `callClaudeCentral` with `actionSlug: 'supplier_match_output'`.
- Voice rules: no em dashes (system-prompt rule + parser-side defensive sanitiser), no emojis, British spelling, no acronym leaks ("bill of materials" not "BOM", "minimum order quantity" not "MOQ", "request for quote" not "RFQ"). ISO 9001 / AS9100 stay as written (proper-noun certifications).
- Semantic tokens only — `.sp2-show-work` uses `--sp-surface-soft` and `--sp-border` from the existing scoped variables, no hardcoded hex.
- Light theme.
- No fabrication: prompt explicitly instructs the model to write a SHORTER why_relevant when the supplier profile is sparse, rather than padding.

Cost ceiling for development: 1 quality-test call against Sonnet (£0.021), well under the £1 budget.
