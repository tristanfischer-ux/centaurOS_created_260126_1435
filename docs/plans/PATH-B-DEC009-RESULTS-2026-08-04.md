# Path B results — clean DEC-009 kit-case solve (2026-08-04)

**Prerequisite:** Path A run 2 matched (`path_a_matched=true`, mean 81.558081 N·m, magnets 6×22.5 frozen).

**Intent:** Re-solve `em_fia_front_kit_case` at DEC-009 architecture (24,000 rpm / 130 mm) with baseline magnets frozen at 6.0 × 22.5 mm. Do **not** overwrite failed `em_fia_front_kit_case_DEC009.json` (that run re-derived magnets to 8.85×14.58 and had 6 sign reversals).

## Freeze

| quantity | value | source |
|---|---|---|
| stack / active length | 130 mm | twin DEC-009 |
| max_rotor_speed_rpm | 24000 | twin DEC-009 |
| phase_current_design_a | 535 A | twin DEC-009 |
| magnet t × L | 6.0 × 22.5 mm | baseline via `FIA_MAGNET_*` |

## Results (PATH_B_DEC009)

| | Failed DEC009 (do not quote) | Path B (this run) |
|---|---|---|
| magnet t × L mm | 8.85 × 14.58 | **6.0 × 22.5** |
| active_length_mm | 130 | **130** |
| rpm | 24000 | **24000** |
| I design A | 535 | **535** |
| mean \|T\| N·m | 36.27 | **122.100** |
| sign_reversals | 6 | **0** |
| sign_consistent | false | **true** |
| required shaft (at 24k) N·m | 104.099 | **104.099** |
| mean vs required | 0.35 | **1.173** |
| \|T\| min / max | — | 84.97 / 145.23 |
| best angle | +45° | **−30°** |
| duty_torque_screen_ok | false | **false** |
| torque_reliable | false | **false** |
| ship_ok | false | **false** |

**Compare:** `out/.../_motor_stack/path_b_dec009_compare.json`  
**ran_at:** `2026-08-04T11:03:08Z`  
**git_sha:** `eddd56d66`  
**Log:** `path_b_dec009.log`

**Verdict:** `path_b_fe_coherent = true`, `path_b_duty_clear = false`.

### How to read the bars

- **Power bar at 24,000 rpm** (required ≈ 104.1 N·m under the twin’s efficiency chain): mean **122.1 N·m = 1.173×** — clears that bar numerically.
- **Conservative binding bar** (125.215 N·m, still stamped from rebalanced 19.5k duty): mean **122.1 ≈ 0.975×** — does **not** clear binding.
- Kit-case still reports `duty_torque_screen_ok=false` and `torque_reliable=false` (coarse sweep / reliability gates, not a green duty close).

So Path B is a **sign-stable FE SIGHT candidate at DEC-009 geometry**, not a Bar A close and not `ship_ok`.

## Honesty after run

| field | value |
|---|---|
| binding_duty_shaft_torque_nm | 125.214912 |
| last_sign_consistent_kit_case_fe_mean_nm | 81.558081 (Path A / REBALANCED label — **not** auto-restamped to 122.1) |
| mgu_fe product basis | `option_screen_product_not_kit_case_fe` |
| stack / rpm | 130 / 24000 |
| ship_ok | **false** |

## Do not

- Close Bar A / mint `ship_ok` without duty clear under a **named** bar + finish council  
- Quote failed `*_DEC009.json` (8.85 mm magnets) as SIGHT  
- Collapse product basis to kit-case FE until council accepts Path B mean as the kit-case label  
- Treat 1.173× of the 24k power bar as “binding cleared” while binding remains 125.215  

## Next

1. Decide which torque bar binds at DEC-009 (24k power bar vs conservative 125.215).  
2. If Path B mean is adopted as kit-case FE label, restamp honesty fields via an open stage + council — do not hand-edit.  
3. Only then consider Bar A / `ship_ok` under the named bar.
