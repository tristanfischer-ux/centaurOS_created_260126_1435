# ForgeOS PDF Engine — Quality Workstream Tracker

_Live single-source-of-truth for the BESS/VF quality push. Updated 2026-05-28._
_(Previous TRACKER.md content — investor/supplier page redesign, fully shipped — is preserved in git at commit `2971a6bc5`.)_
_View styled: `~/.claude/scripts/show-md "/Users/tristanfischer/Developer/CentaurOS created 260126 1435/TRACKER.md"`_

## Goal
Recover BESS council quality toward ≥8 on a **deterministic, DB-grounded** document, and keep the engine universally sound (verified on VF). Driven by the principle: every fact comes **DB-first → search-on-miss → write-back → retrieve → grow**.

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
