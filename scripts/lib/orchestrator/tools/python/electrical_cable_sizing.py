#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/electrical_cable_sizing.py

electrical:cable-sizing — FIRST-PRINCIPLES sizing of the main LV feeder cable
from the design current, run length and voltage: select the smallest STANDARD
conductor cross-sectional area (CSA, mm2) whose de-rated ampacity carries the
design current, then compute the resulting volt-drop as a percentage of nominal,
per BS 7671 (IET Wiring Regulations) / IEC 60364-5-52 ampacity + mV/A/m tables.

WHAT IT DOES
    Given the load design current I_b [A], the cable route length L [m], the
    nominal voltage and the install grouping/temperature de-rating factors:

      I_t      = I_b / (Ca x Cg)                        tabulated-current target [A]
      CSA      = smallest standard CSA with ampacity(CSA) >= I_t   [mm2]
      Vd       = (mV/A/m)(CSA) x I_b x L / 1000          volt-drop [V]
      Vd%      = 100 x Vd / V_nominal                    volt-drop [% of nominal]

WHY (CO2-mineralisation Electrical Distribution module had NO computation):
    The plant has no cable sizing tool, so the SWA/LSZH feeder bundle was
    LLM-guessed. A feeder SIZED to BS 7671 ampacity with a checked volt-drop IS
    the BoM line item — conductor CSA + design current + volt-drop %.

INPUT (JSON on stdin)
    {
      "cable_name": "main LV feeder",          # optional label
      # design current: either given directly, OR derived from a load + voltage:
      "design_current_a": 900.0,              # OR:
      "load_kw": 561.0, "voltage_v": 400.0, "power_factor": 0.9, "phases": 3,
      "length_m": 35.0,                        # cable route length [m]
      "nominal_voltage_v": 400.0,             # nominal system voltage for Vd%
      "conductor": "copper",                  # copper | aluminium
      "ambient_derate_ca": 0.94,              # BS 7671 temperature factor Ca
      "grouping_derate_cg": 0.80,             # BS 7671 grouping factor Cg
      "n_parallel": 1,                        # conductors per phase in parallel
      "max_voltdrop_pct": 5.0                 # advisory ceiling (BS 7671 §525: 5%)
    }

OUTPUT (JSON on stdout)
    main_feeder_cable_csa_mm2 (per-conductor standard CSA), feeder_design_current_a,
    cable_voltdrop_pct, the de-rated tabulated-current target + the selected
    ampacity, plus a worked[] array (each line hand-checkable) and a _provenance
    block. ERRORS (never fabricates) if no standard CSA in the table carries the
    target current — the caller must add parallel runs.

LICENCE: tool wrapper internal. Tabulated ampacity + mV/A/m values are the
published BS 7671 Appendix 4 / IEC 60364-5-52 reference-method figures (90 C
thermosetting, multi-core, Reference Method C — clipped direct). British spelling.
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402  (same-dir shared helper)

PROVENANCE = {
    "tool_name": "electrical_cable_sizing (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "BS 7671:2018+A2:2022 (IET Wiring Regulations) Appendix 4 — current-"
        "carrying capacity + voltage-drop (mV/A/m) tables; IEC 60364-5-52 "
        "(electrical installations — selection + erection of wiring systems)."
    ),
    "physics_basis": (
        "Tabulated-current target I_t = I_b / (Ca x Cg) (de-rate the design "
        "current by ambient + grouping factors). Select the smallest standard "
        "conductor CSA whose Reference-Method-C tabulated ampacity (x parallel "
        "runs) >= I_t. Volt-drop Vd = (mV/A/m) x I_b x L / 1000; Vd% = 100 Vd / "
        "U_nom. Ampacity + mV/A/m are the published BS 7671 Appendix 4 figures "
        "(90 C thermosetting, multi-core, Method C); no fabricated constants."
    ),
    "confidence_class": "standard",
    "last_reviewed_date": "2026-06-04",
}

