# Engine Accuracy + Speed — Suggestion Pack for GPT-5.6 Review

**Author:** Cursor / Grok session (2026-07-09)  
**Status:** PLAN ONLY — do not implement from this doc until Tristan + GPT-5.6 review  
**Audience:** GPT-5.6 (adversarial review), then Tristan / Fable for prioritisation  
**Scope:** ForgeOS serial design chain (`scripts/serial-design-chain-v2.tsx` + orchestrator + Blender drawings + Excel scorecard)  
**Out of scope:** Coding, cold chain runs, Powerwall/Codema ship loops (separate handovers)

---

## How GPT-5.6 should review this

For each suggestion, return:

| Field | Meaning |
|-------|---------|
| **Verdict** | `KEEP` / `KEEP-WITH-EDITS` / `DEFER` / `REJECT` |
| **Accuracy impact** | High / Med / Low / Negative risk |
| **Speed impact** | High / Med / Low / Negative risk |
| **Goodhart risk** | Does this make scorecards look better without making dossiers more true? |
| **Universal?** | Fits CORE FIX PRINCIPLE (noun/unit/provenance) or sneaks in class special-cases? |
| **Dependency** | What must exist first? |
| **Cheaper alternative** | If any |
| **One-line rewrite** | If KEEP-WITH-EDITS |

Also answer at the end:

1. Top 5 to do **this month** (accuracy-first).  
2. Top 5 to do **this month** (speed-first, without accuracy regression).  
3. Which 3 suggestions are **actively dangerous** if done naively?  
4. What did this pack **miss** that matters more?

---

## Context that shaped these suggestions

Recent empirical pain (not theoretical):

| Signal | Lesson |
|--------|--------|
| Codema run 2100: almost all tabs ≥9.4, **Exec Summary = 2** | Exact brief-metric key mismatch (`ro_makeup_flow_m3_per_hr` vs contract aliases) kills ship while engineering is fine |
| Codema exit 33 (fertigation motor) | Fake `source:brief` seeds poison physics critic / duty checks |
| Irrigation phantom 225 m³/h | Tool writes plant-total quantities that Risk/Sense-check must suppress |
| Panel Design I vs rescaled kW | Downstream consumers not re-derived after reconcile |
| BESS gates 10–36 mature; Codema/unseen classes soft | Accuracy gap is **contract emission + aliasing + drawing topology**, not “more LLM seats” |
| Gate 37 (.venv dead → zero worked-calcs) | Infra liveness is a first-class accuracy failure |
| `CHAIN_AS_DB_CONSUMER` | Live distributor calls in-chain burn quota and destroy determinism |
| Shadow gates 31–36 | Having a gate ≠ catching; proveCatch + enforce is the intent |
| Cold chains used as discovery | Expensive; selftest + state.json attack should precede full runs |
| Excel-goal config already exists | `CHAIN_SKIP_RENDER=1`, skip image gen, `QUALITY_LOOP_MAX_ITERS=1` — underused as default for iterate loops |

Standing constraints (do not violate in recommendations):

- CORE FIX PRINCIPLE — fix the rule, not the instance  
- GATE INTENT — proveCatch + route-to-fix  
- SIGHT — audit DELIVERED artefacts, not `state.json` intent  
- Deterministic + correct (not “reproducible lie”)  
- Universal over per-class special-cases  
- Chain is DB consumer for parts (no live Mouser/DK in chain)

---

## A. Accuracy — highest leverage

### A1. Brief-metric exact-key registry + alias graph (Codema Exec killer)

**Problem:** Compliance / Exec Summary verify by exact key. Contract emits near-synonyms (`ro_high_pressure_pump_throughput_m3_h` vs brief `ro_makeup_flow_m3_per_hr`) → UNVERIFIED → floor collapses.

**Suggestion:** Maintain a **universal** brief-key → delivered-quantity alias graph (synonym families by unit + noun stem, not per-project hacks). At contract emit and at compliance build, resolve aliases bidirectionally. Every alias needs a proveCatch with a Codema-shaped adversarial brief.

**Why faster too:** Stops multi-hour “almost shipped” loops that only fail Exec.

**Risk:** Over-aliasing (usable ≠ nameplate). Mitigate with strong-qualifier splits (same as gate 18).

---

### A2. Provenance honesty contract (`source` cannot lie)

**Problem:** Seeds marked `source:brief` that were actually calculator guesses (fertigation 7.5 kW) defeat critics and look “authoritative.”

