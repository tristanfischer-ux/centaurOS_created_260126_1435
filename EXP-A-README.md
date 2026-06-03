# Experiment A — BESS-golden holdout (wall-3 de-risk) · RUNBOOK

_Scaffolded 2026-06-03. The scaffold is **built + tested**; the **council run is the fresh-session job**._

## The question this answers
Can a **generic** dossier (structure from the class-reference graph + real DB-first parts + contract quantities, with **no bespoke coupled-physics sizing code**) score within reach of the **9.28 hand-built BESS golden**? This is the one existential unknown the whole universal-engine north-star hinges on (`GENERIC-EMITTER-PLAN.md §1`). We answer it by forcing a **known** class (BESS) down the **generic** path with its 4,710-line hand emitter **held out**, then councilling the result against the golden.

## Run it (one command)
```bash
bash scripts/exp-a-bess-golden-holdout.sh            # → out/exp-a-bess-holdout/
```
This sets `EXP_A_HOLDOUT_CLASS=bess` + `UNIVERSAL_GENERIC_EMITTER=1` and runs the canonical BESS brief (`src/lib/pdf-engine-v2/briefs/baseline-10/09-bess-container.md`) through `run-class-iter.sh`. The holdout hides the BESS registered + legacy emitters so `bess` falls through to the generic miss-fallback (`assembler.ts §4`).

## Then evaluate (the actual experiment)
1. Open `out/exp-a-bess-holdout/chain-v2.pdf` and confirm all 31 gates + 13 audits exit 0 (never trust stdout alone — see project `CLAUDE.md`).
2. Council it (the same 4-seat council used for the golden) **and** read the Physics Critic.
3. Compare **section by section** to the 9.28 golden.

### Decision rule (`GENERIC-EMITTER-PLAN.md §1`)
| Result | Verdict |
|---|---|
| ≥ 8.0 all sections | **GO pure-generic** (confidence: low) |
| 6.0–7.9, fidelity ≥ 6, **zero HIGH gate findings** | **GO hybrid**, target ≥6-honest — the realistic win (confidence: moderate-high) |
| < 6 **OR** any HIGH engineering finding | **PIVOT** to class-family sizing plug-ins first |

## What the scaffold does (verified) — and deliberately does NOT
**Does (tested by `scripts/test-generic-skeleton.tsx`, PASS):** derives one module per class-graph node (11/11 for BESS), keeps every `required` node, gives each a gate-23-shaped seed word, and surfaces the contract's scalar quantities on the principal node. `finalise()` then runs the density-splitter + brief-scope-filter; the chain's `completeEmitterGaps` (which runs **before** gate-23) fills each seed word's honest `"specify at detailed design"` placeholder with a real DB-first MPN; the narrator writes prose; Engine-B/C price the BoM.

**Does NOT (rough by design — this is what Experiment A measures the absence of):**
- **No bespoke sizing.** The 9.28 lives in ~4,710 lines of coupled-physics in `deterministic-emitter.ts`; the generic path carries none. Thin `derived_parameters` on non-principal modules is **expected** and is exactly the signal we want to read.
- **No edge→links yet.** `cross_module_grammar_links` is empty (graph edges → links is the Phase-1 build).
- **No gate-20 firewall yet.** Real-part density leans entirely on the downstream gap-filler; `generic/pick-verified-part.ts` (the §3 firewall) is Phase-2.

## Likely iteration points for the fresh session
- **gate-23** if the gap-filler can't fill a node's MPN → widen its part search (sub→module→class) or accept the honest deferral (may need a gate-23 tweak to pass honest-deferral words).
- **gate-17 / compliance** thin because non-principal `derived_parameters` are empty → decide whether to map more contract quantities per-module (still no invented numbers).
- **gate-20** if any gap-filled MPN is fictional → that's the firewall's job (Phase-2).
- **Slug resolution**: confirm `resolveClassGraphSlug('bess')` reaches `bess-utility-scale` in the chain's envelope (the test calls the slug directly).

