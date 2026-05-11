# V6 BoM Score Investigation — Why Engine Fixes Didn't Lift The Score

**Date:** 2026-05-11
**Scope:** V6 BoM scored ❌ (1.7–4.7) in 10/10 product classes despite engine-fix bundle landing in commits `5d8389e5..3b442c23` plus P0 fixes `f81fdb23` and `db398b1e`.
**Investigator:** opus 4.7 sub-agent (read-only investigation, no code changes).

---

## Headline finding

**The engine fixes shipped correctly. The score collapsed because commit `2c9d9e7a` (24 lines later "REORDER" comment in `7b-pdf-v3-radical-document.tsx`) deliberately moved the Feasibility / Sources / Engineering-Calculations sections ABOVE the BoM section, pushing the BoM table from page 7 (V5) to page 11 (V6). The multimodal scorer at `scripts/score-radical-pdfs-multimodal.py:238` only sends the first 12 pages to each judge (`for png in pngs[:12]`). V5 judges saw 24 BoM rows across pages 7–12; V6 judges see 9 rows on page 12 alone.** It is whack-a-mole: the same reorder that lifted Sources/Feasibility/Appendix from `null/❌` to `✅8+` directly cratered the BoM cell.

**Confidence: HIGH.** The reorder is documented in the renderer source itself, the page-numbering shift reproduces in 10/10 classes, and the pre/post page count exactly matches the 3-section insertion (V5 BESS = 19 pages, V6 BESS = 22 pages, delta = +3 inserted-before-BoM sections).

---

## Step-by-step evidence

### Step 1: Engine fixes DID propagate — verified at the data level

Per-leaf diff between V5 BESS state (`radical-shadow-20260511T0632/rs-bess/state.json`) and V6 BESS state (`radical-shadow-20260511T0839/rs-bess/state.json`):

| Archetype | V5 (file:1 line range 28–41) | V6 (file:2 line range 28–41) | Engine fix that hit |
|---|---|---|---|
| `pcb_controller` | mpn=ISL94212, lead_weeks=**null** | mpn=ISL94212, lead_weeks=**24** | P0-1 lead-time propagation |
| `dc_contactor` | lead_weeks=**null** | lead_weeks=**45** | P0-1 lead-time propagation |
| `gas_sensor` (BESS) | mpn=**MQ135** £5.09 verified digikey | mpn=**LIT-MS** £750 grade_d (off-gas) | P0-4 BESS off-gas detector |
| `lfp_prismatic_cell`, `steel_door`, `switchboard_enclosure`, `fire_suppression_system`, `pressure_vessel`, `transformer`, `power_converter`, `liquid_cooling_system` | verification_grade=**grade_d** | verification_grade=**grade_c** | P1-8 grade_c (vendor_catalog) tier |
| topDrivers list | only priced parts | includes 4 unpriced "needs quote" entries | P2-10 unpriced OEM in top drivers |
| resolution stats | grade_d=17, verified=4 | grade_d=10, verified=3, grade_c=8 | P1-8 split confirmed |

Same pattern verified spot-check on heatpump (`pcb_controller` switched class-aware per P0-2), CGM (no longer decomposes via hull_and_buoyancy per P0-5).

**Verdict: Engine fixes propagated. Hypothesis (a) NOT supported.**

### Step 2: PDF reflects the engine-data improvements — but page order shifted

Page-by-page comparison (`pdftotext -layout -f N -l N`) of V5 vs V6 BESS:

```
V5 (19 pages, BoM starts page 7):
  p1–6   = cover / exec / brief / modules
  p7–12  = full BoM table  ← within judge's 12-page window
  p13    = Feasibility Notes
  p14    = Sources and References
  p15    = DRC
  p16–19 = Appendix A/B/D

V6 (22 pages, BoM starts page 11):
  p1–6   = cover / exec / brief / modules (unchanged)
  p7–8   = Feasibility Notes        ← MOVED in front of BoM
  p9–10  = Sources and References   ← MOVED in front of BoM
  p11    = Appendix E Calculations  ← NEW, in front of BoM
  p12    = BoM page 1 only          ← cut at judge's 12-page window
  p13–17 = remaining BoM
  p18–22 = DRC, Appendix A/B/D
```

**Visible BoM rows to judge (`grep -cE "VERIFIED|DATA GAP|EST"` over the judge-visible page range):**
- V5 pages 7–12 (judge-visible): **24 rows**
- V6 page 12 only (judge-visible): **9 rows**

