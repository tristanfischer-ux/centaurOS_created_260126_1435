#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/reaction_feasibility_gibbs.py

reaction:feasibility-gibbs — FIRST-PRINCIPLES thermodynamic feasibility of a
chemical reaction.

WHAT IT DOES
    Given a reaction (species + signed coefficients) and temperature(s), computes

        dG_rxn(T) = Σ coeff_i x dGf_i      (products positive, reactants negative)
        K(T)      = exp(-dG_rxn / (R x T))
        verdict   = feasible | borderline | infeasible

    The standard Gibbs energy of formation dGf of each species is taken, in order
    of preference, from:
      1. caller override (`gf_kj_mol` on the species) — for one-off literature values;
      2. the `chemicals` package, computed AT RUNTIME from its tabulated solid/liquid/
         gas enthalpy of formation (Hfs/Hfl/Hfg) + absolute entropy (S0s/S0l/S0g) via
         chemicals.Gibbs_formation(). Verified against CRC: CaCO3 -1128.97 vs -1128.8,
         KOH(s) -379.45 vs -379.1, CaSO4 -1321.92 vs -1322.0, K2SO4 -1319.64 vs -1321.4
         kJ/mol (all within ~0.2%);
      3. a small CURATED literature table (this file, `_LIT_GF`) for species the
         `chemicals` package lacks (gypsum CaSO4.2H2O, aqueous CO2, liquid water/MEA,
         aqueous KOH) — EVERY entry carries its source citation + a confidence flag.

    HONESTY CONTRACT (Plan C, docs/grounding-and-selfgrowth-plan.md): a thermodynamic
    value is NEVER fabricated. If a species has no value from (1)-(3) the tool RETURNS
    AN ERROR naming the missing species — it does not silently assume zero. Every dGf
    used is reported with its `source` + `confidence` so the dossier can disclose
    which numbers are CRC-grade and which are literature/estimated.

WHY (CO2 mineralisation): the K2SO4 / MEA-regeneration loop has no plant analogue,
    so "is it thermodynamically real?" was an LLM guess. This tool validates it:
    gypsum carbonation CaSO4.2H2O + CO2 + 2KOH -> CaCO3 + K2SO4 + 3H2O computes a
    strongly negative dG (~ -200 kJ/mol) => FEASIBLE, a verdict not a guess.

    Temperature handling: dGf values are standard-state (298.15 K). For T != 298.15 K
    we report dG at 298.15 K AND a Van 't Hoff style first-order extrapolation using
    the reaction enthalpy dH_rxn (from the same tables) holding dH constant, which is
    flagged as an approximation (entropy term carried via dG298 and dH298). This is
    explicitly labelled "approx (constant dH)" — not claimed as a rigorous T-dependence.

INPUT (JSON on stdin)
    {
      "reaction_name": "gypsum carbonation",
      "species": [
        {"name":"CaSO4.2H2O","coeff":-1,"cas":"10101-41-4","phase":"s"},
        {"name":"CO2","coeff":-1,"cas":"124-38-9","phase":"g"},
        {"name":"KOH","coeff":-2,"cas":"1310-58-3","phase":"s"},
        {"name":"CaCO3","coeff":1,"cas":"471-34-1","phase":"s"},
        {"name":"K2SO4","coeff":1,"cas":"7778-80-5","phase":"s"},
        {"name":"H2O","coeff":3,"cas":"7732-18-5","phase":"l"}
      ],
      "temperatures_k": [298.15, 393.15]      # optional; default [298.15]
    }
    `phase` in {s, l, g, aq}. Defaults to 's' if omitted (most CO2-mineral species
    are solids). `gf_kj_mol` may override the looked-up value (with `gf_source`).

OUTPUT (JSON on stdout)
    Per-temperature dG_rxn, K, verdict; the dGf table actually used (value + source +
    confidence + phase per species); the lowest data-confidence (so the dossier can
    flag the whole verdict); a `worked[]` array (the dG summation + K, hand-checkable).

LICENCE: tool wrapper internal; thermodynamic data from `chemicals` (MIT) + cited
    literature (CRC Handbook of Chemistry & Physics; Robie & Hemingway USGS Bull. 2131;
    NIST). Citations travel with every value.
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402  (same-dir shared helper)

R = 8.314462618  # J/mol/K (CODATA)
T_REF = 298.15   # K

