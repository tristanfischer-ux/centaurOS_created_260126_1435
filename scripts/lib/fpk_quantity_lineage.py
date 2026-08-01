#!/usr/bin/env python3
"""fpk_quantity_lineage.py — F-PROC-2 revisioned quantity contract hashes.

INTENT (red-team F-PROC-2): FEMM / ISO / CFD / CAD / Excel must cite one
canonical quantity snapshot. Per-solver `source_state_sha256` alone diverges
as artefacts are restamped at different times. This module builds a stable
hash over the identity-critical quantity set and proves a mutated key fails.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import tempfile
from pathlib import Path
from typing import Any, Mapping, Optional

SCHEMA = "forgeos.fpk.quantity_lineage/v1"
OUTPUT_JSON = "fpk-quantity-lineage.json"

# Identity-critical keys that must stay coherent across EM / gears / oil / CAD.
CANONICAL_QUANTITY_KEYS: tuple[str, ...] = (
    "continuous_power_kw",
    "continuous_design_duty_kw",
    "front_regen_electrical_cap_kw",
    "max_rotor_speed_rpm",
    "dc_bus_voltage_v",
    "gear_ratio",
    "fpk_rotor_id_mm",
    "fpk_rotor_od_mm",
    "fpk_housing_od_mm",
    "fpk_housing_len_mm",
    "fpk_gear_face_mm",
    "gear_face_mm",
    "gear_module_mm",
    "fpk_planet_count",
    "planet_count",
    "gear_oil_volume_ml",
    "gear_oil_jet_nozzle_diameter_mm",
    "gear_oil_slosh_length_mm",
    "coolant_inlet_c",
    "coolant_flow_l_min",
)


def _qty_value(raw: Any) -> Any:
    if isinstance(raw, Mapping) and "value" in raw:
        return raw.get("value")
    return raw


def extract_canonical_quantities(state: Mapping[str, Any]) -> dict[str, Any]:
    """Pull identity-critical quantities from orchestratorContract."""

    oc = state.get("orchestratorContract")
    q = oc.get("quantities") if isinstance(oc, Mapping) else None
    if not isinstance(q, Mapping):
        return {}
    out: dict[str, Any] = {}
    for key in CANONICAL_QUANTITY_KEYS:
        if key not in q:
            continue
        val = _qty_value(q.get(key))
        if val is None:
            continue
        out[key] = val
    return out


def hash_canonical_quantities(quantities: Mapping[str, Any]) -> str:
    """Stable sha256 over sorted JSON of canonical quantities."""

    payload = json.dumps(quantities, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def collect_motor_stack_hashes(twin_dir: Path) -> dict[str, str]:
    """Read per-artefact source_state_sha256 for the digest table."""

    stack = twin_dir / "_motor_stack"
    out: dict[str, str] = {}
    if not stack.is_dir():
        return out
    for path in sorted(stack.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(data, dict):
            continue
        sha = data.get("source_state_sha256") or data.get("input_quantities_sha256")
        if isinstance(sha, str) and sha:
            out[path.name] = sha
    return out


def build_lineage(twin_dir: Path) -> dict[str, Any]:
    """Build the twin quantity-lineage register."""

    state_path = twin_dir / "state.json"
    state: dict[str, Any] = {}
    if state_path.is_file():
        try:
            loaded = json.loads(state_path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                state = loaded
        except (OSError, json.JSONDecodeError):
            state = {}
    canonical = extract_canonical_quantities(state)
    lineage_sha = hash_canonical_quantities(canonical) if canonical else ""
    stack_hashes = collect_motor_stack_hashes(twin_dir)
    unique_stack = sorted(set(stack_hashes.values()))
    return {
        "schema": SCHEMA,
        "twin": str(twin_dir),
        "ship_ok": False,
        "canonical_quantity_count": len(canonical),
        "canonical_quantities": canonical,
        "quantity_lineage_sha256": lineage_sha,
        "motor_stack_source_hashes": stack_hashes,
        "motor_stack_hash_unique_count": len(unique_stack),
        "note": (
            "Canonical quantity sha is the cross-domain identity lock. "
            "Per-solver source_state_sha256 may still diverge when artefacts "
            "were stamped at different times — restamp after quantity edits. "
            "ship_ok stays false."
        ),
        "proveCatch": {
            "has_canonical_keys": len(canonical) >= 8,
            "has_lineage_sha": len(lineage_sha) == 64,
        },
    }


def write_lineage(twin_dir: Path, register: Optional[Mapping[str, Any]] = None) -> Path:
    """Write lineage JSON onto the twin."""

    payload = dict(register or build_lineage(twin_dir))
    path = twin_dir / OUTPUT_JSON
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(path)
    return path


def selftest() -> int:
    """proveCatch: stable hash + mutation detection."""

    with tempfile.TemporaryDirectory(prefix="fpk-lineage-") as raw:
        twin = Path(raw)
        (twin / "_motor_stack").mkdir()
        state = {
            "orchestratorContract": {
                "quantities": {
                    "continuous_power_kw": {"value": 250.0},
                    "max_rotor_speed_rpm": {"value": 19500.0},
                    "gear_ratio": {"value": 8.0},
                    "fpk_rotor_id_mm": {"value": 130.5},
                    "fpk_rotor_od_mm": {"value": 197.1},
                    "fpk_gear_face_mm": {"value": 58.0},
                    "gear_module_mm": {"value": 1.0},
                    "planet_count": {"value": 4},
                    "gear_oil_volume_ml": {"value": 626.0},
                    "gear_oil_jet_nozzle_diameter_mm": {"value": 1.8},
                    "gear_oil_slosh_length_mm": {"value": 30.0},
                    "coolant_flow_l_min": {"value": 12.0},
                }
            }
        }
        (twin / "state.json").write_text(json.dumps(state), encoding="utf-8")
        (twin / "_motor_stack" / "em_fia_front_kit_case.json").write_text(
            json.dumps({"source_state_sha256": "aaa", "ship_ok": False}),
            encoding="utf-8",
        )
        reg = build_lineage(twin)
        sha1 = reg["quantity_lineage_sha256"]
        checks = {
            "has_sha": len(sha1) == 64,
            "canonical_count": reg["canonical_quantity_count"] >= 8,
            "proveCatch": all((reg.get("proveCatch") or {}).values()),
        }
        # Mutation must change the hash.
        state["orchestratorContract"]["quantities"]["gear_ratio"]["value"] = 9.0
        (twin / "state.json").write_text(json.dumps(state), encoding="utf-8")
        sha2 = build_lineage(twin)["quantity_lineage_sha256"]
        checks["mutation_changes_sha"] = sha1 != sha2
        write_lineage(twin, reg)
        checks["wrote"] = (twin / OUTPUT_JSON).is_file()
        if not all(checks.values()):
            print("FAIL", json.dumps(checks, indent=2))
            return 1
        print("fpk_quantity_lineage --selftest OK")
        print(json.dumps(checks, indent=2))
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--twin", type=Path)
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()
    if args.selftest:
        return selftest()
    if not args.twin:
        parser.error("--twin or --selftest required")
    path = write_lineage(args.twin)
    reg = json.loads(path.read_text(encoding="utf-8"))
    print(
        json.dumps(
            {
                "path": str(path),
                "quantity_lineage_sha256": reg.get("quantity_lineage_sha256"),
                "canonical_quantity_count": reg.get("canonical_quantity_count"),
                "motor_stack_hash_unique_count": reg.get(
                    "motor_stack_hash_unique_count"
                ),
                "ship_ok": False,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
