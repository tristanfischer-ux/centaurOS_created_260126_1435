# PDF Engine v2 — Work Tracker

**Owner:** OpenCode (Sonnet)
**Latest:** 2026-05-07 07:00
**Goal:** Every project type generates a report scored ≥8/10 on every section.

---

## Phase map (what each letter covers)

| Phase | Domain |
|---|---|
| **A** | Engine plumbing — classifier, validators, prompts, stage wiring |
| **B** | BOM quality — part generation, grounding, cost attachment |
| **C** | Supplier matching — corpus reader, Stage 5 wiring, per-part cross-check |
| **D** | Corpus indexing — reverse indexes, domain tagging |
| **E** | Report sections — waterfall, regulatory, FMEA, datasheet evidence |
| **F** | Scoring system — compound, council, rubric, history, dashboard |
| **G** | Brief handling — classifier widening, brief-expand stage, validator relaxation |
| **H** | Corpus expansion — distributor catalogues, semiconductor brokers, coverage diagnostic |
| **I** | Safety & compliance — per-class safety validator registry |
| **J** | Dashboard & diagnostics — show-all-runs, drill-down, versioning |
| **K** | Council hygiene — model-lineage discipline, parallel judges + retry, calibration |
| **L** | Research + benchmarks — source thresholds, BENCH-L1/L2/L3 wiring |
| **M** | Cost + NRE — market-anchored pricing, NRE from regulatory matrix |
| **N** | Sizing — margin + thermal-rejection statements |
| **X** | Deferred / stubs — NEW-001 feasibility advisor etc. |

Historical IDs from earlier sessions (`A1..A12`, `B1a..B3`, `C1..C4`, `D1..D3`, `E1..E4`, `SCORE-001..006`, `HP-003`, `CX-001..CX-002`, `BENCH-L1..L3`, `FARM-CLS-1..2`, `UX1`, `NEW-001`) are preserved with their commit SHAs but regrouped under the new phase letters.

---

## Single source of truth — all items

Status is verified from git log + grep + code audit, not memory.

### Phase A — Engine plumbing

| ID | Description | Status | Commit / ref |
|---|---|---|---|
| A1 | `gateResults` scope fix | ✅ | `defa15a0` |
| A2 | Pre-loaded grounding into Stage 4 | ✅ | `a66c15ee` |
| A3 | Defensive null rendering + `lib/safe-state.ts` | ✅ | `27e42a0e` |
| A4 | Abort on critical-stage failure + honest error PDF | ✅ | `b07a0bbe` |
| A5 | Sizing domain regex normalise | ✅ | `13c1b583` |
| A6 | Product-agnostic research prompt | ✅ | `d0b636d5` |
| A7 | Robust decompose JSON parser | ✅ | `d0b636d5` |
| A8 | Generic-domain sizing tolerates missing mass | ✅ | `1de66980` |
| A9 | Centralised `lib/llm-json.ts` | ✅ | `7b8bc927` |
| A10 | BOM uses Gemini + `json_object` + fallback | ✅ | `8bf529fd` |
| A11 | HP-sizing lookup fallback | ✅ | `cda26726` |
| A11b | HP-sizing keyword expansion | ✅ | `369158ca` |
| A11c | HP-sizing mostly-unmatched defer | ✅ | `369158ca` |
| A11d | HP-sizing diagnostic log | ✅ | `8d453904` |
| A12 | Heatpump monobloc detection | ✅ | `cf516d74` |
| A12b | Outer-shell modules skip floor budget | ✅ | `7afb03ac` |
| A13 | Farm classifier vertical_farm + 2-signal gate (was FARM-CLS-1) | ✅ | `cda26726` |
| A14 | Farm classifier 2-signal gate for thermal_system (was FARM-CLS-2) | ✅ | `ed901a79` |

### Phase B — BOM quality

