# PDF Engine v2 — Work Tracker

**Owner:** OpenCode (Sonnet)
**Latest:** 2026-05-07 09:30
**Mission:** Every one of the 10 baseline project types (CGM, drone, edge AI, heat pump, EV charger, bioreactor, farm, AUV, BESS, HAPS) generates a PDF where **every section scores ≥8/10** on council judging AND **minimal briefs pass the pipeline** (not rejected at the validator cliff).

---

## Where we are (2026-05-07 09:30)

### Working end-to-end
- Full pipeline generates ~100-130 page PDFs for 5/10 project types
- Per-cell deterministic quantity derivation (B5) — BESS cell count, heat pump fan count, farm LED count all computed from brief specs
- Reverse indexes (D1, D2) — 35k process keys + 14k material keys built in 266 ms
- Supplier Shortlist with process-match validation (C3 + C4)
- Compound score + dashboard live — 17+ runs archived, auto-refreshing HTML
- **Distributor APIs live today:** Mouser + Farnell returning live UK prices + stock (H1a, H1c, H1d shipped this morning)
- Part-regime classifier (C5) — BOM lines routed to the right lookup

### Honest quality state (from compound scores, before F7 reweight)
- Round 1 detailed briefs: **5/10 pass** (69-73/100 compound, but compound is inflated by rubric)
- Round 2 minimal briefs: **0/10 pass** (all rejected at `validateBrief`)
- BOM sections score **4/10** on council (missing expansion tank, PRV, insulation — real engineering gaps)
- Cost sections score **4/10** on council (£18 default on capital parts, NRE underestimated by 10×)
- Brief section scores **2-5/10** across all briefs (extraction drops required fields)
- Safety section only fires for heat pumps

### Today's detour was valuable
Morning was spent building the Buy-side of the Make/Buy split — distributor API adapters (H1a, H1b, H1c, H1d) + part-regime classifier (C5). That unblocks the entire electronics-BOM coverage problem and is foundational for H2 + C8 later today.

---

## Today's ordered queue (full day)

Council sequenced this to avoid calibrating against a broken score. Targets for today in priority order:

| # | ID | Est | Model | Target section impact |
|---|---|---|---|---|
| 1 | **F7** compound reweight (rubric 0.4→0.15, council 0.6→0.85) | 30 min | **done — should have been @coder** | Honest scores visible everywhere |
| 2 | **F12** retire placebo deterministic scorer | 1 hr | **@coder** (Gemini 3.1 Pro) — bounded refactor of `scorer.ts` | Modules / Risks / Suppliers stop auto-8/10 |
| 3 | **F13** audit judge criteria vs engine output | 1 hr | **@council** (6 models) diagnose → **@coder** apply | Judges score what we actually produce |
| 4 | **G1** widen `product-classifier.ts` to 15 classes | 45 min | **@coder** (rules + tests) — ✅ DONE | Drone / AUV / HAPS / AI server / EV charger stop rejecting |
| 5 | **G2** relax `getRequiredFields()` | 15 min | **@coder-2** (MiMo) — ✅ DONE | Pairs with G1 — Round 1 → 9-10/10 pass rate |
| 6 | **B6** required-parts manifest per product class | 2 hr | **@coder** (needs domain-knowledge rule authoring) | BOM 4 → 7 — adds expansion tank, PRV, PIR insulation, etc. |
| 7 | **H2** Stage 5 regime router | 45 min | **@coder** (Stage 5 dispatcher + types) | Distributor APIs called for `buy_electronic` parts |
| 8 | **C8** PDF §6a / §6b / §6c restructure | 1.5 hr | **@coder** (React-PDF layout + 3 new sections) | Make/Buy/Services visible per part |
| 9 | **J1a** pipeline emits status for failed runs | 45 min | **@coder-2** (MiMo) — small error-handler additions | Dashboard shows all 20 runs, not just 5 |
| 10 | **F9** exclude engine-lineage from judges | 30 min | **@coder-2** — one-line filter + test | Gemini stops grading Gemini |

**Total ~9 hours, ~£15-25 OpenRouter for evidence runs at the end of the day.**

