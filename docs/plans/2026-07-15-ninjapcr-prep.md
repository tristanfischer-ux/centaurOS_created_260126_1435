# NinjaPCR prep — Yuri Wet-Lab Benchmark 02

**Status:** Prep ready (brief + board + frozen gold + SIGHT pack). Chain not launched.  
**Ladder:** 01 Open Colorimeter ✅ (floor 9) → **02 NinjaPCR** ← next → 03 Poseidon → …

## Gate cleared to start

Colorimeter (`out/colorimeter-20260713-1441`), Codema (`out/codema-20260714-0332`), and Powerwall (`out/powerwall-20260715-0631`) all ship at honest floor ≥9. The colorimeter-before-NinjaPCR finish bar is satisfied.

## Artefacts prepared

| Path | Purpose |
|------|---------|
| `briefs-loop/yuri_ninjapcr.md` | Black-box brief expanded for the chain (research-use thermocycler, ≥8×0.2 mL, 4–99 °C, active heat/cool, browser UI) |
| `out/ninjapcr-board.json` | Empty `loop-board/1` — gate open |
| `out/_gold-ninjapcr-repo` | Frozen @ `181768d6ec068a6dd68593042167699285744768` (GPL-3.0) |
| `out/_gold-ninjapcr-openpcr` | Upstream OpenPCR @ `1585d964fc30108b8376d737025c6cebd11bd52f` |
| `out/_gold-ninjapcr-showcase/` | TRAINING SIGHT pack (kit photos via Wayback; PCB renders; plate SVG/PNG) |
| Eval / sources (Downloads) | `Yuri_Wet_Science_Benchmark_Library/evaluation/02_ninjapcr_evaluation.md` + `gold_standard_sources/02_ninjapcr_sources.md` |

## Gold architecture signals (TRAINING — do not paste MPNs into emitters)

From frozen repo skim (rules only, universal):

- **Form:** compact benchtop thermocycler; laser-cut / fabricated plate enclosure; metal sample block for 0.2 mL tubes.
- **Thermal:** bidirectional **Peltier** well drive (`PIN_WELL_INA/INB/PWM`, PWM ±1023) + **lid heater** (`PIN_LID_PWM` + lid thermistor) + **fan** cooling path (`USE_FAN`).
- **Sense:** well temperature via high-resolution ADC (MCP3554 / NAU7802 paths) + thermistor tables; lid thermistor separate.
- **Control:** scheduled PID (`PID_v1`, lid gain schedule); protocol engine in `program.*` / `thermocycler.*`.
- **UI:** Wi‑Fi / browser (ESP path in later boards); LCD removed vs OpenPCR — “everything on browser”.
- **Hard problems (eval):** ramp-rate thermal model, well-to-well uniformity *measured*, heater switch current paths, independent thermal fuse / hardware shutdown, fan + sensor failure → safe state.

## Launch command (when Tristan says go)

```bash
PCB_STAGE=1 bash scripts/run-loop.sh \
  briefs-loop/yuri_ninjapcr.md \
  out/ninjapcr-board.json \
  ninjapcr
```

One PID tree per `out/ninjapcr-*`. Prefer Cursor durable background Shell. Do not pipe Blender to `head`.

## Rules of engagement (same as colorimeter)

- **TRAINING/REFERENCE-AIDED** when gold informs a universal rule — never `if class == ninjapcr: emit <gold MPN list>`.
- Research-use hardware — no clinical / IVD framing.
- Instrument-device path: sealed product / device envelope (not plant container); plant tabs NA where honest.
- Score from workbook / `tab-scorecard.json` + SIGHT — not stdout alone.
- Target: honest floor ≥9 / ships=True before ladder step 03 (Poseidon).

## Still optional before first chain

1. Export public BOM Google Sheet → CSV under `out/_gold-ninjapcr-showcase/` (manual; sheet needs browser).
2. Wayback more assembly-sequence frames if first exterior fails the glance test.
3. Commit Powerwall source fixes still dirty in the working tree (`requirements_bom.py`, `parts_ledger.py`, `build-excel-export.py`) so the ninjapcr branch starts clean.
