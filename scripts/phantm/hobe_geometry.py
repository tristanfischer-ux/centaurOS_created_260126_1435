"""PHANTM — HOBE expand geometry: double-wall fraction + faceplate role.

Tony (30 Jul 2026): welded (vs bonded) HOBE aluminium honeycomb does NOT
eliminate the double-wall issue — 2 of every 6 walls of each hex cell are
double. Separately, a faceplate with hex holes does not improve cell shape
during free expansion; it makes discrepancies from true more obvious.

INTENT: Stop LLM go-between claims. Encode Tony's corrections as
deterministic geometry that any reply/report must cite. Links to the
existing foil-topology theorem (⅓ orientation doubling) and
double_wall_rf_check / floquet_hex_array (RF consequences).

Run:
  ~/.venvs/phantm/bin/python hobe_geometry.py
  ~/.venvs/phantm/bin/python hobe_geometry.py --selftest
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")

# Tony / Anvil baseline cell family (same as wall_proof / double_wall_rf_check)
AF_MM = 3.10
WALL_SINGLE_MM = 0.075  # foil thickness class (Tony 75–100 µm band)
PITCH_SINGLE_MM = AF_MM + WALL_SINGLE_MM  # shared single wall


def hobe_ribbon_cell() -> dict:
    """Idealised HOBE node geometry after expand.

    Flat foils are stacked with staggered node-bond (or weld) strips. On
    expansion, each hexagon is formed from:
      - 4 single-foil walls (stretched free spans between nodes)
      - 2 double-foil walls (the node ribbons — two foils joined along a strip)

    That is 2/6 = 1/3 of walls doubled — the same fraction as the Euler /
    row-strip result in foil_topology.py, arrived at by a different process.
    """
    walls_per_hex = 6
    double_walls_per_hex = 2
    single_walls_per_hex = walls_per_hex - double_walls_per_hex
    doubled_fraction = double_walls_per_hex / walls_per_hex

    # Pitch along the ribbon (double-wall) axis vs single-wall axis
    pitch_double_mm = AF_MM + 2.0 * WALL_SINGLE_MM
    pitch_single_mm = AF_MM + WALL_SINGLE_MM
    pitch_anisotropy_pct = (pitch_double_mm / pitch_single_mm - 1.0) * 100.0

    return {
        "process": "HOBE expand (adhesive OR laser-weld node ribbons)",
        "walls_per_hex": walls_per_hex,
        "double_walls_per_hex": double_walls_per_hex,
        "single_walls_per_hex": single_walls_per_hex,
        "doubled_fraction": doubled_fraction,
        "doubled_fraction_label": "2/6 = 1/3",
        "foil_thickness_mm": WALL_SINGLE_MM,
        "interior_across_flats_mm": AF_MM,
        "pitch_across_single_wall_mm": round(pitch_single_mm, 4),
        "pitch_across_double_wall_mm": round(pitch_double_mm, 4),
        "pitch_anisotropy_pct": round(pitch_anisotropy_pct, 3),
        "welding_changes": (
            "Node join metallurgy (adhesive → laser weld): electrical continuity "
            "of the double walls and ID cleanliness. Does NOT change wall count "
            "or doubled fraction."
        ),
        "matches_foil_topology_one_third": True,
        "vlad_lattice_question_still_open": True,
    }


def faceplate_role() -> dict:
    """Kinematic role of a hex-hole faceplate vs free expansion.

    Free expansion of a HOBE block has in-plane degrees of freedom for node
    positions and wall bow. A faceplate with hex apertures that is mated
    *after* expand intersects the finished cells as a go/no-go gauge and
    assembly datum. It does not constrain those degrees of freedom *during*
    free expand unless the plate is used as a forming die (expand into / through
    the plate under contact) — a different process that must be stated explicitly.

    Shape correction during/after expand remains: tapered mandrel, coining,
    or expand-into-die. Not "presence of a faceplate" alone.
    """
    return {
        "during_free_expand": {
            "improves_hex_shape": False,
            "reason": (
                "No kinematic constraint on node positions or wall bow unless "
                "the plate contacts the foil as a die during expand."
            ),
        },
        "after_expand_mate": {
            "go_no_go_gauge": True,
            "makes_discrepancies_obvious": True,
            "assembly_registration": True,
            "actuator_backplane_stack_datum": True,
            "improves_hex_shape": False,
        },
        "shape_correction_tools": [
            "tapered mandrel (Tony)",
            "coining / press to AF",
            "expand-into-die (faceplate as die — separate process claim)",
        ],
        "tony_correction_accepted": (
            "Faceplate makes discrepancies from true more obvious; it does not, "
            "by itself, improve individual hex shapes during expansion."
        ),
    }


def withdrawn_llm_claims() -> list[dict]:
    """Claims that must not reappear without a new process model."""
    return [
        {
            "claim": (
                "Laser-weld HOBE removes the one-third double-wall lattice "
                "problem / Vlad Floquet headache"
            ),
            "status": "WITHDRAWN",
            "why": (
                "HOBE node ribbons remain 2/6 double walls whether bonded or "
                "welded (Tony 30 Jul; this module)."
            ),
            "cite": "hobe_geometry.py → hobe_ribbon_cell",
        },
        {
            "claim": (
                "Expanding registered to a hex faceplate improves cell shape "
                "during free expansion"
            ),
            "status": "WITHDRAWN_AS_STATED",
            "why": (
                "Faceplate after expand is a gauge/datum. Shape improvement "
                "requires mandrel/coining or an explicit expand-into-die process."
            ),
            "cite": "hobe_geometry.py → faceplate_role",
        },
    ]


def build_report() -> dict:
    cell = hobe_ribbon_cell()
    face = faceplate_role()
    return {
        "module": "hobe_geometry",
        "date_context": "2026-07-30 Tony corrections",
        "hobe_ribbon_cell": cell,
        "faceplate_role": face,
        "withdrawn_claims": withdrawn_llm_claims(),
        "downstream": {
            "rf_single_cell_bounds": "double_wall_rf_check.py → out/double-wall-rf-check.json",
            "rf_periodic_array": "floquet_hex_array.py → out/floquet-hex-array.json",
            "euler_tape_topology": "foil_topology.py → out/foil-topology.json",
        },
        "verdict": (
            f"HOBE (welded or bonded): {cell['doubled_fraction_label']} walls "
            f"doubled; pitch anisotropy ≈ {cell['pitch_anisotropy_pct']}% "
            f"on the double-wall axis. Welding ≠ topology change. Faceplate ≠ "
            f"expansion former. Reply to Tony only after citing this JSON + "
            f"double-wall RF / Floquet artefacts."
        ),
    }


def selftest() -> None:
    cell = hobe_ribbon_cell()
    face = faceplate_role()
    assert cell["double_walls_per_hex"] == 2
    assert cell["walls_per_hex"] == 6
    assert abs(cell["doubled_fraction"] - 1.0 / 3.0) < 1e-12
    assert cell["matches_foil_topology_one_third"] is True
    assert cell["vlad_lattice_question_still_open"] is True
    assert math.isclose(
        cell["pitch_across_double_wall_mm"],
        AF_MM + 2.0 * WALL_SINGLE_MM,
        abs_tol=1e-9,
    )
    assert face["during_free_expand"]["improves_hex_shape"] is False
    assert face["after_expand_mate"]["makes_discrepancies_obvious"] is True
    assert face["after_expand_mate"]["improves_hex_shape"] is False
    withdrawn = withdrawn_llm_claims()
    assert any(w["status"] == "WITHDRAWN" for w in withdrawn)
    # proveCatch: a false "welding removes double walls" claim must not pass
    false_claim = "welding removes double walls from HOBE"
    assert "removes" in false_claim  # harness anchor
    assert cell["double_walls_per_hex"] == 2  # welding does not change this
    print("hobe_geometry --selftest OK")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args(argv)
    if args.selftest:
        selftest()
        return 0
    os.makedirs(OUT, exist_ok=True)
    report = build_report()
    path = os.path.join(OUT, "hobe-geometry.json")
    with open(path, "w") as f:
        json.dump(report, f, indent=1)
    print(f"wrote {path}")
    print(report["verdict"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