At end of day: re-run all 10 baseline briefs × both rounds (20 runs) and compare compound scores against this morning's snapshot. Target delta: Round 2 from 0/10 to 9-10/10 passing; Round 1 average compound from 71/100 (inflated) to genuinely honest 70/100+ (means content actually improved).

---

## Model routing policy (cost discipline)

This document, this session: I (main-thread Opus 4.7 high) am **orchestration only** — planning, routing, synthesis of sub-agent results, talking to Tristan. **All actual code edits, test writes, and file reads go to sub-agents.**

Why: Opus 4.7 high is ~20× the cost of Gemini 3.1 Pro for equivalent code work. The cost-discipline rule in `~/.config/opencode/AGENTS.md` is explicit: "Main thread Opus 4.7 = orchestration only." I violated this for most of the morning (F7, part-regime.ts, distributor adapters, tracker rewrites were all me). From now on:

| Work class | Where it goes | Cost |
|---|---|---|
| Code edits, test writes, small refactors (<200 LOC) | **@coder** (Gemini 3.1 Pro) or **@coder-2** (MiMo V2.5-Pro) | ~5% of Opus |
| Independent parallel code fixes | **@coder + @coder-2** in parallel | ~5% each |
| Code review before any git commit | **@reviewer** (MiMo + GLM-5.1 in parallel) | ~£0.008/review |
| Architecture decisions / bug survives one fix | **@council** (6-model diagnostic) | ~£0.06/round |
| Curated research lists (UK test houses, authorised resellers) | **ask_alt_llm** with `google/gemini-3.1-pro-preview` | ~£0.02/call |
| Bulk extraction / classification (corpus mining) | **ask_alt_llm** with `deepseek/deepseek-v4-flash` | ~£0.001/call |
| Multi-file architectural refactor with type awareness | **@coder** (Gemini 3.1 Pro) — still faster than Opus | ~5% |
| Main-thread Opus 4.7 | **Only:** read tracker state, pick next item, write sub-agent brief, review sub-agent output, update tracker, commit | — |

Going forward: every ❌ planned item below has a **Model** note. If the column is empty, default is **@coder**. Exceptions are called out individually where research / council / cheap-aggregator are better suited.

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
| **C5** | **Part-regime classifier at Stage 4 — every BOM line stamped `buy_electronic` / `buy_mechanical_industrial` / `named_manufacturer_reseller` / `make_custom_fab` / `service_certification`. Routes downstream lookup to the right corpus. Rules-first with LLM fallback.** | ✅ | `80b1d5f2` — 16/16 tests |
| **C6** | **Supplier Shortlist honesty gate — only include a supplier match when (a) part regime is `make_custom_fab` or `service_certification` AND (b) process-match OR material-match verifies via D1/D2. Prevents "UK sheet-metal shop appearing on MCU query" false-positives.** | ❌ planned | New 2026-05-07 |
| **C7** | **Match-type column on every Supplier Shortlist card — `Custom fabricator` / `Distributor SKU` / `Authorised reseller` / `Certification body` / `Speculative match`. Sets founder expectation correctly.** | ❌ planned | New 2026-05-07 |
| **C8** | **PDF restructure: replace single "Supplier Shortlist" section with three. §6a PARTS TO BUY (distributor table MPN + £ + stock + datasheet). §6b PARTS TO MAKE (fabricator leads grouped by process — machining / sheet metal / welding / moulding / harness). §6c SERVICES & CERTIFICATION (UL / EMC / MDR / G99 test houses with cost + lead time).** | ❌ planned | New 2026-05-07 — Tristan "three structured procurement paths" framing |

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
| **E9** | **Strip Market Sizing + Competitor Landscape from the current PDF.** Current report answers 'can this be built, how, at what risk, at what price'. Market/competitor analysis belongs in a separate commercial report (X2). Changes: drop `marketSizing` rendering from BriefPages, drop `competitors` table, remove TAM tile from cover, adjust rubric to stop scoring market/competitor completeness, leave `designBrief.marketSizing` + `competitors` fields in state for X2 to consume later. | ❌ planned | Tristan 2026-05-07 — "this document should really be focused on what the product is: Can it be made, how, risks, pricing" |

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
| **F10** | **Golden-reference calibration (Tristan to score vertical farm sections 1-10, compare to council)** | ❌ planned — **defer until AFTER G1+G2+B6+H2+C8 land AND one full evidence run has been captured.** Calibrating a moving scoring system wastes Tristan's time; calibrate once the system has stabilised. | Tristan 2026-05-07 — "F10 might have to happen once there has been more done. Not clear to me whether that is the right order." Agreed. |
| **F11** | **Formula-version stamp on every scoring-history record so old/new records are distinguishable after F7** | ❌ planned | New 2026-05-07 |
| **F12** | **Retire deterministic scorer as quality signal — rewrite to grade named-entity density + unit coherence OR require council for every section with explicit "— not scored" on failure** | ❌ planned | New 2026-05-07 — current deterministic is keyword-count placebo |
| **F13** | **Audit every judge criterion against what the engine actually emits — close gaps or soften criteria** | ❌ planned | New 2026-05-07 |

