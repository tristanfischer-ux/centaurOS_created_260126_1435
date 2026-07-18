# Diagnosis for Cursor — two stuck Yuri instrument runs (from Claude, 2026-07-17)
*You asked me (via Tristan) to check whether the instrument runs are passing their ≥8 scorecard. Result: poseidon PASSES (det floor 10), colorimeter is a clean first pass (iter 0), ninjapcr is borderline (floor 8, not all-pass). Two are stuck — details + source fixes below. Both are plateauing on **code-level bugs the loop cannot self-fix**, not on anything more iterations will solve.*

## openflexure (microscope) — plateaued at floor **7 after 7 iterations**
`quality-loop-directives.json` names it exactly:

1. **False compliance FAIL on the HEADLINE metric.** `brief_compliance=7`: *"focus_resolution_um — target 1 µm, achieved 0.611 µm (abbe_resolution_um)"* scored **FAIL (soft)**. But for resolution **smaller is better** — 0.611 µm *beats* the 1 µm target. The compliance matcher is comparing magnitudes with no metric DIRECTION, so a design that **exceeds** the target is scored non-compliant. This is exactly why 7 iterations can't fix it: the design is already good; the **RULE** is wrong.
   - **Fix (universal source rule):** give the compliance matcher a metric-direction family — resolution / linewidth / detection-limit / noise / latency / power-draw are **lower-is-better** (pass when achieved ≤ target); throughput / accuracy / capacity stay higher-is-better. Key off the metric noun/unit, not a per-class table.
2. **Headline metric UNVERIFIED.** Self-audit: *"Primary target (focus resolution) unverified despite being the headline metric."* No worked calc backs the 0.611 µm. Add an optics worked-calc (Abbe: d = λ/(2·NA)) so the headline number is *verified*, not asserted.
3. **BoM=7: 1 part NOT FOUND** in the cascade/ledger — a coverage gap; ingest the missing part.

## pioreactor (bioreactor) — produced **NO deliverable**; run-loop is **GATE CLOSED**
From `out/logs/pioreactor-campaign.log`:

1. **`draw_hvac.py` crashed: `'NoneType' object has no attribute '__dict__'`** — HVAC drawing runs on a bioreactor that has no HVAC subsystem and dereferences None. **Guard/skip HVAC when the class has no HVAC** (or supply the missing object).
2. **openpyxl error `expected MultiCellRange`** → the **Engineering Analysis tab was SKIPPED** (Excel-build type bug — a merged-range assignment got the wrong type).
3. **`chain-v2.pdf` never rendered** → a cascade of ENOENT (deliverable-copy, consistency-audit `pdftotext`, `open`) all failed on the missing PDF. **The render failure is the upstream cause of the empty run dir** — fix this and the downstream noise clears.
4. **`[benchmark] generation failed: fetch failed`** — benchmark-net LLM call had a network fetch failure (transient, but it degrades the run; add a retry).
5. **Board GATE CLOSED** with open defects blocking relaunch: parts-ledger **22 not-found equipment** (X-128, X-105, X-102, X-104…); Process-schedules **4/43 required cells empty**; cross-schedule reconciliation diverges >20% (valve count schedule 3 vs BoM 0; instrument count); **Renders VISION CRITIC: "product cropped, too small, or unreadable; generic anonymous boxes"**; Verification **5 HARD claims open**. It won't launch until these are disposed (`loop_board.py dispose <id>`) or fixed at source.

## The pattern
Both are stuck on **source-rule bugs**, not on needing more loops: a compliance-direction rule (openflexure), a `draw_hvac` None-guard + an openpyxl MultiCellRange type bug + a PDF-render failure (pioreactor), plus **parts-coverage gaps** on both. Fix at source with a guard (per the CORE FIX PRINCIPLE) and the loop moves again. openflexure's false-fail in particular is worth catching as a regression invariant: *a design that meets-or-beats a lower-is-better target must never score the compliance tab below 8.*
