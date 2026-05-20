# Iter-9 Integration Plan v3 — Council-Critiqued

**Status:** Final iteration. v2 (`ITER9-STRATEGIC-PLAN-V2.md`) → integration map (`CHAIN-ENGINE-DIAGRAM-V6-AND-ITER9-INTEGRATION.html`) → this v3.

**Council:** Grok 4.3 + Opus 4.7 + Gemini 3.5 Flash + GPT-5.5 (all 4 landed, $0.32). Responses in `firestorm-iter9-integration/`.

## What the integration map (v6) got wrong (4-of-4 critiques)

### Overclaimed tangible value
The map claimed W0 alone prevents 4 of 10 iter-7 findings. Council:
- **K10 cross-class bleed** ✓ type-checkable. W0 prevents.
- **Duplicate BoM rows** ✓ if object identity / canonical IDs exist. W0 helps.
- **LED 10× driver mismatch** ✗ NOT type-checkable. Needs W1 (electrical sizing tool).
- **AHU fan stall** ✗ NOT type-checkable. Needs W1 (fan curve tool).

W7 claim that "exemplars prevent Engine B under-pricing" — Gemini + GPT-5.5: **wrong**. Engine B runs AFTER Phase 2 and overrides Generator prices. Exemplars help magnitude, but Engine B needs its own data improvement.

### Misplaced workstreams
- **W2** between K10 and Headline is WRONG — that's pre-render. The rendered image (cabinet PNG) doesn't exist until `render-minimal-pdf.tsx` runs. **W2 must be POST-render** to catch the actual image mismatch.
- **W0** placement at Generator alone is INCOMPLETE. R1-R4 reviewers patch state with free-form JSON; if they bypass W0 validation, the schema is broken. W0 must wrap the entire Phase 1 + Phase 2 envelope.

### Risky big-bang replacements
- **W0 cannot REPLACE the 5+ registries directly.** Council unanimous: introduce as canonical source + adapter layer. Don't delete the legacy registries until outputs are semantically equivalent on the harness.
- **W3 cannot REPLACE R1-R4 directly.** Losing Qwen 3.6 Max generalist loses cross-domain integration checks. Specialists tunnel-vision. **Run W3 in parallel with one generalist retained.**
- **W1 in-flight (Phase 1 function-calling) is high-risk** — destabilises Gemini 3.1 Pro's structured output. Start post-hoc gate replacement first, in-flight behind feature flag.

### Unmeasurable proof points
- Step 4 (W4 mutation): "finds at least 1 error" — weak. Council: use **mutation testing** with seeded known-bad patches, measure recall.
- Step 6 (W7): "BoM lands in realistic band" — vague. Council: **Engine B variance <15% vs historical manual-audit baseline**.
- Step 8 (W5 distill): "proposes diff" not a quality metric. Define: **proposed diffs that human approves >70% of the time**.
- Step 10 (W6-full): "actionable digest" subjective. Define: **drift detected predates next iter-N firestorm by N days**.

### Missing infrastructure (all 4 council)
1. **Feature flag + rollback plan per workstream**
2. **Stable telemetry schema** (W5/W6 cannot work without)
3. **Model/version pinning** (Gemini 3.1 Pro → 3.5 Pro change would invalidate baselines)
4. **Mutation-test suite** with seeded bad patches (for W4 verification)
5. **Render-level visual validation** (W2 needs the actual PDF as input)
6. **Backward compatibility plan** for existing state.json consumers (downstream of chain)
7. **Tool error fallbacks** (W1 tools that fail — chain halts or fallback to LLM?)

### W6-lite scope — 7-hour CI is dead on arrival (3-of-4)
- Gemini: "developers will bypass it, commit directly to main, or stop writing tests"
- Opus: "blocks all development. Fix: parallelize to 1 hr, run nightly not per-commit"
- GPT-5.5: "tiered — PR smoke (3 briefs), nightly full (15), release gate (full + council)"

## v3 — Revised plan

