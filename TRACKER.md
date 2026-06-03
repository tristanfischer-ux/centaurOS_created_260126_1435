# ForgeOS PDF Engine — Quality Workstream Tracker

_Live single-source-of-truth for the BESS/VF quality push. Updated 2026-05-28._
_(Previous TRACKER.md content — investor/supplier page redesign, fully shipped — is preserved in git at commit `2971a6bc5`.)_
_View styled: `~/.claude/scripts/show-md "/Users/tristanfischer/Developer/CentaurOS created 260126 1435/TRACKER.md"`_

## Goal
Recover BESS council quality toward ≥8 on a **deterministic, DB-grounded** document, and keep the engine universally sound (verified on VF). Driven by the principle: every fact comes **DB-first → search-on-miss → write-back → retrieve → grow**.

## Active increment (Tristan 3 decisions, 2026-05-30)
1. **Hybrid quality**: ✅ BESS hit **9.28/10 PASS** council (Gemini 10.0 / Claude 8.92 / Qwen 8.92; all 12 sections ≥8.67), up from ~7.45 baseline (7.45→8.65→8.97→9.28). **THE REUSABLE RECIPE (apply to every class for go-wide):** (a) materials grounded in current commodity prices (DB-first); (b) gate-17 universal Brief Compliance completeness + PASS/FAIL inference; (c) perf-card spec-sheet synthesis from brief metrics[]; (d) £/output-unit cost stack; (e) auto-improve loop (re-price + recommend); (f) **Executive Summary** section (lib/executive-summary.ts — was the 5.50 binding axis → 9.00); (g) **Sourcing Strategy** block (lib/sourcing-strategy.ts — lead-time/dual-source/MOQ, 7.33 → 9.00); (h) gate fixes (26 measurement/rate false-positives, 30 mass hard-exit→flag). **NOW GOING WIDE** — wind chain running first. (decision 1)
2. **Materials growing-DB**: ✅ DONE + grounded in current prices (copper/aluminium were 36-45% stale). DB-first, 4-week refresh. Open: a hands-off monthly auto-feed needs a paid API or a fragile free scraper (CronCreate can't hold monthly — 7-day expiry); reliable free method = agent web-search re-ground when stale. (decision 2)
3. **Auto-improve loop**: iterate a design toward its brief instead of accepting the miss. Spec: `AUTO-IMPROVE-SPEC.md`. Build = Phase 1 (structured trade-off) + Phase 2 (material-DB re-price lever), validated on BESS council, then Phase 3 convergence. Feeds decision 1. (decision 3)
_(Prior: deterministic-generation Phase B/C → ≥8 BESS; folds into decision 1.)_

## 2026-05-31 — Self-learning loops + tool-automation session (Tristan-directed)
Tristan: wire the self-learning loops (search→DB→reuse) + verify tool automation.
**DONE (committed + proven):**
- **New-class class-reference graph loop CLOSED** (82f2927e8 + cecd497e0): root cause of "why isn't the wind turbine learning" = K10 slug drift (chain emits `wind_turbine`/`h2_electrolyser`; graph keyed `wind_turbine_small`/`hydrogen_electrolyser`) + writeback aimed at the UN-aliased slug (silent no-op). Fixed at the choke point (`resolveClassGraphSlug` + bootstrap-on-miss); wind/h2/evcharger now read+grow their graph, new classes bootstrap from a run. Invariant `UNIVERSAL.class_graph_slugs_resolve_to_real_graph`.
- **gate-18 systematic false positives killed** (ab5376d35): single-page PF, AFE-vs-dc-dc, `30-40kW`→`-40` negative-parse, downrate-recommendation. vf 1→0 HIGH; evcharger 4→1 (survivor is REAL: 300-vs-400 kg pedestal); BESS real mass contradiction preserved.
- **recordScoringRun wired** (933a5ba27): RL loop feeds the scoring dashboard.
- **material-price refresh triggered** (70ff6f0c5): weekly-sweep trigger + 28-day gate; live fetcher awaits a commodity-price key (flagged, not papered over).

**INVESTIGATED → NOT BUILT (would be inert — verify-before-build):**
- **Accumulation loop (Tristan's #1): OBSOLETE.** Needs ≥4/6 LLM-emitter consensus + a prompt to inject into; production uses the DETERMINISTIC emitter (LLM generator pruned 2026-05-23; `RADICAL_MULTI_EMITTER` unread by the chain; tables 0 rows). Intent ("don't re-derive modules") already met by determinism. Forward value (accumulate NEW-class modules) blocked on the generic emitter. **NEEDS TRISTAN DECISION.**
- **iec-standards writeback-on-miss: DORMANT.** Only bess (1/35 plans) invokes the tool; bess never misses (67 rows + curated). Standards loop already wired via the lock-gate.

### ⭐ ACTIVE PRIORITY (Tristan 2026-05-31: robust-first, not shipping until robust) — UNIVERSAL-CLASS MILESTONE
Wall-2 design council DONE (`plan_is_sound:false` → corrected plan in `UNIVERSAL-ENGINE-PLAN-wall2-council.md`, commit b0d91cd66). Verdict: wall-2 is plumbing; **wall-3 generic emitter is the value gate** (can a GENERIC dossier score 8+? — the one existential unknown the whole north-star hinges on). go-wide of the 35 registered classes does NOT invalidate (milestone is miss-path-scoped; registered classes byte-identical-protected). **Build order (the anti-forget queue — do NOT drop):**
1. ❌ `tool-io-manifest.ts` (council increment-0; harvest output_keys from `output as {...}` type-literals + applicable_to allowlists + cost_basis; standalone, zero behaviour change; 2 unit tests)
2. ❌ wall-4 quantity-DERIVATION in `buildContractForChain` miss-fallback (the real prerequisite; `buildMinimalContract:3322` is an input-taking stub)
3. ❌ wall-2 `buildComposedPlan` (briefKeys from seeded contract; applicable_to filter; 1:1 copy + macro synthesis; `feeds_into:[]`+`validatePlan()`; (base_key,basis) matching) + wire `orchestrate.ts:95` additively + `shared_quantities` on contract type
4. ❌ output-golden regression invariants (BESS+VF+wind deep-equality, NOT source-hash-pin)
5. ❌ **wall-3 generic emitter — council-gated** — VALIDATE by running the BESS brief through the generic path vs the hand-written 9.28 golden ref. Only step that renders a new-class PDF / enables any 8+ claim.
_Self-learning input already laid 2026-05-31: the class-reference graph loop wall-3 reads from now grows from runs._

## Missing-only recap (current — 2026-05-29, post-crash-recovery)
_The engine-watchdog (`~/.claude/scripts/engine-watchdog.sh`) reads THIS section for the autonomous turn-start routing list. Keep these ❌ rows current; they are the live pending queue, NOT the stale `src/lib/pdf-engine-v2/TRACKER.md` (2026-05-07, Phase-P deferred)._

**⟢ 2026-06-03 reconciliation (session closed 14 commits — HEAD==origin, tree clean).** The PDF-quality backlog is essentially CLEARED + deployed: P3 honest indicative disclosure (#36/#37), per-module mass plumbing (#38), gate-11 glyph + gate-17 mass-row (#39/#40), gate-23 macro-anchor £0-orphan kill (#34), worked-calc consistency across ~200 tools (#32), self-audit enforcing mode (#33), auto-planner cross-domain prune + flip-ON (#14). **Experiment B (structure-lockout relax) confirmed bioreactor fidelity 3→6 → #41 is a LOCKOUT BUG, not a generation ceiling.** The ONE remaining strategic unknown is **wall-3 (UNIV-WALLS): can a GENERIC dossier score ≥8 on an unseen class?** — the existential question the whole north-star hinges on. Decisive next move = **Experiment A (BESS-golden holdout)** row below. The 3 small open items (#17/#18 run-gated VF; #41 permanent constrain-the-relax) are lower-leverage.

| ID | Item | Status |
|---|---|---|
| ⭐ EXP-A | **Experiment A — BESS-golden holdout (de-risks wall-3, THE strategic move).** Force the BESS brief down the GENERIC path (4,710-line hand-emitter held out; structure from the 26-node graph, gap-filler for parts, LLM sizing, all 31 gates), run the real council + Physics Critic, compare section-by-section to the 9.28 golden. Binary outcome → GO pure-generic / GO hybrid ≥6-honest / PIVOT to class-family plug-ins. `GENERIC-EMITTER-PLAN.md §1`. ≈1 day. | ❌ **recommended next** |
| UNIV-WALLS | **Universal class support (Tristan mandate 2026-05-30 "make all industrial products/classes").** Plan: `UNIVERSAL-ENGINE-PLAN.md`. A new class hits 4 hardcoded enumerations; envelope fails first. ✅ Wall 1 (generic envelope, cde61c6de). ❌ Wall 2 (generic plan / wire dormant composeToolGraph), Wall 4 (buildMinimalContract fallback), Wall 3 (generic graph-driven emitter — HARD, council-gated). Machinery is BUILT-BUT-INERT (drawer `forgeos_universal_class_machinery_built_but_inert`) — WIRE, don't rebuild | ❌ walls 2-4 open |
| MATERIALS-DB | ✅ DONE 2026-05-30 (e9e39d179 + 7f80bf0d7) — `material_prices` growing-DB in forge-truth.db; getMaterialPrice DB-first + static fallback; B-8 grounds in DB; `deriveMacroMaterialRateGbpPerKg` price-from-it primitive (auto-derives wind blade £18.3/kg). Live feed = pluggable hook | ✅ done |
| ENG-8 | Deterministic-generation Phase B (single-source numbers) + Phase C (DB-pin 100% of BoM with provenance) → stable ≥8 BESS council | ❌ in progress |
| VF-VALIDATE | Re-run VF chain through the 13-gate audit to validate the 40HC single-row / DX-HVAC-macro / external-skid emitter rework (commit `ec954a39c`); add a `dx_hvac_unit` macro-anchor regression invariant | ❌ pending chain run |
| MODELS-TAIL | Finish the stale-model-id long tail: ~8 live-script refs (`enrich-state-with-suppliers`, `estimate-missing-prices`, `classify-pretraining-parts`, 2 audit scripts) + price-table GA keys (add-not-replace) + `claude-sonnet-4-7`→`4-6` bug | ❌ pending |

## Council trajectory (BESS)
| Iter | Score | Note |
|---|---|---|
| L54 | **8.49** | peak — partly a lucky draw; real defects not yet audited |
| L55 | 5.87 | regression — £6,012 BoM contradiction (one bad run) |
| L56 | 6.70 | recovered after BoM determinism fix |
| L57 | — | not councilled — surfaced + fixed gate-17 (compliance rows) |
| L58 | — | not councilled — surfaced + fixed gate-21 (3 mispriced pins) |
| L59 | **4.50** | DROP — exposed 3 SYSTEMIC defects (now fixed): physics-critic prose leak, broken pricing curve, 2nd rollup gap. Score is variance-dominated, not recovering. |
| L60 | **4.95** | systemic fixes in; still FAIL (part_realism 2.75). Confirms variance-dominated → triggered the **deterministic-generation workstream** (option 2) below. |

**Systemic fixes (the real levers, all committed 2026-05-28):**
1. ✅ Thermal — dossier no longer renders the in-chain Physics Critic's raw (sometimes-wrong) notes as prose (the phantom "73 kW / can't run / Recalculate" #1 hit). `e10c4f1f5`
2. ✅ Pricing curve — per-category keyword floors/ceilings so whole classes price sanely (detector £4→£350, IPC £9k→£2.5k). `1a75297e1`
3. ✅ Second rollup — component-class breakdown reconciles to BoM total by construction. `7caaf6da8`

## DONE — committed today
| Commit | Fix |
|---|---|
| `dcac146ef` | **BoM determinism** — unmatched macros get a visible module home; cover = Σ headers by construction (regression root cause) |
| `e75345690` | Blender per-module best-view cameras (11/11 distinct) |
| `869086e21` + `734e8903e` | VF emitter hardened — 30/30 sub_modules carry real MPNs (gate 23) |
| `80bc68e96` | VF Blender template rebuilt — 40HC container + 8 trolleys + 12 VF module ids |
| `7382f5f3c` | Standards lookup de-stubbed — reads the real 4,098-row `pretraining_extracted_standards` |
| `d92667de1` + `0a9b43700` | Tools-flow diagram — real "Parts Cascade — Farnell/Digi-Key/Mouser" + "Standards Lookup — forge-truth.db" |
| `8e6d0dd75` | Cover naming — "concept-stage engineering design dossier" |
| `5188f0b6a` | Pricing INTERIM — curated catalogue prices for cascade-miss industrial parts |
| `6fd4c1497` | Pricing FULL — 53 industrial-OEM SKUs seeded into forge-truth.db (cascade serves DB-first) |
| `d015510db` | Gate-17 — map `nameplate_capacity_kwh` + `transient_power` kW/MW brief keys |
| `990c669e1` | Gate-21 — pin real prices (LEM £1→£113, Schneider £18.50→£45, NXP £5→£1.22) |

## IN FLIGHT (background jobs)
- `bblpsc0v4` — **BESS L59 chain** (clean full-stack) → then 4-seat council
- `aaf8404ebab8ece39` — **DB audit** agent (truth-grounded)
- `aa3457d561d4312de` — **Tools audit** agent (real/stub/wired/called)

## AUDIT FINDINGS (databases + tools, 2026-05-28 — code/DB-grounded)
**Big correction:** the engine runs on REAL tools, not stubs. `register-all.ts` imports `pybamm-real`/`coolprop-real`/`pandapower-real`/`ngspice-real`; L58 fired CoolProp 7.2.0 / pandapower 3.4.0 / ngspice 46 / pybamm 26.4.3. The `*-stub.ts` files are dead/unimported. **CoolProp de-stub was MY error — dropped.**
- **DB-first + grows (verified):** part PRICE (`distributor_cascade_cache`) + part EXISTENCE (`pretraining_extracted_parts`).
- **Newly wired (docs stale):** specs/standards/products writeback paths exist; standards read live (de-stubbed today); specs growth unexercised (0 web rows).
- **Real gaps:** (a) **class grounding is FROZEN baked TS** (`class-reference-graphs/*.ts`) not live-DB — the per-class "what a BESS should contain"; (b) **suppliers never DB-first** (`pretraining_extracted_suppliers` no reader; Nightshift 28k reverse-index unwired); (c) **3 validated tools stranded** (protection_coordination/arc_flash/g99 — no wrapper, not wired); (d) ~80 orphaned Python tools; (e) CLAUDE.md/DATABASES.md stale on writeback.

## DETERMINISTIC-GENERATION WORKSTREAM (option 2 — current focus)
Plan: `PLAN-deterministic-generation.md` (v2, post-council). Goal reframed by council: **deterministic AND correct** (not just deterministic — else "a reproducible lie").
Root cause of the score swing (code-verified, NOT memory): the LLM Generator was pruned 2026-05-23; variance now comes from **3 inadequately-guarded post-emission LLM mutation layers** + 7 single-source-of-truth number violations + pricing that never reads the DB (127/155 lines curve-estimated, £1/£10k outliers).
Council (Gemini 3.1 Pro / Grok 4.3 / GLM-5.1 / Kimi K2.6): direction sound, v1 had 6 two-seat holes — all folded into v2.

| Phase | What | Status |
|---|---|---|
| **A** | Lock design state vs LLM part/spec mutation (close the 3 leaks) | **DONE + council-verified (local, uncommitted)**: physics-repair whitelist; reviewer A2/A3 + add_sub_module guards (normalised); emitter-identity-lock.ts absorption layer (snapshot→re-assert, dual-key, in-loop in Phase-2). 2 council rounds; 7 blockers fixed; type-clean. Residual: simultaneous word.id+character_id rename (low-prob, unreachable by 2/3 stages, detected by words_missing → E1 invariant). A5 numeric-claim guard deferred to after B1. |
| **B** | Single-source + correctness of every number (thermal split, mass-reconcile gate, payload hard-gate, std merge) | pending |
| **C** | DB-pin 100% of BoM correctly (emitter fail-closed, curated prices w/ provenance, price-sanity bounds, det. classifier) | pending |
| **D** | Deterministic repair path | **NOT NEEDED (verify-first outcome)** — iter-61/62 physics-repair SKIPPED (plausibility 10/10, 0 HIGH findings); the emitter sizes/specs clean by construction, so neutering the LLM repair (A1) caused no regression + no repair vacuum. |
| **E** | Prove convergence (det. test on state-hash, gate audit, invariants, end-to-end + council) | in progress — running iters |

### Run progress (deterministic core)
| Iter | Result | Lesson |
|---|---|---|
| 61 | exit 23 — 2 empty reviewer sub_modules (watchdog_timer, emergency_stop_chain) | Phase A guards WORKING live (REJECT [identity-locked A2/A3] all over the log); physics-repair skipped @ plausibility 10/10. |
| 62 | exit 23 — **4 DIFFERENT** empty reviewer sub_modules (coolant_heater, coolant_return_manifold, gas_vent_interlock, cell_voltage_wire_upgrade) | Reviewer-added structure is NON-DETERMINISTIC → whack-a-mole + determinism-test killer. Decision: **block reviewer add_sub_module entirely** (structure = emitter-owned). |
| 63 | **exit 0 — clean PDF, all 13+ gates PASS** | gate 23 cleared (structure-lock worked). Full council **7.45 mean** (Grok 7 / GLM 6 / DeepSeek 9 / GPT-5.5 7.8). **part_realism 2.75 → 8.6** (the binding axis, fixed). Stable + earned (not a lucky draw). physics-repair skipped @ 10/10. |
| 64 | exit 0 | determinism 2nd run. **determinism-check(63,64): FAIL — identity ~99% byte-identical (1/141 word), but 40 PRICE diffs.** Variance MOVED to pricing → root cause = LLM cost-repair.tsx (Grok). |

### Council 7.45 → finish-fixes for stable ≥8 (all universal, "close to brief" per Tristan)
1. ✅ **Price determinism**: disabled LLM cost-repair by default (chain `CHAIN_ENABLE_COST_REPAIR`); deterministic cache→curve→sanity-bounds is authoritative (also lifts BoM toward the brief's premium band).
2. ✅ **Thermal arithmetic**: PyBaMM writes cell_heat_generation_kw; system_thermal_dissipation_kw recomputed = cell + inverter (invariant). (bess.ts:150)
3. ✅ **Mass single-source**: dropped 32,175 aggregator figure from BESS mass cascade → in_container_mass_kg (29,875).
4. ✅ **B4 payload**: container_payload_rating_kg = brief cap 35,000 kg (bespoke heavy-duty enclosure + brief's specialist-trailer note); new gate 30 asserts mass ≤ rating. Close-to-brief (brief allows 35,000 kg gross).
5. ✅ **Cost reconciliation**: universal cover card "ex-works vs brief target".

**NEXT:** iter-65 (≥8 council check) + iter-66 (determinism re-test, expect prices now byte-stable). 1 residual identity nit (ems_fibre_patch_panel MPN) to confirm gone.

**Key sequencing rule:** A1 neuters physics-repair's part-swap (which took L60 plausibility 5→10), so A1 must land WITH B/C/D or the score regresses. No chain run until the deterministic core (A+B+C+D) is coherent.
**Open product fork for Tristan (non-blocking):** B4 payload breach (~30 t system vs ~26.6 t ISO-668 payload). Default = bespoke heavy-duty enclosure + on-site/split transport note, keep 2.5 MWh. Redirect before I reach B4 to instead (a) cut capacity to fit standard ISO, or (b) make multi-container the headline.

## DEFERRED (post-workstream)
- Class grounding → DB-live; wire suppliers DB-first; wire 3 stranded engineering tools; fix stale docs; thin-brief test (#219); template-mismatch guard (#221).

## KNOWN STATE / GOTCHAS (verified today)
- Per-part **price** is served by `distributor_cascade_cache`, NOT `pretraining_extracted_parts` (latter = existence only, empty price).
- `pretraining_extracted_parts` grows live (cascade write-back). `standards` now read live (de-stubbed today). `specs` / `suppliers` / `products` still **baked TS snapshots, no write-back** = the "next major architectural move".
- VF was the outlier on module-id mismatch; BESS/heatpump/drone use canonical ids matching their templates.
- The chain's bash wrapper can report exit 0 while the chain failed a gate — always check the log's `Exit code:` + the gate audits.
