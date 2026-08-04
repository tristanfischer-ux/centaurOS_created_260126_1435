# Path B results — clean DEC-009 kit-case solve (2026-08-04)

**Prerequisite:** Path A run 2 matched (`path_a_matched=true`, mean 81.558081 N·m, magnets 6×22.5 frozen).

**Intent:** Re-solve `em_fia_front_kit_case` at DEC-009 architecture (24,000 rpm / 130 mm) with baseline magnets frozen at 6.0 × 22.5 mm. Do not overwrite failed `em_fia_front_kit_case_DEC009.json` (that run re-derived magnets to 8.85×14.58 and had 6 sign reversals).

**Freeze:**

| quantity | value | source |
|---|---|---|
| stack / active length | 130 mm | twin DEC-009 |
| max_rotor_speed_rpm | 24000 | twin DEC-009 |
| phase_current_design_a | (twin) | live state |
| magnet t × L | 6.0 × 22.5 mm | REBALANCED baseline via `FIA_MAGNET_*` |

**Artefacts (when complete):**

- `out/.../_motor_stack/em_fia_front_kit_case_PATH_B_DEC009.json`
- `out/.../_motor_stack/path_b_dec009_compare.json`
- log: `path_b_dec009.log`

**Status:** IN PROGRESS

## Do not

- Close Bar A / mint ship_ok without duty clear + council  
- Quote failed `*_DEC009.json` as SIGHT  
- Collapse product basis to kit-case FE until Path B is coherent and reviewed  