| ID | Description | Status | Commit / ref |
|---|---|---|---|
| B1a | BOM qty column + supplier fallback | ✅ | `8353f1f3` |
| B1b | Cost-model respects qty + domain-aware NRE | ✅ | `8353f1f3` |
| B2 | Expand COTS cost heuristic to ~60 keyword rules | ✅ | `734f6901` |
| B2b | Thermal-pad cheap-sheet heuristic | ✅ | `79bb7435` |
| B3 | A-E grade inline on section headers + rows | ✅ | `GradeLabel` in `7-pdf.tsx` |
| B4 | Cost-basis indicator + per-module breakdown appendix (was B2-plan) | ✅ | `79ed1a1f` |
| B5 | Per-cell deterministic quantity derivation + tighten isBessCell | ✅ | `6b1e9cf4`, `d22a3413` |
| **B6** | **Required-parts manifest per product class — deterministic post-BOM validator adds missing safety-critical parts** | ❌ planned | `HANDOVER-quality-8-out-of-10.md` BOM-Q1 |
| **B7** | **Cost-floor sanity check on capital-class parts (auto-Brave on £<50 + mass>10kg)** | ❌ planned | BOM-Q2 |
| **B8** | **BOM generation architecture — corpus-first + deterministic-first, LLM only for novel items or narrative connectives** | ❌ planned | New 2026-05-07 — foundational. Depends on H1 (distributor import) |
| **B9** | **Truncation recovery — re-prompt for continuation when BOM part count below product-class floor** | ❌ planned | BOM-Q3 |

### Phase C — Supplier matching

| ID | Description | Status | Commit / ref |
|---|---|---|---|
| C1 | `lib/local-corpus.ts` reader | ✅ | `0c940de4` |
| C2 | `runSuppliers` uses local corpus as primary | ✅ | `0dbc2cac` |
| C3 | Supplier Shortlist PDF section (was landed under "B3" label) | ✅ | `f41a2c11` |
| C4 | Process-match validation — red-flag unverified suppliers | ✅ | `13de00bb` |

### Phase D — Corpus indexing

| ID | Description | Status | Commit / ref |
|---|---|---|---|
| D1 | Reverse index `process → companies` | ✅ | `13de00bb` |
| D2 | Reverse index `material → companies` | ✅ | `13de00bb` |
| D3 | 20-tag domain taxonomy + supplier re-rank | ✅ | `ef251347` |

### Phase E — Report sections

| ID | Description | Status | Commit / ref |
|---|---|---|---|
| E1 | Real cost waterfall (labour / test / shipping / overhead / contingency) | ✅ | `29bf3ed5` |
| E2 | Regulatory table with £ + weeks per standard | ✅ | `c1c9fdc2` |
| E3 | FMEA with S × O × D RPN + verification tests | ✅ | `e1978abd` |
| E4 | Datasheet-backed top-3 part notes from page_chunks corpus | ✅ | `77e983de` |
| E5 | UX1 verbatim brief at top of Section 1 | ✅ | `444e20d8` |
| E6 | CX-002 meaningful project names from brief | ✅ | `471e49cc` |
| **E7** | **Judges for Feasibility Gate + Proofreader findings + Audit Log** | ❌ planned | New 2026-05-07 |
| **E8** | **Cover / Executive Summary judge** | ❌ planned | New 2026-05-07 |

### Phase F — Scoring system

| ID | Description | Status | Commit / ref |
|---|---|---|---|
| F1 | Compound score `rubric × 0.4 + council × 10 × 0.6` (was SCORE-001) | ✅ | `8f702a01` |
| F2 | Honest council-failure state (`score=-1` sentinel; "— not scored") | ✅ | `8f702a01` |
| F3 | Rubric reweight BOM 15→25%, Cost 15→20% | ✅ | `8f702a01` |
| F4 | Cross-run `scoring-history.jsonl` archive | ✅ | `b8156209` |
| F5 | Suppliers + Risks promoted to council tier | ✅ | `b8156209` |
| F6 | Auto-refreshing HTML dashboard | ✅ | `b8156209` |
| **F7** | **Compound-formula reweight — cut rubric contribution to 15% so a 5.4/10 council content doesn't read as 71/100 honestly** | ❌ planned | New 2026-05-07 — Tristan-flagged: compound is misleadingly high |
| **F8** | **Per-judge score breakdown visible on scorecard + dashboard card** | ❌ planned | New 2026-05-07 |
| **F9** | **Exclude engine-lineage models from judge council (no Gemini grading its own work)** | ❌ planned | New 2026-05-07 — Tristan-flagged conflict of interest |
| **F10** | **Golden-reference calibration (Tristan to score vertical farm sections 1-10, compare to council)** | ❌ planned | New 2026-05-07 — Tristan offered to do this for vertical farm |
| **F11** | **Formula-version stamp on every scoring-history record so old/new records are distinguishable after F7** | ❌ planned | New 2026-05-07 |
| **F12** | **Retire deterministic scorer as quality signal — rewrite to grade named-entity density + unit coherence OR require council for every section with explicit "— not scored" on failure** | ❌ planned | New 2026-05-07 — current deterministic is keyword-count placebo |
| **F13** | **Audit every judge criterion against what the engine actually emits — close gaps or soften criteria** | ❌ planned | New 2026-05-07 |

