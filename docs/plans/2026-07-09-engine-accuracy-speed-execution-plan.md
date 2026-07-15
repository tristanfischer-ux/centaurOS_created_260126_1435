# Engine Accuracy + Speed — Reconciled Execution Plan

**Status:** Plan only — no code authorised by this document  
**Inputs reviewed:**
- `docs/plans/HANDOVER_gpt56_engine_suggestions_review.md`
- `docs/plans/2026-07-09-engine-accuracy-speed-suggestions.md`
- `OPERATING-FRAME-2026-06.md`
- `docs/ARCHETYPE-CAMPAIGN-PLAYBOOK.md`
- `docs/DECISION-defer-autonomous-hill-climbing-loop-2026-06-24.md`

## Important finding

`HANDOVER_gpt56_engine_suggestions_review.md` contains the instructions for GPT-5.6, not GPT-5.6's completed review. There is therefore no independent KEEP / DEFER / REJECT verdict to reconcile yet.

**Decision:** use this as the proposed plan, but do not begin implementation until GPT-5.6 has returned the requested review and Tristan has accepted the reordered scope.

---

## Objective

Improve the engine on two measurable axes without trading one for the other:

1. **Accuracy:** fewer wrong, contradictory, stale, or unverifiable claims in the delivered Excel/drawings.
2. **Speed:** fewer wasted cold runs and less repeated work, while preserving the full ship gate.

The governing sequence is:

> Honest measurement → fail-fast prevention → provenance/quantity spine → incremental execution → broader optimisation.

This order matters. Caching or parallelising a dishonest pipeline only produces wrong dossiers faster.

---

## Principles and non-negotiables

1. Delivered artefacts, not `state.json`, determine quality.
2. UNVERIFIED counts as FAIL.
3. Every fix is universal: noun + unit + qualifier + provenance, never project/class-name checks.
4. Every new gate proves both catch and correct counter-case.
5. Every finding routes to its source writer.
6. One physical quantity has one authoritative mint; downstream stages read or explicitly derive.
7. LLM output cannot block or vary a deliverable without cache stability or deterministic corroboration.
8. Distributor APIs remain outside the chain.
9. Autonomous self-rewriting remains deferred.
10. The `ship` profile never skips SIGHT or gates.

---

## Programme structure

### Phase 0 — Independent review and baseline

**Purpose:** prevent implementation from starting on unchallenged assumptions and establish performance baselines.

**Actions:**
1. Run the GPT-5.6 review handover and capture its verdict in a new review document.
2. Reconcile KEEP / EDIT / DEFER / REJECT decisions into this plan.
3. Measure current baselines on representative saved runs:
   - time and model cost by stage;
   - number of cold runs needed to reach an honest floor ≥9;
   - false PASS / false UNVERIFIED count;
   - cache hit rate;
   - time spent before a fatal gate;
   - drawing regeneration time.
4. Select the golden portfolio:
   - mature BESS;
   - Codema/water-treatment;
   - one unseen or thin archetype;
   - one small residential ESS mini-brief.

**Exit criteria:**
- GPT-5.6 review exists.
- Tristan accepts a prioritised list.
- Baseline report and fixed golden portfolio exist.

---

### Phase 1 — Stop wasted runs

**Purpose:** realise low-risk speed gains that also prevent invalid deliverables.

#### 1A. Toolchain boot preflight

Move gate-37-shaped checks before expensive work:
- correct Python environment resolves;
- a trivial engineering tool executes;
- worked-calculation bridge returns a valid result;
- required databases and output paths are readable.

**Acceptance:** every known dead-venv fixture aborts before the first paid model call; healthy counter-case passes.

#### 1B. Official run profiles

Define one authoritative profile interface:

| Profile | Purpose | Required result |
|---|---|---|
| `smoke` | Guards and fixtures | No customer artefact |
| `excel-iterate` | Scorecard iteration | Excel rendered and reingested |
| `drawings` | Drawing-only correction | Dirty drawings regenerated and audited |
| `ship` | Customer output | Full chain, all gates, SIGHT |