### Three structural changes
1. **W6-lite is TIERED, not monolithic.** 3 tiers, each with different scope/frequency.
2. **W0 is INCREMENTAL — adapter layer first, full replacement only after dual-run convergence.**
3. **W3 ADDS specialists alongside R1-R4 initially, doesn't replace.** Generalist diversity retained.

### v3 workstream catalogue

| W# | Name | Tier-1 deliverable | Tier-2 expansion |
|---|---|---|---|
| **W6-lite-S** | Smoke harness | 3 briefs (1 each: VF/BESS/heatpump), <15 min, PR-blocking | — |
| **W6-lite-N** | Nightly harness | 15 briefs (5 each), parallelised to <2 hr | — |
| **W6-lite-R** | Release gate | Full 15 briefs + council adjudication, blocking only on release tags | — |
| **W0a** | Object model adapter | VF-only. Adapter wraps existing registries; chain reads through adapter | Replace VF registries after 30 days of harness equivalence |
| **W1a** | Tools (post-hoc) | `fan_curve.lookup` + `psychrometrics.calc` + `pressure_drop.pipe` REPLACE existing lookup tables in `universal-arithmetic-gates.ts` | Add `voltage_drop.cable`, `refrigerant.cycle`, etc. |
| **W1b** | Tools (in-flight) | Gemini 3.1 Pro function-calling at Phase 1 BEHIND FEATURE FLAG, A/B'd | Default-on after 7 days of harness parity |
| **W4a** | Mutation-test suite | Seeded known-bad patches (e.g. revert iter-8 commits one at a time, confirm harness catches each) | Deterministic. No LLM. |
| **W4b** | LLM red-team | Pre-merge on chain-critical files, after W4a established | Optional. Sampled (every Nth commit), not mandatory. |
| **W3a** | First specialist (parallel) | HVAC specialist runs ALONGSIDE R1-R4, output captured for comparison but doesn't patch | After 14 days of harness data: decide if specialist replaces R2 or stays parallel |
| **W3b** | Full specialist roster | 6 specialists (HVAC, Electrical, Fluid, Compliance, Safety, BoM) running in parallel; one generalist retained as integration reviewer | — |
| **W7a** | VF exemplar pack | 3 golden VF reports, retrieved by envelope similarity, injected as Generator + W3 context | — |
| **W7b** | All-class packs | BESS + heatpump exemplar packs | — |
| **W5** | Pattern distillation | Statistical: ≥20 runs/class. Quarterly batch. Human-approves diffs. | — |
| **W2** | Multimodal POST-render | Runs AFTER `render-minimal-pdf.tsx` emits PDF. Compares rendered hero + module images against reference library. | — |
| **W6-full** | Continuous learning | Telemetry pipe + drift dashboard + user-signal capture. NO auto-mutation. | — |

### Council-revised sequence (10 numbered steps, each with measurable proof)