# BS 7671 Appendix 4 reference data — 90 C thermosetting (XLPE) multi-core,
# Reference Method C (clipped direct). Per standard conductor CSA [mm2]:
#   ampacity_a   : tabulated 3-phase current-carrying capacity [A]
#   mv_per_a_m   : voltage drop per ampere per metre [mV/A/m] (3-phase, line value)
# Copper (Cu) and aluminium (Al) reference tables.
CABLE_TABLES = {
    "copper": {
        # csa : (ampacity_a, mv_per_a_m)
        1.5:   (23, 25.0),
        2.5:   (31, 15.0),
        4:     (42, 9.5),
        6:     (54, 6.4),
        10:    (75, 3.8),
        16:    (100, 2.4),
        25:    (133, 1.5),
        35:    (164, 1.1),
        50:    (198, 0.81),
        70:    (253, 0.57),
        95:    (306, 0.42),
        120:   (354, 0.33),
        150:   (407, 0.27),
        185:   (464, 0.22),
        240:   (546, 0.18),
        300:   (628, 0.145),
        400:   (728, 0.115),
    },
    "aluminium": {
        16:    (78, 4.0),
        25:    (102, 2.5),
        35:    (126, 1.85),
        50:    (152, 1.35),
        70:    (194, 0.94),
        95:    (235, 0.68),
        120:   (271, 0.54),
        150:   (311, 0.44),
        185:   (354, 0.36),
        240:   (415, 0.29),
        300:   (477, 0.235),
        400:   (552, 0.185),
    },
}