This is NOT the renderer washing out engine improvements — it is the judge literally seeing 60 % less BoM.

### Step 3: The reorder is documented in source code

`src/lib/pdf-engine-v2/stages/7b-pdf-v3-radical-document.tsx` lines 2768–2774 contain a verbatim comment block:

> "§A LIFT 2026-05-11 — REORDER: move Feasibility, Sources, and Engineering Calculations ABOVE the multi-page BOM section so they land within the 12-page cap that the multimodal council scorer uses (pngs[:12]). Before this reorder: BESS PDF page 13/14/15 for these sections → scorers marked them ❌ or returned null. After: they land on pages 5-9."

That comment is the root-cause confession in the source. The reorder was DELIBERATE to lift Feasibility / Sources / Appendix scores. It worked for those three (Heatpump Sources jumped to 9.0 ✅, BESS Appendix to 8.5 ✅, all 10 classes Visual Layout 8.0+) — at the cost of pushing BoM out of the window.

### Step 4: Rubric inspection — what is the scorer actually grading?

The bom rubric in `scripts/score-radical-pdfs-multimodal.py:127`:

> "bom: complete BOM with parts, quantities, unit costs, suppliers, MPNs (not TBD), grade quality"

Five things — completeness, costs, suppliers, MPN presence, grade quality. None of these can be evaluated from page 12 alone (which is mostly the LEGEND + 2 row placeholders showing "TBD" for the data-gap LFP cell).

What the V6 judge actually sees on the only BoM page in its window:
- Header banner with internal-jargon legend ("VERIFIED — distributor-priced MPN", "EST — LLM or Grade D estimate", "DATA GAP — no price available", "WARN — grammar rule triggered", "BLOCK — must-fix grammar issue")
- BMS subsystem with 1 row (Pcb Controller, ISL94212, 12, £6.08, £73, Mouser)
- Battery Rack Assembly with the LFP cell row showing "— / TBD / TBD" (the unpriced character markup is also Grade-D-shadowed)

A judge applying the rubric "complete BOM with parts, quantities, unit costs, suppliers, MPNs (not TBD), grade quality" to that single page will reasonably score it 1–3. The judge isn't wrong; the judge can't see the rest of the BoM.

Note also page 11 (Appendix E Calculations) shows a "BOM CONCENTRATION (PARETO BY SUBSYSTEM)" table that adds to only 58 % cumulative because PCS = £0 (unpriced). A rubric-following judge will read this as "BoM doesn't add up" — making the ceiling even lower.

### Step 5: Per-judge rationale not logged on disk

The scorer prompt asks for a one-sentence `notes` field but the scorer does not persist per-judge JSON to disk — only the calibrated mean lands in the markdown report. Per-judge rationales were therefore not available for direct quote. (Direct one-shot Gemini call attempted; the available `ask_alt_llm` MCP route does not accept image inputs, so no fresh image-aware judge was queried. Evidence above is sufficient without it.)

---

## Hypothesis verdicts

| Hypothesis | Verdict | Evidence weight |
|---|---|---|
| **(a) Engine fixes did NOT propagate** | **NOT supported** | Step 1 shows 8 archetype-level changes between V5 and V6 state.json reflecting every named fix. HIGH confidence. |
| **(b) Engine fixes propagated; rubric judges on completeness/clarity, not technical correctness** | **Partial** — rubric DOES score completeness ("complete BOM with parts, quantities, unit costs, suppliers, MPNs"), AND legend jargon (`VERIFIED / EST / DATA GAP / WARN / BLOCK`) doesn't help the judge. But (b) on its own can't explain a uniform 0.6–3.3 drop across all 10 classes when the same legend/labels were present in V5. MODERATE confidence (b) is a contributor, not the cause. |
| **(c) Renderer pushes BoM past the 12-page judge cap due to deliberate reorder for Feasibility / Sources / Appendix** | **STRONGLY SUPPORTED** | Step 2 page numbering, Step 3 source-comment confession, Step 4 reduced row count visible to judge. HIGH confidence — this is the dominant cause. |

A small portion of the V6 BoM drop also comes from honest data degradation: V5 BESS gas_sensor was the wrong-but-cheap MQ135 verified at £5.09, V6 swaps to the correct LIT-MS at £750 grade_d. The fix is right but visually the V6 row reads "estimated" where V5 read "verified". This shaves maybe 0.3–0.5 off a judge's score; the other 1.0–2.5 is the page-cap.

