#!/usr/bin/env python3
"""Universal gate: every physics screen must describe ONE machine, and it must fit.

INTENT (2026-07-31 Tristan, "everything needs to be universal in fixes"): the FE
front twin was found holding TWO INCOMPATIBLE MACHINES across its own artefacts —

    rotor 197.1 / housing 251.8 : em duty case, MTPA, torque map, voltage-FW, oil
    rotor 122.0 / housing 176.7 : rotor structural, magnet pocket, DEMAG,
                                  water jacket, case mount

so the demagnetisation and rotor-strength screens were solved on a DIFFERENT
MOTOR from the torque screens, and their conclusions did not apply to each other.
Worse, the 197.1 mm rotor does not fit the front bay at all — it needs
rotor_od*1.42 = 279.9 mm of cross-section against an od_cap of 197.98 mm — so the
duty torque everyone was quoting belonged to a machine that cannot be installed.

NOTHING CAUGHT EITHER FAULT. Not the multiphysics stamp, not the ship gate, not
any screen: each artefact was internally consistent, and no rule compared them.
This module is that rule.

It is deliberately archetype-agnostic: it keys on the presence of geometry fields
in solver artefacts and on an envelope, never on a product class or a part name,
so any twin with physics screens and a stated envelope is covered.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Mapping, Optional

# Geometry fields a solver artefact may record, mapped to a canonical name.
# Any artefact that records one of these is claiming "I was solved on THIS
# machine", which is exactly what must agree across the twin.
GEOMETRY_ALIASES: dict[str, tuple[str, ...]] = {
    "rotor_od_mm": ("rotor_outer_diameter_mm", "rotor_od_mm", "fpk_rotor_od_mm"),
    "rotor_id_mm": ("rotor_inner_diameter_mm", "rotor_id_mm", "fpk_rotor_id_mm"),
    "stator_od_mm": ("stator_outer_diameter_mm", "stator_od_mm", "fpk_stator_od_mm"),
    "stator_id_mm": ("stator_inner_diameter_mm", "stator_id_mm", "fpk_stator_id_mm"),
    "housing_od_mm": ("housing_outer_diameter_mm", "housing_od_mm", "fpk_housing_od_mm"),
    "housing_len_mm": ("housing_length_mm", "housing_len_mm", "fpk_housing_len_mm"),
    "active_length_mm": ("active_length_mm", "stack_len_mm", "stack_length_mm"),
}

# Two artefacts disagree when a shared dimension differs by more than this.
# Tight enough to catch a real design divergence, loose enough for rounding.
AGREEMENT_TOL_MM = 0.75
AGREEMENT_TOL_FRAC = 0.01


@dataclass
class CoherenceFinding:
    code: str
    severity: str          # "HIGH" blocks; "MED" flags
    message: str
    detail: dict = field(default_factory=dict)


def _num(value: Any) -> Optional[float]:
    if isinstance(value, Mapping):
        value = value.get("value")
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return out if math.isfinite(out) and out > 0 else None


def extract_geometry(blob: Any) -> dict[str, float]:
    """Pull whatever canonical geometry an artefact records (recursively)."""
    found: dict[str, float] = {}

    def walk(node: Any) -> None:
        if isinstance(node, Mapping):
            for key, val in node.items():
                for canon, aliases in GEOMETRY_ALIASES.items():
                    if key in aliases and canon not in found:
                        parsed = _num(val)
                        if parsed is not None:
                            found[canon] = parsed
                walk(val)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(blob)
    return found


def _disagrees(a: float, b: float) -> bool:
    return abs(a - b) > max(AGREEMENT_TOL_MM, AGREEMENT_TOL_FRAC * max(a, b))


def check_envelope_fit(
    geometry: Mapping[str, float],
    envelope_mm: Mapping[str, float],
    *,
    radial_allowance: float = 1.42,
    cross_section_frac: float = 0.78,
) -> list[CoherenceFinding]:
    """A machine that cannot be installed is not a design. Universal, envelope-keyed.

    `radial_allowance` is the build the rotor needs beyond its own OD (jacket,
    shelf, wall); `cross_section_frac` is how much of the bay cross-section the
    machine may occupy. Both mirror the concentric-geometry derivation so the
    gate and the sizer cannot disagree — the exact failure mode that let a
    197.1 mm rotor be solved inside a bay that caps at 139.4 mm.
    """
    out: list[CoherenceFinding] = []
    d = _num(envelope_mm.get("d")) or _num(envelope_mm.get("depth"))
    h = _num(envelope_mm.get("h")) or _num(envelope_mm.get("height"))
    rotor_od = geometry.get("rotor_od_mm")
    if not (d and h and rotor_od):
        return out
    od_cap = min(d * 0.98, h * 0.96) * cross_section_frac
    needed = rotor_od * radial_allowance
    if needed > od_cap + 1e-9:
        out.append(CoherenceFinding(
            code="GEOMETRY_EXCEEDS_ENVELOPE",
            severity="HIGH",
            message=(
                f"rotor_od {rotor_od:.1f} mm needs {needed:.1f} mm of bay "
                f"cross-section but the envelope caps at {od_cap:.1f} mm — this "
                f"machine cannot be installed (bay max rotor "
                f"{od_cap / radial_allowance:.1f} mm)"),
            detail={"rotor_od_mm": rotor_od, "needed_mm": needed,
                    "od_cap_mm": od_cap,
                    "bay_max_rotor_od_mm": od_cap / radial_allowance},
        ))
    return out


def check_artefact_agreement(
    artefacts: Mapping[str, Mapping[str, float]],
    contract_geometry: Optional[Mapping[str, float]] = None,
) -> list[CoherenceFinding]:
    """Every artefact must describe the SAME machine (and the contract's machine)."""
    out: list[CoherenceFinding] = []
    by_field: dict[str, list[tuple[str, float]]] = {}
    for name, geom in artefacts.items():
        for canon, value in geom.items():
            by_field.setdefault(canon, []).append((name, value))

    for canon, entries in sorted(by_field.items()):
        values = [v for _n, v in entries]
        if len(values) < 2:
            continue
        lo, hi = min(values), max(values)
        if _disagrees(lo, hi):
            groups: dict[float, list[str]] = {}
            for name, value in entries:
                key = next((k for k in groups if not _disagrees(k, value)), value)
                groups.setdefault(key, []).append(name)
            out.append(CoherenceFinding(
                code="ARTEFACT_GEOMETRY_SPLIT",
                severity="HIGH",
                message=(
                    f"{canon} disagrees across solver artefacts "
                    f"({lo:.1f} vs {hi:.1f} mm) — screens solved on different "
                    "machines cannot be read against each other"),
                detail={"field": canon,
                        "groups": {str(round(k, 2)): sorted(v)
                                   for k, v in groups.items()}},
            ))

    if contract_geometry:
        for canon, expected in contract_geometry.items():
            for name, value in by_field.get(canon, []):
                if _disagrees(float(expected), float(value)):
                    out.append(CoherenceFinding(
                        code="ARTEFACT_VS_CONTRACT_DRIFT",
                        severity="HIGH",
                        message=(
                            f"{name} was solved on {canon}={value:.1f} mm but the "
                            f"contract derives {float(expected):.1f} mm — the "
                            "artefact describes a machine the design does not"),
                        detail={"artefact": name, "field": canon,
                                "artefact_value": value,
                                "contract_value": float(expected)},
                    ))
    return out


def evaluate_geometry_coherence(
    artefact_dir: Path | str,
    *,
    contract_geometry: Optional[Mapping[str, float]] = None,
    envelope_mm: Optional[Mapping[str, float]] = None,
) -> dict:
    """Read every solver artefact in a directory and check them against each other."""
    directory = Path(artefact_dir)
    artefacts: dict[str, dict[str, float]] = {}
    if directory.is_dir():
        for path in sorted(directory.glob("*.json")):
            try:
                blob = json.loads(path.read_text())
            except (ValueError, OSError):
                continue
            geom = extract_geometry(blob)
            if geom:
                artefacts[path.name] = geom
    findings = check_artefact_agreement(artefacts, contract_geometry)
    if envelope_mm and contract_geometry:
        findings.extend(check_envelope_fit(contract_geometry, envelope_mm))
    for geom in artefacts.values():
        if envelope_mm:
            findings.extend(check_envelope_fit(geom, envelope_mm))
    # De-duplicate identical envelope findings across artefacts.
    seen, unique = set(), []
    for f in findings:
        key = (f.code, f.message)
        if key not in seen:
            seen.add(key)
            unique.append(f)
    blocking = [f for f in unique if f.severity == "HIGH"]
    return {
        "schema": "forgeos.fpk.geometry_coherence/v1",
        "artefacts_scanned": len(artefacts),
        "findings": [
            {"code": f.code, "severity": f.severity, "message": f.message,
             "detail": f.detail} for f in unique
        ],
        "blocking_count": len(blocking),
        "ok": not blocking,
    }


def _selftest() -> None:
    """proveCatch: the REAL FE front split and the REAL over-size rotor must FIRE."""
    # ── The exact split found on the live twin (2026-07-31) ─────────────────
    live = {
        "em_fia_front_kit_case.json": {"rotor_od_mm": 197.1, "housing_od_mm": 251.8},
        "em_fia_mtpa_screen.json": {"rotor_od_mm": 197.1, "housing_od_mm": 251.8},
        "calculix_fia_rotor_screen.json": {"rotor_od_mm": 122.0, "housing_od_mm": 176.7},
        "em_fia_demag_screen.json": {"rotor_od_mm": 122.0, "housing_od_mm": 176.7},
    }
    split = check_artefact_agreement(live)
    assert any(f.code == "ARTEFACT_GEOMETRY_SPLIT" for f in split), (
        "the real two-machine split MUST fire — a demag screen solved on a "
        "different rotor than the torque case is not a design")
    codes = {f.code for f in split}
    assert all(f.severity == "HIGH" for f in split), split
    # It must name BOTH groups so the operator can see which screens to re-run.
    detail = next(f.detail for f in split if f.code == "ARTEFACT_GEOMETRY_SPLIT")
    assert len(detail["groups"]) == 2, detail
    assert any("demag" in n for g in detail["groups"].values() for n in g), detail

    # ── A coherent twin must PASS (no false positive) ───────────────────────
    coherent = {
        "a.json": {"rotor_od_mm": 139.4, "housing_od_mm": 198.0},
        "b.json": {"rotor_od_mm": 139.4, "housing_od_mm": 198.0},
        "c.json": {"rotor_od_mm": 139.42},          # rounding, not divergence
    }
    assert not check_artefact_agreement(coherent), (
        "rounding must not be reported as a split")

    # ── The REAL over-size rotor must fire against the REAL bay ─────────────
    bay = {"d": 259.0, "h": 267.0}
    too_big = check_envelope_fit({"rotor_od_mm": 197.1}, bay)
    assert any(f.code == "GEOMETRY_EXCEEDS_ENVELOPE" for f in too_big), (
        "a rotor that cannot be installed MUST fire")
    assert abs(too_big[0].detail["bay_max_rotor_od_mm"] - 139.42) < 0.1, too_big[0].detail
    # The bay-legal machine must PASS.
    assert not check_envelope_fit({"rotor_od_mm": 139.4}, bay), (
        "the bay-legal machine must not be flagged")
    # Exactly at the cap is legal.
    assert not check_envelope_fit({"rotor_od_mm": 139.42}, bay)

    # ── Contract drift: an artefact solved on a machine the design dropped ──
    drift = check_artefact_agreement(
        {"em.json": {"rotor_od_mm": 197.1}}, {"rotor_od_mm": 139.4})
    assert any(f.code == "ARTEFACT_VS_CONTRACT_DRIFT" for f in drift), drift

    # ── Universality: keys off fields + envelope, never a product class ─────
    assert "product_class" not in GEOMETRY_ALIASES
    assert extract_geometry({"deep": {"nest": {"rotor_outer_diameter_mm": 100.0}}}) == {
        "rotor_od_mm": 100.0}, "must find geometry at any depth"
    assert extract_geometry({"rotor_od_mm": {"value": 88.0}}) == {"rotor_od_mm": 88.0}, (
        "must accept the {value: …} quantity form")
    assert extract_geometry({"rotor_od_mm": -5}) == {}, "non-positive is not geometry"
    assert extract_geometry({}) == {}

    print(
        f"fpk_geometry_coherence _selftest: OK — real two-machine split FIRES "
        f"({len(split)} finding/s, codes={sorted(codes)}), 197.1 mm rotor rejected "
        f"against a 139.4 mm bay cap, coherent twin passes clean")


if __name__ == "__main__":
    _selftest()
