# Council Review — ForgeOS PDF Engine v2 Production Migration Plan

**Date:** 2026-05-10
**Purpose:** Adversarial pre-commitment review of the 7-phase, 10-12 week v1 migration plan.
**Council:**

| Seat | Model | Cost |
|------|-------|------|
| A | `anthropic/claude-opus-4.7` (claude-4.7-opus-20260416) | $0.1127 |
| B | `google/gemini-2.5-pro-preview` | $0.0597 |
| C | `deepseek/deepseek-r1` | $0.0060 |

**Total cost:** $0.1784 USD / £0.14 GBP

---

## Seat Summaries (raw positions before synthesis)

**Opus:** Architecture is real. Plan sequenced for engineering convenience, not risk reduction. Grammar Phase 4 too late — should precede resolution. Timeline wishful by ~40% (14-18 wk realistic). Golden eval harness is the single biggest missing item. Recommends BESS-first, keep fallback with hard deletion date, defer Phase 6, incremental renderer, PR + council quorum for library governance. Shadow mode 3-4 weeks.

**Gemini:** Plan is "a recipe for a 6-month death march." Confuses `git mv` with architectural integration. Biggest sequencing error: renderer (Phase 5) too late — tree structure must be validated against PDF layout before 7 weeks of backend work locks it in. Demands a Phase 0 vertical slice (1 week) forcing tree through skeleton of all stages before commitment. 16-18 weeks realistic with buffer. Prefers all-10-at-once and rip-out fallback (contrarian on both D1 and D2). Shadow mode on exit criteria (metric-based), not time-based.

**DeepSeek:** Strongest adversarial position: plan "dangerously underestimates technical debt." 18 weeks. Critical flaw is the universality assumption — 22-radical library biased toward commodity designs, will fail on novel inputs. Demands radical fault-injection sprint BEFORE Phase 1. Grammar 6→30 in 4 weeks "wildly unrealistic" (1.5 rules/day each needing conflict testing). Biggest missing item: schema backfill of 10K+ historical manifests. Agrees defer Phase 6, BESS-first, keep fallback.

---

## Q1 — Sequencing: Is It Optimal?

**Consensus: No. Two errors, one catastrophic.**

**Error 1 (CATASTROPHIC): Renderer placed in Phase 5, after grammar.** Two of three seats flag this independently. Grammar verdicts require structural rendering support (inline WARNs, hierarchical BOM nodes). If Phase 4 completes without a renderer that can consume the tree, you either ship broken PDFs or bolt temporary scaffolding onto Phase 4 that you rip out in Phase 5. Worse: if the tree structure optimised for resolution/grammar is unsuitable for PDF layout — different depth, different node fanout — you must rewrite Phase 1's prompt and invalidate 4-6 weeks of upstream work.

**Error 2 (SIGNIFICANT): Grammar (Phase 4) is too late.** Grammar rules should constrain what gets decomposed and resolved, not flag it post-hoc. The LFP 87.7% derate WARN is a clean example — it should fail the composition *before* resolution queries distributors for an out-of-spec config. Placing grammar after resolution means some resolution work will be for compositions grammar should have blocked.

**Consensus reorder:**
1. Phase 0 (new, 1 wk): Vertical slice — hardcoded single archetype through skeleton of all stages including renderer. Validates tree structure is consumable before committing at scale.
2. Phase 1 (decomposition emits tree) — with grammar seed rules (6) already active as validators.
3. Phase 4 (grammar, 6 seed rules in prod) — fires in parallel with Phase 2.
4. Phase 2 (resolution) — tree exists, grammar gates it.
5. Phase 3 (cost rollup).
6. Phase 5 (renderer — tree-aware, now fully informed by what grammar/resolution need).
7. Phase 6 deferred or cut.
8. Phase 7 (fallback removal).

**Dissent:** DeepSeek additionally argues Phase 3 (cost rollup) must precede Phase 2 (resolution), so pricing flows into validated cost nodes. Opus and Gemini do not flag this sequence — minority position, low confidence.