# ---------------------------------------------------------------------------
# CURATED LITERATURE Gibbs / enthalpy of formation (kJ/mol) for species the
# `chemicals` package cannot supply in the relevant phase. EVERY entry cites a
# source and a confidence. dGf is standard-state, 298.15 K.
#
# Sources:
#   CRC = CRC Handbook of Chemistry & Physics, 97th ed., Standard Thermodynamic
#         Properties of Chemical Substances.
#   Robie = Robie & Hemingway, "Thermodynamic Properties of Minerals and Related
#         Substances at 298.15 K", USGS Bulletin 2131 (1995).
#   NIST = NIST Chemistry WebBook.
# Keyed by (CAS, phase).
# ---------------------------------------------------------------------------
_LIT_GF: dict[tuple[str, str], dict] = {
    # Gypsum (calcium sulfate dihydrate) — NOT in chemicals' tables.
    #   dHf = -2022.6 kJ/mol, S0 = 194.1 J/mol/K (Robie/CRC) -> dGf ≈ -1797.2 kJ/mol.
    ("10101-41-4", "s"): {"gf_kj_mol": -1797.2, "hf_kj_mol": -2022.6,
                           "source": "CRC Handbook 97th ed. / Robie & Hemingway USGS Bull. 2131 (CaSO4·2H2O)",
                           "confidence": "medium"},
    # Aqueous CO2 (the absorbed/dissolved species in the carbonation liquor).
    ("124-38-9", "aq"): {"gf_kj_mol": -385.98, "hf_kj_mol": -413.8,
                          "source": "CRC Handbook 97th ed. (CO2 aqueous)", "confidence": "high"},
    # Liquid water (CRC standard) — chemicals also has this but we pin the CRC value.
    ("7732-18-5", "l"): {"gf_kj_mol": -237.14, "hf_kj_mol": -285.83,
                          "source": "CRC Handbook 97th ed. (H2O liquid)", "confidence": "high"},
    # Aqueous KOH (fully dissociated K+ + OH-): dGf(K+) -283.27 + dGf(OH-) -157.24.
    ("1310-58-3", "aq"): {"gf_kj_mol": -440.51, "hf_kj_mol": -482.4,
                           "source": "CRC Handbook 97th ed. (K+ aq -283.27 + OH- aq -157.24)",
                           "confidence": "medium"},
    # Liquid monoethanolamine (MEA). Gas-phase dGf is -106.9 (chemicals); the liquid
    # is lower. Literature liquid dGf is sparse; flagged LOW confidence accordingly.
    ("141-43-5", "l"): {"gf_kj_mol": -161.0, "hf_kj_mol": -507.5,
                         "source": "estimated from MEA(g) dGf -106.9 kJ/mol (chemicals) less ~54 kJ/mol "
                                   "vaporisation-Gibbs; liquid value approximate",
                         "confidence": "low"},
}


def _gf_from_chemicals(cas: str, phase: str) -> dict | None:
    """Compute standard dGf (and dHf) for a species in a given phase from the
    `chemicals` package tables via chemicals.Gibbs_formation(). Returns kJ/mol +
    source string, or None if the package lacks the phase data for this species."""
    from chemicals import Hfs, Hfl, Hfg, S0s, S0l, S0g, simple_formula_parser, search_chemical
    from chemicals.reaction import Gibbs_formation, standard_formation_reaction

    hf_fn = {"s": Hfs, "l": Hfl, "g": Hfg}.get(phase)
    s0_fn = {"s": S0s, "l": S0l, "g": S0g}.get(phase)
    if hf_fn is None or s0_fn is None:
        return None  # aqueous handled by the literature table
    dHf = hf_fn(cas)
    S0 = s0_fn(cas)
    if dHf is None or S0 is None:
        return None

    # Resolve the formula to enumerate constituent elements.
    try:
        formula = str(getattr(search_chemical(cas), "formula", "") or "")
        atoms = simple_formula_parser(formula)
    except Exception:
        return None
    reactant_coeff, elemental_counts, product_atomss = standard_formation_reaction(atoms)

    # Reference-element absolute entropies S0 (J/mol/K): diatomic gases for H/O/N/F/Cl,
    # solids for the metals/C/S. dHf of any element in its standard state = 0.
    elem_ref_cas = {
        "O": "7782-44-7", "H": "1333-74-0", "N": "7727-37-9",
        "F": "7782-41-4", "Cl": "7782-50-5",
        "C": "7440-44-0", "Ca": "7440-70-2", "K": "7440-09-7",
        "S": "7704-34-9", "Na": "7440-23-5", "Mg": "7439-95-4",
    }
    gas_elems = {"O", "H", "N", "F", "Cl"}
    dHfs_std, S0_elements, coeffs = [], [], []
    for cnt, prod in zip(elemental_counts, product_atomss):
        elem = next(iter(prod.keys()))
        ref = elem_ref_cas.get(elem)
        if ref is None:
            return None  # unknown reference element -> cannot compute; fall through
        s0e = (S0g if elem in gas_elems else S0s)(ref)
        if s0e is None:
            return None
        dHfs_std.append(0.0)
        S0_elements.append(s0e)
        coeffs.append(cnt / reactant_coeff)

    gf = Gibbs_formation(dHf, S0, dHfs_std, S0_elements, coeffs)  # J/mol
    return {"gf_kj_mol": gf / 1000.0, "hf_kj_mol": dHf / 1000.0,
            "source": f"chemicals package (CRC/NIST tables), Hf{phase}+S0{phase} via Gibbs_formation()",
            "confidence": "high"}