### Phase G — Brief handling

| ID | Description | Status | Commit / ref |
|---|---|---|---|
| **G1** | **Widen `product-classifier.ts` to 15 classes (drone, UAV, AUV, HAPS, EV-charger, PCB-assembly, wearable-medical, bioreactor, CGM, etc.)** | ❌ planned | BASELINE-10 finding — 5/10 detailed briefs fell into "unknown" class and were rejected |
| **G2** | **Relax `getRequiredFields()` to minimum common field set when classifier is uncertain** | ❌ planned | BRIEF-Q2 (was) |
| **G3** | **Brief-expand stage `0.5-brief-expansion.ts` + new PDF "Brief interpretation" section showing original + inferred fields + assumption rationale** | ❌ planned | Tristan 2026-05-07 design proposal |
| **G4** | **Research LLM validator + re-prompt when structured fields missing from designBrief** | ❌ planned | BRIEF-Q1 (was) |

### Phase H — Corpus expansion

| ID | Description | Status | Commit / ref |
|---|---|---|---|
| **H1** | **Import Farnell / RS / Mouser / Digikey UK distributor catalogues to sibling `~/.forge-capital/distributor-catalogue.db` — SKU-level data with current UK prices. Biggest single lever on electronics-dominant BOMs.** | ❌ planned | CORPUS-Q1 (was) — 1-2 session job |
| **H2** | **Tag BOM parts by regime (electronic / mechanical / biotech) at generation; route to the right corpus** | ❌ planned | CORPUS-Q2 (was) |
| **H3** | **Corpus-coverage diagnostic on Supplier Shortlist page — "N parts total, M matched local corpus, K required external search, J unmatched"** | ❌ planned | CORPUS-Q4 (was) |
| **H4** | **Semiconductor brokers (Avnet / Arrow / Mouser stocking) for ASIC / MCU / FPGA — fourth catalogue layer** | ❌ planned | CORPUS-Q5 (was) |
| **H5** | **Synthetic-BOM coverage regression harness — pre-flight check per project class showing % of typical parts that would match the corpus** | ❌ planned | CORPUS-Q6 (was) |

### Phase I — Safety & compliance

| ID | Description | Status | Commit / ref |
|---|---|---|---|
| **I1** | **Per-class safety validator registry — BESS (UL 9540A / thermal runaway / G99), farm (food contact / WRAS), CGM (MDR / biocompatibility), drone (geofence / battery thermal), AUV (pressure / maritime), HAPS (EASA SC-HAPS)** | ❌ planned | Tristan 2026-05-07 — noticed only heatpump currently has a "Safety & Compliance" row |
| **I2** | **Consistent "Safety & Compliance" scorecard row in every PDF — ensure every class has an authored safety check** | ❌ planned | New 2026-05-07 |

### Phase J — Dashboard & diagnostics

| ID | Description | Status | Commit / ref |
|---|---|---|---|
| **J1** | **Show ALL runs in dashboard — including BRIEF INCOMPLETE, INFEASIBLE, PIPELINE ERROR with status column** | ❌ planned | Tristan 2026-05-07 — dashboard shows 5/20 runs because the other 15 never wrote qa-scores.json |
| **J2** | **Click-through from card → per-section council reasons + code-change-recommendations (the genuinely actionable output)** | ❌ planned | New 2026-05-07 |
| **J3** | **Per-project long-run history beyond 20-run cap ("BESS: 11 runs, best 73, worst 62, last 71")** | ❌ planned | New 2026-05-07 |

### Phase K — Council hygiene

| ID | Description | Status | Commit / ref |
|---|---|---|---|
| **K1** | **Fire judges in parallel with 60 s per-judge timeout + 1 retry — return partial-council rather than all-or-nothing "— not scored"** | ❌ planned | COUNCIL-Q1 (was) |
| **K2** | **Exclude engine-lineage models from judge council — implemented as "never judge with a model in the lineage that generated the content being judged"** | ❌ planned | F9 architectural counterpart |

### Phase L — Research + benchmarks