**Suggestion:** Typed provenance enum: `brief_literal` | `brief_derived` | `calculator` | `tool:<id>` | `corpus` | `assumed`. Ban promoting calculator → brief_literal. Gate: any `brief_literal` must substring-match brief text or structured brief field.

**Risk:** Noise if brief paraphrases; keep structured fields as source of truth.

---

### A3. Quantity identity spine (one noun → one scalar)

**Problem:** Same physical quantity appears under multiple keys with conflicting values (irrigation plant-total vs per-unit; usable vs nameplate energy).

**Suggestion:** First-class `QuantityId` (or strengthen shared_quantities) with: canonical unit, strong qualifiers, allowed emitters, and a single writer stage. Downstream may only *read*. Extend gate 24 pattern beyond coolant chemistry to flow/power/energy families.

**Risk:** Schema migration cost; start with top 20 conflict-prone nouns from punchlists.

---

### A4. Emitter completeness before Phase 2 (already gate 23 — enforce earlier + wider)

**Problem:** Gaps invite LLM MPN invention; gate 23 catches late.

**Suggestion:** Run emitter-completeness **before** expensive research/Phase-2, fail fast with punchlist of missing slots. Expand slot lists from residential BESS + water-treatment campaigns as *signal for missing universal slots*, not class forks.

**Speed win:** Fail in minutes, not after £ of LLM.

---

### A5. Residential vs plant topology discriminator (Powerwall / wall ESS)

**Problem:** Container BESS habits (1500 V, racks, MV) smear into wall products.

**Suggestion:** Universal deployment-envelope signal from brief nouns (`wall-mounted`, `single-phase`, `kWh` not `MWh`, mass &lt; 500 kg) that **suppresses** container templates in drawings + contract builders. Same pattern as gate 34 marine-marker suppression — suppress-on-legitimate-class, don’t special-case Tesla.

**Risk:** False suppress on small commercial BESS; use multi-signal vote.

---

### A6. Re-derive cascade after any reconcile

**Problem:** Panel kW rescale left Design I stale; similar “write once, forget dependents.”

**Suggestion:** Explicit dependency graph: when quantity X changes, recompute declared dependents (I, cable, breaker, thermal). Selftest: mutate X, assert Y updates. No silent stale reads.

---

### A7. SIGHT-first scorecard (artefact reingest as default)

**Problem:** Engine audits intent; humans catch delivered Excel/PDF lies in 5 seconds.

**Suggestion:** Make render-then-reingest (Excel cells + drawing geometry + optional vision critic) the **default** path for ship verdict, not an optional audit. Cheap deterministic reingest first (~70%); vision only for residue with proveCatch on known-bad images.

**Speed note:** Can skip PDF when Excel is the product (`CHAIN_SKIP_RENDER=1`) but must still reingest Excel.

---

### A8. Close shadow → enforce for gates that already proveCatch

**Problem:** Gates 31–36 shadow-by-default = walk-through.

**Suggestion:** Promote to enforce **per-gate** when: proveCatch green in CI + 2 weeks shadow zero false-block on golden set. Start with deterministic deception signals (gate 31 HEADLINE_BLANK / BOM_TOTAL_ZERO / COMPLIANCE_FALSE_PASS) — zero LLM flake.

**Risk:** Blocking in-flight campaigns; use env flag per gate, default on for new runs only.

---

### A9. Tool-plan liveness + worked-calc floor (gate 37) as boot check

**Problem:** Dead `.venv` → empty Calculations sheet after full spend.

**Suggestion:** Preflight in &lt;30s: import engineering venv, run 1 trivial tool, abort before Stage 1 if dead. Cache “venv healthy” with mtime fingerprint.

---

### A10. Corpus / forge-truth as runtime source of truth (close baked-TS gap)

**Problem:** CLAUDE.md: specs/standards/suppliers baked in 2026-05 TS snapshots; DB has rows without writeback/read path.

**Suggestion:** Phased: (1) runtime read specs/standards from forge-truth with bake fallback, (2) writeback on successful web miss, (3) delete bake when coverage ≥ threshold. Accuracy compounds; speed improves on cache hits.

**Risk:** DB drift / bad ingest; require provenance + confidence on every DB row used in contract.

---

### A11. Duty / physics cross-check at seed time (not only critic time)

**Problem:** Exit 33 / phantom pumps caught late.

**Suggestion:** When seeding a motor/pump from Q×P or brief kW, run the same duty inequality the critic uses. Refuse impossible seeds early with calculator provenance.

---