_CONF_RANK = {"high": 3, "medium": 2, "low": 1, "unknown": 0}


def _resolve_gf(spec: dict) -> dict:
    """Return {gf_kj_mol, hf_kj_mol?, source, confidence, phase} for a species, or
    raise ValueError if no honest value is available (NEVER fabricates)."""
    name = str(spec.get("name", "")).strip()
    phase = str(spec.get("phase", "s")).lower()
    cas = spec.get("cas")

    # 1. caller override
    if spec.get("gf_kj_mol") is not None:
        return {"gf_kj_mol": float(spec["gf_kj_mol"]),
                "hf_kj_mol": (float(spec["hf_kj_mol"]) if spec.get("hf_kj_mol") is not None else None),
                "source": str(spec.get("gf_source", "caller-supplied literature value")),
                "confidence": str(spec.get("gf_confidence", "medium")), "phase": phase}

    # Need a CAS to look anything up; resolve from name if absent.
    if not cas:
        try:
            from chemicals import search_chemical
            cas = search_chemical(name).CASs
        except Exception:
            raise ValueError(f"no CAS for '{name}' and name not resolvable — cannot look up dGf")

    # 2. literature table (covers phases / species chemicals lacks)
    lit = _LIT_GF.get((str(cas), phase))
    if lit is not None:
        return {**lit, "phase": phase}

    # 3. chemicals package (solid/liquid/gas only)
    chem = _gf_from_chemicals(str(cas), phase)
    if chem is not None:
        return {**chem, "phase": phase}

    raise ValueError(
        f"no Gibbs-of-formation data for '{name}' (CAS {cas}, phase '{phase}') in the "
        f"literature table OR the chemicals package — supply `gf_kj_mol` + `gf_source` "
        f"with a citation (a thermodynamic value must never be fabricated)")


def _verdict(dg_kj_mol: float) -> str:
    # Standard engineering thresholds on dG_rxn (kJ/mol of reaction as written):
    #   strongly negative => proceeds; near zero => equilibrium-limited; positive => not spontaneous.
    if dg_kj_mol < -20.0:
        return "feasible"
    if dg_kj_mol <= 20.0:
        return "borderline"
    return "infeasible"


