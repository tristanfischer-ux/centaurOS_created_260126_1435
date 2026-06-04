#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/reaction_stoichiometry_balance.py

reaction:stoichiometry-balance — FIRST-PRINCIPLES mass balance of a balanced
chemical reaction.

WHAT IT DOES
    Given a balanced reaction (species + signed integer/float coefficients,
    reactants negative, products positive) and a BASIS (the known molar or
    mass rate of ONE species), it computes the mole flow and mass flow of
    EVERY other species purely from stoichiometry and molecular weight:

        n_i   = (coeff_i / coeff_basis) x n_basis          [mol / time]
        mass_i = n_i x MW_i                                [g  / time] -> t/day

    Molecular weights come from `chemicals.MW` (NIST atomic-weight tables,
    package `chemicals` 1.5, MIT licence). No thermodynamic data is needed —
    this is conservation of atoms, the most certain calculation in the plant.

WHY (Plan C, docs/grounding-and-selfgrowth-plan.md section C item 1):
    CO2-mineralisation's gypsum / CaCO3 / K2SO4 tonnages were LLM-guessed and
    inconsistent (gypsum quoted 3.91 vs 3.1 t/day in the same dossier). A
    balanced reaction + a single CO2 basis fixes every product tonnage exactly.
    The novel sub-modules (gypsum_carbonation, k2so4_recovery, mea_recovery)
    have no catalogue parts, so a grounded worked mass balance gives them real
    engineering substance.

INPUT (JSON on stdin)
    {
      "reaction_name": "gypsum carbonation",        # optional label
      "species": [                                   # the balanced reaction
        {"name": "CaSO4:2H2O", "coeff": -1, "cas": "10101-41-4"},  # reactant (negative)
        {"name": "CO2",        "coeff": -1},
        {"name": "KOH",        "coeff": -2},
        {"name": "CaCO3",      "coeff":  1},          # product (positive)
        {"name": "K2SO4",      "coeff":  1},
        {"name": "H2O",        "coeff":  3}
      ],
      "basis": {"species": "CO2", "rate": 1.0, "unit": "t/day", "is_mass": true}
    }
    `name` is parsed by chemicals.MW (formula or common name). `cas` overrides
    the lookup when the name is ambiguous (recommended for hydrates / salts).
    `unit` may be any of: t/day, kg/day, kg/h, kg/s, mol/s, kmol/h, mol/day.
    `is_mass` true => the basis rate is a MASS rate; false => a MOLE rate.

OUTPUT (JSON on stdout)
    Per-species mole + mass flow in a canonical t/day plus the input unit, an
    atom-balance check (Σ reactant atoms == Σ product atoms for every element),
    and a `worked[]` array (each line hand-checkable: moles = mass / MW, then
    product mass = moles x ratio x MW).