## Files
| File | Role |
|---|---|
| `scripts/lib/orchestrator/assembler.ts` | §0 holdout + §4 generic miss-fallback hook (flag-gated; 35 registered classes never reach it) |
| `scripts/lib/orchestrator/generic/derive-skeleton.ts` | graph nodes → `DesignModule[]` (Tier B; pure, tested) |
| `scripts/lib/orchestrator/generic/generic-emitter.ts` | `emitGenericDesign` — resolves the graph, wraps the skeleton in `DesignJSON` |
| `scripts/lib/orchestrator/generic/emitter-primitives.ts` | shared `mod/cc/word/makeSubModule/synthesizeRadSyntax` |
| `scripts/exp-a-bess-golden-holdout.sh` | the one-command runner |
| `scripts/test-generic-skeleton.tsx` | self-verifying smoke + invariant test (no chain/LLM/network) |

_North star stays pure-generic ≥8 (high-confidence NOT near-term); the next build after a GO/HYBRID is `GENERIC-EMITTER-PLAN.md §7` Phase 0 → Q → 1 → 2 → 3 → 4._

---

## Experiment A — RESULT (2026-06-03 live run) · VERDICT: HYBRID — build Phase-1 (rough graph-only is too thin)

Ran the holdout end-to-end on the canonical BESS brief. The de-risk delivered a **measured verdict**.

**What worked:**
- Holdout + generic path engaged cleanly — `bess` fell through to assembler §4, `emitGenericDesign` produced 11 modules from the `bess-utility-scale` graph (`hit:db`); the chain ran end-to-end through Phase-2 and every structural gate.
- **gate-23 PASS** (12/12 sub_modules) — structure is complete.
- Partial real-part grounding worked (an ABB PCS inverter grounded downstream).
- **#41 verified live** — the Physics Critic flagged `brief_to_design_fidelity @ environmental_interface`; the constrained relaxation PERMITTED the reviewer's `add_sub_module environmental_interface__chiller` (module was fidelity-flagged) and the snapshot extended (+1). Risk-#1 (Critic `where`-field → module match) RESOLVED.

**Why it is NOT yet a councillable dossier (the measured gap):** a pure graph-node skeleton is structurally complete but far too THIN. The grammar/density gate flagged comprehensively — and Phase-2 could NOT repair it (Phase-2 is architecturally barred from adding MPN-bearing words/structure, so it looped without converging):
- `sub_module_word_density`: 12 sub_modules at **1 word** (need 5-7 for a real BoM).
- `word_modifier_richness`: 11 words at **2 mods** (need qty+manufacturer+part_number+rating = 4).
- `cross_module_required_links`: **10 required BESS links MISSING** (`cross_module_grammar_links` emitted empty).
- `no_orphan_sub_modules` / `thermal_path_closes` / `sensor_has_receiver`: all consequences of the empty links.
- `module_cell_count` incomplete (cell_count without module_count / cells_per_module).
- Plausibility misses on coupled geometry (PCS depth vs container width; rack row vs container length) — the "no bespoke sizing" gap, as expected.

**Decision-rule outcome:** rough-generic can't clear the BoM floor → confirms **HYBRID, not pure-generic-≥8**. The generic emitter needs **component-level** structure, not module-level. (This is a *successful* de-risk: it converted the existential unknown into a precise build spec, cheaply, without committing to the multi-session build first.)