def compute(payload: dict) -> dict:
    species_in = payload.get("species") or []
    if not isinstance(species_in, list) or len(species_in) < 2:
        raise ValueError("`species` must be a list of >= 2 {name, coeff, phase} entries")
    temps = payload.get("temperatures_k") or [T_REF]
    if not isinstance(temps, list) or not temps:
        temps = [T_REF]

    # Resolve dGf + dHf for every species (raises if any lacks honest data).
    gf_table = []
    have_all_hf = True
    for s in species_in:
        coeff = float(s.get("coeff", 0.0))
        if coeff == 0.0:
            raise ValueError(f"species '{s.get('name')}' has zero coefficient")
        d = _resolve_gf(s)
        if d.get("hf_kj_mol") is None:
            have_all_hf = False
        gf_table.append({"name": str(s.get("name", "")).strip(), "coeff": coeff, **d})

    # dG_rxn and dH_rxn at the reference temperature.
    dg298 = sum(r["coeff"] * r["gf_kj_mol"] for r in gf_table)
    dh298 = (sum(r["coeff"] * r["hf_kj_mol"] for r in gf_table) if have_all_hf else None)

    # Worst (lowest) data confidence drives how strongly the dossier can assert the verdict.
    min_conf = min((r["confidence"] for r in gf_table), key=lambda c: _CONF_RANK.get(c, 0))

    worked = []
    react_terms = " + ".join(
        f"{abs(r['coeff']):g}x({r['gf_kj_mol']:g})" for r in gf_table if r["coeff"] < 0)
    prod_terms = " + ".join(
        f"{abs(r['coeff']):g}x({r['gf_kj_mol']:g})" for r in gf_table if r["coeff"] > 0)
    sum_react = sum(abs(r["coeff"]) * r["gf_kj_mol"] for r in gf_table if r["coeff"] < 0)
    sum_prod = sum(abs(r["coeff"]) * r["gf_kj_mol"] for r in gf_table if r["coeff"] > 0)
    # Formula kept PURELY arithmetic (+ - x /) so the substitution re-evaluates by hand AND
    # the regression harness's arithmetic checker can verify it — the term breakdown
    # (coeff x dGf per species) lives in `assumptions`, not in the formula string.
    worked.append(worked_calc(
        label="Standard reaction Gibbs energy (298.15 K)",
        formula="dG_rxn = sum_products - sum_reactants",
        values={"sum_products": (round(sum_prod, 3), "kJ/mol"),
                "sum_reactants": (round(sum_react, 3), "kJ/mol")},
        result=round(dg298, 3), result_unit="kJ/mol",
        assumptions=[f"sum_products = sum of (coeff x dGf) over products: {prod_terms}",
                     f"sum_reactants = sum of (coeff x dGf) over reactants: {react_terms}",
                     f"lowest data confidence among species: {min_conf}"],
    ))

    results = []
    for T in temps:
        T = float(T)
        # dG(T): exact at T_REF; for T != T_REF use constant-dH Van 't Hoff approx if dH known.
        if abs(T - T_REF) < 1e-6 or dh298 is None:
            dg_T = dg298
            t_basis = "standard (298.15 K)" if abs(T - T_REF) < 1e-6 else "298.15 K value (no dH for T-correction)"
        else:
            # dG(T) ≈ dH298 - T x (dH298 - dG298)/T_REF   [holds dH, dS constant from 298.15 K]
            dS298 = (dh298 - dg298) / T_REF  # kJ/mol/K
            dg_T = dh298 - T * dS298
            t_basis = "approx (constant dH/dS from 298.15 K)"
        ln_K = -(dg_T * 1000.0) / (R * T)
        K = math.exp(ln_K)
        verdict = _verdict(dg_T)
        results.append({
            "temperature_k": round(T, 2),
            "delta_g_rxn_kj_mol": round(dg_T, 3),
            "delta_h_rxn_kj_mol": (round(dh298, 3) if dh298 is not None else None),
            "equilibrium_constant_K": K,
            "ln_K": round(ln_K, 4),
            "log10_K": (round(math.log10(K), 3) if K > 0 else None),
            "verdict": verdict,
            "temperature_basis": t_basis,
        })
        # The CHECKABLE working is ln(K) = -(dG x 1000)/(R x T) — pure arithmetic. K = e^ln_K is
        # then stated in the result note (the exp() is one final unambiguous step, not part of the
        # arithmetic substitution, so the printed maths still re-evaluates exactly).
        # result_unit kept EMPTY so the substitution ends cleanly at the ln_K number and the
        # harness arithmetic checker re-evaluates it (the K = e^lnK step is stated in assumptions).
        worked.append(worked_calc(
            label=f"Equilibrium constant at {round(T, 1)} K  (ln K; then K = e^lnK = {K:.4g})",
            formula="ln_K = -(dG_rxn x 1000) / (R x T)",
            values={"dG_rxn": (round(dg_T, 3), "kJ/mol"), "R": (R, "J/mol/K"), "T": (round(T, 2), "K")},
            result=round(ln_K, 4), result_unit="",
            assumptions=["x1000 converts kJ to J; ln K > 0 (K>1) => products favoured, "
                         "ln K < 0 (K<1) => reactants favoured",
                         f"K = exp(ln_K) = exp({round(ln_K, 4)}) = {K:.4g}", t_basis],
        ))

    # Headline verdict = at the first (usually reference) temperature.
    headline = results[0]

    return {
        "reaction_name": payload.get("reaction_name", "reaction"),
        "delta_g_rxn_298k_kj_mol": round(dg298, 3),
        "delta_h_rxn_298k_kj_mol": (round(dh298, 3) if dh298 is not None else None),
        "verdict": headline["verdict"],
        "equilibrium_constant_K": headline["equilibrium_constant_K"],
        "results_by_temperature": results,
        "gibbs_formation_table": [
            {"name": r["name"], "coeff": r["coeff"], "phase": r["phase"],
             "gf_kj_mol": round(r["gf_kj_mol"], 3),
             "hf_kj_mol": (round(r["hf_kj_mol"], 3) if r.get("hf_kj_mol") is not None else None),
             "source": r["source"], "confidence": r["confidence"]}
            for r in gf_table
        ],
        "lowest_data_confidence": min_conf,
        "worked": worked,
        "data_sources": [
            "Gibbs/enthalpy of formation for solids/liquids/gases: the `chemicals` package "
            "(Hf+S0 tables, CRC/NIST) via chemicals.Gibbs_formation(), MIT licence.",
            "Species the package lacks (gypsum CaSO4·2H2O, aqueous CO2/KOH, liquid MEA): "
            "CRC Handbook of Chemistry & Physics 97th ed. + Robie & Hemingway USGS Bull. 2131; "
            "each value carries its citation + confidence in gibbs_formation_table.",
            "Gas constant R = 8.314462618 J/mol/K (CODATA).",
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