---

## Q2 — Timeline: Realistic?

**Consensus: 10-12 weeks is fantasy. Realistic range: 16-18 weeks.**

All three seats converge on ~18 weeks, independently.

**Specific underestimates:**

| Phase | Plan | Council estimate | Reason |
|-------|------|-----------------|--------|
| Phase 1 (Decomposition) | 2 wk | 3-4 wk | Prompt iteration for tree output across 10 classes is empirical, serial work. 4-5 cycles per class expected. |
| Phase 4 + grammar growth | 1-2 wk + 3-4 wk parallel | 6 wk total | Rule authoring is a serial constraint-design problem. Non-conflicting rules compound in complexity. |
| Phase 5 (Renderer) | 2 wk | 3-4 wk | Tree-shaped BOM with vendor attribution and inline grammar verdicts against a template built for flat lists is major structural work. |
| Phase 7 (fallback removal) | 1 wk | 2 wk | Excising conditional code paths across 10 classes, cleaning tests, full regression. |
| Shadow mode | not in plan | 3-4 wk | See Q7. |

**Add slack:** +2 wk Phase 1, +2 wk grammar, +1-2 wk renderer, +2 wk fallback removal, +3 wk shadow mode. Hidden taxes: distributor API rate limits, MPN data quality issues, PDF layout regressions not visible until real reports render.

---

## Q3 — Missing Work: Top 3 Collectively Flagged

**All three seats converge on these three gaps:**

### Gap 1: Eval Harness / Golden Set (BLOCKER)

Flagged by all three independently. Zero PR-level regression testing exists in the plan. No frozen golden outputs for any of the 10 baseline classes. Without this:
- Phase 1 prompt iterations regress silently.
- Grammar rule additions break compositions that previously passed.
- Cost rollup changes produce undetected delta.

Required: JSON snapshots of current per-class outputs (tree shape, BOM, cost total, grammar verdicts, render hash) for all 10 classes. Every phase PR must pass the harness or explain the diff. **This must exist before Phase 1 begins.**

### Gap 2: Schema Migration / Versioning (BLOCKER)

Existing production manifests are flat-list. The plan is silent on:
- What happens to in-flight and archived reports when schema changes.
- Whether a `schemaVersion` field exists in the tree root.
- Backward-read compatibility for old PDFs.
- DeepSeek specifically flags 10K+ historical manifests requiring backfill — if this number is accurate, that is a multi-week migration job with zero mention in the plan.
- What happens when the 23rd radical is added — do all old trees become invalid?

Required: `radical_spec_version` field, backward-read compatibility layer, explicit migration scripts.

### Gap 3: Distributor API Resilience / Cost Determinism (SIGNIFICANT)

The demo queries live distributors. In production:
- Rate limits (no caching strategy mentioned).
- MPN deprecation (parts go EOL; no stale-MPN policy).
- Regional stock variance and currency fluctuation.
- API outages (no circuit breaker).
- Cost non-determinism: £820,637 today, £847,221 tomorrow because prices moved. Is the cost rollup deterministic for a given report ID? No pinned snapshots vs live query policy defined.

**Additional missing items flagged by 1-2 seats:**
- Observability / monitoring: per-stage latency, radical-coverage %, grammar fire rates, resolution hit rates, fallback-engagement rate.
- Rollback plan (distinct from fallback): one-command procedure to revert production in under 5 minutes.
- Grammar rule conflict resolution system: precedence model, deduplication when multiple rules share a root cause.
- Library governance process: the bar a 23rd radical must clear, including a required eval-harness pass against all 10 baseline classes.
- LLM prompt version pinning: `MODULE_DECOMPOSITION_SYSTEM_PA` changes affect all 10 classes simultaneously. No versioned-prompt strategy mentioned.

---

## Q4 — Per-Decision Council Verdicts (D1-D5)

### D1: Cutover Strategy

**Council verdict: BESS-first (2-1 majority)**