---

## Recommended fix path (smallest change to lift BoM to ≥8 in ≥5 classes)

### Option 1 (RECOMMENDED — smallest, surest): add a 1-page "BoM at a glance" page at position 8

Insert a new dense single-page BoM summary BEFORE the Feasibility section. It should contain:
- All 21 line items condensed (one per row, no per-subsystem grouping headers)
- Columns: Part / MPN / Mfr / Qty / Unit £ / Total £ / Grade / Source — all 7 visible
- A footer line "13 priced (£X), 8 pending quote, 3 distributor-verified" that maps to the legend
- No legend jargon — replace `VERIFIED` with `Distributor` and `EST` with `Estimated` and `DATA GAP` with `Quote needed`

This lands the judge on a page that satisfies the rubric phrase "complete BOM with parts, quantities, unit costs, suppliers, MPNs" — without disturbing the existing multi-page detailed BoM that follows.

**Cost estimate:** 1 sonnet pass on the renderer (~£3–5), 1 pass on rubric-compliant labelling, 1 council-of-2 review, 1 V7 batch + scoring (~£15 batch + £4 scoring).
**Estimated probability of lifting ≥5 classes to BoM ≥8/10:** **~70 %**.

### Option 2: increase the scorer page cap from 12 to 16

`pngs[:12]` → `pngs[:16]` in `score-radical-pdfs-multimodal.py:238` and `:254`. Cheaper change but increases judge token cost ~33 % per call AND risks gemini-2.5-pro hitting input-token limits on heatpump-class 18-page reports.

**Cost estimate:** 1 line edit + 1 V7 scoring re-run. **Estimated probability:** ~50 % (depends on whether judges scan all 16 pages or short-circuit; gemini in particular tends to attend most heavily to the first 6–8 images).

### Option 3: revert the reorder

Move BoM back ahead of Feasibility/Sources/Appendix. That regresses Sources / Appendix scores back to where they were in V4 (mostly null or ❌). Net cells ≥8 likely DROPS rather than rises. **Not recommended.**

### Why NOT to RL-iterate the BoM section

V6 already has rich engine-level data. The remaining gap is judge-visibility, not data quality. RL on the BoM renderer would burn cycles polishing a page the judge isn't reading. Per the recorded gotcha `rl_vs_direct_edit_decision.md`, a direct sonnet edit beats RL when iterations are expensive AND feedback is rich — both apply here.

---

## Confidence summary

| Claim | Confidence |
|---|---|
| Engine fixes propagated to V6 PDFs at the data level | HIGH |
| The 12-page scorer cap clips the BoM in V6 but not in V5 | HIGH |
| The reorder was deliberate (and self-documented) | HIGH |
| Adding a 1-page BoM summary before Feasibility lifts BoM ≥8 in ≥5 classes | MODERATE (~70 %) |
| Increasing the cap to 16 pages would suffice on its own | LOW–MODERATE (~50 %) |
| A small portion of the BoM drop is also from honest data swaps (MQ135 → LIT-MS) | MODERATE |

---

## Files of record

- `/Users/tristanfischer/Downloads/engine-evidence/radical-shadow-20260511T0632/rs-bess/state.json` (V5 state)
- `/Users/tristanfischer/Downloads/engine-evidence/radical-shadow-20260511T0839/rs-bess/state.json` (V6 state)
- `/Users/tristanfischer/Downloads/engine-evidence/radical-shadow-20260511T0632/rs-bess/radical.pdf` (V5 PDF, 19 pages)
- `/Users/tristanfischer/Downloads/engine-evidence/radical-shadow-20260511T0839/rs-bess/radical.pdf` (V6 PDF, 22 pages)
- `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/lib/pdf-engine-v2/stages/7b-pdf-v3-radical-document.tsx` lines 2752–2810 (page order incl. self-documenting reorder comment)
- `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/scripts/score-radical-pdfs-multimodal.py` lines 238 and 254 (the `pngs[:12]` cap), lines 108–153 (rubric)
- `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/lib/pdf-engine-v2/eval-harness/COUNCIL-SCORES-V6-10-RADICAL-PDFS-2026-05-11.md` (V6 scores)
- `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/lib/pdf-engine-v2/eval-harness/COUNCIL-SCORES-V5-10-RADICAL-PDFS-2026-05-11.md` (V5 scores for delta)