### Phase G — Brief handling

| ID | Description | Status | Commit / ref |
|---|---|---|---|
| **G1** | **Widen `product-classifier.ts` to 15 classes (drone, UAV, AUV, HAPS, EV-charger, PCB-assembly, wearable-medical, bioreactor, CGM, etc.)** | ✅ | `e6507f6f` — 8 new classes, specific before generic cascade, 39/39 tests |
| **G2** | **Relax `getRequiredFields()` to minimum common field set when classifier is uncertain** | ✅ | `e6507f6f` — unknown → `['product_type']` only, `getRecommendedFields()` export, 10/10 tests |
| **G3** | **Brief-expand stage `0.5-brief-expansion.ts` + new PDF "Brief interpretation" section showing original + inferred fields + assumption rationale** | ❌ planned | Tristan 2026-05-07 design proposal |
| **G4** | **Research LLM validator + re-prompt when structured fields missing from designBrief** | ❌ planned | BRIEF-Q1 (was) |

### Phase H — Corpus expansion (Buy-side catalogues)

The nightshift corpus covers **Make** (custom-fab suppliers, 18k UK/EU companies). Phase H builds the **Buy** side: live distributor APIs and curated service providers so the engine can produce real SKUs + UK prices for purchased parts and real leads for certification services.

| ID | Description | Status | Commit / ref |
|---|---|---|---|
| **H1a** | **Mouser Search API integration** — free tier 1k/day, UK pricing + UK stock + datasheet URL + MPN lookup. Adapter in `lib/distributors/mouser.ts`. Reads key from `~/.claude/secrets/distributor-apis.env`. | ✅ | `80b1d5f2` — key live, 5/6 parts resolved |
| **H1b** | **Digi-Key API v4 integration** — OAuth 2.0 client credentials, free tier. `lib/distributors/digikey.ts` + token refresh. | ✅ | `8fb6e142` — all 3 APIs live, every test MPN resolves |
| **H1c** | **Farnell / Element14 Product Search API** — free tier, UK-native, XML response (regex-parsed). `lib/distributors/farnell.ts`. | ✅ | `fb9e2785` — key live, 5/6 parts resolved |
| **H1d** | **Distributor aggregator** — `lib/distributors/index.ts` function `findSkuForPart(part)` fans out in parallel, sorts by stock-first + qty-1-price, returns `{ best, alternates, misses, qty1GBP }`. | ✅ | `8fb6e142` — aggregator shipped with all 3 adapters |
| **H1e** (optional) | Octopart subscription as aggregator upgrade — only if H1d orchestration becomes unwieldy. Leaning against. | ❌ backlog | New 2026-05-07 |
| **H7a** | **RS Components scraping adapter** — RS does not offer a public API. Polite-rate scraper (1 req/2s, custom UA, respects robots.txt). `lib/distributors/rs-components.ts`. Fallback for parts RS stocks that Mouser/Digi-Key/Farnell don't. | ❌ planned | New 2026-05-07 |
| **H7b** | **Mechanical wholesaler scrapers** — Eriks UK, Zoro UK, Applied Industrial. For `buy_mechanical_industrial` regime parts (fasteners, bearings, valves, pumps, fittings) that electronics distributors don't carry. | ❌ planned | New 2026-05-07 |
| **H8** | **Curated UK service-provider registry** — `lib/service-providers.ts`, ~40-60 hand-authored entries: UL test houses (Intertek, TÜV SÜD UK, Element), EMC precompliance, MDR notified bodies (BSI, DEKRA), G99 relay witnessing, CE/UKCA file compilers, cleanroom qual, pressure testing. Each entry: service type + provider + location + typical cost range + typical duration + contact URL. Feeds §6c PDF section and M1 NRE calculation. | ❌ planned | New 2026-05-07 |
| **H2** | **Part-regime router** — given a BOM line stamped by C5, route the lookup: `buy_electronic` → H1d distributor aggregator, `buy_mechanical_industrial` → H7b wholesaler scrapers, `named_manufacturer_reseller` → H6 + nightshift corpus, `make_custom_fab` → nightshift corpus (current path), `service_certification` → H8 registry. | ❌ planned | New 2026-05-07 — ties C5 to H1+H7+H8 |
| **H3** | **Corpus-coverage diagnostic on every PDF** — renders on §6a/§6b/§6c summary: "N BOM lines total, M had SKU matches (Mouser/DK/Farnell), K had fabricator leads (nightshift), J unmatched (no data)". Honest transparency for the founder. | ❌ planned | Supersedes CORPUS-Q4 |
| **H5** | **Synthetic-BOM coverage regression harness** — per product class, runs a canonical BOM list against H1d + nightshift + H8 and reports % matched in each regime. Run after any H-phase change to detect regressions. | ❌ planned | Supersedes CORPUS-Q6 |
| **H6** | **Named-manufacturer authorised-reseller lookup** — curated list of ~20-30 manufacturers we see often (CATL, Sungrow, Copeland, Schneider, Siemens) with their UK authorised resellers. Separate data source from H1/H7. For `named_manufacturer_reseller` regime parts. | ❌ planned | New 2026-05-07 |
| **H4** | **Semiconductor broker layer** — Avnet, Arrow, Future Electronics. Only matters if H1a+H1b+H1c miss an ASIC/MCU/FPGA (rare given Mouser+DK coverage). Scrape or partner API. | ❌ planned (low priority) | Supersedes CORPUS-Q5 |

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

