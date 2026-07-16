# Poseidon prep — Yuri Wet-Lab Benchmark 03

**Status:** Chain launched (NinjaPCR 1808 SHIPS floor 9 + SIGHT form cleared).  
**Ladder:** 01 Open Colorimeter ✅ → 02 NinjaPCR ✅ (`1808-SCORED-ships-floor9-sight`) → **03 Poseidon** ← running → …

## Gate to start

NinjaPCR ships with honest floor ≥9 **and** SIGHT parity vs `out/_gold-ninjapcr-showcase/` (star knob on outer lid face in 00/04/07, not Goodhart score-only). Prep artefacts below may be created in parallel; do not launch Poseidon until that bar clears.

## Artefacts prepared

| Path | Purpose |
|------|---------|
| `briefs-loop/yuri_poseidon.md` | Black-box brief expanded for the chain (4-ch syringe pump, backlash, blocked-line safety, GUI + protocol) |
| `out/poseidon-board.json` | Empty `loop-board/1` — gate open |
| `out/_gold-poseidon-repo` | Frozen @ `5a139fed350bbf5d775ffa9650f465e557b6ccb0` (BSD-2-Clause, pachterlab/poseidon) |
| `out/_gold-poseidon-showcase/` | TRAINING SIGHT pack (product ortho + flow-rate chart; expand with STL stills / build-video frames) |
| Eval / sources (Downloads) | `Yuri_Wet_Science_Benchmark_Library/evaluation/03_poseidon_evaluation.md` + `gold_standard_sources/03_poseidon_sources.md` |

## Gold architecture signals (TRAINING — do not paste MPNs into emitters)

From frozen repo skim (rules only, universal):

- **Form:** 3D-printed syringe-pump frames + carriage on lead screw; optional peer Raspberry Pi microscope; CNC-shield / stepper-driver stack (multi-axis).
- **Motion:** stepper + lead screw; displacement from syringe ID × pitch × microstepping; AccelStepper-class firmware path.
- **Control:** Arduino (+ CNC shield) serial protocol; Python/Qt host GUI; channel independence under concurrent moves.
- **Hard problems (eval):** backlash, structural compliance, blocked-line pressure/force limit, variable syringe geometry, missed-step-free concurrent control, gravimetric accuracy across rates.

## Launch command (when NinjaPCR SIGHT clears)

```bash
PCB_STAGE=1 bash scripts/run-loop.sh \
  briefs-loop/yuri_poseidon.md \
  out/poseidon-board.json \
  poseidon
```

One PID tree per `out/poseidon-*`. Prefer Cursor durable background Shell. Do not pipe Blender to `head`.

## Rules of engagement

- **TRAINING/REFERENCE-AIDED** when gold informs a universal rule — never `if class == poseidon: emit <gold MPN list>`.
- Research-use hardware — no clinical / IVD framing.
- Score from workbook / `tab-scorecard.json` + SIGHT — not stdout alone.
- Target: honest floor ≥9 / ships=True before the next ladder step.

## Still optional before first chain

1. Export public BOM Google Sheet → CSV under `out/_gold-poseidon-showcase/`.
2. Render stills from `HARDWARE/pump/stl` + `HARDWARE/microscope/stl` for SIGHT comparison.
3. Confirm product-classifier / envelope path for multi-axis syringe-pump (+ optional microscope) before cold launch.

## Post-mortem 1834 (2026-07-15)

Misclassified as `vehicle` (`car`⊂`carriage`) → empty contract → plant BoM. SOURCE fix: word-bound vehicle + `syringe_pump` class path. Archived `out/poseidon-20260715-1834-BAD-vehicle-misclass`.