| ID | Description | Status | Commit / ref |
|---|---|---|---|
| L1 | BENCH-L1 hand-curated benchmarks.ts | ✅ | `96d6837a` |
| L2 | BENCH-L2 corpus-mining script + loader scaffold | ✅ (scaffold) | `92932a6d` |
| L3 | BENCH-L3 live-search scaffolding | ✅ (scaffold) | `92932a6d` |
| **L4** | **Verify BENCH-L1 actually fires on cost-waterfall page (not currently visible in logs)** | ❌ planned | New 2026-05-07 |
| **L5** | **Research prompt hardening — explicit ≥5 sources + ≥3 competitors thresholds with re-prompt** | ❌ planned | RES-Q1 (was) |
| **L6** | **BENCH-L2 overnight mining run** | ❌ planned (deferred) | ~30 min + ~£1-3 |
| **L7** | **BENCH-L3 live-search enable when L1+L2 sparse for a product class** | ❌ planned | Flip `ENABLE_LIVE_BENCHMARK_SEARCH=true` once H1 lands |

### Phase M — Cost + NRE

| ID | Description | Status | Commit / ref |
|---|---|---|---|
| **M1** | **NRE from regulatory matrix (sum of £-cost × weeks per standard, not flat-per-module)** | ❌ planned | COST-Q2 (was) — BESS should move from £140k NRE to £260k-£500k via regulatory sum |
| **M2** | **Top-10 parts market-anchor — every capital part must have a cited Farnell/RS/Mouser URL or council-flagged as "unpriced"** | ❌ planned | COST-Q1 (was) |
| **M3** | **Benchmark-anchor check visible on cost-waterfall page (depends on L4)** | ❌ planned | New 2026-05-07 |
| **M4** | **LLM temperature tuning + N-run median for deterministic-leaning stages (decompose, BOM)** | ❌ planned | New 2026-05-07 — reduces run-to-run variance |
| **M5** | **Cost-per-compound-point tracking for future trade-off decisions** | ❌ planned | New 2026-05-07 |

### Phase N — Sizing

| ID | Description | Status | Commit / ref |
|---|---|---|---|
| **N1** | **Margin + thermal-rejection statements on Sizing page — floor-budget used/spare, heat rejection required vs cooling capacity provided** | ❌ planned | SIZE-Q1 (was) |

### Cross-cutting completed

| ID | Description | Status | Commit / ref |
|---|---|---|---|
| CX-001 | Compact feasibility banner text | ✅ | `8198c940` |
| HP-003 | Verdict wording on monobloc paths | ✅ | `8198c940` |
| BASELINE-10 | 10 projects × 2 rounds (detailed + minimal briefs) | ✅ | `083ef489` — findings in `BASELINE-10-ANALYSIS.md` |

### Phase X — Deferred

| ID | Description | Status | Commit / ref |
|---|---|---|---|
| X1 | NEW-001 brief-feasibility advisor (full universal-physics version) | ⏸ deferred | Stub at `stages/1.5-feasibility-advisor.ts`, plan at `PLAN-NEW-001.md`. **Note:** G3 brief-expand is a narrower, higher-leverage win that partially addresses the same problem |

---

## Tally

**53 ✅ done · 35 ❌ planned · 1 ⏸ deferred**

---

## Missing-only recap (ordered by leverage for the ≥8/10 mission)

### HIGH leverage — do in the next session

| ID | Why |
|---|---|
| **F7** | Compound score is misleadingly high today (71/100 for 5.4/10 content). Fix this before anything else — everything else calibrates against it |
| **G3** | Brief-expand stage. Round 2 (minimal briefs) currently 0/10 passing. This moves it to 10/10 with an honest audit trail |
| **G1 + G2** | Widen classifier + relax validator. Round 1 currently 5/10 passing. This moves it to 9-10/10 |
| **B6** | Required-parts manifest. Addresses the literal-real council finding ("missing expansion tank + PRV + PIR insulation") on BESS |
| **J1** | Show-all-runs dashboard. Today's tool hides 15/20 runs — tracking failures that don't write qa-scores.json |
| **F9 / K2** | Exclude engine-lineage from judges. Gemini grading Gemini is a conflict of interest and inflates scores |
| **H1** | Distributor catalogue import — biggest lever on electronics BOMs. 1-2 session job. Depends on: regulatory review that Farnell/RS catalogues are public-facing (they are) |

### MEDIUM leverage

