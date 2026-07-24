"""PHANTM — drive PCB power + control requirements (deterministic).

Architecture (24 Jul, Tristan instruction): the aperture is a stack —
hex lattice (cells 7.75 mm deep, foil short inside) → cell back wall →
APERTURE PCB with one clearance hole per cell (the translator tail sweeps
through it) + coil termination pads + cell-select switches → board-to-board
→ DRIVER PCB (phase bridges, buck rail, MCU). Two boards because 3 coils +
drivers per cell do NOT fit inside a 3.25 mm hex pitch on one board.

All electrical numbers derive from the FE-backed coil model (Rc 0.552 Ω,
step 1.8 A, full-drive Ic* 3.35 A ≈ 1.9 V) — no new physics.

Run: ~/.venvs/phantm/bin/python drive_electronics.py → out/drive-electronics.json
"""
import json
import math

RC = 0.552          # Ω per coil (report §8.5)
I_STEP = 1.8        # A — stepping begins ≈1.4 A; 1.8 A default pulse
I_FULL = 3.35       # A — FE full-drive point (2·Fd) — the WORST-CASE regime
R_EXT = 0.045       # Ω — FET (15 mΩ) + trace/web (30 mΩ) resistive path (sol fix:
                    # a fixed 0.15 V "drop" implied 83 mΩ, inconsistent with the FETs)
R_TOT = RC + R_EXT  # 0.597 Ω total path
V_RAIL_STEP = round(I_STEP * R_TOT, 2)   # 1.07 V rail for stepping
V_RAIL_FULL = round(I_FULL * R_TOT, 2)   # 2.00 V rail for full drive
T_PULSE = 1.5e-3    # s
T_STEP = 4e-3       # s per completed step incl. settle (report §4.4 upper)
DUTY = T_PULSE / T_STEP             # 0.375 — pulses are 37.5% of step time
E_STEP = I_STEP**2 * RC * T_PULSE   # J (2.68 mJ)
E_STEP_FULL = I_FULL**2 * RC * T_PULSE  # J (9.29 mJ)
FLYBACK_UJ = 0.5 * 0.6e-6 * I_FULL**2 * 1e6  # µJ stored in Lc at turn-off
CELLS_TILE = 24
COILS_CELL = 3
STEPS_REPOINT = 10  # average steps per cell for a re-point (assumption, stated)

out = {
    "coil": {"rc_ohm": RC, "i_step_a": I_STEP, "i_full_a": I_FULL,
             "rail_v_step": V_RAIL_STEP, "rail_v_full": V_RAIL_FULL,
             "note": "resistive load: the RAIL VOLTAGE is the current control (τ = L/R "
                     "≈ 1.1 µs ≪ 1.5 ms pulse). TWO REGIMES, never mixed: STEPPING at "
                     "1.8 A (rail ≈1.15 V, 2.68 mJ/step) and WORST-CASE FULL-DRIVE at "
                     "3.35 A (rail ≈2.0 V, 9.29 mJ/step). Rail-sharing across n "
                     "parallel cells needs star/kelvin routing: shared-path budget "
                     "≤5 mΩ (26.8 A × 5 mΩ = 134 mV on a 2 V rail ≈ 7% current error; "
                     "force ∝ I²). Flyback at turn-off is trivial: "
                     f"{FLYBACK_UJ:.1f} µJ — one clamp diode per coil."},
    "topology": {
        "chosen": "UNIPOLAR drive (council fix, gemini-3.1): direction comes from the "
                  "PHASE SEQUENCE (A→B→C vs C→B→A), not current polarity — so each "
                  "coil needs only ONE low-side FET (72 per tile, 10–20 mΩ) + a "
                  "flyback clamp; one shared DAC-set buck rail feeds all coil highs. "
                  "No H-bridges, no select-FET sneak paths.",
        "rejected": "3 shared full-H phase bridges + per-cell dual select FET — "
                    "REJECTED: a dual FET cannot block a bipolar phase rail (body "
                    "diodes conduct; deselected coils cross-feed).",
        "option": "a reverse 'brake' pulse (§4.4 option) would need half-bridges — "
                  "only add if the settle tests demand it",
        "polarity_note": "wire every coil so positive rail current AIDS the PM "
                        "(FE sign convention)"},
    "per_tile": {"cells": CELLS_TILE, "coils": CELLS_TILE * COILS_CELL,
                 "duty": DUTY,
                 "stepping": {"e_step_mj": round(E_STEP * 1e3, 2),
                              "e_repoint_coil_j": round(CELLS_TILE * STEPS_REPOINT * E_STEP, 2),
                              "e_repoint_rail_j": round(CELLS_TILE * STEPS_REPOINT * E_STEP
                                                        * V_RAIL_STEP / (I_STEP * RC), 2)},
                 "full_drive": {"e_step_mj": round(E_STEP_FULL * 1e3, 2),
                                "e_repoint_coil_j": round(CELLS_TILE * STEPS_REPOINT * E_STEP_FULL, 2),
                                "e_repoint_rail_j": round(CELLS_TILE * STEPS_REPOINT * E_STEP_FULL
                                                          * V_RAIL_FULL / (I_FULL * RC), 2)},
                 "bookkeeping_note": "coil figures are I²·R_coil·t; RAIL figures add the "
                                     "FET/trace drop (council catch, grok-4.5) — supply "
                                     "sizing must use the rail numbers"},
    "parallelism_trade": [],
    "aperture_10cm": {},
    "pcb": {
        "aperture_board": {
            "holes": f"{CELLS_TILE} clearance holes Ø2.6 mm on the 3.25 mm hex pitch "
                     "(translator diagonal 2.19 mm + 0.2 mm/side)",
            "min_web_mm": round(3.25 - 2.6, 2),
            "web_current_note": "3.35 A pulses through 0.65 mm webs: use 2 oz copper; "
                                "webs are 1–2 mm long so thermally fine (IPC-2221 "
                                "continuous limit ≈2.5 A at 1 oz — pulsed duty is ≤40%)",
            "content": "coil termination pads (6/cell) + 3 per-coil low-side FETs "
                       "+ 3 flyback clamps per cell (1 mm-class DFN — fits the pitch "
                       "now that no H-bridges are needed) + board-to-board connector",
            "layers": "4-layer, 2 oz outer",
        },
        "driver_board": {
            "content": "DAC-set buck 5 V→0.8–2.1 V, BURST-RATED (VRM-class, ≥30 A "
                       "at 2 V) + input bulk capacitance, MCU (STM32-class), "
                       "gate-drive shift registers for the 72 low-side FETs, "
                       "CAN/SPI host interface",
            "why_two_boards": "the buck, bulk, MCU and connectors do not belong on "
                              "the hole-perforated aperture board; the per-coil "
                              "FETs DO fit the cell pitch under the unipolar "
                              "topology (see topology.chosen)",
        },
    },
    "control": {
        "position_sensing": "none — open-loop step counting into PM detents "
                            "(zero-power hold); hold-until-settled release per §4.4; "
                            "100% detent-force test at assembly is the calibration",
        "step_timing": "1.5 ms pulse + settle ⇒ ≤250 Hz per cell; MCU timing trivial",
        "addressing": "per-tile MCU; tiles daisy-chained (CAN or SPI); aperture "
                      "controller sends per-cell target depths (phase map)",
        "phase_map_source": "beam-steering phase profile — Tony/Vlad's domain; the "
                            "electronics contract is only: deliver step commands",
    },
    "assumptions": {
        "steps_per_repoint": STEPS_REPOINT,
        "t_step_s": T_STEP,
        "confidence": "electrical numbers HIGH (derive from FE-backed coil model); "
                      "component choices/costs INDICATIVE (LOW) until quotes",
    },
}

