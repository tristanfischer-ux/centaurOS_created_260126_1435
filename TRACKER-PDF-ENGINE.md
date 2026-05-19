# PDF Engine v2 — Tracker

> Single source of truth for in-flight + queued + completed work on the multi-LLM design chain. Read at session start. Updated every turn that lands a change.
>
> Honesty rule (Tristan 2026-05-16): "better to be honest and say we are not sure than have a false claim of accuracy." Applies to every LLM-emitted assertion the engine ships — manufacturer/part_number, recommendations, completeness claims, gate scores. Confidence tags are not optional.

---

## In Flight (autonomous overnight)

### iter-62 — 10-class fan-out (final state)
- Status: **9 of 10 FINAL** (haps still running). 0 unrecovered FATALs.
- All 10 went through: cgm needed 3 attempts (R2 GLM JSON, R3 Qwen JSON, then success); vertical-farm needed 2 attempts (R1 Grok JSON, then success); ev-charger crashed in render only (state.json clean, PDF re-rendered after DesignDecisionsPage chunked fix).
- Aggregate: 1099 parts, 265 stripped (24.1%), 40 honest "manual sourcing" recs, 42 design decisions, 2/10 accepted_with_decisions.
- Phase 2 trajectory range: best bioreactor + bess-container (12/14 grammar at iter 8 cap); worst cgm (7/14). All classes still improving at cap = cap-too-tight confirmed across all 10.
- Common unresolved gates: `word_modifier_richness` (10/10 classes), `cross_module_required_links` (7/10), `sub_module_prose_covers_words` (4/10), `spatial_position_complete` (3/10).
- Flash-Lite audit (post-hoc, all 10 classes): brief_to_design_fidelity 7/10 consistent. Caught physics issues invisible to gates (drone 74 Wh insufficient for 40-min cruise; BESS 4896 cells × 280 Ah × 3.2 V = 4.4 MWh insufficient for 3.5 MWh usable after derating; CGM patch design includes 48 g NCR18650B vs 5 g brief constraint; EV-charger 36 × 60 A MOSFETs vs 230 A/phase input; BESS topology 16s×17 label inconsistent with 17s16 actual).

### iter-63 — mass-retrofit all 10 classes with new pipeline (autonomous overnight)
- Status: **DONE** (2026-05-16, ~07:30 GMT). Re-ran cascade verifier (grounded + Tavily + Mouser tier 3) + critic + renderer on every iter-62 state.json.
- Aggregate: **926 parts checked, 870 verified WITH URL (94%), 56 stripped (6%)**, 28 Mouser direct catalogue links, 101 Tavily fallbacks, 797 grounded hits.
- **Strip rate dropped from 26.3% → 6%** vs un-grounded verifier. HAPS notable: 0% strip (down from 42% — niche-class theory confirmed with grounding).
- Sample Mouser hits with live data: Infineon FF1000R17IE4 IGBT @ £516.98 (18 in stock); TDK NTCG164BH103JT1 @ £0.09 (6345 in stock); STM32F427VGT6 @ £9.41 (1721 in stock); Molex 505570-0801 @ £0.20 (matched via T3 alphanumeric prefix).
- Renderer fixes landed: (1) Parts Pending Verification page moved AFTER module sections (was before brief — wrong location); (2) FMEA acronyms expanded — "SEV/LIK/DET/RPN" → "SEVERITY / LIKELIHOOD / DETECTABILITY / RISK PRIORITY" with plain-English glossary; (3) Compliance class-key alias resolver — "Battery Energy Storage System (BESS)" → energy_storage registry (was showing "No standards registered" then listing items — contradiction fixed).
- Code changes this session: cascade with Mouser tier 3 + recommender URLs + Mouser matcher tuned with T1/T2/T3 strategies (exact / starts-with / alphanumeric prefix) + critic stage wired at chain STEP 7.5 + Phase 2 cap raised 9 → 18 + structural-gate-to-design-decisions routing (9 gate names mapped to plain-English explanations + recommendations).

### Open architectural items
- DigiKey tier 4 (OAuth, 2-3 hr setup) — not yet wired
- Farnell tier 5 — API returning 400 on initial test; needs query syntax debugging
- Critic findings flowing into R4 grounded fact-check (works in retro; needs validation on a fresh iter-64 chain run)
- Recommender URL escalation to Mouser (now wired but only validated in retro; fresh-chain validation pending)
- Strip-precision unknown for new cascade — last ground-truth test on un-grounded verifier showed 40% strip-precision; need a re-test on new cascade
- 5/10 complete + CGM relaunched standalone:
  - **cgm** — FATAL R2 GLM JSON parse (transient). **Relaunched standalone @ 06:24** (pid 85059).
  - **drone** ✓ not_accepted · 138 parts (102 verified / 36 stripped / 34 recs · 10 unknown) · 0 design decisions · Phase 2 trajectory 6→10/14 at iter cap
  - **edge-ai** ✓ not_accepted · 113 parts (78 / 33 strip / 33 recs · 4 unknown) · 0 design decisions · 6→9/14
  - **heatpump** ✓ accepted_with_decisions · 98 parts (70 / 24 strip / 24 recs · 3 unknown) · 1 decision · 5→8/14
  - **bioreactor** ✓ not_accepted · 130 parts (92 / 35 strip / 35 recs · 5 unknown) · 0 design decisions · 6→12/14
  - **ev-charger** ✓ accepted_with_decisions · 139 parts (110 / 24 strip / 24 recs · 0 unknown) · **41 design decisions** · 5→8/14 (stalled at iter 4 — modifier_consistency)
  - vertical-farm 🔄 running (R-chain stage)
  - auv, bess-container, haps — queued