Profile settings must be visible in the run manifest. `ship` cannot inherit skip flags.

#### 1C. Fail-fast ordering

Proposed order:
1. Environment/database preflight
2. Brief parse/schema
3. Engineering-lock HARD slots
4. Unit-family/static preflight
5. Emitter completeness
6. Provenance-literal validation
7. Paid research and generation

#### 1D. Agent workflow rule

No cold chain until:
1. relevant selftest passes;
2. known-bad fixture proves the catch;
3. known-good counter-case passes;
4. saved-state/offline replay is clean;
5. the appropriate iterate profile is selected.

**Phase exit criteria:**
- Dead environment cannot consume paid calls.
- Every run records a profile.
- Median time-to-fatal-failure drops materially.
- No ship-gate behaviour is weakened.

---

### Phase 2 — Make quantities trustworthy

**Purpose:** remove the source of Codema's false UNVERIFIED, fake brief provenance, and multi-mint contradictions.

#### 2A. Provenance contract first

Introduce the conceptual provenance states:
- brief literal;
- brief derived;
- deterministic calculator;
- named engineering tool;
- corpus/database evidence;
- explicit assumption.

Every derived quantity must record:
- source identity;
- source inputs;
- canonical unit;
- derivation or tool output;
- confidence/verification state;
- source writer and downstream consumers.

**Why first:** alias resolution cannot be safe without knowing whether two quantities represent delivered values, targets, assumptions, or requirement echoes.

#### 2B. Quantity identity spine

Define quantity identity as:

> physical family + equipment/scope + strong qualifiers + canonical unit

Examples:
- usable battery energy ≠ nameplate battery energy;
- plant flow ≠ per-pump flow;
- continuous power ≠ peak power;
- achieved throughput ≠ brief target throughput.

Assign one authoritative writer. Reconciliation stages may replace a value only by emitting a recorded supersession event, after which dependants become dirty.

#### 2C. Strict metric equivalence resolver

Replace the original broad “bidirectional alias graph” proposal with a stricter resolver:

1. exact key match;
2. registered semantic equivalence with same unit family, scope, and strong qualifiers;
3. deterministic derivation from authoritative delivered quantities;
4. otherwise UNVERIFIED.

Never use unconstrained fuzzy matching. Never let target echoes satisfy delivered metrics.

The Codema RO case is the initial adversarial fixture, not a hardcoded rule.

#### 2D. Re-derive cascade

When an authoritative value changes, invalidate and recompute declared dependants such as:
- current;
- breaker;
- cable;
- thermal duty;
- panel totals;
- cost/output ratios;
- compliance rows.

**Phase exit criteria:**
- Codema-shaped key synonyms verify only when semantically equivalent.
- usable/nameplate and plant/per-unit counter-cases remain separate.
- calculator values cannot claim brief-literal provenance.
- stale dependent fixtures fail before rendering.

---

### Phase 3 — Prevent wrong physics before critics

**Purpose:** move detection from late model critique to early deterministic construction.

#### 3A. Seed-time engineering checks

At quantity creation, check applicable relationships:
- hydraulic power from flow, pressure/head, and efficiency;
- electrical current from power, voltage, phase, and power factor;
- energy from cell voltage/capacity/count;
- thermal capacity from load, ambient, and derating;
- enclosure/component scale compatibility.

Impossible or incomplete values remain explicit assumptions/UNVERIFIED; they are not silently promoted.

#### 3B. Deployment-envelope discriminator

Use multiple independent signals to select topology:
- mounting/deployment language;
- voltage/phase;
- energy and mass scale;
- dimensions;
- grid interface;
- installation environment.

No single noun determines the path. The result selects or suppresses topology families (wall cabinet, skid, container, marine, etc.) and is visible in the run manifest.