for n_par in (1, 2, 4, 8, 16):
    t_tile = math.ceil(CELLS_TILE / n_par) * STEPS_REPOINT * T_STEP
    out["parallelism_trade"].append({
        "parallel_cells": n_par,
        "tile_repoint_s": round(t_tile, 2),
        "stepping": {"pulse_w": round(n_par * I_STEP * V_RAIL_STEP, 1),
                     "rail_a": round(n_par * I_STEP, 1),
                     "avg_w_during_repoint": round(n_par * I_STEP * V_RAIL_STEP * DUTY, 1)},
        "full_drive": {"pulse_w": round(n_par * I_FULL * V_RAIL_FULL, 1),
                       "rail_a": round(n_par * I_FULL, 1),
                       "avg_w_during_repoint": round(n_par * I_FULL * V_RAIL_FULL * DUTY, 1)},
    })

N_CELLS_10CM = 1093   # 100×100 mm square panel / 9.15 mm² tiling area (§8.9)
for n_par in (8, 64):
    t_ap = math.ceil(N_CELLS_10CM / n_par) * STEPS_REPOINT * T_STEP
    out["aperture_10cm"][f"parallel_{n_par}"] = {
        "repoint_s": round(t_ap, 2),
        "pulse_w_stepping": round(n_par * I_STEP * V_RAIL_STEP, 0),
        "pulse_w_full": round(n_par * I_FULL * V_RAIL_FULL, 0),
    }
out["aperture_10cm"]["energy_j_stepping"] = round(N_CELLS_10CM * STEPS_REPOINT * E_STEP, 1)
out["aperture_10cm"]["energy_j_full"] = round(N_CELLS_10CM * STEPS_REPOINT * E_STEP_FULL, 1)
out["aperture_10cm"]["energy_j_stepping_rail"] = round(
    N_CELLS_10CM * STEPS_REPOINT * E_STEP * V_RAIL_STEP / (I_STEP * RC), 1)
out["aperture_10cm"]["energy_j_full_rail"] = round(
    N_CELLS_10CM * STEPS_REPOINT * E_STEP_FULL * V_RAIL_FULL / (I_FULL * RC), 1)
out["aperture_10cm"]["idle_w"] = 0.0

# sanity gates
assert abs(E_STEP * 1e3 - 2.68) < 0.03
assert abs(E_STEP_FULL * 1e3 - 9.29) < 0.05
assert abs(I_FULL * RC - 1.85) < 0.01
p8 = out["parallelism_trade"][3]
assert abs(p8["stepping"]["pulse_w"] - 15.4) < 0.3
assert abs(p8["full_drive"]["pulse_w"] - 53.6) < 0.5
json.dump(out, open("out/drive-electronics.json", "w"), indent=1)
print(f"8-parallel: {out['parallelism_trade'][3]}")
print(f"10 cm aperture: {out['aperture_10cm']}")
print("wrote out/drive-electronics.json")
