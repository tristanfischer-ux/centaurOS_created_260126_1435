# HAPS ≥8-everywhere — Physics & Auto-Planner Scope

_Scoped 2026-06-05. Four parallel code-mapping agents + mempalace cross-check. READ-FIRST artifact; no code changed in the scoping pass._

## TL;DR — two corrections to my own prior framing

My earlier conclusion ("the inert auto-planner is the HAPS bottleneck; the AIM long pole is building the universal physics path") was **wrong on two counts**, confirmed by the code and by two drawers dated 2026-06-03 that my loaded memory didn't surface:

1. **The auto-planner is NOT inert.** `composeToolGraph` (`scripts/lib/orchestrator/auto-planner.ts:93`, real Tarjan SCC + Kahn topo-sort) is wired live via `composeFallbackPlan` (`auto-plan-fallback.ts:149`) → `orchestrate.ts:105` → `serial-design-chain-v2.tsx:2616`, **default-ON since 2026-06-03** (`UNIVERSAL_AUTO_PLAN !== '0'`). The "zero callers" finding reflects the pre-2026-05-31 state.
2. **HAPS doesn't use the auto-planner at all.** HAPS is a **registered** class — it has a hand-written class-plan (`class-plans/haps.ts`, `register-all.ts:261`), a dedicated emitter (`emitters/haps.ts`), an archetype contract builder (`engineering-contract.ts:1148`), and HAPS-applicable physics tools. So it takes the hand-wired path and **never touches `composeToolGraph`.** Its wrong numbers are hand-wiring defects, not a missing auto-plan.

And the strategic question I was circling — "can a generic/universal path hit ≥8 on engineering content?" — **has already been answered.** Experiment A (2026-06-03, commit `049f43a03`): the BESS golden forced down the class-agnostic generic path scored brief-fidelity **8**, part-realism **8**, honesty **9**, coherence **6**, **engineering-plausibility 3**. Verdict already recorded: pure-generic-≥8 is **not** reachable; the lone wall is **engineering-plausibility sizing**; the decision is **per-class-FAMILY sizing plug-ins**, not more generic structure.

---

## Problem A — the universal/unseen-class path (NOT the HAPS lever)

Status, from code + roadmap (`UNIVERSAL-ENGINE-PLAN.md`, `GENERIC-EMITTER-PLAN.md`):