Powerwall is the first test case; the mechanism must also distinguish small commercial and utility BESS.

#### 3C. Emitter completeness at the earliest valid point

Run completeness immediately after module/submodule definition exists, before stages that would invent missing content.

**Phase exit criteria:**
- Known fertigation duty mismatch fails at seed time.
- Residential ESS cannot inherit container/MV topology in the test matrix.
- Correct small commercial BESS is not falsely suppressed.

---

### Phase 4 — Make delivered artefacts the authority

**Purpose:** close SIGHT so the engine audits what the customer receives.

#### 4A. Excel render-reingest

For every iterate and ship run:
- reopen the written workbook;
- read displayed cell values/formulas;
- recompute tab scores from delivered cells;
- check cross-tab quantities and totals;
- fail on blank, stale, clipped, or false-PASS states.

#### 4B. Drawing reingest

Use deterministic geometry/manifest checks first:
- required equipment/tag coverage;
- envelope and clearance;
- load/connection reconciliation;
- duplicated/overlapping annotations;
- topology consistency.

Use vision only for irreducible appearance residue and only with a known-bad proveCatch.

#### 4C. Gate promotion policy

Promote shadow gates individually when all are true:
1. decision is deterministic or deterministically corroborated;
2. proveCatch and counter-case pass;
3. golden portfolio has zero unexplained false blocks;
4. finding routes to a source stage;
5. rollback flag exists.

First candidate: deterministic gate-31 deception signals, not LLM-judge scores.

**Phase exit criteria:**
- Ship verdict derives from delivered Excel/drawings.
- State-vs-artefact stale fixtures fail.
- At least one safe deterministic shadow gate is promoted after evidence.

---

### Phase 5 — Incremental execution

**Purpose:** avoid rerunning clean stages, after authority and invalidation are trustworthy.

#### 5A. Stage dependency DAG

Document each stage's:
- inputs;
- outputs;
- source-code dependencies;
- side effects;
- purity;
- downstream consumers.

This DAG is a prerequisite for caching and parallelism.

#### 5B. Content-addressed stage cache

Cache keys include:
- normalised brief/contract input;
- relevant code/file hashes;
- model and prompt versions;
- database snapshot/version where relevant;
- run-profile settings.

A cache entry is reusable only if its provenance and output schema validate.

#### 5C. Dirty-stage resume

Resume from the first dirty node, not a manually guessed stage. Provide an explicit force-rebuild option and record cache reasons in `actions.jsonl`.

#### 5D. Incremental drawings

Reuse a drawing only when its manifest, envelope, connections, annotations, generator code, and style inputs are unchanged. Regenerate punchlisted sheets and all affected dependants.

**Phase exit criteria:**
- A price-only change does not regenerate unaffected geometry.
- An emitter/contract change invalidates every true consumer.
- Golden outputs are identical between clean full run and cached run.

---

### Phase 6 — Controlled throughput optimisation

**Purpose:** optimise compute only after correctness, invalidation, and artefact authority are established.

#### 6A. Parallelise proven-pure nodes

Parallel candidates:
- read-only deterministic gates;
- independent module drawings;
- cached DB-only lookups;
- independent ensemble calls.

Do not parallelise shared mutable design writes.

#### 6B. Prompt compaction

Replace repeated full-state payloads with validated digests containing:
- changed quantities;
- provenance;
- unresolved findings;
- relevant module slice;
- explicit output schema.

Keep high token ceilings available for genuinely large reasoning tasks.

#### 6C. Model and ensemble routing

Run scored A/B tests on the golden portfolio before changing seats. Evaluate:
- tab floor;
- deterministic gate findings;
- hallucination/parse failure;
- latency;
- cost.

Use ensemble early-exit only where the aggregation rule remains valid after stopping.

#### 6D. Conditional benchmark LLM

