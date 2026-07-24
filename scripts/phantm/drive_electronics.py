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
I_FULL = 3.35       # A — FE full-drive point (2·Fd)
V_FULL = I_FULL * RC                # 1.85 V at the coil
V_RAIL = 2.0        # V — buck rail; rail voltage IS the current limit (R load)
DRIVER_DROP = 0.15  # V — low-side FET + trace at these currents (indicative)
T_PULSE = 1.5e-3    # s
T_STEP = 4e-3       # s per completed step incl. settle (report §4.4 upper)
E_STEP = I_STEP**2 * RC * T_PULSE   # J (2.68 mJ)
E_STEP_FULL = I_FULL**2 * RC * T_PULSE
CELLS_TILE = 24
COILS_CELL = 3
STEPS_REPOINT = 10  # average steps per cell for a re-point (assumption, stated)

out = {
    "coil": {"rc_ohm": RC, "i_step_a": I_STEP, "i_full_a": I_FULL,
             "v_at_full_v": round(V_FULL, 3), "rail_v": V_RAIL,
             "note": "resistive load: the RAIL VOLTAGE is the current control — "
                     "2.0 V rail → 3.6 A ceiling ≈ Ic*; a 1.0 V setting gives 1.8 A. "
                     "τ = L/R ≈ 1.1 µs so current settles instantly vs the 1.5 ms pulse."},
    "per_tile": {"cells": CELLS_TILE, "coils": CELLS_TILE * COILS_CELL,
                 "e_step_mj": round(E_STEP * 1e3, 2),
                 "e_repoint_j": round(CELLS_TILE * STEPS_REPOINT * E_STEP, 2)},
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
            "content": "coil termination pads (6/cell) + cell-select FETs (dual "
                       "10–20 mΩ, ≪ Rc) + board-to-board connector",
            "layers": "4-layer, 2 oz outer",
        },
        "driver_board": {
            "content": "3 phase half-bridge pairs (per-phase totem poles rated for "
                       "the parallel-group current), buck converter 5 V→0.8–2.1 V "
                       "DAC-set (the current control), bulk capacitance, MCU "
                       "(STM32-class), CAN/SPI host interface",
            "why_two_boards": "3 drivers/cell cannot fit inside 9.15 mm² of cell "
                              "pitch even both-sides; select-FETs stay per-cell on "
                              "the aperture board, power devices move behind",
        },
        "driver_architecture": {
            "chosen": "3 shared phase rails + per-cell select FETs: 3 half-bridges "
                      "+ 48 select FETs per tile (a cell's 3 coils share its select "
                      "pair; only the addressed cells' coils see the phase rail)",
            "alternative": "per-coil integrated H-bridge (72 ICs/tile) — simplest "
                           "for the first prototype, more parts at volume",
            "polarity": "phase bridges are full H per rail — coil polarity must "
                        "AID the PM on the drive stroke (FE sign convention)",
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
    burst_w = n_par * I_FULL * (V_RAIL + DRIVER_DROP)
    t_tile = math.ceil(CELLS_TILE / n_par) * STEPS_REPOINT * T_STEP
    out["parallelism_trade"].append({
        "parallel_cells": n_par,
        "burst_w": round(burst_w, 1),
        "rail_burst_a": round(n_par * I_FULL, 1),
        "tile_repoint_s": round(t_tile, 2),
    })

N_CELLS_10CM = 1093   # 100×100 mm / 9.15 mm² tiling area (§8.9)
for n_par in (8, 64):
    t_ap = math.ceil(N_CELLS_10CM / n_par) * STEPS_REPOINT * T_STEP
    out["aperture_10cm"][f"parallel_{n_par}"] = {
        "repoint_s": round(t_ap, 2),
        "burst_w": round(n_par * I_FULL * (V_RAIL + DRIVER_DROP), 0),
    }
out["aperture_10cm"]["energy_j"] = round(N_CELLS_10CM * STEPS_REPOINT * E_STEP, 1)
out["aperture_10cm"]["idle_w"] = 0.0

# sanity gates
assert abs(E_STEP * 1e3 - 2.68) < 0.03
assert abs(V_FULL - 1.85) < 0.01
assert out["parallelism_trade"][3]["burst_w"] < 60  # 8-parallel stays bench-supply scale
json.dump(out, open("out/drive-electronics.json", "w"), indent=1)
print(f"8-parallel: {out['parallelism_trade'][3]}")
print(f"10 cm aperture: {out['aperture_10cm']}")
print("wrote out/drive-electronics.json")