- Opus: BESS-first. Empirical proof of universality already exists from the radical growth curve. No need to re-prove it under production risk. BESS-first = batch validation of remaining 9, not new architectural risk.
- DeepSeek: BESS-first. Universal claim is unproven in production. Niche classes (CGM/AUV/HAPS) added only 2 radicals — library may be biased toward commodity designs. Exploding one class is cheaper than 10.
- Gemini: All-10-at-once (DISSENT). The real risk is in niche classes; force the confrontation now rather than discovering failure at class 6 after 4 months of BESS-only operation.

**Recommendation: BESS-first.** Gemini's point is architecturally valid, but the asymmetry of production risk favours the safer path. The universality claim is already empirically validated — you do not need production exposure to all 10 simultaneously to re-prove it.

---

### D2: Per-Class Fallback

**Council verdict: Keep with time-box (2-1 majority)**

- Opus: Keep with hard deletion date in Phase 7. A non-converging baseline + 10 classes over 14-18 weeks means you will hit at least one class where Radical underperforms. No escape hatch = forced regression.
- DeepSeek: Keep. Auto-engage if >5% resolution failures occur. Rip-out is "suicidal."
- Gemini: Rip out (DISSENT). Fallback doubles the testing matrix, allows bugs in the Radical path to hide, and ensures permanent "Frankenstein" half-state. Pain acute but brief.

**Recommendation: Keep, with time-box.** Gemini's testing-matrix argument is real and should inform the Phase 7 deadline — set a hard date 2 weeks after shadow-mode exit criteria are met, after which fallback is removed regardless.

---

### D3: Order-Parts Feature

**Council verdict: DEFER TO v1.5 (unanimous)**

All three seats independently reach the same verdict. Demo CSVs already work. Phase 6 is product-marketing value, not migration value. Cuts 1 week off critical path with no loss of v1 architectural completeness.

---

### D4: Library Governance

**Council verdict: Council mandate + Tristan veto (2 seats prefer this; 1 prefers PR review with council quorum)**

- Gemini + DeepSeek: Council mandate. 22 radicals are the x86 instruction set of the platform — changes require gravity of modifying CPU microcode. Slow, deliberate, Tristan holds veto.
- Opus: PR review with council quorum + radical-justification doc. Require: (a) written proof existing 22 cannot compose the new behaviour, (b) PR review, (c) eval-harness pass against all 10 baseline classes.

**Recommendation:** Adopt Opus's process (it is the most concrete), with council mandate as the spirit. The bar should be written justification + eval-harness green across all 10 classes + council quorum. Tristan holds veto. "PR review" alone is insufficient — the eval-harness requirement is the real gate.

---

### D5: Renderer

**Council verdict: Incremental (2-1 majority)**

- Opus + DeepSeek: Incremental. Scrap-and-rewrite is the most common cause of stalled migrations. A rewrite hides inside a 2-week estimate and becomes a 6-week project.
- Gemini: Scrap and rewrite (DISSENT). Data model has fundamentally changed flat → tree. Incremental migration produces a mess of adapters and shims harder to maintain than a clean rewrite.

**Recommendation: Incremental, but with a Phase 0 vertical slice first.** Phase 0 (see Q1 reorder) validates the tree is consumable by the PDF engine before committing to either approach. If Phase 0 reveals the existing renderer is structurally incompatible with tree-shaped data, escalate to rewrite at that point — not before.

---

## Q5 — Top 3 NEW Risks (Not in Original List)

### Risk 1: Decomposition Non-Determinism (Opus)

**Severity: HIGH. Kill probability: HIGH.**

The demo worked once. It has not been stress-tested for inter-run consistency on the same input, or cross-class consistency where the same component (e.g., "cooling subsystem") decomposes differently in BESS vs bioreactor when it shouldn't.

If LLM tree decomposition is inconsistent across runs — different tree shapes, different radical assignments — the cost rollup, grammar verdicts, and BOM become non-reproducible. By week 8, with Phases 1-3 in production, you discover the same product generates two different £-totals on rerun. This is a trust-destroying production bug with no fast fix.

