# Fake-good tab catalogue + PLAUSIBILITY layer — 2026-07-21

**Tristan:** "just because you have a high score number doesn't mean it's necessarily true …
catch all of these fake-good tabs and not allow them to happen again."

## THE ONE ROOT
Every fake-good is the same failure: **scorers reward CONSISTENCY (arithmetic reconciles /
value is USED / provenance present), never PLAUSIBILITY (would a chartered engineer BELIEVE
the number).** Consistency ≠ correctness. A strong sub-family is **scale/archetype leak**:
plant-scale content on a benchtop device.

## CATALOGUE (SIGHT of out/…-final delivered dossier.xlsx)
| # | Tab (score) | Fake-good | Status |
|---|---|---|---|
| 1 | Bill of Materials (8.3) | 23 lines at £0.01 (penny crush) | FIXED source 3cdc32aaa |
| 2 | Cost waterfall (10) | consistent ladder over the penny-BoM | self-fixes with #1 |
| 3 | Calculations (10) | 16 mm² (~90 A) cable on a 35 W device | FIXED source a83bc6f35 + caught P3 |
| 3b| Calculations (10) | 0 kg cable mass | FIXED source a83bc6f35 + caught P2 |
| 3c| Calculations (10) | 0 L/min airflow on the DO loop | TODO (curated physics-forbids-zero) |
| 4 | Financial (9.9) | Energy/yr = £0 on a 24/7 powered device | TODO (build-excel Financial) |
| 4b| Financial (9.9) | annual volume "20 m³" vs 20 ml working vol (unit confusion) | TODO (P4 unit-family) |
| 5 | Equipment & Dims (10) + Audit (10) | duplicate "Sensing Instrumentation Subcomponent" | caught P5 (re-point to register source) |
| 6 | Connection trace (10) | electronic parts carry fluid services (ledger view) | caught P6 (re-point to ledger) |
| 7 | Part names (10) | UNRESOLVED parts shown cell-check PASS | TODO (P7, soft) |
| 8 | Assembly sequence (10) | colorimeter optical-bench story (LED→cuvette / blanking / dark cal) on a bioreactor | TODO (P8 archetype-narrative) |
| 9 | Risk & Regulatory (7.5) | "working at height / tank tops / fall hazard" on a 20 ml device | TODO (P-hazard scale leak) |

## THE MECHANISM (built — c8b8476de)
`deterministic_checks_lib.py::_checks_plausibility` — a PLAUSIBILITY family that attacks
magnitudes/semantics, wired into `run_all_checks`. Bound to the score via the EXISTING path:
⚠ Checks tab score = `10 if 0 FAIL else max(0, 8−2×fails)` → feeds the dossier FLOOR (min of
all tabs) → **a plausibility FAIL floors the dossier < 8 → the fake-good can't ship green**,
and each check's detail routes the fix at source. proveCatch both directions in --selftest.

Shipped invariants: P2 (cable mass>0), P3 (cable-CSA scale), P5 (name honesty), P6 (fluid
service domain). On the delivered state P2+P3 FIRE (the 16 mm²/0 kg cable).

## ROADMAP (deterministic-first, per Tristan)
- P4 unit-family coherence — annual-volume denominator must match working-volume unit family
  (m³ vs ml). Build-excel Financial (out_unit derivation).
- P8 archetype-narrative — the assembly/hazard narrative must not describe a FOREIGN archetype
  (cuvette/blanking/absorbance on a non-optical product; working-at-height on a benchtop).
  Marker-based, like gate-34 tool-archetype-coherence.
- P-hazard scale-coherence — a plant hazard (working at height / confined space / tank tops)
  on a watt-scale/benchtop device is a leak.
- 3c physics-forbids-zero (curated) — airflow on an active DO loop, energy/yr on a powered device.
- Re-point P5→register source and P6→ledger source (they currently read cleaner
  partVerifications/connection-schedule and missed the display-tab instances).
- SOURCE fixes for #4 (Financial energy>0 + unit), #8 (assembly archetype), #9 (risk hazards),
  #5 (emitter naming — no "…Subcomponent N").

## META-FINDING (the dominant systemic root) — 2026-07-21 SIGHT
The single largest source of fake-goods is **PLANT TEMPLATES APPLIED WHOLESALE TO A BENCHTOP
INSTRUMENT**, each scoring 10 because the plant template is internally consistent:
- **Design basis (10)** — steam velocity 30 m/s, DN15–DN300 pipe ladder, HVAC duct sizing — a
  20 ml device has no steam, no DN pipes, no ducts.
- **Risk & Regulatory (7.5)** — "working at height / confined space / tank tops fall hazard".
- **Calculations (10)** — 16 mm² (~90 A) cable [FIXED]; plant cable/feeder defaults.
- **Assembly (10)** — colorimeter optical-bench story.
The device-scale signal (`isInstrumentDevice` / `isWattScaleInstrument` / enclosure < 1 m³)
already exists. The systemic fix: a benchtop instrument must SCOPE-OUT or DEVICE-SIZE the
plant-scope tabs (like Engineering Analysis already prints "OUT OF SCOPE"), not fill them with
plant constants that score 10. Two-pronged: (a) PLAUSIBILITY checks that FAIL plant content on
a device (floor the dossier); (b) source: gate plant-template tabs behind `not isInstrumentDevice`
or render a device-appropriate basis. This is the [[forgeos_device_scale_fix_family]] extended
from the BoM/geometry to the NARRATIVE/BASIS tabs.

Catalogue entry #10: Design basis (10) — plant process-piping/steam/HVAC basis on a benchtop device.

## SOURCE-FIX TARGETS traced (ready to apply post-bake)
- **#4 Financial Energy/yr = £0** — build-excel-export.py:10451 `energy = _ECON_LOAD_KW * ratio *
  hours * load_factor * energy_price`. `_ECON_LOAD_KW` resolves to 0 (reads continuous_power_kw/
  rated_power_kw, ABSENT for a benchtop) instead of falling back to `connected_electrical_load_kw`
  (0.035 kW). FIX: fall back to connected_electrical_load_kw / total_power_w so a powered device
  never shows £0 energy. (hours=8760, lf=0.65, price=0.15 → ~£30/yr honest.)
- **#4b m³/ml unit confusion** — the Financial `out_unit`/`out_qty` reads the primary output metric
  as "20 m³" when the working volume is 20 ml. FIX: unit-family-coherence on the divisor
  (P4) — the annual-volume denominator unit must match the working-volume unit family.
- **#5 duplicate "…Subcomponent" names** — generic fallback name minted across component_engineering.py
  / deterministic_finalize.py when a sub-module word has no specific function name. FIX: name by
  function at emission; never mint "{Module} Subcomponent {N}".