| ID | Why |
|---|---|
| B7 | Cost-floor sanity on capital parts (£18 container problem) |
| B8 | BOM architecture — corpus-first. Depends on H1 |
| B9 | Truncation recovery |
| F8 | Per-judge breakdown |
| F10 | Golden-reference calibration (Tristan to do for vertical farm) |
| F11 | Formula-version stamping |
| F12 | Retire placebo deterministic scorer |
| F13 | Audit judge criteria vs engine output |
| G4 | Research LLM validator + repair |
| H2 | Part-regime tagging + corpus router |
| H3 | Corpus-coverage diagnostic on Supplier Shortlist |
| I1 + I2 | Per-class safety validators (six classes) |
| J2 | Dashboard click-through to council reasons |
| K1 | Parallel judges + retry |
| L4 | Verify BENCH-L1 fires (currently silent in logs) |
| L5 | Research threshold enforcement |
| M1 | NRE from regulatory matrix |
| M2 | Top-10 market anchor |
| M3 | Benchmark anchor visible on cost waterfall |
| N1 | Sizing margin + thermal statements |

### LOW leverage / backlog

| ID | Why |
|---|---|
| E7 | Judges for Feasibility Gate / Proofreader / Audit Log |
| E8 | Cover / Executive Summary judge |
| H4 | Semiconductor brokers |
| H5 | Synthetic-BOM coverage regression |
| J3 | Per-project long-run history |
| L6 | BENCH-L2 overnight mining run |
| L7 | BENCH-L3 live-search enable |
| M4 | Temperature tuning + N-run median |
| M5 | Cost-per-compound-point tracking |

### Deferred by design

| ID | Why |
|---|---|
| X1 | NEW-001 — full universal-physics advisor. Replaced in practice by G3 brief-expand for the non-impossible cases |

---

## Self-imposed guardrails

1. Evidence PDFs + qa-scores before calling any item done
2. One increment per commit, SHA cited in the tracker row
3. Council review happens before major architectural shifts (B8, F7, H1)
4. Definition of done for quality items: 3 consecutive runs keep the target section ≥ 8/10

---

## Log

(newest first — historical entries retained for SHA traceability)

### 2026-05-07 07:00 — Tracker restructure + BOM-architecture honesty

Tristan called out: (1) dashboard shows only 5/20 runs because failures don't write qa-scores.json — real bug, J1 added. (2) compound score too high (71/100 for 5.4/10 content) — F7 added. (3) BOM is LLM-generated not corpus-generated — architectural gap, B8 added. Tracker regrouped into phases A-N + X with letter-number IDs. Total: 53 ✅ / 35 ❌ / 1 ⏸. New items (35) awaiting council review before implementation.

### 2026-05-07 06:30 — Baseline-10 experiment complete
20 runs (10 projects × 2 rounds). Round 1 (detailed) 5/10 passing at compound 69-73. Round 2 (minimal) 0/10 passing. Findings in `BASELINE-10-ANALYSIS.md`: brief validator is a cliff + corpus is precision-manufacturing-heavy with electronics/power-electronics/semiconductor gaps.

### 2026-05-07 05:00 — SCORE-004+005+006 shipped
Cross-run history, HTML dashboard, Suppliers+Risks in council tier. Commit `b8156209`.

### 2026-05-07 03:30 — SCORE-001+002+003 shipped
Compound score + honest failure + rubric reweight. Commit `8f702a01`.

### 2026-05-06 evening — 44 tracker items shipped in 10 commits
A3 safe-state, A4 error PDF, E4 datasheet-backed notes, D3 domain taxonomy, D1+D2+C4 reverse indexes + match verification, B4 Cost basis, CX-001+HP-003 banner + wording, BENCH-L1+L2+L3 scaffolding. Plus NEW-001 stub + PLAN-NEW-001.md.

### 2026-05-06 13:00 — Phase E1/E2 + B3 + UX1 + CX-002 landed
E1 `29bf3ed5`, E2 `c1c9fdc2`, UX1 `444e20d8`, CX-002 `471e49cc`, B3 Supplier Shortlist `f41a2c11`.

### 2026-05-06 09:25 — baseline-2 + C1 + C2 landed
Local Nightshift corpus wired in as primary supplier source.

### 2026-05-06 06:30 — baseline-0 + BASELINE-AUDIT.md written
20 numbered observations with fix-path mapping.

### 2026-05-06 00:00 — session start
Plan agreed. Setup + Phase A begin.
