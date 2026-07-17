# OpenFlexure prep — Yuri Wet-Lab Benchmark 04

**Status:** Prep + classifier/archetype SOURCE ready; chain launching.  
**Ladder:** 01 Open Colorimeter ✅ → 02 NinjaPCR ✅ → 03 Poseidon ✅ (`0659` SHIPS floor 9) → **04 OpenFlexure** ← next → 05 Pioreactor → …

## Gate cleared to start

| Product | Settled run | Verdict |
|---|---|---|
| Colorimeter | `out/colorimeter-20260713-1441` | SHIPS floor 9 · open 0 · workbook-recalc |
| Codema (parallel plant) | `out/codema-20260714-0332` | SHIPS floor 9 · open 0 |
| Powerwall (parallel wall) | `out/powerwall-20260715-0631` | SHIPS floor 9 · open 0 |
| NinjaPCR | `out/ninjapcr-20260715-1808-SCORED-ships-floor9-sight` | SHIPS floor 9 · open 0 |
| Poseidon | `out/poseidon-20260716-0659` | SHIPS floor 9 · open 0 · form glance PASS |

Poseidon-era form/glance changes are form-keyed (`syringe_pump` / `thermocycler` / `optical_handheld`). Live glance on settled Colorimeter + NinjaPCR exteriors still PASS. Form-factor honesty PASS on all five settled states.

## Artefacts prepared

| Path | Purpose |
|---|---|
| `briefs-loop/yuri_openflexure.md` | Black-box brief expanded for the chain |
| `out/openflexure-board.json` | Empty `loop-board/1` — gate open |
| Classifier + archetype | `lab_microscope` beats `pcb`→consumer_electronics; HARD slots + device-scale kW |
| Eval / sources (Downloads) | `Yuri_Wet_Science_Benchmark_Library/evaluation/04_openflexure_evaluation.md` + `gold_standard_sources/04_openflexure_sources.md` |

## Gold architecture signals (TRAINING — do not paste MPNs)

- **Form:** printed flexure body + motorised XY + focus; inverted / sample-accessible.
- **Optics:** RMS objectives + webcam-grade camera; sampling = f(NA, pixel pitch).
- **Motion:** low-cost geared steppers; manage backlash / stick-slip / drift.
- **Software:** network API + browser UI; separate camera / stage / experiment control.
- **Hard problems (eval):** sub-micron from printed parts, optical alignment, multi-day drift, reliable autofocus.

## Launch command

```bash
PCB_STAGE=1 bash scripts/run-loop.sh \
  briefs-loop/yuri_openflexure.md \
  out/openflexure-board.json \
  openflexure
```

One PID tree per `out/openflexure-*`. Prefer Cursor durable background Shell. Do not pipe Blender to `head`.

## Rules of engagement

- **TRAINING/REFERENCE-AIDED** when gold informs a universal rule — never `if class == openflexure: emit <gold MPN list>`.
- Research-use hardware — no clinical / IVD framing.
- Score from workbook / `tab-scorecard.json` + SIGHT — not stdout alone.
- Target: honest floor ≥9 / ships=True before ladder step 05 (Pioreactor).