- **Known issue surfaced**: Phase 2 iter cap = 9 (0..8) is too tight for 14-gate system. Drone/edge-ai/bioreactor hit cap while still improving. They exit `not_accepted` because the unrepaired failures are structural gates (`spatial_position_complete`, `cross_module_required_links`, `word_modifier_richness`, `thermal_path_closes`) — not modifier_consistency — so they don't route to Design Decisions either. → Open question for Tristan: raise cap to 18? Or extend Design Decisions routing to cover structural gates that won't repair?
- **Renderer bug found + fixed mid-batch**: DesignDecisionsPage had same overflow bug as PartsPendingVerificationPage when decisions ≥ ~30. EV-charger had 41 decisions → render crashed `-9.6e+21`. **Fix landed**: chunked at 5/page. EV-charger PDF re-rendered cleanly (237 KB).

## Just-completed (autonomous turn)

### C — Strip + recommend + early Gen verification (one piece)

Two parts to land together:

1. **Early Gen-verification pass** — between Generator and R1.
   - Status: NOT STARTED
   - Why: catch fakes the Generator invents before R1/R2/R3 build prose around them. Currently the prose says "the pack DC busbar uses Mersen 2MCB1500 rated 1500 A" — stripping the modifier at end-of-chain leaves the prose inconsistent.
   - Cost: ~£0.07/run (extra Flash-Lite pass on Gen output)

2. **Strip + recommend** — when a part is stripped, ask Flash-Lite for a verified real alternative.
   - Status: NOT STARTED
   - Honesty rule: the recommendation MUST itself carry a confidence tag. If the LLM doesn't know a verified real alternative, the recommendation says "uncertain — manual sourcing required against the technical spec already listed", NOT a fabricated SKU. **Never trade one fabrication for another.**
   - Cost: ~£0.04/run (one extra call per stripped item)

Combined: ~£0.17/run.

### A — `spatial_position_complete` grammar gate
- Status: **CODE LANDED** in `universal-grammar-gates.ts` (registered). Not yet validated on a live run.
- Validates on: next live BESS run.

### B — `cross_module_required_links` gate + `class-connections.ts`
- Status: NOT STARTED. ~3 hours.

### B-physics — `cell_discharge_rate_within_nameplate` gate
- Status: NOT STARTED. ~2 hours. (Tristan-numbered "C" but renamed to avoid clash with "C: strip+recommend" above.)

---

## Recently Completed (this conversation)

| Item | File(s) | Notes |
|---|---|---|
| Phase 0 brief refinement loop + transparent renderer | chain + render | iter-54 Test-2 validated halt path |
| MAX_RELAX_FACTOR halt-path correctness (applied flag) | chain | |
| 7 per-class headline derivers | `headline-deriver.ts` | ev_charger, wearable_medical, drone, edge_ai_server, bioreactor, auv, haps |
| Lead-time PERMANENTLY suppressed; cost temporarily suppressed | prompts + `sentence-generator.ts` | Two-tier suppression |
| Class-key alignment with `product-classifier.ts` | 4 data files | cgm→wearable_medical, edge_ai→edge_ai_server, heatpump→thermal_system |
| §Compliance + §Risk renderer pages | renderer | Financial fields suppressed |
| `class-standards.ts` + `class-hazards.ts` | data files | All 10 classes |
| Design Decisions Required page + accepted_with_decisions status | `design-decisions.ts` + chain + renderer | iter-60b surfaced 1 decision |
| Anti-hallucination recalibration (commodity floor + R4 strip prompt + post-Phase-2 normalise) | gates + chain | iter-60b: fakes ~40% → ~20% |
| applyPatches merge-not-replace at indexed positions | `universal-repair.ts` | Iter-60 crash root cause |
| Concurrency cap + widened retries + `run-fanout.sh` | chain + new script | |
| Part verification stage (per-item verify + strip) | `part-verification.ts` + chain + renderer | Tested on iter-60b: catches Mersen-on-PCB, format mismatches |

---

## Queued / Deferred