LICENCE: tool wrapper internal; MW data from `chemicals` (MIT).
"""
from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402  (same-dir shared helper)


# Mass-rate unit -> kg/s ; mole-rate unit -> mol/s. Canonical reporting is t/day.
_MASS_UNIT_TO_KG_S = {
    "kg/s": 1.0,
    "kg/h": 1.0 / 3600.0,
    "kg/day": 1.0 / 86400.0,
    "t/day": 1000.0 / 86400.0,
    "tonne/day": 1000.0 / 86400.0,
    "g/s": 1e-3,
}
_MOLE_UNIT_TO_MOL_S = {
    "mol/s": 1.0,
    "mol/h": 1.0 / 3600.0,
    "mol/day": 1.0 / 86400.0,
    "kmol/h": 1000.0 / 3600.0,
    "kmol/day": 1000.0 / 86400.0,
}
_KG_S_TO_T_DAY = 86400.0 / 1000.0


def _resolve(spec: dict) -> tuple[float, str]:
    """Return (molecular weight g/mol, canonical Hill formula) for a species.

    The Hill formula comes from the resolved chemical (via CAS / name search) so the
    atom-balance check uses the TRUE composition — `chemicals.elements.simple_formula_parser`
    does NOT understand hydrate display notation (CaSO4.2H2O parses to O5.2; CaSO4(H2O)2
    drops the group multiplier), so we never rely on the display `name` for atoms when a
    catalogue formula is available.
    """
    from chemicals import MW, search_chemical

    cas = spec.get("cas")
    name = str(spec.get("name", "")).strip()
    if cas:
        hit = search_chemical(str(cas))
        return float(MW(str(cas))), str(getattr(hit, "formula", "") or "")
    # Try the raw identifier first (formula like "K2SO4" or a CAS); fall back to a
    # name search ("gypsum"). search_chemical resolves common names -> CAS.
    try:
        hit = search_chemical(name)
        return float(MW(hit.CASs)), str(getattr(hit, "formula", "") or "")
    except Exception:
        return float(MW(name)), ""


def compute(payload: dict) -> dict:
    from chemicals.elements import simple_formula_parser

    species_in = payload.get("species") or []
    if not isinstance(species_in, list) or len(species_in) < 2:
        raise ValueError("`species` must be a list of >= 2 {name, coeff} entries")
    basis = payload.get("basis") or {}
    basis_name = str(basis.get("species", "")).strip()
    if not basis_name:
        raise ValueError("`basis.species` is required")
    basis_rate = float(basis.get("rate", 0.0))
    basis_unit = str(basis.get("unit", "t/day"))
    is_mass = bool(basis.get("is_mass", True))

    # Resolve MW + coefficient for every species; find the basis row.
    # `formula` precedence for the atom balance: caller-supplied flat formula (for
    # hydrates the caller MUST give a flat Hill formula, e.g. gypsum -> CaH4O6S) >
    # the catalogue Hill formula from chemicals > the display name (last resort).
    rows = []
    basis_row = None
    basis_cas = basis.get("cas")
    for s in species_in:
        name = str(s.get("name", "")).strip()
        coeff = float(s.get("coeff", 0.0))
        if coeff == 0.0:
            raise ValueError(f"species '{name}' has zero coefficient")
        mw, catalogue_formula = _resolve(s)
        row = {"name": name, "coeff": coeff, "mw_g_mol": round(mw, 4),
               "role": "reactant" if coeff < 0 else "product",
               "cas": s.get("cas"),
               "formula": s.get("formula") or catalogue_formula or name}
        rows.append(row)
        # Match the basis by NAME first; only by CAS when BOTH sides carry a non-null CAS
        # (avoids the None==None trap that would match every formula-only species).
        name_match = name == basis_name
        cas_match = bool(basis_cas) and s.get("cas") == basis_cas
        if name_match or cas_match:
            basis_row = row
    if basis_row is None:
        raise ValueError(f"basis species '{basis_name}' not found among reaction species")

    # Basis molar rate (mol/s) — from mass via mass/MW, or directly.
    if is_mass:
        if basis_unit not in _MASS_UNIT_TO_KG_S:
            raise ValueError(f"unknown mass unit '{basis_unit}'")
        basis_kg_s = basis_rate * _MASS_UNIT_TO_KG_S[basis_unit]
        basis_mol_s = (basis_kg_s * 1000.0) / basis_row["mw_g_mol"]  # g/s ÷ g/mol
    else:
        if basis_unit not in _MOLE_UNIT_TO_MOL_S:
            raise ValueError(f"unknown mole unit '{basis_unit}'")
        basis_mol_s = basis_rate * _MOLE_UNIT_TO_MOL_S[basis_unit]
        basis_kg_s = basis_mol_s * basis_row["mw_g_mol"] / 1000.0

    abs_basis_coeff = abs(basis_row["coeff"])

    # Per-species flows from the stoichiometric ratio to the basis.
    species_out = []
    worked = []
    # Show the basis-mole derivation first (so the reader can re-check moles = mass / MW).
    if is_mass:
        worked.append(worked_calc(
            label=f"Basis molar flow ({basis_row['name']})",
            formula="n_basis = (mass_basis x 1000) / MW_basis",
            values={"mass_basis": (round(basis_kg_s, 6), "kg/s"),
                    "MW_basis": (basis_row["mw_g_mol"], "g/mol")},
            result=round(basis_mol_s, 6), result_unit="mol/s",
            assumptions=[f"basis = {basis_rate} {basis_unit} of {basis_row['name']}",
                         "x1000 converts kg to g so g/s ÷ g/mol = mol/s"],
        ))

    for r in rows:
        ratio = r["coeff"] / basis_row["coeff"]            # signed mole ratio to basis
        mol_s = ratio * basis_mol_s                        # signed mol/s (react<0, prod>0)
        mass_kg_s = mol_s * r["mw_g_mol"] / 1000.0         # signed kg/s
        t_day = mass_kg_s * _KG_S_TO_T_DAY                 # signed t/day
        species_out.append({
            "name": r["name"], "role": r["role"], "coeff": r["coeff"],
            "mw_g_mol": r["mw_g_mol"],
            "mole_flow_mol_s": round(abs(mol_s), 6),
            "mass_flow_kg_s": round(abs(mass_kg_s), 6),
            "mass_flow_kg_day": round(abs(mass_kg_s) * 86400.0, 3),
            "mass_flow_t_day": round(abs(t_day), 5),
        })
        # One worked line per NON-basis species: product/reactant mass from the basis.
        if r is not basis_row:
            worked.append(worked_calc(
                label=f"{r['role'].capitalize()} mass flow: {r['name']}",
                formula="mass = (coeff / coeff_basis) x n_basis x MW",
                values={"coeff": (abs(r["coeff"]), ""),
                        "coeff_basis": (abs_basis_coeff, ""),
                        "n_basis": (round(basis_mol_s, 6), "mol/s"),
                        "MW": (r["mw_g_mol"], "g/mol")},
                # result is in g/s here (mol/s x g/mol); report it as g/s and ALSO give t/day below.
                result=round(abs(mol_s) * r["mw_g_mol"], 4), result_unit="g/s",
                assumptions=[f"= {round(abs(t_day), 5)} t/day "
                             f"(g/s x 86.4 / 1000)",
                             "atom conservation: product tonnages are exact, not estimated"],
            ))

    # ---- Atom balance: Σ(coeff x atoms_of_element) must be ~0 for every element. ----
    elem_totals: dict[str, float] = {}
    parse_warnings = []
    for r in rows:
        try:
            atoms = simple_formula_parser(str(r.get("formula") or r["name"]))
        except Exception as exc:
            parse_warnings.append(f"could not parse formula for {r['name']}: {exc}")
            continue
        for el, n in atoms.items():
            elem_totals[el] = elem_totals.get(el, 0.0) + r["coeff"] * n
    atom_balanced = all(abs(v) < 1e-6 for v in elem_totals.values()) and not parse_warnings
    if not atom_balanced and not parse_warnings:
        worst = max(elem_totals.items(), key=lambda kv: abs(kv[1]))
        parse_warnings.append(
            f"reaction is NOT atom-balanced: element '{worst[0]}' net {worst[1]:+.3f} "
            f"(reactant coeffs must be negative, product positive, and atoms must conserve)")

    # Mass-balance cross-check (Σ reactant mass == Σ product mass, t/day).
    react_mass_t_day = sum(s["mass_flow_t_day"] for s in species_out if s["coeff"] < 0)
    prod_mass_t_day = sum(s["mass_flow_t_day"] for s in species_out if s["coeff"] > 0)
    mass_closure_pct = (
        100.0 * (prod_mass_t_day - react_mass_t_day) / react_mass_t_day
        if react_mass_t_day else 0.0)
    worked.append(worked_calc(
        label="Overall mass balance (conservation check)",
        formula="closure = (mass_products - mass_reactants) / mass_reactants x 100",
        values={"mass_products": (round(prod_mass_t_day, 5), "t/day"),
                "mass_reactants": (round(react_mass_t_day, 5), "t/day")},
        result=round(mass_closure_pct, 4), result_unit="%",
        assumptions=["should be ~0% — mass in = mass out for a balanced reaction"],
    ))

    return {
        "reaction_name": payload.get("reaction_name", "reaction"),
        "basis": {"species": basis_row["name"], "rate": basis_rate, "unit": basis_unit,
                  "is_mass": is_mass, "molar_flow_mol_s": round(basis_mol_s, 6)},
        "species": species_out,
        # Convenience flat map: species name -> t/day (what the dossier sub-modules read).
        "mass_flows_t_day": {s["name"]: s["mass_flow_t_day"] for s in species_out},
        "mass_flows_kg_day": {s["name"]: s["mass_flow_kg_day"] for s in species_out},
        "atom_balanced": atom_balanced,
        "element_net_atoms": {k: round(v, 6) for k, v in elem_totals.items()},
        "mass_balance_reactants_t_day": round(react_mass_t_day, 5),
        "mass_balance_products_t_day": round(prod_mass_t_day, 5),
        "mass_closure_pct": round(mass_closure_pct, 4),
        "warnings": parse_warnings,
        "worked": worked,
        "data_sources": [
            "Molecular weights: NIST atomic weights via the `chemicals` package "
            "(chemicals.MW), MIT licence, github.com/CalebBell/chemicals",
        ],
    }


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
    except Exception as exc:  # noqa: BLE001 — surface any failure as structured error
        json.dump({"error": f"{type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(out, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
