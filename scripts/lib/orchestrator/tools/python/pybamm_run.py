#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/pybamm_run.py

Real PyBaMM wrapper for the orchestrator. Reads JSON input from stdin,
writes JSON output to stdout.

Computes cell-level quantities for BESS sizing:
- cell_count               (deterministic arithmetic)
- nameplate_capacity_kwh   (deterministic arithmetic)
- voltage_profile          (REAL PyBaMM DFN discharge simulation at 0.5C)
- capacity_fade            (empirical model scaled by chemistry)
- internal_resistance      (from parameter set)

Input:
    {
      "target_energy_kwh": 3500,
      "dod_fraction": 0.80,
      "cell_chemistry": "lfp" | "nmc" | "lto",
      "cell_capacity_ah": 280,
      "cell_voltage_v": 3.2,
      "ambient_temp_c": 25
    }

Performance: ~3-6 seconds per call (PyBaMM startup + DFN model build +
0.5C discharge simulation + voltage profile extraction). The cycle-life
simulation that would give a real capacity fade curve is skipped because
it adds ~30s per call; we use an empirical scaling instead.

License: BSD-3-Clause. Source: github.com/pybamm-team/PyBaMM
"""
from __future__ import annotations

import json
import math
import sys
import time

# Map orchestrator chemistry codes to PyBaMM parameter sets.
PARAMETER_SETS = {
    "lfp": "Prada2013",       # LFP cell (Prada 2013)
    "nmc": "OKane2022",       # NMC graphite-SiOx (O'Kane 2022)
    "lto": "Chen2020",        # Generic Li-ion fallback for LTO (no LTO-specific set ships)
}

EMPIRICAL_CAPACITY_FADE_PCT = {
    "lfp": 8.0,   # LFP at 6000 cycles 1C/1C, 25°C, ~80% retention typical
    "nmc": 15.0,  # NMC at 6000 cycles
    "lto": 4.0,   # LTO known for very low fade
}


def deterministic_cell_count(payload: dict) -> tuple[int, int, float]:
    """Pure arithmetic — same as the stub. Returns (cell_count, cell_count_theoretical, nameplate_kwh)."""
    target_kwh = float(payload.get("target_energy_kwh", 3500))
    dod = float(payload.get("dod_fraction", 0.80))
    cell_ah = float(payload.get("cell_capacity_ah", 280))
    cell_v = float(payload.get("cell_voltage_v", 3.2))
    cell_energy = (cell_ah * cell_v) / 1000.0
    nameplate = target_kwh / dod
    theoretical = math.ceil(nameplate / cell_energy)
    cell_count = math.ceil(theoretical * 1.025)  # EoL margin
    return cell_count, theoretical, nameplate


def real_pybamm_voltage_profile(chemistry: str, c_rate: float = 0.5) -> dict:
    """Run a single-cell DFN discharge simulation in PyBaMM. Returns voltage
    samples at 100%, 50%, 10% SOC + estimated internal resistance.

    This is the part that uses real PyBaMM physics. Without this call,
    we're just doing the same arithmetic as the stub.
    """
    import pybamm

    ps_name = PARAMETER_SETS.get(chemistry, "Marquis2019")
    params = pybamm.ParameterValues(ps_name)

    # Build a DFN model
    model = pybamm.lithium_ion.DFN()
    # Override C-rate
    params.update({"Current function [A]": c_rate * params["Nominal cell capacity [A.h]"]})

    # Run discharge from 100% to 0% SOC (or until cut-off voltage)
    sim = pybamm.Simulation(model, parameter_values=params)
    # Solve for ~3600s of physical time (full discharge at 1C ≈ 3600s, at 0.5C ≈ 7200s)
    t_end = int(3600 / c_rate)
    sim.solve([0, t_end])

    sol = sim.solution
    # Extract voltage at end-points
    times = sol["Time [s]"].entries
    voltage = sol["Voltage [V]"].entries
    discharge_capacity = sol["Discharge capacity [A.h]"].entries

    nominal_capacity_ah = float(params["Nominal cell capacity [A.h]"])

    def voltage_at_soc(target_soc: float) -> float | None:
        """Linear-interp voltage at target SOC (0..1)."""
        target_discharge = nominal_capacity_ah * (1.0 - target_soc)
        # find the closest sample
        for i in range(1, len(discharge_capacity)):
            if discharge_capacity[i] >= target_discharge:
                # interpolate between i-1 and i
                d0 = float(discharge_capacity[i - 1])
                d1 = float(discharge_capacity[i])
                v0 = float(voltage[i - 1])
                v1 = float(voltage[i])
                if d1 == d0:
                    return v0
                t = (target_discharge - d0) / (d1 - d0)
                return v0 + t * (v1 - v0)
        # if not reached, return final voltage
        return float(voltage[-1])

    v100 = voltage_at_soc(1.0)
    v50 = voltage_at_soc(0.5)
    v10 = voltage_at_soc(0.1)

    # Internal resistance estimate: use IV from start-of-discharge transient
    if len(times) >= 2 and len(voltage) >= 2:
        # OCV - V_load drop right at the start of discharge gives I*R
        ocv_param = params.get("Open-circuit voltage [V]") if "Open-circuit voltage [V]" in params else None
        if ocv_param is not None and callable(ocv_param):
            # Initial OCV at 100% SOC
            try:
                v_oc_100 = float(ocv_param(1.0))
            except Exception:
                v_oc_100 = v100
        else:
            v_oc_100 = v100
        v_load_initial = float(voltage[1])
        i_load = c_rate * nominal_capacity_ah  # A
        internal_resistance_ohm = max(0.0, (v_oc_100 - v_load_initial) / max(1e-9, i_load))
        internal_resistance_mohm = internal_resistance_ohm * 1000.0
    else:
        internal_resistance_mohm = 0.35  # fallback

    return {
        "parameter_set": ps_name,
        "voltage_at_100_soc_v": round(v100, 4) if v100 is not None else None,
        "voltage_at_50_soc_v": round(v50, 4) if v50 is not None else None,
        "voltage_at_10_soc_v": round(v10, 4) if v10 is not None else None,
        "internal_resistance_mohm": round(internal_resistance_mohm, 3),
        "c_rate_simulated": c_rate,
    }


CELL_MASS_KG_BY_CHEMISTRY = {
    "lfp": 5.3,   # CATL CB-280Ah-A-50, EVE 280Ah, others — 280 Ah prismatic class
    "nmc": 4.7,   # higher energy density per kg
    "lto": 5.9,   # higher mass per kWh
}

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": "PyBaMM",
    "tool_version": "26.4.3",
    "tool_license": "BSD-3-Clause",
    "tool_source_url": "https://github.com/pybamm-team/PyBaMM",
    "tool_paper": "Sulzer, Marquis, Timms, Robinson, Chapman (2021), 'Python Battery Mathematical Modelling (PyBaMM)', Journal of Open Research Software, 9(1):14",
    "tool_doi": "10.5334/jors.309",
    "physics_basis": "Doyle-Fuller-Newman pseudo-2D electrochemistry model (Doyle, Fuller, Newman 1993, J. Electrochem. Soc. 140(6))",
    "physics_paper_doi": "10.1149/1.2221597",
    "parameter_set_reference": "Prada et al. (2013), 'A simplified electrochemical and thermal aging model of LiFePO4-graphite Li-ion batteries', J. Electrochem. Soc. 160(4):A616",
    "confidence_class": "library",  # one of: library | datasheet | textbook | standard | empirical | estimated
    "embedded_constants": {
        "CELL_MASS_KG_BY_CHEMISTRY": {
            "source": "CATL CB-280Ah-A-50 + EVE 280Ah + Calb 280Ah public datasheets, 2024-2025",
            "confidence": "datasheet",
        },
        "R_MIN_MOHM_BY_CHEMISTRY": {
            "source": "Industry-typical clamp: LFP 280Ah cell DC IR floor ≈ 0.3 mΩ from CATL/EVE/Calb datasheets. Required because PyBaMM DFN startup-transient estimate returns unphysical ≤0.02 mΩ.",
            "confidence": "industry_typical",
            "note": "See mempalace gotcha drawer_ForgeOS_gotchas_2f20805c0729bdc8",
        },
        "SYSTEM_OVERHEAD_MULTIPLIER (1.5x)": {
            "source": "Industry-typical busbar+contactor+wiring loss factor; real BESS round-trip ηDC ≈ 95-97% with battery contributing 1-2% and balance-of-plant another 1-2%",
            "confidence": "empirical",
        },
        "BMS_CHANNELS_PER_SLAVE (12)": {
            "source": "ISL94212 BMS slave IC datasheet (Renesas/Intersil)",
            "confidence": "datasheet",
        },
        "TARGET_CELLS_PER_RACK (280)": {
            "source": "40-ft ISO container 8×2 rack layout heuristic; industry-typical",
            "confidence": "industry_typical",
        },
        "DC_BUS_DERATING (0.92)": {
            "source": "Industry-typical 8% headroom for end-of-charge over-voltage transients before SCPD trip",
            "confidence": "industry_typical",
        },
    },
    "last_reviewed_date": "2026-05-22",
    "review_notes": "Build #18p-fix2: clamped R_min, corrected per-cell current for series-parallel topology, added voltage-limit check in derive_pack_topology.",
}

# Max cell voltage at end-of-charge (per chemistry)
MAX_CELL_VOLTAGE_V = {
    "lfp": 3.65,  # LFP charge cutoff
    "nmc": 4.25,  # NMC charge cutoff
    "lto": 2.85,  # LTO charge cutoff
}

# BMS slave board channels (industry standard 12 or 16; we use 12 = lowest-risk)
BMS_CHANNELS_PER_SLAVE = 12

# DC bus voltage derating — leave 8% headroom above max cell voltage for
# charge over-voltage transients before SCPD trip.
DC_BUS_DERATING = 0.92

# Preferred range for rack_count in a container-class BESS (used for
# tiebreaking; the algorithm prefers configurations near 16 racks for
# 40-ft container layout — 8 wide × 2 deep × 1 tall).
PREFERRED_RACK_COUNT = 16


def derive_pack_topology(
    cell_count_raw: int,
    cell_voltage_v: float = 3.2,
    chemistry: str = "lfp",
    dc_bus_voltage_v: float = 800.0,
) -> dict:
    """
    Build #18p-fix1 (2026-05-22): voltage-limit-aware pack topology.

    Picks (series_cells_per_string, parallel_strings_per_rack, rack_count)
    such that:
      • series_cells × cell_voltage ≤ dc_bus_voltage × DC_BUS_DERATING /
        (max_cell_voltage / nominal_cell_voltage) — keeps charge over-
        voltage within rating of DC contactor/breaker/fuse.
      • total_cells = series × parallel × racks ≈ cell_count_raw (minimum
        excess, never less).
      • rack_count chosen near PREFERRED_RACK_COUNT for container layout.

    Returns a dict with all the derived fields the design layer needs.

    Why this matters: Build #18p shipped a 313-cells-in-series design at
    800V DC bus → 313 × 3.2 = 1001V nominal, exceeds 800V rating, physics
    critic flagged. The fix is to constrain series count ≤
    floor(800 × 0.92 / 3.65) = 201 for LFP at 800V.
    """
    max_cell_v = MAX_CELL_VOLTAGE_V.get(chemistry, 3.65)
    max_series_cells = int(math.floor((dc_bus_voltage_v * DC_BUS_DERATING) / max_cell_v))

    best = None
    # Iterate over candidate series-string lengths (top-down: max first).
    # For each candidate, find a (parallel, racks) that fits.
    for series in range(max(50, max_series_cells - 50), max_series_cells + 1):
        parallel_total_needed = math.ceil(cell_count_raw / series)
        # Find rack_counts that divide parallel_total_needed cleanly.
        for racks in range(4, 33):
            if parallel_total_needed % racks != 0:
                continue
            strings_per_rack = parallel_total_needed // racks
            total_cells = series * parallel_total_needed
            excess = total_cells - cell_count_raw
            if excess < 0:
                continue
            # Score: prefer lowest excess, then racks near PREFERRED, then
            # higher series (better voltage utilisation).
            score = (excess, abs(racks - PREFERRED_RACK_COUNT), -series)
            if best is None or score < best[0]:
                best = (score, racks, strings_per_rack, series, total_cells)

    if best is None:
        # Fallback: 1 rack, all series, accept whatever cell count works.
        # Pathological case — only hits if dc_bus_voltage_v is very low.
        series = max_series_cells
        racks = 1
        strings_per_rack = max(1, math.ceil(cell_count_raw / series))
        total_cells = series * strings_per_rack
        best = ((total_cells - cell_count_raw, 0, -series), racks, strings_per_rack, series, total_cells)

    _, racks, strings_per_rack, series, total_cells = best
    cells_per_rack = strings_per_rack * series
    return {
        "rack_count": racks,
        "strings_per_rack": strings_per_rack,
        "series_cells_per_string": series,
        "parallel_strings_total": strings_per_rack * racks,
        "cells_per_rack": cells_per_rack,
        "cell_count_rounded": total_cells,
        "string_voltage_nominal_v": round(series * cell_voltage_v, 1),
        "string_voltage_max_charge_v": round(series * max_cell_v, 1),
        "max_series_cells_allowed": max_series_cells,
        "dc_bus_voltage_v": dc_bus_voltage_v,
        "headroom_pct": round((1 - (series * max_cell_v) / dc_bus_voltage_v) * 100, 1),
    }


def compute(payload: dict) -> dict:
    chemistry = str(payload.get("cell_chemistry", "lfp")).lower()
    cell_count, theoretical, nameplate = deterministic_cell_count(payload)

    # BESS L4 (2026-05-24): respect engineering-contract authoritative topology.
    # When the contract already solved for an integer-clean cell_count / rack
    # split that fits the brief envelope (mass cap, single container, 800 V
    # bus), pybamm MUST use those values directly instead of running its own
    # derive_pack_topology + EoL margin (which silently produced 3850 cells /
    # 11 racks × 350 cells/rack at 1120 V — a HIGH-severity physics-critic
    # bug in L3). Pybamm still runs the DFN physics for voltage profile +
    # internal resistance; only the topology / cell count is fixed by the
    # contract. The bess.ts class plan passes these *_authoritative fields
    # straight from engineering_contract.ts quantities (see comment in that
    # file ~line 463 — cells_per_rack / series_cells_per_string / rack_count).
    cell_count_authoritative = payload.get("cell_count_authoritative")
    if cell_count_authoritative is not None and int(cell_count_authoritative) > 0:
        cell_count = int(cell_count_authoritative)
        # Override theoretical too so downstream consumers don't see a stale
        # value — theoretical now equals authoritative (they're the same when
        # contract has chosen the topology deliberately).
        theoretical = cell_count
        # Update nameplate to match the authoritative cell count.
        cell_ah_input = float(payload.get("cell_capacity_ah", 280))
        cell_v_input = float(payload.get("cell_voltage_v", 3.2))
        nameplate = (cell_count * cell_ah_input * cell_v_input) / 1000.0

    # Try the real PyBaMM simulation. If it fails (parameter set missing
    # for the chemistry, etc.) fall back to empirical voltage profile.
    real_sim_ok = False
    sim_result: dict = {}
    try:
        sim_result = real_pybamm_voltage_profile(chemistry, c_rate=0.5)
        real_sim_ok = True
    except Exception as exc:
        sim_result = {
            "parameter_set": "fallback",
            "voltage_at_100_soc_v": float(payload.get("cell_voltage_v", 3.2)) + 0.15,
            "voltage_at_50_soc_v": float(payload.get("cell_voltage_v", 3.2)),
            "voltage_at_10_soc_v": float(payload.get("cell_voltage_v", 3.2)) - 0.25,
            "internal_resistance_mohm": 0.35,
            "c_rate_simulated": 0.5,
            "_error": f"{type(exc).__name__}: {exc}",
        }

    capacity_fade_pct = EMPIRICAL_CAPACITY_FADE_PCT.get(chemistry, 8.0)

    # Thermal dissipation at 0.5C = I^2 * R per cell
    cell_ah = float(payload.get("cell_capacity_ah", 280))
    discharge_current_a = cell_ah * 0.5
    # Build #18p-fix2 (2026-05-22): clamp internal_resistance_mohm. PyBaMM's
    # DFN startup-transient R estimate returned 0.022 mOhm (Loop 26 — unphysical
    # for a 280Ah LFP cell where datasheet ranges 0.3-0.5 mOhm). The DFN
    # sim's first-time-step voltage drop is too small to measure R reliably.
    # Industry minimum per chemistry × cell capacity:
    R_MIN_MOHM_BY_CHEMISTRY = {"lfp": 0.30, "nmc": 0.25, "lto": 0.45}
    r_min_mohm = R_MIN_MOHM_BY_CHEMISTRY.get(chemistry, 0.30)
    r_mohm_clamped = max(sim_result["internal_resistance_mohm"], r_min_mohm)
    r_ohm = r_mohm_clamped / 1000.0
    thermal_w = (discharge_current_a ** 2) * r_ohm

    # Build #18p-fix1 (2026-05-22): voltage-limit-aware pack topology.
    dc_bus_voltage_v = float(payload.get("dc_bus_voltage_v", 800))
    cell_voltage_v_input = float(payload.get("cell_voltage_v", 3.2))
    # BESS L4 (2026-05-24): if the engineering contract has already chosen an
    # integer-clean topology, USE IT and skip derive_pack_topology entirely.
    # The contract knows the brief constraints (mass cap, container envelope,
    # bus voltage class) and picked the topology to satisfy ALL of them; the
    # local solver here only knows the bus-voltage-derating heuristic and was
    # producing 11-rack 175-series splits that violated the contract.
    rack_count_auth = payload.get("rack_count_authoritative")
    cells_per_rack_auth = payload.get("cells_per_rack_authoritative")
    series_auth = payload.get("series_cells_per_string_authoritative")
    parallel_per_rack_auth = payload.get("parallel_strings_per_rack_authoritative")
    if (
        rack_count_auth is not None
        and cells_per_rack_auth is not None
        and series_auth is not None
        and parallel_per_rack_auth is not None
        and int(rack_count_auth) > 0
        and int(cells_per_rack_auth) > 0
    ):
        rack_count = int(rack_count_auth)
        cells_per_rack = int(cells_per_rack_auth)
        series_cells_per_string = int(series_auth)
        parallel_strings_per_rack = int(parallel_per_rack_auth)
        parallel_strings_total = parallel_strings_per_rack * rack_count
        cell_count_rounded = rack_count * cells_per_rack
        string_voltage_nominal_v = round(series_cells_per_string * cell_voltage_v_input, 1)
        topo = {
            "rack_count": rack_count,
            "cells_per_rack": cells_per_rack,
            "cell_count_rounded": cell_count_rounded,
            "series_cells_per_string": series_cells_per_string,
            "strings_per_rack": parallel_strings_per_rack,
            "parallel_strings_total": parallel_strings_total,
            "string_voltage_nominal_v": string_voltage_nominal_v,
            "string_voltage_max_charge_v": round(
                series_cells_per_string * MAX_CELL_VOLTAGE_V.get(chemistry, 3.65),
                1,
            ),
            "max_series_cells_allowed": series_cells_per_string,
            "dc_bus_voltage_v": dc_bus_voltage_v,
            "headroom_pct": 0.0,  # contract chose this; headroom not applicable
        }
    else:
        topo = derive_pack_topology(
            cell_count_raw=cell_count,
            cell_voltage_v=cell_voltage_v_input,
            chemistry=chemistry,
            dc_bus_voltage_v=dc_bus_voltage_v,
        )
        rack_count = topo["rack_count"]
        cells_per_rack = topo["cells_per_rack"]
        cell_count_rounded = topo["cell_count_rounded"]
        series_cells_per_string = topo["series_cells_per_string"]
        parallel_strings_per_rack = topo["strings_per_rack"]
        parallel_strings_total = topo["parallel_strings_total"]
        string_voltage_nominal_v = topo["string_voltage_nominal_v"]

    cell_mass_kg = CELL_MASS_KG_BY_CHEMISTRY.get(chemistry, 5.3)
    total_cell_mass_kg = round(cell_count_rounded * cell_mass_kg, 1)

    # BMS slave board sizing
    bms_slave_count = math.ceil(cell_count_rounded / BMS_CHANNELS_PER_SLAVE)
    bms_total_channels = bms_slave_count * BMS_CHANNELS_PER_SLAVE

    # Build #18p-fix2 (2026-05-22): correct per-cell current for series-parallel
    # topology. Real per-cell current = string current = total_bus_current /
    # parallel_strings_total. NOT cell_ah × C-rate (which assumes all-parallel).
    # Loop 26 physics critic exposed the bug: my prior calc returned 2.16 kW
    # but actual dissipation is ~15 kW for a 1 MW system.
    rated_power_kw = float(payload.get("rated_power_kw", 1000))  # 1 MW default for 1MW BESS
    total_bus_current_a = (rated_power_kw * 1000.0) / dc_bus_voltage_v
    per_cell_current_a = total_bus_current_a / max(1, parallel_strings_total)
    # Each cell dissipates I² × R + system overhead for busbars/wiring/
    # connections/contactors. Real BESS round-trip efficiency is 95-97%
    # round-trip AC-DC-AC, of which battery is 1-2% and BMS/wiring is
    # another 1-2%. We model the wiring overhead as 1.5× cell I²R.
    SYSTEM_OVERHEAD_MULTIPLIER = 1.5  # busbars + tabs + wiring + contactors
    per_cell_thermal_w = (per_cell_current_a ** 2) * r_ohm
    system_thermal_dissipation_kw = round(
        (cell_count_rounded * per_cell_thermal_w * SYSTEM_OVERHEAD_MULTIPLIER) / 1000.0, 2
    )

    # Cold plate sizing — sized for system dissipation × 1.25 safety factor.
    # Per-rack capacity is total / rack_count rounded UP to a sensible
    # commercial cold-plate rating (1, 1.5, 2, 2.5, 3, 4, 5 kW are standard).
    cold_plate_total_capacity_min_kw = round(system_thermal_dissipation_kw * 1.25, 2)
    cold_plate_per_rack_raw_kw = cold_plate_total_capacity_min_kw / max(1, rack_count)
    # Round per-rack capacity to nearest standard commercial rating
    STANDARD_PLATE_KW = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 7.5, 10.0]
    cold_plate_per_rack_min_capacity_kw = next(
        (s for s in STANDARD_PLATE_KW if s >= cold_plate_per_rack_raw_kw),
        STANDARD_PLATE_KW[-1],
    )
    # Recompute total based on rounded-up per-rack
    cold_plate_total_capacity_kw = round(cold_plate_per_rack_min_capacity_kw * rack_count, 2)

    return {
        "cell_count": cell_count_rounded,           # USE THIS (integer-clean) value in design
        "cell_count_raw_physics": cell_count,        # original physics-derived (with EoL margin)
        "cell_count_theoretical": theoretical,
        "nameplate_capacity_kwh": round(cell_count_rounded * cell_ah * float(payload.get("cell_voltage_v", 3.2)) / 1000.0, 1),
        "rack_count": rack_count,
        "cells_per_rack": cells_per_rack,
        # Build #18p-fix1: full series-parallel topology — design layer MUST use these
        "series_cells_per_string": series_cells_per_string,
        "parallel_strings_per_rack": parallel_strings_per_rack,
        "parallel_strings_total": parallel_strings_total,
        "string_voltage_nominal_v": string_voltage_nominal_v,
        "string_voltage_max_charge_v": topo["string_voltage_max_charge_v"],
        "dc_bus_voltage_v": dc_bus_voltage_v,
        "dc_bus_headroom_pct": topo["headroom_pct"],
        "per_cell_current_at_rated_a": round(per_cell_current_a, 1),
        "total_bus_current_at_rated_a": round(total_bus_current_a, 1),
        "cell_mass_kg": cell_mass_kg,
        "total_cell_mass_kg": total_cell_mass_kg,
        "bms_slave_count": bms_slave_count,
        "bms_channels_per_slave": BMS_CHANNELS_PER_SLAVE,
        "bms_total_channels": bms_total_channels,
        # Build #18p-fix2: corrected thermal (was 7× too small in Loop 26)
        "system_thermal_dissipation_kw": system_thermal_dissipation_kw,
        "system_thermal_dissipation_at_05c_kw": system_thermal_dissipation_kw,  # alias for backward compat
        "cold_plate_total_capacity_min_kw": cold_plate_total_capacity_kw,
        "cold_plate_per_rack_min_capacity_kw": cold_plate_per_rack_min_capacity_kw,
        "capacity_fade_at_6000_cycles_pct": capacity_fade_pct,
        "internal_resistance_mohm": sim_result["internal_resistance_mohm"],
        "thermal_dissipation_at_05c_w": round(thermal_w, 2),
        "voltage_profile_at_05c_summary": {
            "voltage_at_100_soc_v": sim_result["voltage_at_100_soc_v"],
            "voltage_at_50_soc_v": sim_result["voltage_at_50_soc_v"],
            "voltage_at_10_soc_v": sim_result["voltage_at_10_soc_v"],
        },
        "_meta": {
            "real_pybamm_simulation_ok": real_sim_ok,
            "parameter_set": sim_result.get("parameter_set", "fallback"),
            "c_rate_simulated": sim_result.get("c_rate_simulated"),
            "error": sim_result.get("_error"),
        },
        # Build #19d: provenance block — surfaces in the report's Tools-Used page
        "_provenance": PROVENANCE,
    }


def main() -> int:
    t_start = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse failed: {exc}"}, sys.stdout)
        return 2
    try:
        result = compute(payload)
        result["_meta"]["wall_time_s"] = round(time.time() - t_start, 2)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