def compute(payload: dict) -> dict:
    name = str(payload.get("cable_name", "main feeder"))

    conductor = str(payload.get("conductor", "copper")).strip().lower()
    if conductor not in CABLE_TABLES:
        raise ValueError(f"conductor must be one of {list(CABLE_TABLES)}; got {conductor!r}")
    table = CABLE_TABLES[conductor]

    phases = int(payload.get("phases", 3))
    if phases not in (1, 3):
        raise ValueError("phases must be 1 or 3")

    # ---- Design current I_b: given, OR derived from load + voltage ----
    if payload.get("design_current_a") is not None:
        i_b = float(payload["design_current_a"])
        ib_basis = "design current (given)"
    elif payload.get("load_kw") is not None:
        load_kw = float(payload["load_kw"])
        v = float(payload.get("voltage_v", 400.0))
        pf = float(payload.get("power_factor", 0.9))
        if not 0.0 < pf <= 1.0:
            raise ValueError("power_factor must be in (0, 1]")
        if v <= 0:
            raise ValueError("voltage_v must be > 0")
        if phases == 3:
            i_b = (load_kw * 1000.0) / (math.sqrt(3.0) * v * pf)
        else:
            i_b = (load_kw * 1000.0) / (v * pf)
        ib_basis = f"derived: {load_kw} kW / ({'sqrt(3) x ' if phases == 3 else ''}{v} V x {pf})"
    else:
        raise ValueError("provide design_current_a OR (load_kw + voltage_v)")
    if i_b <= 0:
        raise ValueError("design current resolves to <= 0 A")

    length_m = float(payload.get("length_m", 30.0))
    if length_m <= 0:
        raise ValueError("length_m must be > 0")

    v_nom = float(payload.get("nominal_voltage_v", payload.get("voltage_v", 400.0)))
    if v_nom <= 0:
        raise ValueError("nominal_voltage_v must be > 0")

    ca = float(payload.get("ambient_derate_ca", 1.0))
    cg = float(payload.get("grouping_derate_cg", 1.0))
    if not 0.1 <= ca <= 1.0 or not 0.1 <= cg <= 1.0:
        raise ValueError("ambient_derate_ca and grouping_derate_cg must be in [0.1, 1.0]")

    n_parallel = max(1, int(payload.get("n_parallel", 1)))
    max_vd_pct = float(payload.get("max_voltdrop_pct", 5.0))

    # ---- De-rated tabulated-current target ----
    derate = ca * cg
    i_t = i_b / derate                         # required tabulated current (single run)
    i_t_per_run = i_t / n_parallel             # per parallel conductor

    # ---- Select smallest standard CSA whose ampacity (x parallel) carries I_t ----
    selected_csa = None
    selected_ampacity = None
    selected_mv = None
    for csa in sorted(table.keys()):
        ampacity, mv = table[csa]
        if ampacity * n_parallel >= i_t - 1e-9:
            selected_csa = csa
            selected_ampacity = ampacity
            selected_mv = mv
            break
    if selected_csa is None:
        largest = max(table.keys())
        amp_largest = table[largest][0] * n_parallel
        raise ValueError(
            f"no standard {conductor} CSA carries the de-rated target {round(i_t, 1)} A "
            f"with {n_parallel} parallel run(s) (largest tabulated = {largest} mm2 -> "
            f"{round(amp_largest, 1)} A); increase n_parallel or improve de-rating"
        )

    # ---- Volt drop ----
    # Vd = (mV/A/m) x I_b x L / 1000, divided by parallel runs (current splits).
    vd_v = (selected_mv * i_b * length_m) / (1000.0 * n_parallel)
    vd_pct = 100.0 * vd_v / v_nom

    # ===================== worked[] — chained off rounded intermediates =========
    i_b_r = round(i_b, 2)
    i_t_r = round(i_t, 2)
    vd_v_r = round(vd_v, 3)
    vd_pct_r = round(vd_pct, 3)

    worked = [
        worked_calc(
            label="De-rated tabulated-current target",
            formula="I_t = I_b / (Ca x Cg)",
            values={"I_b": (i_b_r, "A"), "Ca": (ca, ""), "Cg": (cg, "")},
            result=i_t_r, result_unit="A",
            assumptions=[f"design current basis: {ib_basis}",
                         "Ca ambient + Cg grouping de-rating (BS 7671 Appendix 4)"],
        ),
        worked_calc(
            label="Conductor cross-sectional area (standard selection)",
            formula="CSA = smallest standard with ampacity x n_parallel >= I_t",
            values={"I_t": (i_t_r, "A"), "n_parallel": (n_parallel, "")},
            result=selected_csa, result_unit="mm2",
            assumptions=[
                f"{conductor}, 90 C thermosetting, Reference Method C (clipped direct)",
                f"selected CSA tabulated ampacity = {selected_ampacity} A "
                f"({'x ' + str(n_parallel) + ' parallel = ' + str(selected_ampacity * n_parallel) + ' A' if n_parallel > 1 else 'single run'})",
            ],
        ),
        worked_calc(
            label="Volt drop",
            formula="Vd = (mV/A/m) x I_b x L / (1000 x n_parallel)",
            values={"mV/A/m": (selected_mv, "mV/A/m"), "I_b": (i_b_r, "A"),
                    "L": (round(length_m, 1), "m"), "n_parallel": (n_parallel, "")},
            result=vd_v_r, result_unit="V",
            assumptions=[f"mV/A/m for {selected_csa} mm2 {conductor} (BS 7671 Appendix 4)"],
        ),
        worked_calc(
            label="Volt drop as percentage of nominal",
            formula="Vd_pct = 100 x Vd / U_nom",
            values={"Vd": (vd_v_r, "V"), "U_nom": (round(v_nom, 1), "V")},
            result=vd_pct_r, result_unit="%",
            assumptions=[f"BS 7671 §525 advisory ceiling {max_vd_pct}% "
                         f"({'within limit' if vd_pct <= max_vd_pct else 'EXCEEDS limit — upsize or add parallel runs'})"],
        ),
    ]

    return {
        "cable_name": name,
        "conductor": conductor,
        "phases": phases,
        "length_m": round(length_m, 2),
        "nominal_voltage_v": round(v_nom, 1),
        "ambient_derate_ca": ca,
        "grouping_derate_cg": cg,
        "n_parallel": n_parallel,
        "tabulated_current_target_a": round(i_t, 2),
        "selected_ampacity_a": selected_ampacity,
        "selected_ampacity_total_a": selected_ampacity * n_parallel,
        "mv_per_a_m": selected_mv,
        # Headline output quantities (names chosen to match the Electrical
        # Distribution module words — cable / feeder):
        "main_feeder_cable_csa_mm2": selected_csa,
        "feeder_design_current_a": round(i_b, 2),
        "cable_voltdrop_pct": round(vd_pct, 3),
        "voltdrop_within_limit": bool(vd_pct <= max_vd_pct),
        "worked": worked,
        "data_sources": [
            "BS 7671:2018+A2:2022 Appendix 4 — current-carrying capacity (Reference Method C) + voltage-drop mV/A/m tables",
            "IEC 60364-5-52 — selection and erection of wiring systems (ampacity basis)",
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
        out["_provenance"] = PROVENANCE
        out.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t, 3)
    except Exception as exc:  # noqa: BLE001 — surface any failure as structured error
        json.dump({"error": f"{type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(out, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
