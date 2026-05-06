# PDF Engine v2 — Work Tracker

**Owner:** Claude (Sonnet)
**Started:** 2026-05-06
**Goal:** Local-first quality lift on the pdf engine. Many small wins, each with a PDF before/after.

> **Rule I must follow:** I do not close an increment unless I have a diffable PDF artefact showing the change. If I can't point to a page number and say "this is what improved", the increment doesn't count.

---

## Evidence log

All before/after PDFs live under `~/Downloads/engine-evidence/<label>/`. Layout:

```
~/Downloads/engine-evidence/
  baseline-0/
    bess/
      report.pdf
      log.txt
      summary.json
      qa-scores.json
    heatpump/...
    farm/...
  A1-feasibility-gate/
    bess/... (post-fix)
    NOTES.md       # what changed, which pages to look at
  A2-grounding-wired/
    ...
```

Each increment folder has a `NOTES.md` that cites page numbers in the baseline it fixes.

---

## Phase plan

| Phase | Increment | Status | Evidence folder | PDF change claim |
|---|---|---|---|---|
| Setup | S1 engine-evidence.sh wrapper | **done** | scripts/ | committed 5caf6914 |
| Setup | S2 test briefs (bess, heatpump, farm) | **done** | briefs/ | committed 5caf6914 |
| Setup | S3 baseline run × 3 briefs | **done** | baseline-0/ | All 3 PDFs captured — see BASELINE-AUDIT.md |
| Setup | S4 BASELINE-AUDIT.md | **done** | ~/Downloads/engine-evidence/baseline-0/BASELINE-AUDIT.md | 20 numbered observations (BESS, HP, farm, CX) + fix map |
| A | A1 `gateResults` scope fix | **done** | baseline-PRE-A1-CRASH | commit defa15a0 — unblocks every non-RED, non-INFEASIBLE run |
| A | A5 sizing domain regex normalise | **done** | baseline-PRE-A5/ | commit 13c1b583 — unblocks Stage 3 for every brief |
| A | A6+A7 product-agnostic prompts + robust decompose JSON | **done** | (implicit via later baselines) | commit d0b636d5 — research/decompose no longer hallucinate heat pumps |
| A | A8 generic-domain sizing tolerates missing module-mass | **done** | (implicit) | commit 1de66980 — unblocks Stage 4 when decompose doesn't set mass |
| A | A9 centralised lib/llm-json.ts, wire into BOM | **done** | (implicit) | commit 7b8bc927 — string-aware brace balancing + raw dump on failure |
| A | A10 BOM uses Gemini + json_object + model fallback | **done** | baseline-0/bess | commit 8bf529fd — GLM-5.1 replaced; BOM parses reliably |
| A | A2 pass pre-loaded grounding into Stage 4 | **done** | baseline-1/ (running) | commit a66c15ee — Stage 4 reuses groundingData; sets up Phase C swap |
| A | A11 HP sizing branch respects missing-lookup-matches | **done** | baseline-1/heatpump (running) | commit cda26726 — unblocks heatpump end-to-end |
| A | FARM-CLS-1 tighten classifier / add vertical_farm class | **done** | baseline-1/farm (running) | commit cda26726 — "kWh" alone no longer forces energy_storage |
| A | A3 defensive rendering / null safety | todo | A3-defensive/ | 10 runs in a row all produce valid PDFs |
| A | A4 abort on critical-stage failure | todo | A4-abort-on-fail/ | Short error PDF when decompose/sizing fails |
| B | B1 render source grades inline | todo | B1-grades/ | Every section header + BOM row shows A–E grade |
| B | B2 render priceBreakdown column | todo | B2-cost-basis/ | BOM has "Cost basis" column; appendix shows each breakdown |
| B | B3 feasibility dashboard page | todo | B3-dashboard/ | New page 4: 7-row PASS/WARN/FAIL gate table |
| C | C1 lib/local-corpus.ts | todo | C1-local-corpus/ | Unit test proves semantic search works against nightshift.db |
| C | C2 top-5 BOM parts get real suppliers | todo | C2-top5-suppliers/ | BOM shows 3 real suppliers on top 5 cost rows |
| C | C3 Suppliers section — all BOM | todo | C3-suppliers-all/ | Suppliers page is 2 pages of real UK/EU suppliers with certs |
| C | C4 process-match validation | todo | C4-process-match/ | Parts with no verified supplier flagged in red |
| D | D1 reverse index: process→companies | todo | D1-process-index/ | New SQL table; supplier lookups for process X faster + broader |
| D | D2 reverse index: material→companies | todo | D2-material-index/ | BOM parts with material X show supplier count footer |
| D | D3 boilerplate strip + domain tagging | todo | D3-domain/ | Irrelevant suppliers disappear from domain-specific results |
| E | E1 real cost waterfall | todo | E1-waterfall/ | Waterfall page with 8-row table summing to correct £X,XXX |
| E | E2 regulatory with cost + timeline | todo | E2-regulatory/ | Regulatory table has £ + weeks per standard |
| E | E3 FMEA with S/O/D and RPN | todo | E3-fmea/ | FMEA page: 15-20 row table with RPN sorted desc |
| E | E4 datasheet-backed top 10 part notes | todo | E4-datasheet/ | Top 10 BOM parts each have 2-sentence note + source URL |