- **Structure: solved.** Generic envelope fallback (wall-1, `cde61c6de`), generic plan fallback (wall-2, auto-planner default-ON), Phase-1 generic emitter (`generic/generic-emitter.ts`, flag `UNIVERSAL_GENERIC_EMITTER`, default-off), `writebackDiscoveredNode/Edge` now have real callers (`serial-design-chain-v2.tsx:4493+`).
- **Sizing: the lone wall.** The 9.28 BESS golden is ~4,710 lines of coupled-physics sizing code (132 MPNs, 406 literals) that no growing DB holds and an LLM can't one-shot. The 30 gates *reject* wrongness; they don't *author* sizing. Key tradeoff (drawer): grounding to real catalogue parts raises part-realism but *lowers* plausibility — "ground to real parts" and "be physically plausible" pull apart without sizing.
- **Genuine remaining work (already planned):** wall-4 generic contract (`buildContractForChain` returns `{quantities:{}}` on a miss → starves the composed plan), `tool-io-manifest.json` completion (84 of 178 tools declare zero `output_keys` → can't be selected as producers), a gate-20-safe generic part-picker, and the **family sizing plug-in layer** (one "battery-systems" plug-in covers BESS/residential/marine; **no "aircraft" family exists** — `generic/sizing.ts` `FAMILIES = { battery }` only). The chosen ≥8 path = LLM authors per-class sizing **code**, iterated against the semantic-self-audit (gate 31) as oracle.

**Probing the universal path needs a genuinely-unregistered class. HAPS is the wrong probe — it's hand-wired.**

---

## Problem B — HAPS's actual draggers (registered-but-broken hand-wiring)

HAPS is a registered, **bit-rotted** emitter producing a **baked archetype that ignores the brief** — the same documented pattern (2026-06-03) as the edge_ai emitter shipping a rack server for a residential brief, and the satellite_smallsat emitter scoring 7.6/exit-18 today. The 5 physics-critic HIGHs + 2 gate-18 contradictions + dropped-hydrogen decompose into seven concrete defects, most shallow:

| # | Defect | Depth | Evidence | Fix |
|---|---|---|---|---|
| B-1 | **Dead consistency rules — key-name mismatch.** Verifier rules reference `solar_peak_kw`/`solar_required_kw`/`cruise_power_kw`/`total_estimated_mass_kg`; the plan **emits** `solar_harvest_peak_kw`/`total_system_mass_kg`. Missing-quantity → `verifier.ts:52-56` returns `passed:false` at **`warning`** (non-blocking). Only `haps.flutter_margin` is fatal+live. So the solar-balance, cruise-power, mass-envelope checks are **no-ops** — the 701 W/m² and 320 W errors sail past the validator meant to catch them. | SHALLOW | `class-plans/haps.ts:558-615` vs emitted keys | Rename rule keys to emitted keys; add harness invariant "every verifier rule references an emitted quantity" (**grep-able pattern — likely recurs across other registered classes**). |
| B-2 | **Torque-coherence tool exists, lists `haps` applicable, but is NOT wired.** `motor-prop:matching` (`tools/motor-prop-match.ts:29`; `python/motor_prop_match.py` does "match at intersection of motor torque curve and prop demand") is exactly the check that catches "A60 outrunner can't turn a 4.0 m prop." `class-plans/haps.ts` never invokes it — HAPS gets prop-alone (BEMT) + motor-alone (derate), never the join. | SHALLOW | grep: zero hits for `motor-prop:matching` in haps plan | Add the step to `HAPS_PLAN.tools`. |
| B-3 | **Two un-reconciled battery-energy fields → gate-18 contradiction (16 vs 18.84 kWh).** Contract holds `battery_capacity_kwh`=16 (`engineering-contract.ts:1245`) **and** `actual_pack_energy_kwh`≈18.84 (`class-plans/haps.ts:270`, from the Li-S tool). Emitter reads 16; other readers/LLM reach 18.84. Nothing reconciles them. | SHALLOW-MED | `performance-card.ts:599` merges both | Pick one canonical nameplate field; have the Li-S tool write back into `battery_capacity_kwh`. |
| B-4 | **Hardcoded emitter literals violate physics + brief.** 4.0 m prop literal (`emitters/haps.ts:626`, also fed to the BEMT tool at `class-plans/haps.ts:163`), Hacker A60 motor literal (`:596`), 5–8 kg payload literal (`:872`), `q(...,fallback)` defaults throughout. Shipped numbers come from literals, not enforced physics. | MED | emitter source | Derive prop Ø / motor / payload from tools+contract; remove literals (gate-25 brief-value-literal-scanner is the existing pattern). |
| B-5 | **LLM-prose-vs-contract divergence (cruise 2.27 vs 33.3 kW).** Contract/emitter compute ~2.27 kW (`engineering-contract.ts:1206`); the LLM Generator (Phase 2) independently narrates 33.3 kW; no post-LLM reconcile pass; gate-18 only **detects + aborts** (`cross-page-numeric-consistency-audit.ts:1597`), never reconciles. | MED | — | A reconcile-to-contract pass that rewrites LLM prose scalars to the canonical contract value. |
| B-6 | **Dropped hydrogen / payload 50→5.5 kg = MISSING brief→design contract (UNIVERSAL).** Brief requires "hydrogen + solar hybrid propulsion"; HAPS contract builder has **no fuel-cell branch**; brief only *tags* "hydrogen" (`brief-augment.ts:368`); `brief_to_design_fidelity` (3/10) is an LLM opinion (`physics-critic.ts:223`) that reports but never adds the subsystem. This is the baked-archetype root cause. | MED-DEEP | no presence/coverage gate exists | The already-planned **Quality layer**: an `architecture` schema slot + a HARD brief→design requirement-coverage gate that asserts every brief-required subsystem is present, failing closed when "hydrogen fuel cell" is required but absent. **Generalises to all 35 classes.** |
| B-7 | **Physics critic is SHADOW + too narrow.** Critic catches all 5 HIGHs in prose, but Gate-33 enforcement + Phase-2 autocorrect are both SHADOW-by-default, and even ON only handle "named-part-vs-rating" failures — not quantitative-impossibility/coherence (701 W/m², 320 W, topology). | MED-DEEP | `physics-critic-enforcement.ts:101-132` | Flip enforcement on for coherence faults; extend `issueIsBlocking` + the corrector to impossibility/coherence dimensions. **Universal.** |

---

## Leverage read & recommended sequencing (look → scope → build, each gated)

- **B-1, B-2, B-3** are shallow bugs (rename / add-a-tool / reconcile-a-field) — cheap, immediate HAPS lift; **B-1 is a grep-able pattern across classes.**
- **B-6 and B-7** are the **highest-leverage** — they are the universal "Quality layer" the generic-emitter plan already specced as "ship it even if pure-generic pivots." They fix HAPS's hydrogen-drop and the 5 physics HIGHs *at the gate*, and generalise to every registered class.
- **B-4, B-5** are HAPS emitter hygiene (de-hardcode + reconcile-to-contract), medium.
- **Problem A** (auto-planner / generic path) is **not** the HAPS lever and its strategic question is already settled — don't reopen it here.

**Proposed order:**
1. Shallow HAPS trio (B-1 + invariant, B-2, B-3) → re-run + council HAPS, measure bom/coherence lift. (Low-risk, but touches the verifier — validate.)
2. Universal Quality layer (B-6 brief→design coverage gate + architecture slot; B-7 flip physics-critic enforcing + extend to coherence). **Council-validated, not autonomous** (touches core orchestration).
3. (Deferred, separate) the family sizing plug-in layer — needs an "aircraft" sizing family that doesn't yet exist.

## Separate: the CAD layer (the "no fuselage" render)
The poor HAPS image is the procedural Blender template (`scripts/blender-templates/haps-9shot.py`), the 7th wiring layer — not physics. Root cause: the fuselage `pod_shell` is 0.46×3.0×0.42 m with 0.18/0.22 m stub fairings and 35 mm-radius twin booms, dwarfed by a 25 m wing → reads as "nose nub + floating V-tail." Fix designed (lengthen/streamline the central body via `add_frustum` nose+tail cones, thicken the booms); ready to apply + re-render.
