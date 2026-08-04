#!/usr/bin/env python3
"""Uplift parts-manifest with named FE kit hierarchy under provisional seeds.

Adds/replaces human-readable kit parts (motor, reducer, inverter, cap region,
cold plate, PCBs, HV, QDs, mounts, bay ghost) using Path B geometry + envelopes
+ provisional XYZ. Preserves existing detailed meshes as secondary rows.

Improves GA labelling without inventing chassis ICD authority.
"""
from __future__ import annotations

import argparse
import copy
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DEFAULT_TWIN = REPO / "out" / "formula-e-front-mgu-20260729-1432"


def _iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _part(
    tag: str,
    name: str,
    pos: list[float],
    dims: dict,
    *,
    shape: str = "box",
    module: str = "structure_containment",
    note: str = "",
) -> dict:
    return {
        "tag": tag,
        "equipment_tag": tag,
        "name": name,
        "module": module,
        "shape": shape,
        "qty": 1,
        "pos_mm": pos,
        "dims_mm": dims,
        "geometry_source": "kit_hierarchy_provisional_seeds",
        "signature_family": "traction_pack",
        "entity_type": "bom_component",
        "kit_hierarchy": True,
        "provisional_note": note or "under provisional partner seeds",
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path, default=DEFAULT_TWIN)
    args = ap.parse_args()
    twin = args.twin.resolve()
    ms = twin / "_motor_stack"
    man_path = twin / "parts-manifest.json"
    man = json.loads(man_path.read_text())
    bak = twin / f"parts-manifest.pre-kit-hierarchy-{_iso().replace(':','')}.json"
    shutil.copy2(man_path, bak)

    pb = json.loads((ms / "em_fia_front_kit_case_PATH_B_DEC009.json").read_text())
    env = json.loads((ms / "kit_assembly_envelopes_lite.json").read_text())
    seeds = json.loads((ms / "provisional_partner_seeds.json").read_text())
    gear = {}
    if (ms / "gear_topology_option_screen.json").is_file():
        gear = json.loads((ms / "gear_topology_option_screen.json").read_text())
    inv = json.loads((ms / "inverter_packaging_fia_front_kit_case.json").read_text())
    iq = inv.get("input_quantities") or {}
    geo = pb.get("machine_geometry") or {}

    bay = env.get("bay_mm") or {"w": 343.0, "d": 259.0, "h": 267.0}
    # Centre bay at origin for product-scale GA (match sealed enclosure convention)
    cx, cy, cz = 0.0, 0.0, bay["h"] / 2.0

    motor_od = float(geo.get("housing_outer_diameter_mm") or 198)
    motor_l = float(geo.get("housing_length_mm") or 140.5)
    mcu_w = float(iq.get("mcu_w_mm") or 235.3)
    mcu_d = float(iq.get("mcu_d_mm") or 139.6)
    mcu_h = float(iq.get("mcu_h_mm") or 28.0)

    # Gear envelope from topology hypothesis
    wh = (gear.get("working_hypothesis") or {}).get("selected_id") or ""
    if "EXTERNAL" in wh:
        g_od = float(
            next(
                (
                    o.get("envelope_od_mm")
                    for o in gear.get("options") or []
                    if o.get("id", "").startswith("OPT-C")
                ),
                120,
            )
        )
        g_len = float(
            next(
                (
                    o.get("envelope_length_mm")
                    for o in gear.get("options") or []
                    if o.get("id", "").startswith("OPT-C")
                ),
                90,
            )
        )
        gear_note = f"external planetary hypothesis {wh}"
        # place gear on -W side of motor
        gear_pos = [-(motor_l / 2 + 8 + g_len / 2), 0.0, cz]
        gear_dims = {"w": g_len, "d": g_od, "h": g_od, "dia": g_od, "len": g_len, "axis": "x"}
        gear_shape = "cylinder"
    else:
        gear_note = "reducer placeholder under bore-hold / enlarge hypothesis"
        gear_pos = [-(motor_l / 2 + 45), 0.0, cz]
        gear_dims = {"w": 90.0, "d": 80.0, "h": 70.0}
        gear_shape = "box"

    # Cap high envelope
    cap_hi = next(
        (p for p in env.get("parts") or [] if p.get("id") == "dc_link_cap_region_high"),
        {"mm": [100.0, 60.0, 40.0]},
    )
    cap_mm = cap_hi.get("mm") or [100.0, 60.0, 40.0]

    # Ports from seeds
    iface = {}
    for s in seeds.get("seeds") or []:
        if s.get("id") == "S-IFACE-XYZ":
            iface = (s.get("value") or {}) if isinstance(s.get("value"), dict) else {}
            break
    ports = iface.get("ports") or []

    def bay_local_to_centre(xyz):
        # seeds: origin min-corner W,D,H → centre-based product frame
        w, d, h = xyz
        return [w - bay["w"] / 2, d - bay["d"] / 2, h]

    kit_parts = [
        _part(
            "BAY",
            f"Bay envelope ghost {bay['w']:.0f}×{bay['d']:.0f}×{bay['h']:.0f} mm",
            [cx, cy, cz],
            {"w": bay["w"], "d": bay["d"], "h": bay["h"]},
            module="structure_containment",
            note="ghost only",
        ),
        _part(
            "MOTOR",
            f"IPM motor housing Ø{motor_od:.0f}×L{motor_l:.0f} Path B",
            [motor_l * 0.1, 0.0, cz],
            {
                "w": motor_l,
                "d": motor_od,
                "h": motor_od,
                "dia": motor_od,
                "len": motor_l,
                "axis": "x",
            },
            shape="cylinder",
            module="energy_conversion_transduction",
            note="PATH_B_GEOMETRY",
        ),
        _part(
            "GEAR",
            f"Reducer / gearbox ({gear_note})",
            gear_pos,
            gear_dims,
            shape=gear_shape,
            module="actuation_kinematics",
            note=gear_note,
        ),
        _part(
            "INVERTER",
            f"SiC inverter MCU {mcu_w:.0f}×{mcu_d:.0f}×{mcu_h:.0f} mm",
            [bay["w"] * 0.15, bay["d"] * 0.05, cz + 40],
            {"w": mcu_w, "d": mcu_d, "h": mcu_h},
            module="energy_conversion_transduction",
            note="packaging screen",
        ),
        _part(
            "COLDPLATE",
            "Inverter cold plate land",
            [bay["w"] * 0.15, bay["d"] * 0.05, cz + 20],
            {"w": mcu_w, "d": mcu_d, "h": 12.0},
            module="environmental_interface",
            note="seed thickness 12 mm",
        ),
        _part(
            "DCLINK",
            f"DC-link capacitor region HIGH ~{cap_mm[0]:.0f}×{cap_mm[1]:.0f}×{cap_mm[2]:.0f} (no MPN)",
            [bay["w"] * 0.12, -bay["d"] * 0.15, cz + 70],
            {"w": cap_mm[0], "d": cap_mm[1], "h": cap_mm[2]},
            module="power_distribution",
            note="CONCEPT_ENVELOPE assumed aspect",
        ),
        _part(
            "PCB-GD",
            "Gate-drive PCB draft NOT_FAB",
            [bay["w"] * 0.20, bay["d"] * 0.25, cz + 90],
            {"w": 120.0, "d": 90.0, "h": 2.0},
            module="control_compute_communication",
            note="NOT_FAB",
        ),
        _part(
            "PCB-CTRL",
            "Control PCB draft NOT_FAB",
            [bay["w"] * 0.18, -bay["d"] * 0.25, cz + 90],
            {"w": 100.0, "d": 80.0, "h": 2.0},
            module="control_compute_communication",
            note="NOT_FAB",
        ),
    ]

    # map ports
    tag_map = {
        "HV_DC_IN": ("HV", "HV DC connector class"),
        "COOLANT_IN": ("QD-IN", "Coolant QD inlet"),
        "COOLANT_OUT": ("QD-OUT", "Coolant QD outlet"),
        "LV_CAN": ("LV", "LV/CAN connector"),
        "HALFSHAFT_L": ("SHAFT", "Halfshaft / output class"),
        "MOUNT_A": ("MNT-A", "Bay mount A"),
        "MOUNT_B": ("MNT-B", "Bay mount B"),
        "MOUNT_C": ("MNT-C", "Bay mount C"),
        "MOUNT_D": ("MNT-D", "Bay mount D"),
    }
    for port in ports:
        pid = port.get("id")
        if pid not in tag_map or pid == "HALFSHAFT_R":
            continue
        tag, label = tag_map[pid]
        xyz = bay_local_to_centre(port.get("xyz_mm") or [0, 0, 0])
        if pid.startswith("MOUNT"):
            dims = {"w": 25.0, "d": 25.0, "h": 15.0}
        elif pid.startswith("COOLANT"):
            dims = {"w": 28.0, "d": 28.0, "h": 40.0, "dia": 28.0, "len": 40.0, "axis": "z"}
        elif pid == "HV_DC_IN":
            dims = {"w": 40.0, "d": 35.0, "h": 45.0}
        else:
            dims = {"w": 30.0, "d": 30.0, "h": 25.0}
        kit_parts.append(
            _part(
                tag,
                f"{label} (provisional XYZ)",
                xyz,
                dims,
                shape="cylinder" if "dia" in dims else "box",
                module="environmental_interface",
                note="S-IFACE-XYZ provisional — not chassis ICD",
            )
        )

    # Keep prior parts that are not kit hierarchy tags, but demote names
    old = man.get("parts") or []
    kit_tags = {p["tag"] for p in kit_parts}
    retained = []
    for p in old:
        t = p.get("tag") or ""
        if t in kit_tags:
            continue
        # keep internal morphology with prefix
        p2 = copy.deepcopy(p)
        if not str(p2.get("name", "")).startswith("["):
            p2["name"] = f"[detail] {p2.get('name', t)}"
        p2["kit_hierarchy"] = False
        retained.append(p2)

    new_parts = kit_parts + retained
    # bbox from bay
    man["parts"] = new_parts
    man["count"] = len(new_parts)
    man["bbox_mm"] = {
        "x_min_mm": -bay["w"] / 2,
        "x_max_mm": bay["w"] / 2,
        "y_min_mm": -bay["d"] / 2,
        "y_max_mm": bay["d"] / 2,
        "z_min_mm": 0.0,
        "z_max_mm": bay["h"],
        "length_mm": bay["w"],
        "width_mm": bay["d"],
        "height_mm": bay["h"],
    }
    man["kit_hierarchy_uplift"] = {
        "ran_at": _iso(),
        "backup": str(bak.name),
        "kit_part_count": len(kit_parts),
        "retained_detail_count": len(retained),
        "gear_hypothesis": wh if (gear.get("working_hypothesis")) else None,
        "ship_ok": False,
        "note": "Provisional kit hierarchy for GA/Blender under partner seeds",
    }
    man_path.write_text(json.dumps(man, indent=2) + "\n")
    print(
        json.dumps(
            {
                "wrote": str(man_path),
                "backup": str(bak),
                "kit_parts": len(kit_parts),
                "total": len(new_parts),
                "ship_ok": False,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