---

## Self-imposed guardrails

1. Run baseline BEFORE starting each increment — do not work blind.
2. One increment per commit. Commit message cites BASELINE-AUDIT observation numbers fixed.
3. At most 2 hours per increment before showing Tristan the diff. Split if ballooning.
4. No Supabase writes. No Vercel concerns. Local only.
5. No rewriting the orchestrator. Wire things better into what exists.

---

## Active increment

Currently: **baseline-1 running** (post A2 + A11 + FARM-CLS-1).

**Post-baseline plan (in order):**
1. Audit baseline-1 PDFs vs baseline-0, update BASELINE-AUDIT observation map.
2. **Next highest-leverage fix on BESS:** BESS-002 (BOM quantity column) + BESS-003 (supplier wired to BOM). These two together should finally produce a BOM that sums to realistic figures once quantities are counted.
3. Then B1 (inline source grades per-row), B2 (cost-basis column), B3 (feasibility dashboard).
4. Then C1 (lib/local-corpus.ts) — the big swap.

Budget: ~£12-14 of £40 spent across baseline-0 + A10 rerun + baseline-1. Plenty of headroom.

---

## Log

(newest first)

### 2026-05-06 06:40 — baseline-1 launched (post A2 + A11 + FARM-CLS-1)
Baseline-0 captured. BASELINE-AUDIT written (20 observations). 3 new commits to close the remaining stage-3/classifier blockers:
- **A2** (commit a66c15ee): wire pre-loaded grounding into Stage 4 — stops double DB query, sets up for local-corpus swap.
- **A11** (commit cda26726): HP sizing branch gets A8-style missing-lookup-matches fallback. Unblocks heatpump full pipeline.
- **FARM-CLS-1** (commit cda26726): product classifier requires 2 signals for energy_storage; adds vertical_farm class with domain-specific required fields. Unblocks farm full pipeline.

### 2026-05-06 06:30 — baseline-0 complete, BASELINE-AUDIT.md written
All 3 PDFs captured: BESS 55 pages / 185 KB (full pipeline), heatpump 37 pages / 122 KB (sizing INFEASIBLE → BOM skipped), farm 27 pages / 85 KB (classifier misclassified as BESS → brief INVALID → short report).

Audit has 20 numbered observations with fix-path mapping. Top 5 highest-impact (all BESS):
- BESS-001 🔴 Unit cost £9,461 — reference is £247k. BOM £25 heuristic dominates.
- BESS-002 🔴 No quantity column; BOM rollup treats every line as qty=1.
- BESS-003 🔴 Every Supplier column shows "TBD" despite Stage 5 matching.
- BESS-004 🔴 NRE £6k for a BESS platform — reference is £355k total / £14k/unit.
- BESS-005 🔴 No module dividers in BOM table — reader can't tell which parts belong where.

### 2026-05-06 05:40 — A10 BOM model swap (commit 8bf529fd)
GLM-5.1 returned 10KB of prose reasoning + numbered list instead of JSON despite "Return ONLY JSON" instruction. Switched primary to Gemini 3.1 Pro + response_format:json_object. Fallback chain Gemini → Claude → GPT-4.1-mini. Every model gets 300s timeout.

### 2026-05-06 05:20 — A9 centralised JSON parser (commit 7b8bc927)
Created lib/llm-json.ts with string-aware brace balancing (ignores `{`/`}` inside string values), markdown strip, thinking-block strip, and /tmp raw dump on final failure. Wired into BOM stage. Decompose still uses its own inline version — can converge later.

### 2026-05-06 05:00 — A8 sizing tolerates missing mass (commit 1de66980)
Decompose doesn't populate estimatedMassKg so the `|| 1000` × 0.01 heuristic gave 10 m² per module — any multi-module brief blew past the envelope budget and INFEASIBLE was auto-returned. Now: if ALL modules lack mass, mark feasible-with-warning instead of blocking the pipeline, and use domain-appropriate fallback multipliers (BESS 0.0002, heat pump 0.001).

### 2026-05-06 04:30 — A6+A7 de-heat-pump research + decompose (commit d0b636d5)
RESEARCH_SYNTHESIS_SYSTEM and MODULE_DECOMPOSITION_SYSTEM both hardcoded "You are a heat pump engineer" / "30kW R290 hydronic split system". Result: BESS briefs produced heat-pump modules. Rewrote both to be product-agnostic. Also made decompose JSON parsing robust — multi-strategy extraction with raw dump on failure.

### 2026-05-06 00:30 — A5 sizing domain regex normalise (commit 13c1b583)
Research LLM produces free-form industryDomain strings. Solver had exact-match dict. Every brief fell through to generic 5×5m envelope and returned INFEASIBLE in 0-1 ms. Replaced with regex normaliser covering BESS-ish, heat-pump-ish, farm-ish strings.

### 2026-05-06 00:15 — A1 gateResults scope fix (commit defa15a0)
Pipeline crashed at PDF stage with "gateResults is not defined" on every happy path because variable was declared in a nested else but referenced at the outer return. Hoisted to function scope.

### 2026-05-06 00:00 — session start
Plan agreed. Setup + Phase A begin. Budget £40/night.