### Phase-1 build spec (measured from the live run — execute next)
1. **edges→links (cheap, high-impact):** populate `cross_module_grammar_links` from `graph.edges` (each `ConnectionEdge` carries `from_class`/`to_class`/`mechanism`). Clears cross_module_required_links + no_orphan + thermal_path + sensor_has_receiver in one move — the gate literally enumerates the required links and they are all already in the graph. Done in `generic-emitter.ts` (DesignJSON-level field).
2. **Tier-A component density (the big lift):** per module, emit 5-7 component words by unioning the nearest `pretraining_products.modules_json` trees (§3 Tier A) instead of one placeholder per node — feeds word density AND gives the gap-filler specific component names to ground.
3. **word richness + true-gap parts:** emit each word with qty + a contract-derived rating, and WITHOUT a `part_number` modifier (a *true* gate-23 gap) so `completeEmitterGaps`/`fillBlankWordMpns` supplies real manufacturer+MPN — avoid the dead-zone `'specify at detailed design'` placeholder that blocks grounding.
4. **derived_parameters completeness:** emit the full arithmetic field set per module (cell_count + module_count + cells_per_module …), not just raw contract quantities.

Then re-run `bash scripts/exp-a-bess-golden-holdout.sh` and council vs the 9.28 golden.

---

## Phase-1 RESULT (2026-06-03, two builds) · VERDICT: STRUCTURE SOLVED — SIZING IS THE WALL → PIVOT

Built the component-level Phase-1 (new `generic/component-source.ts` Tier-A corpus union + `generic/build-links.ts` graph-edges + required-link registry + rewritten `derive-skeleton.ts`) and ran the holdout twice.

**What the universal machinery now SOLVES (no per-class code):**
- gate-23 PASS (22/22 sub_modules) — no completeEmitterGaps injection (the gate-20-safe `'TBD (detailed design)'` placeholder satisfies gate-23, so the mis-pinning injection never fires; `fillBlankWordMpns` still grounds the catalogue-named words).
- **gate-20 PASS** (was exit-20 in build-1 on a `'Carl Zeiss'` injected mis-pin → fixed by the placeholder).
- **D-1 PASS** (2 sub_modules/module, mean 2.0) via the split.
- Grammar/density/links/orphan/sensor/thermal all PASS; layout, BoM-reconciliation, jurisdiction (UK, 0 findings — generic emits NO `regulatory` modifier, sidestepping gate-19), mis-pin, thermal, sizing-vs-load, drift, parts, completeness, consistency all PASS.
- **4 of 5 Physics dimensions clear or near the ≥8 floor:** brief_to_design_fidelity **8**, part_realism **8**, honesty_signal **9**, internal_coherence 6.

**The lone WALL — engineering_plausibility = 3/10 (sizing/scale):**
- "15 racks × 800 mm = 12 m won't fit a 40-ft container" (layout geometry), "a 1 MW inverter can't fit in 0.53 L" (grounding pinned a real but SiC-device-scale part), cooling margin. Chain exits **26** (per-rack drift: narrator "250 cells per string" vs the correct total 3750 = 250×15 — a denominator-alignment quirk, the cells ARE sized right).
- TRADEOFF FOUND: grounding to real parts lifts part_realism (→8) but DROPS plausibility (5→3) because real catalogue parts are scale-wrong for an assembly-level slot. Scale-aware grounding is a Phase-2 lever but the core (how many / what rating / what dimensions) needs coupled-physics SIZING.

**Decision-rule outcome:** HIGH engineering findings + plausibility <6 → **PIVOT** (per `GENERIC-EMITTER-PLAN.md §1`). Pure-generic-≥8 is NOT reachable: the universal path nails structure + document hygiene + parts + honesty (4/5 dims), but ≥8-on-every-section reduces to **ONE** remaining problem — **engineering plausibility = sizing/scale** — which is irreducibly (semi-)per-class coupled physics. The next workstream is **generic structure + per-class-family sizing plug-ins**, not more generic-structure work.

Regression guard: `GENERIC.derive_skeleton_safe_placeholder_and_density` (regression-harness.tsx). Mechanism drawers: `forgeos_gotchas_b96c4c258b64cc14` (two-function grounding), `forgeos_gotchas_64ddb51bf0015e88` (coarse-family class-connections keying).
