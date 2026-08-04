# Path A results — 08-02 / REBALANCED geometry replay (2026-08-04)

**Stage:** `fe-path-a-replay-0802`  
**Git at runs:** `69f3d5989`  
**Twin:** `out/formula-e-front-mgu-20260729-1432`

## Intent

Single-variable check: with **today’s** `em_fia_front_kit_case.py`, does the machine described by REBALANCED `input_quantities` still produce a sign-consistent ~**81.56 N·m** mean?

## Run 1 — stack/rpm/I only (incomplete freeze)

| | REBALANCED (reference) | REPLAY_0802 (run 1) |
|---|---|---|
| active_length_mm | 97.58 | 97.58 |
| rpm | 19500 | 19500 |
| phase_current_design_a | 477 | 477 |
| **magnet t × L mm** | **6.0 × 22.5** | **8.85 × 14.58** (re-derived) |
| machine η | 0.98995 | 0.96749 (state default path) |
| mean \|T\| N·m | **81.558** | **25.75** |
| sign_reversals | **0** | **6** |
| sign_consistent | true | **false** |
| duty_screen_ok | false | false |
| best current angle | −30° | +45° |

**Verdict run 1:** `path_a_matched = false`. Not a fair code test — magnets and η were not frozen.

**Root cause:** `derive_fia_geometry()` re-sizes magnets from the rotor ring unless `FIA_MAGNET_THICKNESS_MM` / `FIA_MAGNET_LENGTH_MM` are set. Efficiency fell back to twin defaults.

## Run 2 — magnets + η frozen (**MATCH**)

Uses env overrides already in kit_case:

- `FIA_MAGNET_THICKNESS_MM=6.0`
- `FIA_MAGNET_LENGTH_MM=22.5`
- `mgu_efficiency` / `inverter_efficiency` from REBALANCED IQ

| | REBALANCED (reference) | REPLAY_0802 (run 2) |
|---|---|---|
| active_length_mm | 97.58 | 97.58 |
| rpm | 19500 | 19500 |
| phase_current_design_a | 477 | 477 |
| **magnet t × L mm** | **6.0 × 22.5** | **6.0 × 22.5** (frozen) |
| machine η | 0.98995 | 0.98995 |
| mean \|T\| N·m | **81.558081** | **81.558081** |
| Δ mean | — | **0.0 N·m (0.0%)** |
| sign_reversals | **0** | **0** |
| sign_consistent | true | **true** |
| \|T\| min / max | — | 55.961 / 97.638 |
| required shaft N·m | 125.214912 | 125.214912 |
| mean vs required | 0.651 | 0.651 |
| best current angle | −30° | **−30°** |
| duty_screen_ok | false | false |
| ship_ok (artefact) | false | false |

**Compare artefact:** `path_a_replay_0802_compare.json`  
**ran_at:** `2026-08-04T10:25:41Z`  
**Log:** `path_a_replay_0802b.log`

**Verdict run 2:** `path_a_matched = true`, `path_a_reproducible_under_freeze = true`  
(`path_a_code_innocent` is a legacy alias for the same flag — it means *reproducible under this freeze*, not general solver innocence.)

**Committed evidence (not only on-disk twin out/):**

- `docs/plans/evidence/path_a_replay_0802_compare.json` — offline re-validated against the hardened runner gates (`geometry_freeze_ok`, `path_a_reproducible_under_freeze`); FE not re-solved
- `docs/plans/evidence/path_a_replay_0802_evidence_slim.json` — geometry / IQ / sweep summary from the run-2 REPLAY artefact

Today’s kit-case code reproduces the 08-02 REBALANCED FE result when geometry (including magnets) is fully frozen. The run-1 collapse was magnet re-derive, not a solver regression under the frozen inputs.

## Step 4 decision

| If Path A matches | Then Path B (clean DEC-009) |
| If Path A diverges **with full freeze** | Stop — code/geometry investigation; **no Path B** |

**Decision: MATCH → proceed Path B.**

Path B = kit-case solve at DEC-009 architecture freeze (24,000 rpm / 130 mm stack) with magnets frozen at baseline 6×22.5 mm. Do **not** quote the earlier failed `em_fia_front_kit_case_DEC009.json` (magnets 8.85×14.58, 6 sign reversals) as SIGHT.

## Honesty after runs

State restored after both runs:

| field | value |
|---|---|
| binding_duty_shaft_torque_nm | 125.214912 |
| last_sign_consistent_kit_case_fe_mean_nm | 81.558081 |
| mgu_fe product basis | `option_screen_product_not_kit_case_fe` |
| mgu_fe product value | 133.854741 |
| max_rotor_speed_rpm | 24000 |
| stack_length_mm | 130 |
| ship_ok | **false** |

## Do not

- Close Bar A  
- Quote run-1 25.75 as design truth  
- Quote failed `*_DEC009.json` (8.85 mm magnets) as SIGHT  
- Mint `ship_ok` from Path A alone (duty still open at 0.65× required)  
