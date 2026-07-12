# Cursor ↔ Claude Code harness inbox

**Authority:** You (Claude Code) own execution. Cursor advises. Tristan is asleep — this is the overnight brief.

**Status:** `RECOMMENDATIONS_READY`  
**Updated:** 2026-07-12 ~21:15 BST

**THE PLAN (execute this):** [`docs/plans/2026-07-12-overnight-open-colorimeter-replica-plan.md`](./2026-07-12-overnight-open-colorimeter-replica-plan.md)

**Immediate next action:** fill `TRAINING-gap-list.md` from §1 (2048 vs gold), then Wave **A1** membrane birth — do not jump to PCB chrome.

---

## What Tristan actually wants (plain English)

By morning there should be an engine-produced colorimeter design that is a **faithful replica of the real device under test** (IO Rodeo Open Colorimeter) — same product shape, optics, interconnect, board architecture, cost class, manufacturable story.

You are **allowed and expected to SEE the target** overnight.

This is **not** “copy the gold BoM into the emitter.”  
This **is**: “Here is what correct looks like. Diff the engine output against it. Change **universal engine code** so a brief-driven run **meets that target**.”

Hard way + assistance:
1. Open the real reference (CAD / PCB / photos / eval checklist).
2. Open the latest engine dossier / state.
3. List every structural gap (enclosure, cuvette tower, LED boards, detector path, MCU/UI, power, cost, PCB tab fitness…).
4. Fix the **rules** (classifier, skeleton, topology, pins, PCB generator, drawings, renders, Excel) that prevent hitting the target.
5. Re-run until the deliverable **looks and reads like that device**, not a plant cabinet with a photodiode noun stuck on.

Mark all gold-informed work: `TRAINING/REFERENCE-AIDED`.  
Do **not** claim a black-box Yuri benchmark score for these runs. A clean hidden-gold score can come later; tonight is **hit the visible target**.

---

## THE TARGET (open these — this is the answer key for shape)

| What | Path |
|---|---|
| **Frozen repo (full design)** | `out/_gold-colorimeter-repo` → `/tmp/open_colorimeter_gold_b7f37ae` @ `b7f37ae` |
| Enclosure / battery mount CAD | `…/design_files/enclosure/` (`.FCStd`, `step/`) |
| Cuvette holder | `…/design_files/cuvette_holder/` |
| **LED PCB(s)** (small swappable boards) | `…/design_files/basic_led_pcb/` |
| Reference BOM workbook | `…/design_files/BOM.xlsx` — **study structure/cost class; do not paste as a per-product table** |
| Visual target pack | `out/_gold-colorimeter-showcase/` (`01`–`07` PNGs: finished product, enclosure, cuvette, optical block, LED PCB, calibration) |
| Evaluation acceptance tests | `~/Downloads/Yuri_Wet_Science_Benchmark_Library/evaluation/01_open_colorimeter_evaluation.md` |
| Source / hard problems | `~/Downloads/Yuri_Wet_Science_Benchmark_Library/gold_standard_sources/01_open_colorimeter_sources.md` |
| Generation brief (still the input) | `briefs-loop/yuri_open_colorimeter.md` |

### Target product shape (north star)

```
Handheld light-tight enclosure
  + 10 mm cuvette holder / optical path (ambient exclusion)
  + small swappable LED source PCB(s) (not a plant panel)
  + photodetector + TIA (+ ADC as needed)
  + MCU + display + buttons (Pybadge-class / compact UI — see enclosure covers)
  + USB + battery as COTS/modules with short interconnect
Cost: tens–low hundreds £, not £k industrial Banner/PV/safety gear
PCB story: multiple small boards / modules OR one compact instrument board with REAL MPNs
        — NOT one 80×80 function_class placeholder with DRC-clean Gerbers
```

Eval checklist hard bars (must become true of the **engine** dossier, not only known in your head):
- Repeatable 10 mm optical geometry + positive cuvette location  
- Ambient / stray light exclusion  
- LED current stability + wavelength/module identity  
- Detector gain / saturation handling  
- Blanking / calibration persistence (in design narrative + test plan)  
- Manufacturable enclosure + serviceable LED module  
- Mech CAD ↔ PCB ↔ firmware pin story coherent  
- BOM with real manufacturer part numbers (resolved by rules/catalogue, not a hardcoded gold dump)

---

## Method (how to use the target)