Do not let a known-family heuristic suppress the independent benchmark on unseen classes. Candidate policy:
- unknown family: always run independent benchmark on ship;
- known family, comfortably in deterministic band: benchmark can use cached result if inputs are unchanged;
- suspicious/radical: run fresh diagnosis.

**Phase exit criteria:**
- At least 30% lower median iterate time against Phase-0 baseline.
- Golden accuracy does not regress.
- Full ship output remains independently audited.

---

### Phase 7 — Corpus compounding (separate workstream)

**Purpose:** replace stale baked knowledge safely.

Order:
1. DB runtime reads with baked fallback;
2. provenance/confidence validation;
3. read parity report;
4. background ingest/writeback only;
5. remove baked source only after coverage and accuracy thresholds hold.

This workstream must not be mixed into the first speed programme because database drift and stage caching interact.

---

## Deliberately deferred or rejected

| Item | Decision | Reason |
|---|---|---|
| Broad fuzzy/bidirectional aliases | Reject | Can falsely equate target/delivered, usable/nameplate, total/per-unit |
| Cache before dependency DAG | Reject | Creates stale deterministic lies |
| More LLM judges | Reject | Cost/flake/Goodhart without provenance |
| Physics autocorrect as default | Reject | Repairs instances instead of source rules |
| Live distributor calls in chain | Reject | Quota, latency, nondeterminism |
| Per-class Powerwall/Codema branches | Reject | Violates universal rule |
| Autonomous hill-climbing | Defer | Existing decision: demand is the binding constraint |
| Full quantity-spine migration in one release | Defer | High blast radius; phase by conflict family |
| Model swaps based only on recency | Reject | Require task A/B evidence |

---

## Prioritised backlog

### P0 — First implementation wave

1. Environment/tool liveness preflight.
2. Official run profiles.
3. Fail-fast gate ordering.
4. Provenance honesty minimum contract.
5. Strict metric equivalence resolver with Codema fixture.

### P1 — Correctness spine

6. Quantity identity for flow, power, and energy.
7. Dependency-driven re-derive cascade.
8. Seed-time duty/physics checks.
9. Deployment-envelope discriminator.
10. Excel reingest as score authority.

### P2 — Speed after correctness

11. Stage DAG.
12. Content-addressed resume.
13. Incremental drawings.
14. Pure-stage parallelism.
15. Prompt/model/ensemble optimisation.

### P3 — Compounding knowledge

16. forge-truth runtime specs/standards.
17. Safe gate promotions.
18. Expanded golden mini-brief portfolio.

---

## Measurement dashboard

Track per run and by profile:

| Metric | Goal |
|---|---|
| Honest minimum tab score | No regression |
| False PASS count | 0 |
| False UNVERIFIED count | 0 on golden equivalence cases |
| Paid calls before deterministic fatal failure | 0 where preflight can detect it |
| Cold runs to ship | ≤2 after guards pass |
| Median `excel-iterate` time | ≥30% reduction |
| Cache hit rate by stage | Measured, never optimised at accuracy expense |
| Full-vs-cached output parity | Byte/cell/geometry equivalent where expected |
| Provenance coverage of displayed engineering numbers | 100% target |
| Unrouted gate findings | 0 |

---

## Review decisions required from Tristan after GPT-5.6

1. Approve or alter the phase order.
2. Decide whether provenance spine or immediate Codema alias resolution is the first coding wave; recommendation: minimal provenance + strict equivalence together.
3. Confirm whether delivered product is Excel-first, allowing PDF to remain skipped in `excel-iterate`.
4. Approve the golden portfolio and time/cost budget.
5. Decide which deterministic shadow gate is the first enforcement candidate.

---

## Handover prompt for the eventual implementation agent

> Implement only the approved phase. Before editing, verify the stated defect on fixtures/saved artefacts. Write proveCatch and correct counter-case first. Fix the universal source rule, record provenance and routing, run cross-archetype regression evidence, and stop at the phase exit criteria. Do not begin the next phase or run a full cold chain merely for discovery.