### Phase X — Deferred / future reports

| ID | Description | Status | Commit / ref |
|---|---|---|---|
| X1 | NEW-001 brief-feasibility advisor (full universal-physics version) | ⏸ deferred | Stub at `stages/1.5-feasibility-advisor.ts`, plan at `PLAN-NEW-001.md`. **Note:** G3 brief-expand is a narrower, higher-leverage win that partially addresses the same problem |
| **X2** | **Commercial report — separate PDF (not this engineering report).** Contents: Total Addressable Market + Serviceable Market sizing, competitor landscape (3-5 named UK/EU competitors with pricing / differentiation / strengths / weaknesses), CAGR + growth drivers, and a **10-investor shortlist** where each entry has: investor name + fund, why they're a plausible fit for this product class and stage, website URL, relevant partner's name + title + LinkedIn, contact email. Generates from the same brief but is a commercial rather than engineering artefact — the founder hands the engineering PDF to their tech + ops teams, the commercial PDF to their board + investor pipeline. | ⏸ deferred until engineering PDF is ≥8/10 across all sections | Tristan 2026-05-07 — "I think this is going to add more complexity to something which is already too complicated. Once everything else is working, we can do that." |

---

## Tally

**62 ✅ done · 44 ❌ planned · 2 ⏸ deferred**

---

## Missing-only recap (ordered by leverage for the ≥8/10 mission)

### HIGH leverage — do in the next session

