#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/rocketcea_combustion.py

Layer-1 wrapper for NASA CEA combustion analysis via RocketCEA.

Reads JSON from stdin, writes JSON to stdout. Replaces hand-coded
chemical_propulsion_sizing / hybrid_propulsion_combustion / aerospike /
staged_combustion / electric_pump_fed combustion-chemistry blocks.

Input:
    {
      "oxidiser": "LOX",                # CEA oxidiser name
      "fuel": "CH4",                    # CEA fuel name
      "of_ratio": 3.5,                  # mass mixture ratio O/F
      "chamber_pressure_bar": 300.0,    # combustion chamber pressure
      "expansion_ratio": 40.0,          # exit area / throat area
      "ambient_pressure_bar": null      # optional, for sea-level Isp
    }

Output:
    {
      "vacuum_isp_s": 371.1,
      "sea_level_isp_s": 320.5,
      "chamber_temp_k": 3556.8,
      "c_star_m_s": 1840.2,
      "exhaust_mass_fraction": {...},
      "expansion_ratio": 40.0,
      "_provenance": {...},
      "_meta": {"wall_time_s": ...}
    }

Smoke test: LOX/CH4, OF=3.5, Pc=300 bar, eps=40 → vacuum Isp ~370s.

RocketCEA uses NASA CEA (Chemical Equilibrium with Applications) by
Gordon & McBride, NASA RP-1311 1996. Charles Taylor 2009 Python wrapper.
License: Apache-2.0. Source: github.com/sonofeft/RocketCEA
"""
from __future__ import annotations

import contextlib
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402


@contextlib.contextmanager
def _suppress_stdout_fd():
    """RocketCEA prints 'USER_HOME_DIR=...' to stdout at import/CEA time, which
    corrupts our JSON-on-stdout contract (and made the worked-calc gate unable to
    parse this tool). Redirect OS-level fd 1 to /dev/null for the duration, so even
    C-level prints from the CEA Fortran core are swallowed. Restored on exit."""
    saved_fd = os.dup(1)
    devnull = os.open(os.devnull, os.O_WRONLY)
    try:
        sys.stdout.flush()
        os.dup2(devnull, 1)
        yield
    finally:
        sys.stdout.flush()
        os.dup2(saved_fd, 1)
        os.close(devnull)
        os.close(saved_fd)


# Build #19d (2026-05-22): provenance metadata.
PROVENANCE = {
    "tool_name": "RocketCEA",
    "tool_version": "1.2.3",
    "tool_license": "Apache-2.0",
    "tool_source_url": "https://github.com/sonofeft/RocketCEA",
    "tool_paper": "Gordon S., McBride B.J. (1996), 'Computer Program for Calculation of Complex Chemical Equilibrium Compositions and Applications', NASA RP-1311. Python wrapper: Taylor C. (2009), 'RocketCEA'.",
    "tool_doi": "https://ntrs.nasa.gov/api/citations/19960044559/downloads/19960044559.pdf",
    "physics_basis": "Chemical equilibrium combustion via minimisation of Gibbs free energy (NASA Lewis equilibrium method); thermo data from NASA Glenn coefficients (Burcat & Ruscic 2005 extended).",
    "confidence_class": "library",
    "embedded_constants": {
        "PSI_PER_BAR": {
            "source": "Exact conversion 14.5037738",
            "confidence": "standard",
        },
    },
    "known_limitations": [
        "Frozen-flow assumption at the exit. For real-engine performance, multiply Isp by ~0.94-0.97 (typical loss factor).",
        "Combustion completeness assumed = 1.0; real injectors give 0.92-0.98.",
    ],
    "last_reviewed_date": "2026-05-22",
}

PSI_PER_BAR = 14.5037738


def compute(payload: dict) -> dict:
    from rocketcea.cea_obj import CEA_Obj

    ox = str(payload.get("oxidiser", "LOX")).strip()
    fu = str(payload.get("fuel", "CH4")).strip()
    of = float(payload.get("of_ratio", 3.5))
    pc_bar = float(payload.get("chamber_pressure_bar", 300.0))
    eps = float(payload.get("expansion_ratio", 40.0))
    p_amb_bar = payload.get("ambient_pressure_bar")

    pc_psi = pc_bar * PSI_PER_BAR

    cea = CEA_Obj(oxName=ox, fuelName=fu)

    # Vacuum Isp at given expansion ratio
    vac_isp = float(cea.get_Isp(Pc=pc_psi, MR=of, eps=eps))

    # Chamber temperature — CEA returns Rankine by default. Convert R -> K via /1.8
    # get_Temperatures returns (Tc, Tt, Te) for chamber, throat, exit
    temps = cea.get_Temperatures(Pc=pc_psi, MR=of, eps=eps)
    chamber_temp_k = float(temps[0]) / 1.8  # Rankine -> Kelvin
    throat_temp_k = float(temps[1]) / 1.8
    exit_temp_k = float(temps[2]) / 1.8

    # c* (characteristic velocity) — units: ft/s by CEA convention
    cstar_ft_s = float(cea.get_Cstar(Pc=pc_psi, MR=of))
    cstar_m_s = cstar_ft_s * 0.3048

    # Sea-level Isp: needs ambient back-pressure
    if p_amb_bar is not None:
        try:
            p_amb_psi = float(p_amb_bar) * PSI_PER_BAR
            sl_isp = float(cea.estimate_Ambient_Isp(Pc=pc_psi, MR=of, eps=eps, Pamb=p_amb_psi)[0])
        except Exception:
            sl_isp = None
    else:
        # Default sea-level (1.01325 bar)
        try:
            sl_psi = 14.696
            sl_isp = float(cea.estimate_Ambient_Isp(Pc=pc_psi, MR=of, eps=eps, Pamb=sl_psi)[0])
        except Exception:
            sl_isp = None

    # Exit Mach number
    try:
        m_exit = float(cea.get_MachNumber(Pc=pc_psi, MR=of, eps=eps))
    except Exception:
        m_exit = None

    # Combustion chamber molecular weight + gamma at injector face
    try:
        mw, gam = cea.get_Chamber_MolWt_gamma(Pc=pc_psi, MR=of, eps=eps)
        mw = float(mw)
        gam = float(gam)
    except Exception:
        mw = None
        gam = None

    # Exhaust mass-fraction breakdown — CEA's full thermochemistry report
    try:
        # Provides string of full CEA output
        rpt = cea.get_full_cea_output(Pc=pc_psi, MR=of, eps=eps, short_output=1)
        exhaust_summary = "see full_cea_output_excerpt"
        # Extract one-liner about major species
        major_species = []
        if "MOLE FRACTIONS" in rpt:
            idx = rpt.find("MOLE FRACTIONS")
            tail = rpt[idx: idx + 800]
            major_species = [line.strip() for line in tail.splitlines() if line.strip()][:10]
        exhaust_summary = major_species
    except Exception:
        exhaust_summary = None

    # Worked calculations (2026-06-03): the thermochemistry (Isp, chamber/exit
    # temperatures, c*, gamma) is produced by NASA CEA's Gibbs-minimisation solver
    # and has no closed-form expression — those are NOT given worked lines. The
    # hand-checkable closed forms are the unit conversions applied to the solver's
    # raw output: chamber pressure bar -> psi, c* ft/s -> m/s, and chamber
    # temperature Rankine -> Kelvin.
    worked = [
        worked_calc(
            label="Chamber pressure (bar -> psi)",
            formula="chamber_pressure_psi = chamber_pressure_bar x psi_per_bar",
            values={"chamber_pressure_bar": (pc_bar, "bar"),
                    "psi_per_bar": (PSI_PER_BAR, "psi/bar")},
            result=round(pc_psi, 2), result_unit="psi",
            assumptions=["exact conversion 1 bar = 14.5037738 psi (CEA takes chamber pressure in psia)"],
        ),
        worked_calc(
            label="Characteristic velocity (ft/s -> m/s)",
            formula="c_star_m_s = c_star_ft_s x 0.3048",
            values={"c_star_ft_s": (round(cstar_ft_s, 2), "ft/s")},
            result=round(cstar_m_s, 1), result_unit="m/s",
            assumptions=["c* from NASA CEA (returned in ft/s); 1 ft = 0.3048 m exactly"],
        ),
        worked_calc(
            label="Chamber temperature (Rankine -> Kelvin)",
            formula="chamber_temp_k = chamber_temp_rankine / 1.8",
            values={"chamber_temp_rankine": (round(float(temps[0]), 1), "R")},
            result=round(chamber_temp_k, 1), result_unit="K",
            assumptions=["chamber temperature from NASA CEA (returned in Rankine); K = R / 1.8"],
        ),
    ]

    out: dict = {
        "oxidiser": ox,
        "fuel": fu,
        "of_ratio": of,
        "chamber_pressure_bar": pc_bar,
        "expansion_ratio": eps,
        "vacuum_isp_s": round(vac_isp, 2),
        "sea_level_isp_s": round(sl_isp, 2) if sl_isp is not None else None,
        "chamber_temp_k": round(chamber_temp_k, 1),
        "throat_temp_k": round(throat_temp_k, 1),
        "exit_temp_k": round(exit_temp_k, 1),
        "c_star_m_s": round(cstar_m_s, 1),
        "exit_mach_number": round(m_exit, 3) if m_exit is not None else None,
        "exhaust_mol_weight_g_mol": round(mw, 3) if mw is not None else None,
        "specific_heat_ratio_gamma": round(gam, 4) if gam is not None else None,
        "exhaust_major_species": exhaust_summary,
        "worked": worked,
    }
    return out


def main() -> int:
    t0 = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse failed: {exc}"}, sys.stdout)
        return 2

    try:
        # Silence RocketCEA's library-level prints (e.g. USER_HOME_DIR=...) so they
        # don't corrupt the JSON-only stdout contract.
        with _suppress_stdout_fd():
            result = compute(payload)
    except Exception as exc:
        import traceback
        json.dump({
            "error": f"compute failed: {type(exc).__name__}: {exc}",
            "trace": traceback.format_exc().splitlines()[-3:],
        }, sys.stdout)
        return 3

    result["_provenance"] = PROVENANCE
    result["_meta"] = {"wall_time_s": round(time.time() - t0, 3)}
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
