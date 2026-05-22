#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/cantera_run.py

Real Cantera wrapper. Used by orchestrator for:
- Heat pump refrigerant cycle thermodynamics (computed via Cantera's
  thermo equation-of-state alongside CoolProp)
- Bioreactor metabolic kinetics (future)
- Combustion / fuel-cell electrochemistry (future)

For BESS this is currently not critical; included for orchestrator
breadth. Returns combustion equilibrium for a representative
stoichiometric mixture as a smoke-test default. Real callers will
pass specific fuel/oxidizer + initial conditions.

License: BSD. Source: github.com/Cantera/cantera
"""
from __future__ import annotations
import json
import sys
import time


def compute(payload: dict) -> dict:
    import cantera as ct

    mode = str(payload.get("mode", "equilibrium")).lower()

    if mode == "equilibrium":
        # Default: stoichiometric H2/O2/N2 combustion at 1 atm
        mech = str(payload.get("mechanism", "gri30.yaml"))
        composition = str(payload.get("composition", "H2:2, O2:1, N2:3.76"))
        t_in_k = float(payload.get("t_in_k", 300))
        p_pa = float(payload.get("p_pa", ct.one_atm))

        gas = ct.Solution(mech)
        gas.TPX = t_in_k, p_pa, composition
        gas.equilibrate("HP")  # constant enthalpy + pressure

        return {
            "mode": "equilibrium_HP",
            "mechanism": mech,
            "initial_composition": composition,
            "equilibrium_temp_k": round(gas.T, 1),
            "equilibrium_pressure_bar": round(gas.P / 1e5, 4),
            "final_composition_mole_fractions": {
                species: round(float(gas.X[gas.species_index(species)]), 4)
                for species in ["H2O", "H2", "O2", "OH", "H", "O", "N2"]
                if species in gas.species_names
            },
        }
    elif mode == "ideal_gas_thermo":
        # Lookup thermophysical properties for a single gas species
        species = str(payload.get("species", "N2"))
        t_k = float(payload.get("t_k", 298))
        p_pa = float(payload.get("p_pa", ct.one_atm))
        gas = ct.Solution("gri30.yaml")
        gas.TPX = t_k, p_pa, f"{species}:1.0"
        return {
            "mode": "ideal_gas_thermo",
            "species": species,
            "temperature_k": t_k,
            "pressure_pa": p_pa,
            "cp_mass_j_kgk": round(float(gas.cp_mass), 2),
            "cv_mass_j_kgk": round(float(gas.cv_mass), 2),
            "density_kg_m3": round(float(gas.density_mass), 4),
            "enthalpy_mass_j_kg": round(float(gas.enthalpy_mass), 2),
        }
    else:
        raise ValueError(f"unknown mode: {mode}")


def main() -> int:
    t = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse: {exc}"}, sys.stdout)
        return 2
    try:
        out = compute(payload)
        out["_meta"] = {"wall_time_s": round(time.time() - t, 3)}
    except Exception as exc:
        json.dump({"error": f"{type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(out, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