| Item | Why deferred | Estimate |
|---|---|---|
| 10-class fan-out (iter-61) | After current C lands | £100, 1 hour |
| Cross-design accumulation: registries learn from runs (#93) | Architectural — after universal pipeline stable | 3 days |
| Organic class-registry generation for unknown classes (#87) | Pair with #93 — together = engine handles any brief | 1-2 days |
| `deployment-envelopes.ts` (40-ft reefer std vs Hi-Cube etc.) (#86) | Pending universal pipeline | ~half day |
| §6 BoM table renderer | Tristan: downstream from universal coverage | After 10-class lands clean |
| §4 Standards prose enrichment | Currently a list — could be richer | Low priority |
| §5 Engineering verification matrix | Not built | Low |
| Multimodal scoring on iter-61 outputs | After 10-class fan-out lands | Low |
| Visual beauty pass — typography + glyphs + layout | After content is right | Low |
| Phase 2 stall-detection: bail when only modifier_consistency conflicts remain | Currently the chain wastes iters on conflicts that should route to Design Decisions | ~1 hour |
| Topology-prose error fix (iter-59 "20 racks in series" wording) | LLM gets parallel/series prose wrong even when underlying topology right | ~1 hour |

---

## Known Issues / Open Questions

- **Transient LLM JSON failures recurring at ~20% rate** in iter-62 fan-out: CGM (GLM-5.1 @ R2), vertical-farm (Grok 4.3 @ R1), ev-charger (render-time post-state-save). The Flash-Lite repair fallback also FAILED on both R1+R2 cases — raw output too broken even for a JSON-repair LLM. Need: per-step retry-with-fresh-LLM-call when both first call AND Flash-Lite repair fail. Cost ~£0.20/run worst case. Filing for post-fan-out.
- **Phase 2 iter cap (9 iters) too tight for 14-gate system**: 4 of 5 finished iter-62 classes hit cap while still improving — exit `not_accepted` because unrepaired failures are structural (`spatial_position_complete`, `cross_module_required_links`, `word_modifier_richness`, `thermal_path_closes`) not modifier_consistency. Need: (a) raise cap to 18, AND/OR (b) extend Design Decisions routing to cover structural gates that won't repair (so chain exits `accepted_with_decisions`).
- **C-rate at 1.09C continuous on 1C cell** (iter-60b BESS): pack exceeds cell continuous nameplate without an explicit derating note. Caught by gate B-physics once built.
- **No spatial coordinates** anywhere in the design data. spatial_position_complete gate forces qualitative position (above/below) but not coordinate-level layout.
- **Plausible-but-unverified SKUs** (CIMC, Tata Steel CP-1200-5MM, Mersen 2MCB1500) — surfaced as uncertain on Parts Pending Verification page rather than stripped. Human confirms.
- **Phase 2 oscillation**: gain-then-lose patterns on stubborn gates. Mitigated by trajectory heuristic + Design Decisions page routing; persistent in some classes.
- **Recommendation honesty**: when Strip+Recommend lands, the recommendation MUST be confidence-tagged. "Uncertain — manual sourcing needed" is preferable to a guessed SKU.

---

## Gotchas codified to MemPalace (do not re-learn)

`forgeos/gotchas` + `forgeos/decisions` wings:

1. Density gates pressure hallucination — relax commodity floor, R4 strip-don't-replace.
2. `accepted_with_decisions` is first-class — never auto-resolve real spec conflicts.
3. Lead-times PERMANENTLY excluded — fabricator-specific.
4. Classifier output is source-of-truth for registry keys.
5. Brief-parser drops detail — read raw briefText alongside parsedBrief.
6. Burst-launching > 6 concurrent chains → 50-60% transient failure; cap at 3.
7. Context window ≠ max-output-tokens.
8. `finish_reason='length'` is STRUCTURAL — never retry same params.
9. applyPatches partial-object replace destroys arrays — MERGE not REPLACE.
10. Trajectory: single regression normal; 2+ consecutive = stall.
11. State-replay > full chain re-run for gate fix validation.
12. Fabricated model IDs cost real money — grep + sanity-ping before launch.
13. Phase 0 MAX_RELAX_FACTOR halt path: leaves parsed_revised as alias of parsed_original (bug).
14. 40-ft reefer has standard vs Hi-Cube variants — height matters.
15. Per-unit vs installation scale: surface BOTH in Headline for fleet-deployed products.
16. Cost / lead-time suppression: AUDIT BOTH render filters AND every LLM prompt that consumes the same data.
17. LLM area/footprint naming is ambiguous: tier_count + magnitude disambiguates canopy vs floor.
18. Render-side modifier filter ≠ prompt-side suppression — check both.
19. Phase 2 score trajectory diagnostic: SUSTAINED (2+ iters) negative slope is the real bad signal, not single-iter regression.
20. Trustworthy data > comprehensive data: honest "uncertain" beats false-confident SKU.

---

## Status legend

- **NOT STARTED** — on the list, no work yet
- **IN PROGRESS** — actively this turn
- **CODE LANDED** — written, type-clean, NOT YET validated on a live run
- **VALIDATED** — landed AND confirmed working on ≥1 iter-N PDF