| # | Step | Proof point (measurable + falsifiable) |
|---|---|---|
| 1 | **W6-lite-S smoke harness** + first 3 golden briefs | Replay today's iter-8 commits 1-by-1 through harness. Confirms harness fires correctly on each: K10 fix passes VF, would-fail without fix. **Pass criterion**: 12 of 12 commits land cleanly in harness. |
| 2 | **W4a mutation suite** + seeded bad patches | Seed reversion of 5 iter-8 commits (e.g. revert K10 fix, revert capacity gate trigger/verify). **Pass criterion**: harness catches ≥4 of 5 seeded reversions. Falsifiable. |
| 3 | **W1a single tool** — `fan_curve.lookup` only, replaces existing arithmetic-gate lookup table | Re-run 3-brief smoke. **Pass criterion**: AHU axial-fan-stall flag fires identically (same false-positive rate, same true-positive rate). Tool produces same result as iter-8 lookup table on 100% of test inputs. |
| 4 | **W1a remaining tools** — psychrometrics, pressure_drop | Same as Step 3. **Pass criterion**: harness baseline metrics ±5% drift across all 3 briefs. |
| 5 | **W0a adapter — VF only** | Chain reads VF state through adapter; existing 5+ class-*.ts registries unchanged. **Pass criterion**: VF brief output byte-identical to baseline before adapter wrapped them. (Adapter is transparent. After 30 days of harness parity, registries can be deleted.) |
| 6 | **W3a HVAC specialist (parallel)** for VF | Specialist runs alongside R1-R4 on VF briefs. Output captured + diffed. **Pass criterion**: specialist catches ≥1 finding/run that R1-R4 missed (compared to physics-critic flags as truth). Falsifiable. |
| 7 | **W7a VF exemplar pack** + retrieval | 3 golden VF reports indexed by envelope. **Pass criterion**: Engine B BoM total median ±15% of historical manual-audit baseline for matching envelope size (Gemini's metric). |
| 8 | **W2 post-render multimodal grounding** — VF only | Multimodal model sees actual rendered PDF hero/module images. **Pass criterion**: known-mismatch test fires (rendered cabinet on container brief detected) AND known-match test passes (rendered cabinet on cabinet brief not flagged). |
| 9 | **Scale steps 3-8 to BESS + heatpump** | All steps re-validated on 2 more classes. **Pass criterion**: 3-class harness baselines stable for 14 days. |
| 10 | **W5 + W6-full + W4b activated** | First distillation diff proposed, first drift digest emailed. **Pass criterion**: Tristan approves ≥1 distillation diff in first month; drift digest predates next manual firestorm by ≥7 days. |

### Hard rules from council (baked into v3)

1. **Feature flag every workstream**: env var `FORGEOS_W0A=on/off`, default off, A/B vs baseline.
2. **Rollback plan**: every commit that adds a workstream must include a documented revert path; W6-lite-S blocks merge if revert breaks baseline.
3. **Telemetry schema (W6-full pre-req)**: define BEFORE any workstream lands. Each chain run writes structured event log: `{stage, model, ms, gate_result, tool_call?, findings, cost}`.
4. **Model + version pinning**: track Gemini 3.1 Pro vs 3.5 Pro vs anything else. Harness baselines invalidated when model version changes.
5. **No big-bang registry replacement** — adapter layer + dual-run + 30-day parity window minimum.
6. **No auto-mutation into production** — W5 + W6-full propose; Tristan approves.
7. **Generalist diversity retained** — W3 adds specialists alongside one generalist, never fully replaces R1-R4.

### Effort + cost summary

| Step | Effort | LLM cost (per run) | One-off compute |
|---|---|---|---|
| 1 | 1 wk | ~$0.30 per smoke run × ~50 PR/wk = $15/wk | none |
| 2 | 3 days | $0 (deterministic) | none |
| 3-4 | 3-4 days | $0 (tools deterministic) | none |
| 5 | 1 wk | $0 (adapter is no-op until cutover) | none |
| 6 | 4 days | +$0.30/run (specialist) × ~30 chain-runs/wk = $9/wk | none |
| 7 | 3 days | +$0.10/run retrieval = $3/wk | embedding index |
| 8 | 1 wk | +$0.20/run multimodal × 30 runs/wk = $6/wk | reference image library |
| 9 | 2 wks | scales 3× | none |
| 10 | 3 wks | distillation $0 (batch); drift $0 | dashboards |

**Total**: ~8-10 weeks to "auto-improving but human-gated, all 3 classes, all workstreams live in tier-1 form". Recurring cost: ~$35-50/week. Engineering ROI breakeven after ~20 manual-firestorm sessions saved.

## Open questions for Tristan to decide before Step 1

1. **Smoke harness model pinning** — do we freeze Gemini 3.1 Pro for Step 1 baselines, or accept that the baseline is "today's model version" and re-baseline on model upgrades?
2. **Tool hosting** — W1 tools run as subprocess (Python via tsx spawn) or in-process TypeScript ports? Subprocess = canonical libraries (CoolProp, psychrolib) but adds latency. In-process = lower latency but re-implement.
3. **W6-lite cost ceiling** — $15/wk is fine for active development; what's the ceiling we're willing to pay during quiet weeks? Smoke harness on every commit is heaviest cost.
4. **Adapter→replacement cutover** — 30-day parity window for W0a is my proposal. Should it be longer (60-day) or shorter (14-day)?
