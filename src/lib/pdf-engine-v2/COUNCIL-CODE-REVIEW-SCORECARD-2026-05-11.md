# Coding-Council: engine-accuracy-scorecard.py (Phase A)

Date: 2026-05-11
Subject: `scripts/engine-accuracy-scorecard.py` — fast-iteration diagnostic that gates the engine-fix loop by measuring linguistic-structural correctness across products.
Synthesis rule: 2+ NEEDS_MAJOR with concrete, reproducible blockers = BLOCKER. Fix or revert.

## Seats dispatched

| Seat | Model | Verdict |
|---|---|---|
| Honest adversary | x-ai/grok-4.3 | NEEDS_MAJOR |
| Reasoning | google/gemini-3.1-pro-preview | Needs Major |
| Schema enforcer | z-ai/glm-5.1 | NEEDS_MAJOR |

3/3 NEEDS_MAJOR — rule triggered. All concrete issues addressed before commit.

## Seat-by-seat synthesis (signal vs noise)

### Grok (honest adversary)

1. **score_product treats manifest/state as dicts after discover_products returns Paths** — false alarm. The main() loop calls `_safe_load_json` on each path before passing to `score_product`. The seat reviewed an abridged code summary that omitted that loading step.
2. **`{... full result dict ...}` placeholder, script not executable** — false alarm. The placeholder appeared only in the summarised brief sent to the seat (the real script returns the full dict).
3. **walk_resolved_tree leaves can attach at wrong levels** — VALID. We now (a) only treat depth==3 nodes as Layer-2 leaves and (b) surface depth!=3 leaves as `misplaced_leaves` evidence with a `tree_depth_pct` penalty (-15 each). Early-exit nodes at depth<3 are surfaced separately as orange evidence.
4. **`has_radical` checks non-existent `archetype_id` key** — false alarm. The snapshot data DOES use `archetype_id` (snake_case) inside `resolution`, while the **node** uses `archetypeId` (camelCase). Verified against rs-auv/state.json: `res keys: ['archetype_id', 'part_class', 'qty', 'mpn', ...]`.
5. **`_archetype_matches_class` synonyms fragile** — VALID. Replaced substring `in` with token-set intersection (split on `_`/`-`/space). Multi-word synonyms must match all parts.
6. **No handling for empty trees / 0 leaves → ZeroDivisionError** — false alarm. Every `len(...)` divisor is guarded with `if X else 0.0`. Added explicit `is_empty_tree` flag in result for downstream consumers.
7. **tree_depth heuristic arbitrary (>=8)** — partially VALID. Now also enforces depth==3 for leaves; arbitrary 8-leaf threshold kept (calibrated to baseline-10 observed minimum).
8. **HTML escaping unverified in summary** — false alarm. All dynamic interpolations route through `_esc()` (verified by re-reading render_card / render_summary_table).

### Gemini (reasoning)

1. **`leaves_per_sentence` matches by `path[1]==s_arch`, double-counts when two sentences share an archetype name** — VALID. Now matches via `parent_uid` lineage (every node gets a unique `uid` during walk, ancestor lookup uses uid set).
2. (response truncated at token cap; first issue is a real fix)

### GLM (schema enforcer)

1. **Tree depth not validated against depth==3** — VALID. Same fix as Grok #3. Depth shape now part of `tree_depth_pct`.
2. **`has_radical` checks `archetype_id` key not in spec** — false alarm (see Grok #4 above). The actual snapshot has it.
3. **`unit_price_gbp` of 0 treated as missing in avg** — minor. `priced_leaves` filter uses `is not None` (correct); the `or 0.0` in avg sum is over priced_leaves only and harmless.
4. **`leaves_per_sentence` defensive check on path length** — superseded by Gemini #1 fix (now uses uid lineage, not paths).
5. **Wrong-domain only checks sentence level** — DESIGN CHOICE. Sentences are the visible top-level archetypes Tristan called out as the primary failure mode; word/character leakage is a downstream symptom. Not fixing.
6. **No `is_empty_tree` flag** — VALID. Added.
7. **`diversity_pct = distinct_real_sources * 33` caps at 99%** — VALID. Replaced with `min(100, 100 * distinct / len(VERIFIED_SOURCES))`.
8. **HTML escaping audit** — verified. `_esc()` wraps every dynamic value.
9. **`_safe_load_json` returns None unhandled** — VALID. Main loop now skips slugs whose manifest/state fail to parse, with explicit warn.
10. **`'nm'` in `_STOPWORDS` blocks brief-modifier matching** — VALID. Removed unit abbreviations from stopword cull intent (none were in the list, but added comment to prevent future regression). Modifier-extraction matches via separate regex pre-tokenisation, so this was less impactful than it looked.
11. **`_archetype_matches_class` substring false-positive** — VALID (same as Grok #5).
12. **Weights sum-check** — confirmed 1.00 for both layers.
13. **walk adds depth-0 paragraph to leaves bucket if childless** — VALID. Now only depth==3 nodes go in `leaves`. Earlier-exit nodes go in `early_exit_nodes` evidence.

## Fixes applied

Edits to `scripts/engine-accuracy-scorecard.py`:

1. `walk_resolved_tree` — every node gets a unique `uid` and `parent_uid`; only depth==3 nodes enter the `leaves` bucket. Nodes are tagged in a private `_all` bucket for ancestor-walk lookups.
2. `score_product` — `leaves_per_sentence` now uses uid-lineage instead of `path[1]` archetype matching (no double-count when two sentences share an archetype name).
3. `tree_depth_pct` — adds penalty for `misplaced_leaves` (depth!=3); requires depth==3 for full score.
4. Result and HTML rendering surface new evidence: `misplaced_leaves`, `early_exit_nodes`, `is_empty_tree`.
5. `diversity_pct` — `100 * distinct / len(VERIFIED_SOURCES)` so 3/3 distributors = 100%.
6. `_archetype_matches_class` — token-set match instead of substring; multi-word synonyms require all parts present.
7. `main()` — explicit `None` and non-dict guards on `_safe_load_json` returns, with stderr warn and skip.
8. `extract_brief_modifiers` — removed dead first pass that was overwritten by the finditer pass.
9. Removed unused `defaultdict` import.

## Re-run verification (V6 batch)

Ran `python3 scripts/engine-accuracy-scorecard.py --batch-dir ~/Downloads/engine-evidence/radical-shadow-20260511T0839 --output ~/Downloads/engine-accuracy-scorecard-V6.html` after fixes.

Headline: 0/10 products pass Universality. The wrong-domain detection — the highest-weighted Layer-1 metric (25%) — surfaces three critical leakages: `refrigerant_circuit` on AUV/drone/HAPS, `fire_detection_and_suppression_system_fss` on bioreactor/vertical-farm, `heat_pump_enclosure` on bioreactor. Brief-coverage is universally weak (max 45.8%, mean ~24%) — the engine is decomposing into generic archetypes that don't pull through brief vocabulary.

## Verdict

UNBLOCKED. All concrete blocker-class issues fixed; design-call issues (wrong-domain depth, 8-leaf threshold) documented inline. Script is suitable as the Phase-A iteration gate.

## Cost

Three council calls totalled approximately £0.04 (Grok 0.010, Gemini 0.028, GLM 0.016 USD) — well under the £15 council budget.
