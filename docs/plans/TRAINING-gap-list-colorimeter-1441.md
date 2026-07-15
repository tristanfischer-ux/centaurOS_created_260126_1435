# TRAINING gap list — Open Colorimeter gold vs engine `1441`

See also: `docs/plans/GOLD-WHY-instrument-rules.md`

**Dossier tab floor (post gold-spine + PCB sync):** **9.0 SHIPS**  
**Gold-fidelity (architecture + cost):** **~9 / 10** (form glance ~8)

## Scorecard

| Dimension | /10 | Notes |
|---|---|---|
| Architecture spine | 9 | COTS compute/UI + detector + LED board + short cables + AM structure |
| BoM fidelity | 9 | Industrial/USB-serial scrubbed; 14 gold-spine principals |
| Cost | 9 | Materials **£105.5** / OEM **£171** / list **£197** (brief ≤£200 materials) |
| Form | 8 | L-step + LED PCB + 4-colour harness + open well + parked cap + proud square D-pad + glass cuvette with sample |
| LED PCB artefact | 9 | **25×25 mm**, 3 on-board parts, DRC-clean, routed, Gerbers — was 80×80 / 24 parts |
| Calibration curve | 9 | Beer–Lambert series on Calculations |
| Scoring honesty | 9 | Open holds / cover sync / PCB generator sync; SHIPS at 9 |
| Verification spine | 10 | Proof-grade: 3 optical contract↔calc pairs + absorbance-error floor; live STATUS; HARD 16/16 PASS |

## Closed this pass (2026-07-14 keep-going)

| Rule | File |
|---|---|
| Placement cannot grow past 40 mm on compact source boards | `pcb_pipeline_runner.py` |
| IC grid centred (old `cy-20` shoved pads off 25–40 mm boards) | `pcb_pipeline_runner.py` |
| Host `dc_dc_regulator` / rails off LED board | `atopile-generator.ts` + test |
| Electronic collector sees battery/regulator/fuse by character_id | `pcb-stage.ts` |
| Surgical PCB sync (generator + pipeline → state) | `scripts/lib/sync-instrument-pcb-state.ts` |
| Form: proud contrast D-pad + 4-colour harness + taller cuvette | `instrument_form_grammar.py` + `build_universal_scene.py` |
| Native COTS spine proveCatch (compute_ui_module, no discrete MCU) | `regression-harness.tsx` + derive-skeleton floors |
| Verification governing proof spine (Excel tab + SHIPS predicate) | `verification_spine.py` + `build-excel-export.py` |
| Qty↔worked matcher strips SI key crumbs (`_ma`, `_db`) | `build-excel-export.py` `_VERIF_STOP_TOKENS` + proveCatch |
| Beer–Lambert stray-light claims synced (0.00043 → 3.0 AU) | frozen `state.json` + `tools-used` (tool source already fixed) |

## Engine updates (earlier close-the-gap pass)

| Rule | File |
|---|---|
| Gold WHY codified | `GOLD-WHY-instrument-rules.md` |
| Optical floors → COTS spine | `derive-skeleton.ts` |
| Host power off LED board | `atopile-generator.ts` |
| PV + USB-serial scrub | `emitter-completion.ts` + chain |
| Instrument Cxx topology suppressed | `requirements_bom.py` (`_connection_rows`) |
| Frozen-run gold spine bake v2 | `instrument-gold-spine-bake.py` |
| Beer–Lambert calibration_curve | `photometry__beer_lambert_range.py` |
| Cap parked on table + glass cuvette sample | `build_universal_scene.py` |
| Overview % from rounded £ | `build-excel-export.py` |
| Holds honesty | `build-excel-export.py` |

## Deliverable

`~/Downloads/colorimeter-1441_gold-close_*` — `dossier.xlsx` + Cycles exteriors + `pcb-board-3d.png` (25 mm) + gold 01 reference.

`~/Downloads/colorimeter-1441_verification-spine_*` — first Verification tab (SHIPS · floor 9).

`~/Downloads/colorimeter-1441_verification-proof_*` — proof-grade spine (3 optical reconciliations, live STATUS, Checks 0 FAIL, SHIPS · floor 9).

## Still for next full chain (not frozen bake)

1. Emit `compute_ui_module` / maker cables **in words** on a fresh chain (floors already do; 1441 words still show exploded host until a re-run).
2. Form G1 polish: D-pad flush into deck (less float), harness all four strands readable at thumbnail, cuvette seated *in* well not perched on rim.
3. Stage 17.6 ingest for real catalogue pins (still no gold MPN paste).
4. Optional: map instrument `led_driver` to resistor-class footprint (gold = LED+R+JST) instead of SOIC driver IC.
