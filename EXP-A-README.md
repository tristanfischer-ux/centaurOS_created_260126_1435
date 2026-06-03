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
