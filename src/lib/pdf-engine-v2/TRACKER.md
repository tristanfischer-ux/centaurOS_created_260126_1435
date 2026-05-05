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
| Setup | S1 engine-evidence.sh wrapper | todo | n/a | |
| Setup | S2 test briefs (bess, heatpump, farm) | todo | briefs/ | |
| Setup | S3 baseline run × 3 briefs | todo | baseline-0/ | |
| Setup | S4 BASELINE-AUDIT.md | todo | baseline-0/ | |
| A | A1 feasibility-gate scope fix | todo | A1-feasibility-gate/ | Infeasible briefs return a short "blocked" report, not 30 pages of zeros |
| A | A2 pass grounding into Stage 4 | todo | A2-grounding-wired/ | BOM rows show real material codes + per-part cost breakdown |
| A | A3 defensive rendering (no null crashes) | todo | A3-defensive/ | 10 runs in a row all produce valid PDFs |
| A | A4 abort on critical-stage failure | todo | A4-abort-on-fail/ | When decompose/sizing fails, short error PDF instead of garbage |
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

Currently: **S1 — build evidence wrapper**

---

## Log

(newest first)

### 2026-05-06 — session start
- Plan agreed. Starting setup phase. No code changes to engine itself in setup — just evidence infrastructure + test briefs + baseline capture.