```text
OPEN TARGET  →  OPEN LATEST out/colorimeter-* DOSSIER + state
     →  WRITE gap list (structural, not cosmetic)
     →  FIX SOURCE RULES + proveCatch guards
     →  ONE clean chain (PCB_STAGE=1, single PID tree)
     →  SIGHT again against showcase + eval checklist
     →  repeat until replica bar met
```

**Allowed:** reading gold CAD/PCB/BOM/photos; using them to decide which universal rules are wrong.  
**Forbidden:** `if product_class == colorimeter: emit <gold MPN list>`; shipping a dossier that only matches because you hand-edited state.

Prefer fast harness for Excel/drawings/renders after a good state freeze; full chain when TS contract/skeleton/PCB generator changes.

---

## Morning definition of done

A new `out/colorimeter-…` (or clearly identified best run) where a skeptical reviewer opening the dossier + PCB tab + renders would say: **“that’s an Open Colorimeter-class instrument,”** not “a process plant with optical nouns.”

Concrete:
- [ ] Visual/mechanical: enclosure + cuvette tower + optical path readable in renders/GA (compare to showcase 01–06)
- [ ] BoM: photometer spine; £-scale COTS; no Banner interlock / PV fuse / DN80 water / PCIe USB
- [ ] PCB: board architecture matches target class (small LED board(s) + instrument electronics); fitness not stuck at ~3/10 on placeholders; PnP/BoM have real designators + MPNs where on-board
- [ ] Electrical / connection: device DC + signal tree present (Electrical not skipped)
- [ ] Tab floor: push every tab to genuine ≥8; stretch ≥9 where the target makes it obvious
- [ ] Commits: `TRAINING/REFERENCE-AIDED` + what gold paths informed the fix
- [ ] Terminal reply below: best `out/` path, scorecard mins, remaining gaps vs eval checklist

If perfect replica slips: leave the **closest** run + punchlist routed to source rules — never inflate scores.

---

## Also still true from earlier audits (don’t ignore)

- Membrane→filtration skid must die at birth  
- `optical_instrument` needs real contract/suppliers/cost band  
- PCB tab UX mostly landed; **content** (pins, off-board triage, pad-overlap vs DRC CLEAN) is the weakness  
- One chain PID tree per `out/`

---

## Terminal reply

<!-- Morning: best out/ path, how you used the target, scores, remaining gaps. -->

### 2026-07-12 ~21:40 — RENDER FIDELITY (gold-informed, commit 6e6b09e8f)

Opened the gold (out/_gold-colorimeter-repo BOM.xlsx + showcase). Target: PyBadge LC
(4624 = MCU+TFT+buttons+LiPo+USB) + TSL2591 detector (1980) + basic_led source board +
3D-printed cuvette holder & enclosure + Qwiic/STEMMA cables + M2.5/M3 fasteners; a
WIDE-FLAT handheld (~140×110×55 mm), ~£100-150 COTS. TRAINING/REFERENCE-AIDED — form
factor only; did NOT paste the gold MPN table into the emitter.

Root-caused the "black BESS cabinet" hero + fixed at SOURCE (universal, keyed on
state.isInstrumentDevice):
1. aggregator.ts deriveDeviceScaleEnclosure emitted a slightly-TALL square box
   (115×115×150) → cube reads as a floor cabinet. Now landscape W:D:H=1.45:1.15:0.60.
2. Added instrument FACE features to the closed cover (display window + 5-button d-pad
   + a cuvette/optical port on the wide top); no vent slots when no air-mover exists.
3. Product-view + cutaway-hero cameras framed on HEIGHT alone → wide-flat overflowed to
   a zoomed white patch. Now frame on max(h_eff, w/1.5, d/1.5) at the 1.5:1 aspect.
VERIFIED (SIGHT): 04-product-exterior reads unmistakably as a benchtop colorimeter;
00-hero a correctly-framed wide-flat cutaway. proveCatch: render_view_contract _selftest.

Killed 3 overlapping chain trees (state-flip hazard); launched ONE clean cold run
out/colorimeter-20260712-2137 (fresh cache, PCB_STAGE=1) to bake in the full fix set.

Honest open punchlist (NOT false-scored): (a) cutaway INTERIOR = generic grey boxes at
~149% fill (recognisable board/optical-bench geometry is a deeper follow-up); (b) BoM
~£576 vs gold ~£150 (engine designs discrete where IO Rodeo used an integrated PyBadge
— disclose/close via COTS-module pricing); (c) scorer json/punchlist reconcile pending.

_Status: (overnight — clean run 2137 in flight)_