**Mitigation:** Temperature-0 + tree-canonicalisation step + golden-set determinism tests before Phase 2 begins.

---

### Risk 2: LLM Provider Model Drift (Gemini)

**Severity: HIGH. Kill probability: MEDIUM.**

The entire Radical architecture depends on `MODULE_DECOMPOSITION_SYSTEM_PA` producing consistently structured trees. When the provider pushes a silent backend model update, the prompt's output structure can degrade with no warning. Debugging begins in the code before anyone checks the model version.

**Mitigation:** Pin to a specific model version. Add a CI job that continuously re-evaluates golden-set prompts against the pinned version and alerts on structural drift.

---

### Risk 3: Radical Library Collapse on Novel Inputs (DeepSeek)

**Severity: HIGH. Kill probability: MEDIUM.**

The 22-radical library was validated against 10 known product classes. When a user submits a design outside the training set — DeepSeek cites "modular nuclear reactor" or "biohybrid drone" — radicals fail to decompose the tree, triggering cascade failure through resolution, cost, and grammar. Fallback permanently engages, the universal architecture claim becomes false in practice, and the system accumulates technical debt around a broken promise.

**Mitigation:** Radical fault-injection testing before Phase 1. If >5% of V8 council manifests require a 23rd radical, halt migration and extend the library first. Add explicit "unknown radical" fault paths with graceful degradation.

---

## Q6 — Grammar Growth: 6 to 30 Rules in 3-4 Weeks

**Consensus: Authoring 24 rules is feasible. Authoring 24 non-conflicting rules in 4 weeks is not.**

All three seats flag this independently. The LFP derate rule is a clean rule: one component, one threshold, one verdict. The next 24 will not all be that clean. Rules will have scope ambiguity (thermal rule at cell level vs pack level?), unit drift (V vs %SOC vs Wh), and class-specific exceptions (aerospace temperature rule conflicts with marine rule).

