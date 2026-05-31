# Wall-2 Schema-Driven Auto-Planner — Design Council Verdict (2026-05-31)

_4-seat adversarial design council (regression / interface / defeat-the-purpose / universality) on a drafted wall-2 implementation memo. Run wf_99d2f089-575. Every finding grounded in file:line._

## Verdict: `plan_is_sound: false`

**The reframe that matters: wall-2 is PLUMBING, not a user-facing increment.** A new (unregistered) class fails at `assembler.ts:154 {ok:false}` → `orchestrate.ts:144` failResult [LOUD] → `serial-design-chain-v2.tsx` exit 7, whether or not wall-2 composes a plan. Without wall-2 it fails at `selectPlan` (exit 7); with wall-2 it fails at the executor/assembler (exit 7). **Only the diagnostic string moves.** Per `outcome_over_plumbing_principle` + `feedback_never_present_smoke_test_artefact_as_demo`, a relocated exit-7 must NOT be presented as a deliverable. **Wall-3 (generic graph-driven emitter) is the value-gating critical path; wall-2 + wall-4 are its prerequisites.**

## Multi-seat holes (≥2 seats → auto-blocker)

1. **[4 seats] Wrong contract fn + unreachable success signal.** Chain uses `buildContractForChain` (engineering-contract.ts:10675), which returns a TRUTHY `quantities:{}` contract on a miss (not `buildContract:447` → null). So an unseen class ALREADY reaches exit 7 today. An empty contract starves the composed plan's tool inputs → exit 7 at the **executor**, not the assembler. **Wall-4 is the quantity-DERIVATION prerequisite that gates whether wall-2 can run at all — NOT "small + safe."**
2. **[3 seats] Wall-2 inert without wall-3** (see reframe above).
3. **[3 seats] Byte-identical invariant must be output-golden, not source-hash-pin.** Assert deep-equality of `contract.quantities` + `design.modules` for BESS+VF+wind warm states vs a committed golden snapshot (harness snapshot-load already at regression-harness.tsx:121). The source-hash-pin self-rebaselines on any wall-3 refactor and omits `orchestrate.ts` (the one runtime file wall-2 edits).
4. **[2 seats] `briefKeys` cannot come from `brief.metrics[]`** — `ParsedConstraints.target_performance` is singular, no `metrics` array. Derive terminators from the SEEDED `contract.quantities` key set at orchestrate entry.
5. **[2 seats] Harvester premise wrong.** `contract_update` declares outputs via `const out = output as {...}` type-literals (not `<key>: {`); 119 ToolSteps use no-arg `input_from_contract: () =>`. The manifest is a **manual authoring pass**, harvester seeds tool_ids only (~30%).

## Single-seat BLOCKERS (still real)
- **Generic-writer adapter infeasible as specified.** Real `contract_update` closures (a) RENAME tool outputs onto different contract keys (bess.ts:161), (b) COMPUTE invariants (bess.ts:162), (c) write `macro_assembly_prices` — **27/35 plans emit BoM cost inside `contract_update`.** A 1:1 quantity copy drops every macro price → no cost stack → B-2/B-3 fail. v1 adapter = 1:1 quantity copy on POST-RENAME contract keys + per-tool macro synthesis from a declared `cost_basis` field; rename/compute semantics deliberately NOT reproduced (safe — composed path only runs for unregistered classes).
- **`ContractInProgress` has no `shared_quantities`** (orchestrator types.ts); `requireSharedQuantity` (engineering-contract.ts:483) THROWS when absent → wall-3 emitter crashes uncaught. Add `shared_quantities?: Record<string,string|number>`; adapter seeds brief anchors.
- **`composeToolGraph` ignores `applicable_to`; 150/163 tools class-gate.** Harvest `applicable_to` allowlists into the manifest; composer treats a non-allowlisted class as a non-producer; only flat-bag tools are auto-composition-eligible in v1.
- **`keysMatch` ≥8-char substring fuses siblings** (`dc_output_voltage_v`/`ac_output_voltage_v` → `output_voltage_v`). Match composed-path keys on (base_key, basis) tuples or exact-match.

## Hard dependencies (sequencing)
- **WALL-3 (generic emitter) = critical path / value gate.** No PDF renders for an unseen class until it ships.
- **WALL-4 (quantity derivation), re-scoped:** derive seed quantities from `parsedConstraints.target_performance` + a universal floor inside `buildContractForChain`'s miss-fallback. `buildMinimalContract:3322` is a private stub taking quantities as INPUT — promoting it yields `{}`. Must land before/with wall-2.
- **Tool-I/O manifest** (`tool-io-manifest.ts`, absent) — immediate prerequisite; must carry `applicable_to` + `cost_basis`.
- **`shared_quantities` on the orchestrator contract type.**
- **WALL-6 grounding-discovery** (`writebackDiscoveredNode/Edge`) — out of wall-2 scope but the manifest is the artefact it later feeds (the self-learning "grows" half; the class-reference graph loop closed 2026-05-31 is its input).

## Recommended first commit (INCREMENT 0, zero behaviour change)
`scripts/lib/orchestrator/tool-io-manifest.ts` as a STANDALONE read-only data file, ZERO imports into the runtime path or the 35 class-plans: `const TOOL_IO` keyed by tool_id `{input_keys, output_keys, domain, applicable, cost_basis?}`; `getToolIOSchemas(): ToolIOSchema[]`; `UNIVERSAL_REQUIRED_OUTPUTS` split into a class-agnostic SOFT floor (mass, cost) vs CONDITIONAL domain keys. Harvest `output_keys` from each plan's `const out = output as {...}` type-literal (POST-RENAME contract keys), UNIONED across all plans using a tool_id; hand-author `input_keys` for the 119 no-arg tools; harvest `applicable_to`. Ship with: a unit test asserting `output_keys` EQUAL (not ⊇) the documented union + no two keys collide under keysMatch within one tool; a registry-purity test (importing the file mutates neither registry). **Explicitly plumbing — wall-2 stays inert until wall-3.**

## Corrected build order
0. Tool-I/O manifest (above) — safe, de-risking, reusable by wall-3 + wall-6.
1. Wall-4 quantity-derivation in `buildContractForChain` miss-fallback (the real prerequisite).
2. `buildComposedPlan` in planner.ts: briefKeys from seeded contract; exclude non-allowlisted tools; 1:1 copy + macro synthesis; `feeds_into:[]` + `validatePlan()`; (base_key, basis) key matching.
3. Wire `orchestrate.ts:95` additively (`selectPlan` unchanged); add `shared_quantities` to the contract type.
4. Output-golden regression invariants (not source-hash-pin) + `composed_planner_never_fires_for_registered_classes`.
5. **Wall-3 generic emitter — council-gated, NOT autonomous** — the only step that renders a PDF / enables any 8+ claim. Wall-2 + wall-4 commit bodies labelled "PLUMBING — no end-to-end value until wall-3."