### A12. Benchmark net (gate 36) as cheap magnitude tripwire on every full run

**Problem:** Bottom-up BoM can be internally consistent and still 3× market-wrong.

**Suggestion:** Keep independence principle; run on `QUALITY_LOOP_PHASE>=3` always; add a **tiny** heuristic pre-check (family £/output band from gate 32) before spending LLM benchmark — only call LLM when heuristic says “suspicious.”

**Risk:** Heuristic skip misses unseen classes — if family unknown, always LLM.

---

## B. Speed — without becoming a reproducible liar

### B1. Tiered run profiles (make the fast path official)

| Profile | Use | Skips |
|---------|-----|-------|
| `smoke` | Rule/selftest validation | LLM heavy, Blender, images, PDF, benchmark |
| `excel-iterate` | Tab scorecard loops | PDF, Gemini images; Blender optional; max 1 quality iter |
| `drawings` | GA/P&ID/panel only | Full research re-run if contract hash unchanged |
| `ship` | Customer dossier | Full chain + SIGHT |

**Suggestion:** Document + enforce profile presets as one CLI flag. Default agent iterate → `excel-iterate`. Today’s flags exist but are tribal knowledge (`docs/archive/trackers/BACKLOG.md`).

---

### B2. Contract-hash short-circuit

**Problem:** Tiny emitter fix re-runs research, council, tools, Blender.

**Suggestion:** Persist stage inputs hash; if contract + brief hash unchanged, resume from first dirty stage. Explicit `--force-stage=N` escape.

**Risk:** Stale cache after code change — include code version / emitter file hash in key.

---

### B3. Parallelise embarrassingly independent stages

**Candidates:** distributor cache lookups; per-module drawing generators that don’t share mutable state; gate audits that only read state; multi-emitter ensemble (already partially parallel).

**Suggestion:** Audit stage DAG; mark pure-read stages for `Promise.all` with concurrency caps. No parallel writes to `design.modules` without merge protocol.

---

### B4. Shrink LLM tokens where structure already exists

**Problem:** Reviewers re-narrate full design.

**Suggestion:** Pass **diffs + quantity tables + punchlist** to R-stages, not full JSON dumps. Keep 150k ceiling as max, but default prompt packing = structured digest (semantic self-audit already builds digests — reuse).

---

### B5. Fail-fast gate ordering

**Suggestion:** Reorder: preflight venv → lock-gate HARD slots → emitter completeness → brief-literal scan → expensive research. Every minute before first $1 LLM is a win.

---

### B6. Golden mini-briefs for regression (not full Codema)

**Problem:** Full cold chain is the only confidence signal → agents overuse it.

**Suggestion:** 5–10 **mini-briefs** (residential ESS, small pump skid, simple PV+battery) that run in &lt;15 min to `tab-scorecard` or even pre-Excel state audits. Full Codema/BESS as nightly/weekly.

---

### B7. Drawing generators: geometry cache + incremental redraw

**Problem:** Blender full redraw on unrelated BoM price fix.

**Suggestion:** If parts-manifest hash + envelope hash unchanged, reuse PNGs; only regenerate punchlisted sheets.

---

### B8. Model routing: right seat, not biggest seat

**Suggestion:** Keep frontier for physics critic / benchmark diagnose; force flash/cheap for extraction, JSON-strict fill, and repetitive reviewers **after** A/B on scorecard (per `docs/MODELS.md`). Kill stale aliases (`deepseek-chat` → v4) — accuracy *and* latency.

**Risk:** Flash on physics = known failure mode; never demote gate 33 seat without A/B.

---

### B9. Ensemble discipline

**Suggestion:** Multi-emitter only where union-recall matters (Stage 1.7 words). Majority vote elsewhere. Cap emitters when quorum already met (early exit).

---

### B10. Agent loop discipline (process, not code)

**Suggestion:** Codify in handover/CI: no cold chain until (1) selftest for the fixed rule, (2) state.json or fixture attack, (3) excel-iterate profile. This is the largest practical speed win observed this week.

---

## C. Accuracy × Speed combined plays (do these early)

| ID | Play | Accuracy | Speed |
|----|------|----------|-------|
| C1 | A1 alias graph + proveCatch | Fixes false UNVERIFIED | Saves ship loops |
| C2 | A9 venv preflight | Prevents empty calcs | Saves full-run waste |
| C3 | B1+B5 profiles + fail-fast order | Same quality bar | Cuts iterate cost |
| C4 | A4 emitter completeness early | Stops MPN fiction | Fail in minutes |
| C5 | A2 provenance honesty | Stops fake brief authority | Fewer critic thrash loops |