**Failure modes in production:**
1. **Verdict Contradiction:** Rule A says PASS, Rule B says FAIL on the same node. Renderer shows both. User loses trust. (Gemini's example: Rule #12 warns battery voltage too high; Rule #28 clears same battery as in-spec.)
2. **Cascade fires:** One root cause trips 8 rules; PDF reads as 8 distinct problems.
3. **False positive compounding:** 6 rules × 10 classes = 60 evaluations. 30 rules = 300 evaluations. False-positive rate compounds at scale.
4. **Combinatorial explosion in conflict testing:** Each new rule must be tested against all N-1 existing rules (DeepSeek: 1.5 rules/day, each needing conflict testing against all others — the work is O(N²), not O(N)).

**Required infrastructure (missing from plan):** Rule precedence model (Safety > Efficiency > Cost priority ordering), rule deduplication when fires share root cause, per-rule confidence/severity, eval set with labelled expected verdicts per class.

**Council recommendation: Cap v1 at 15 rules**, well-tested with conflict resolution. Grow to 30 in v1.5.

---

## Q7 — Shadow Mode Recommendation

**Consensus: Shadow mode mandatory. Run before any user-visible cutover.**

- Opus: 3-4 weeks in shadow mode.
- DeepSeek: 4 weeks minimum.
- Gemini: Metric-based exit criteria, not time-based.

**Synthesis:** Gemini's metric-based framing is superior. Shadow mode runs until:
1. Radical v2 produces cost rollups within ±2% of v1 for >99.5% of production traffic across all 10 classes.
2. Pipeline success rate >99.9%, latency within 120% of v1.
3. At least one meaningful, correct grammar verdict fires on >10% of reports.
4. Zero unresolved grammar contradictions (PASS + FAIL on same node).

These criteria must be met for 2 consecutive weeks. Expected duration: 3-5 weeks if Phase 0 vertical slice and eval harness are built first. Shadow mode must be a first-class infrastructure concern — run Radical alongside per-class for every production request, store both outputs, diff and surface in an internal dashboard.

---

## Q8 — Cut One, Add One

**Cut (unanimous): Phase 6 — Distributor CSV export endpoints.**

Demo CSVs already work. Productising the "Order Parts" PDF section is v1.5 polish. Saves ~1 week. Removes a renderer-coupled feature from the critical path. No architectural value lost.

**Add:**

- Opus: Frozen **golden eval harness** before Phase 1 begins. Highest-leverage single addition.
- DeepSeek: **Radical fault-injection / chaos harness** — synthetic compositions injected to force decomposition errors, prove resolution fallbacks work, validate grammar with invalid trees. Proves universality is not demo theatre.
- Gemini: A dedicated **data and LLM validation role** for the duration of the migration.

**Synthesis:** The golden eval harness (Opus) and radical chaos harness (DeepSeek) are complementary and should both ship as Phase 0 work — total additional effort ~1 week, highest risk-reduction per hour in the plan.

---

## Top 3 Missing Items — Council Collective

1. **Golden eval harness** — frozen JSON snapshots of all 10 baseline classes, every PR must pass or explain the diff. Must precede Phase 1. (All three seats.)
2. **Schema versioning and migration plan** — `radical_spec_version` in tree root, backward-read compatibility, explicit migration scripts for historical manifests. (All three seats.)
3. **Grammar rule conflict resolution system** — precedence model (Safety > Efficiency > Cost), deduplication, labelled eval set per class. Required before grammar grows beyond 6 seed rules. (All three seats.)

---

## Top 3 New Risks — Council Collective

1. **Decomposition non-determinism** — same input produces different trees across runs; cost rollup becomes non-reproducible; trust-destroying production bug. (Opus — highest severity.)
2. **LLM provider model drift** — silent backend update to `MODULE_DECOMPOSITION_SYSTEM_PA`'s model breaks tree structure with no warning; weeks of wrong-layer debugging. (Gemini.)
3. **Radical library collapse on novel inputs** — user submits out-of-distribution design; radical decomposition fails; cascade failure through resolution/cost/grammar; fallback permanently engaged; universal architecture claim false in practice. (DeepSeek.)

---

## Final Verdict

**NEEDS REVISION — specifically:**

1. Add Phase 0 (vertical slice, 1 wk): force a single archetype through skeleton of all stages including renderer before committing architecture at scale.
2. Reorder: grammar seed rules must be active before resolution begins (not after).
3. Build golden eval harness + radical chaos harness before Phase 1 starts.
4. Add schema versioning (`radical_spec_version`) and migration scripts to the plan — this is a blocking gap.
5. Add grammar rule conflict resolution system before growing beyond 6 rules.
6. Revise timeline to 16-18 weeks with explicit shadow-mode phase (metric-based exit criteria).
7. Cap grammar at 15 rules for v1.
8. Cut Phase 6.

The 7-phase plan is not ready to commit as written. It is missing the production scaffolding (eval harness, schema versioning, grammar conflict system, shadow mode infrastructure) that makes the migration survivable. The architecture itself is sound — the proof is real. The plan to migrate it is not.

---

## Single Most Important Pushback for Tristan

**You have no eval harness and no schema versioning plan, and you are about to start changing the system's foundational prompt (`MODULE_DECOMPOSITION_SYSTEM_PA`) across 10 classes simultaneously.**

Without a frozen golden set before Phase 1, every prompt iteration is a leap of faith. You will not know whether a Phase 1 change improved BESS decomposition or silently regressed vertical farm decomposition — because you have no baseline to diff against. This is the highest-probability failure mode in the entire migration: silent regression, discovered weeks later, requiring Phase 1 to be re-run.

Build the eval harness first. It costs 1 week. It saves the 4 weeks you would otherwise spend diagnosing regressions you didn't know you introduced.

---

*Council cost: $0.1784 USD / £0.14 GBP — Opus $0.1127, Gemini $0.0597, DeepSeek $0.0060*