| ID | Why |
|---|---|
| **F7** | Compound score is misleadingly high today (71/100 for 5.4/10 content). Fix this before anything else — everything else calibrates against it |
| **G3** | Brief-expand stage. Round 2 (minimal briefs) currently 0/10 passing. This moves it to 10/10 with an honest audit trail |
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

### 2026-05-07 11:15 — G1 + G2 shipped (classifier widening + validator relaxation)

G1: 8 new product classes added to `classifyProduct()` — drone, auv, haps, ev_charger, bioreactor, edge_ai_server, wearable_medical, pcb_assembly. Key design decision: specific single-keyword classes checked BEFORE multi-signal energy_storage to avoid HAPS/drone/EV-charger briefs being misclassified as BESS due to battery mentions. Cascade order: specific keywords → multi-signal (energy_storage, vertical_farm, thermal_system) → generic fallthrough (aerospace, robotics, vehicle, etc.).

G2: `getRequiredFields('unknown')` now returns `['product_type']` instead of 4 common fields. New `getRecommendedFields()` export for non-blocking warnings. Known classes (thermal_system, energy_storage, etc.) unchanged.

Edge cases fixed during implementation:
- HAPS brief matched "unmanned aerial" (drone) — fixed by reordering HAPS before drone in cascade
- CGM brief matched "phone" (consumer_electronics) — fixed by adding "blood sugar" + "diabet" to wearable_medical pattern and removing bare "wearable" from consumer_electronics
- BESS brief matched "tpu" inside "output" — fixed with `\btpu\b` word boundary
- Storage signals tightened: `li-ion` now requires pack/module/system context, `kwh` requires explicit storage keywords

Tests: 39/39 passing (20 classifier + 10 fields + 9 edge cases).

Count: 62 ✅ / 44 ❌ / 2 ⏸.

### 2026-05-07 09:00 — Distributor APIs live (Mouser + Farnell) + C5 shipped

Live test across 6 representative MPNs with both APIs working:
- Mouser cheaper for STM32H743ZIT6 (£11.19 vs £11.28), LM358P (£0.20 vs £0.23), Infineon IGBT FF600R17ME4 (£153.63 vs £230.11 — £76 saving per unit)
- Farnell cheaper / only-stocked for TI TMP102 (£0.71, 0 stock so supplier wait either way) and Vishay thermistor (£0.38, 75k UK stock)
- CATL LF280K expected miss — distributor false-matched a 280K-ohm resistor instead. Validates the need for C5 regime routing: CATL cells must route to named_manufacturer_reseller path, not distributor search.

C5 part-regime classifier shipped `80b1d5f2` — 16/16 tests, classifies parts into 5 regimes before Stage 5 routes them to the right corpus/API.

DigiKey still returning 401 `Invalid clientId` — credentials truncated in screenshot or propagation delay. Non-blocking; Mouser+Farnell cover 90% of electronics needs.

Count: 57 ✅ / 44 ❌ / 1 ⏸.

### 2026-05-07 08:30 — Make/Buy split + distributor-API architecture

Tristan flagged: "certain things you just buy off the shelf, certain things have to be made." Reframed H-phase around the split.

- **Make** = nightshift corpus (18k UK fabricators — already built)
- **Buy** = distributor APIs (Mouser + Digi-Key + Farnell free tiers, 1k/day each) + H7 mechanical wholesalers + H6 named-manufacturer resellers
- **Services** = H8 curated UK test-house + notified-body registry

C-phase gained C5+C6+C7+C8 (part-regime classifier, honesty gate, match-type column, §6a/§6b/§6c PDF restructure).
H-phase restructured: H1→H1a+H1b+H1c+H1d+H1e (per-API adapters + aggregator). H2 repurposed as regime-router. H6 H7 H8 new. H3 H5 renumbered.

Live test confirmed: Farnell search page returns 94-byte stub (bot protection). Mouser returns captcha page. Digi-Key / Octopart return Cloudflare challenge. **Direct scraping is unviable for all major distributors. Free API keys are the only reliable path.**

Tristan registering keys now. Adapter scaffolding in next commit.

Count: 53 ✅ / 48 ❌ / 1 ⏸.

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