---

## D. Explicit non-suggestions (please confirm reject)

These look attractive and are probably wrong:

1. **More LLM judges on every tab** — cost↑, flake↑, Goodhart↑; prefer deterministic SIGHT.  
2. **Per-class if (codema) / if (powerwall) patches** — violates CORE FIX; returns next week.  
3. **Physics-critic autocorrect ENABLED by default** — Tristan rejected “re-spec the part” as design target; fix emitters/rules. Shadow autocorrect for diagnosis only unless policy changes.  
4. **Live distributor calls in-chain for “fresh prices”** — quota + nondeterminism; ingest jobs only.  
5. **Autonomous overnight hill-climb loop** — deferred (see `docs/DECISION-defer-autonomous-hill-climbing-loop-2026-06-24.md`); customers &gt; engine vanity.  
6. **Skipping Exec Summary / compliance to ship** — the floor is the product.

---

## E. Proposed 30-day roadmap (for GPT-5.6 to reorder)

### Week 1 — Stop bleeding (accuracy + speed)

1. A1 brief-key alias graph + Codema proveCatch  
2. A9 venv / tool-plan preflight  
3. B1 official run profiles + agent default `excel-iterate`  
4. B5 fail-fast gate reorder  
5. A2 provenance enum (minimal: ban fake `brief` on calculator seeds)

### Week 2 — Spine

6. A3 quantity identity for top conflict nouns (flow, power, usable/nameplate energy)  
7. A6 re-derive cascade after reconcile  
8. A11 duty check at seed  
9. B2 contract-hash resume (excel-iterate first)

### Week 3 — Topology + SIGHT

10. A5 deployment-envelope discriminator (wall vs container)  
11. A7 Excel reingest in default ship verdict  
12. A8 enforce gate 31 deterministic deception tier  
13. B6 golden mini-briefs CI

### Week 4 — Compounding

14. A10 forge-truth runtime read (specs) with bake fallback  
15. B3 parallel pure-read gates  
16. B4 digest-packed reviewer prompts  
17. A12 heuristic gate-32 then conditional gate-36 LLM  
18. B7 drawing incremental cache

---

## F. Success metrics (how we’ll know this pack worked)

| Metric | Baseline (qualitative now) | Target in 30 days |
|--------|----------------------------|-------------------|
| Honest ship loops to floor ≥9 | Often 3–6 cold chains | ≤2 cold chains after selftest green |
| False UNVERIFIED on synonym keys | Seen (Codema Exec) | 0 on golden synonym suite |
| Wasted full runs on dead venv / empty tools | Gate 37 class | 0 (preflight catch) |
| Median `excel-iterate` wall time | Unknown — measure Week 1 | −30% vs current full-ish iterate |
| Shadow gates with proveCatch but never enforce | Many of 31–36 | ≥1 deterministic gate promoted |
| Per-class special-case PRs | Temptation high | 0 merged |

---

## G. File map / related docs

| Doc | Why |
|-----|-----|
| `CLAUDE.md` | Gates, CORE FIX, DB-consumer, exit codes |
| `OPERATING-FRAME-2026-06.md` | SIGHT, adversarial engineer stance |
| `docs/DECISION-defer-autonomous-hill-climbing-loop-2026-06-24.md` | Why not Loop 4 now |
| `docs/MODELS.md` | Model routing / A/B discipline |
| `docs/ARCHETYPE-CAMPAIGN-PLAYBOOK.md` | Campaign matcher lessons |
| `briefs-loop/HANDOVER_residential_powerwall.md` | Separate product experiment |
| `AGENT_HANDOVER.md` | Codema Exec alias (instance of A1) |

---

## H. One-page brief for GPT-5.6

> Review this suggestion pack for making the ForgeOS design engine more **accurate** and **faster** without Goodharting scorecards or adding per-class hacks. Challenge every item; reorder the 30-day plan; name the three most dangerous ideas; list what we missed. Do not write code. Output structured verdicts per §“How GPT-5.6 should review this.”

---

## I. Author’s priority bet (bias to disclose)

If forced to pick **only three**:

1. **A1** alias graph (accuracy floor)  
2. **B1+B5+B10** iterate profile + fail-fast + no-cold-chain-until-selftest (speed)  
3. **A2+A11** provenance + duty-at-seed (stops late physics exits)

GPT-5.6: please say if this bet is wrong.
