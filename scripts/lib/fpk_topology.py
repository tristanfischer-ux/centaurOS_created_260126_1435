#!/usr/bin/env python3
"""Front-FPK principal topology freeze with honest bay-relative routing.

INTENT: make the electrical, coolant, and control paths explicit without
turning concept-form mesh anchors into supplier/FIA interface coordinates.
External endpoints therefore remain OPEN until the chassis ICD is supplied.

Run:
  python3 scripts/lib/fpk_topology.py --selftest
  python3 scripts/lib/fpk_topology.py --stamp out/formula-e-front-mgu-20260729-1432
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

from fpk_concentric_geometry import FpkConcentricGeometry, geometry_from_quantities


SCHEMA = "fpk-topology/1"
FRAME = "front_fpk_bay"
SOURCE = "scripts/lib/fpk_topology.py"

# DECISION: retain the 17-edge Phase-T acceptance floor while expanding
# compound interfaces into their physical channels (resolver excite/sin/cos,
# three winding sensors, and separate LV power/CAN paths).
REQUIRED_EDGE_IDS = (
    "HV_DC_POS",
    "HV_DC_NEG",
    "AC_PHASE_U",
    "AC_PHASE_V",
    "AC_PHASE_W",
    "COOLANT_IN",
    "COOLANT_MCU_TO_MOTOR",
    "COOLANT_OUT",
    "LV_POWER",
    "CAN_FD",
    "RESOLVER_EXCITE",
    "RESOLVER_SIN",
    "RESOLVER_COS",
    "TEMP_WINDING_U",
    "TEMP_WINDING_V",
    "TEMP_WINDING_W",
    "TEMP_INVERTER",
)

CRITICAL_EDGE_IDS = frozenset(("HV_DC_NEG", "COOLANT_IN"))
EXTERNAL_EDGE_IDS = frozenset(
    ("HV_DC_POS", "HV_DC_NEG", "COOLANT_IN", "COOLANT_OUT", "LV_POWER", "CAN_FD")
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _quantities(state: Mapping[str, Any]) -> Mapping[str, Any]:
    for key in ("orchestratorContract", "engineeringContract"):
        contract = state.get(key)
        if isinstance(contract, Mapping):
            quantities = contract.get("quantities")
            if isinstance(quantities, Mapping) and quantities:
                return quantities
    raise ValueError("FPK topology requires contract quantities")


def _node_ids(state: Mapping[str, Any]) -> set[str]:
    tree = state.get("fpkPhysicsTree")
    if not isinstance(tree, Mapping):
        return set()
    part_index = tree.get("part_index")
    if not isinstance(part_index, list):
        return set()
    return {
        str(item.get("id"))
        for item in part_index
        if isinstance(item, Mapping) and item.get("id")
    }


def _point(
    geometry: FpkConcentricGeometry,
    x_from_center: float,
    y_from_center: float,
    z_from_floor: float,
    anchor: str,
) -> dict[str, Any]:
    """Convert deterministic form geometry to a dimensionless bay anchor."""
    return {
        "anchor": anchor,
        "uvw": [
            round(0.5 + x_from_center / geometry.case_w_mm, 6),
            round(0.5 + y_from_center / geometry.case_d_mm, 6),
            round(z_from_floor / geometry.case_h_mm, 6),
        ],
        "authority": "CONCEPT_FORM_GEOMETRY_NOT_FIA",
    }


def _anchors(geometry: FpkConcentricGeometry) -> dict[str, dict[str, Any]]:
    """Mirror the concentric Blender placement equations in bay-relative form."""
    base_h = max(10.0, geometry.wall_mm)
    motor_y = geometry.case_d_mm * 0.02
    motor_z = base_h + geometry.housing_od_mm * 0.52
    shelf_z = motor_z + geometry.housing_od_mm * 0.48 + geometry.shelf_h_mm * 0.5
    inverter_z = shelf_z + geometry.shelf_h_mm * 0.5 + geometry.mcu_h_mm * 0.55
    coolant_y = motor_y - geometry.housing_od_mm * 0.48 - 16.0
    coolant_z = motor_z + geometry.housing_od_mm * 0.08

    motor = _point(geometry, 0.0, motor_y, motor_z, "motor_axis")
    inverter = _point(geometry, 0.0, motor_y, inverter_z, "mcu_center")
    control = _point(geometry, 0.0, motor_y, inverter_z, "control_board_locus")
    return {
        "motor": motor,
        "inverter": inverter,
        "control": control,
        "ac_pierce": {
            "anchor": "mcu_to_stator_pierce",
            "uvw": [
                round((inverter["uvw"][0] + motor["uvw"][0]) / 2.0, 6),
                round((inverter["uvw"][1] + motor["uvw"][1]) / 2.0, 6),
                round((inverter["uvw"][2] + motor["uvw"][2]) / 2.0, 6),
            ],
            "authority": "CONCEPT_FORM_GEOMETRY_NOT_FIA",
        },
        "cold_plate": _point(
            geometry,
            0.0,
            motor_y,
            inverter_z + geometry.mcu_h_mm * 0.5 + 2.0,
            "mcu_cold_plate_locus",
        ),
        "coolant_in": _point(
            geometry,
            -24.0,
            coolant_y,
            coolant_z,
            "coolant_in_concept_mesh",
        ),
        "coolant_out": _point(
            geometry,
            24.0,
            coolant_y,
            coolant_z,
            "coolant_out_concept_mesh",
        ),
        "hv_connector": _point(
            geometry,
            -geometry.mcu_w_mm * 0.32,
            motor_y - geometry.mcu_d_mm * 0.55,
            inverter_z,
            "hv_connector_concept_mesh",
        ),
        "lv_connector": _point(
            geometry,
            geometry.mcu_w_mm * 0.32,
            motor_y - geometry.mcu_d_mm * 0.55,
            inverter_z,
            "lv_connector_concept_locus",
        ),
        "resolver": _point(
            geometry,
            geometry.housing_len_mm * 0.45,
            motor_y,
            motor_z,
            "resolver_motor_end_locus",
        ),
    }


def _edge_specs() -> list[dict[str, Any]]:
    return [
        {
            "id": "HV_DC_POS",
            "label": "HV DC+",
            "domain": "electrical_hv",
            "from": "chassis_hv_dc_positive",
            "to": "dc_bus_plus",
            "via": ("hv_dc_connector",),
            "anchors": ("hv_connector", "inverter"),
        },
        {
            "id": "HV_DC_NEG",
            "label": "HV DC−",
            "domain": "electrical_hv",
            "from": "chassis_hv_dc_negative",
            "to": "dc_bus_minus",
            "via": ("hv_dc_connector",),
            "anchors": ("hv_connector", "inverter"),
        },
        *[
            {
                "id": f"AC_PHASE_{phase.upper()}",
                "label": f"AC phase {phase.upper()} pierce",
                "domain": "electrical_ac",
                "from": f"sic_half_bridge_{index}",
                "to": f"phase_coil_{phase}",
                "via": (f"ac_bus_{phase}",),
                "anchors": ("inverter", "ac_pierce", "motor"),
            }
            for index, phase in enumerate(("u", "v", "w"), start=1)
        ],
        {
            "id": "COOLANT_IN",
            "label": "Coolant inlet",
            "domain": "fluid_thermal",
            "from": "chassis_coolant_supply",
            "to": "mcu_cold_plate",
            "via": ("coolant_port_in",),
            "anchors": ("coolant_in", "cold_plate"),
        },
        {
            "id": "COOLANT_MCU_TO_MOTOR",
            "label": "MCU cold plate to motor jacket",
            "domain": "fluid_thermal",
            "from": "mcu_cold_plate",
            "to": "motor_cooling_jacket",
            "via": (),
            "anchors": ("cold_plate", "motor"),
        },
        {
            "id": "COOLANT_OUT",
            "label": "Coolant outlet",
            "domain": "fluid_thermal",
            "from": "motor_cooling_jacket",
            "to": "chassis_coolant_return",
            "via": ("coolant_port_out",),
            "anchors": ("motor", "coolant_out"),
        },
        {
            "id": "LV_POWER",
            "label": "LV power",
            "domain": "electrical_lv",
            "from": "chassis_lv_supply",
            "to": "lv_buck_rails",
            "via": ("lv_signal_connector",),
            "anchors": ("lv_connector", "control"),
        },
        {
            "id": "CAN_FD",
            "label": "Vehicle CAN-FD",
            "domain": "signal_differential",
            "from": "chassis_can_fd",
            "to": "can_fd_transceiver",
            "via": ("lv_signal_connector",),
            "anchors": ("lv_connector", "control"),
        },
        *[
            {
                "id": f"RESOLVER_{channel}",
                "label": f"Resolver {channel.lower()} channel",
                "domain": "signal_resolver",
                "from": "resolver",
                "to": "resolver_excitation_demod",
                "via": (),
                "anchors": ("resolver", "control"),
            }
            for channel in ("EXCITE", "SIN", "COS")
        ],
        *[
            {
                "id": f"TEMP_WINDING_{phase.upper()}",
                "label": f"Winding temperature {phase.upper()}",
                "domain": "signal_temperature",
                "from": f"winding_ntc_{index}",
                "to": "oem_inverter_control_board",
                "via": (),
                "anchors": ("motor", "control"),
            }
            for index, phase in enumerate(("u", "v", "w"), start=1)
        ],
        {
            "id": "TEMP_INVERTER",
            "label": "Inverter temperature",
            "domain": "signal_temperature",
            "from": "inverter_module_ntc",
            "to": "oem_inverter_control_board",
            "via": (),
            "anchors": ("inverter", "control"),
        },
    ]


def _make_edge(
    spec: Mapping[str, Any],
    anchors: Mapping[str, dict[str, Any]],
    node_ids: set[str],
) -> dict[str, Any]:
    edge_id = str(spec["id"])
    required_nodes = (str(spec["from"]), *tuple(spec["via"]), str(spec["to"]))
    is_external = edge_id in EXTERNAL_EDGE_IDS
    missing_nodes = sorted(
        node_id
        for node_id in required_nodes
        if not node_id.startswith("chassis_") and node_id not in node_ids
    )
    is_routed = not is_external and not missing_nodes
    if is_external:
        status = "OPEN_INTERFACE_ICD"
    elif missing_nodes:
        status = "OPEN_SOURCE_NODE"
    else:
        status = "ROUTED_BAY_RELATIVE"

    points = [copy.deepcopy(anchors[str(key)]) for key in spec["anchors"]]
    bay_relative: dict[str, Any] = {"waypoints": points}
    if is_external:
        bay_relative["external_endpoint"] = None
        bay_relative["internal_endpoint"] = points[-1]
    else:
        bay_relative["source_endpoint"] = points[0]
        bay_relative["destination_endpoint"] = points[-1]

    return {
        "id": edge_id,
        "label": spec["label"],
        "domain": spec["domain"],
        "from_part": spec["from"],
        "to_part": spec["to"],
        "via": list(spec["via"]),
        "required": True,
        "routed": is_routed,
        "route": {
            "frame": FRAME,
            "status": status,
            "bay_relative": bay_relative,
            "missing_source_nodes": missing_nodes,
            "note": (
                "External endpoint OPEN until supplier/chassis ICD; concept mesh "
                "anchor is not an FIA port coordinate."
                if is_external
                else "Route joins state physics nodes through concentric form anchors."
            ),
        },
    }


def _revision_hash(frame: Mapping[str, Any], edges: Sequence[Mapping[str, Any]]) -> str:
    payload = {
        "schema": SCHEMA,
        "frame": frame,
        "required_edge_ids": REQUIRED_EDGE_IDS,
        "edges": edges,
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def build_fpk_topology(state: Mapping[str, Any]) -> dict[str, Any]:
    """Build the frozen principal topology from state geometry and physics nodes."""
    quantities = _quantities(state)
    geometry = geometry_from_quantities(quantities)
    anchors = _anchors(geometry)
    nodes = _node_ids(state)
    edges = [_make_edge(spec, anchors, nodes) for spec in _edge_specs()]
    routed_count = sum(1 for edge in edges if edge["routed"])
    frame = {
        "id": FRAME,
        "coordinate_system": "dimensionless_uvw_0_to_1",
        "u_axis": "vehicle_lateral",
        "v_axis": "vehicle_longitudinal",
        "w_axis": "bay_floor_to_crown",
        "geometry_source": (
            "state.fpkConcentricGeometry + orchestratorContract.quantities"
            if isinstance(state.get("fpkConcentricGeometry"), Mapping)
            else "scripts/lib/fpk_concentric_geometry.py from contract quantities"
        ),
    }
    topology = {
        "schema": SCHEMA,
        "source": SOURCE,
        "required_count": len(REQUIRED_EDGE_IDS),
        "routed_count": routed_count,
        "unrouted_count": len(REQUIRED_EDGE_IDS) - routed_count,
        "frame": frame,
        "edges": edges,
        "claims": {
            "fia_port_xyz": False,
            "homologated": False,
            "bay_relative_concept_routes": True,
        },
        "race_hold": {
            "id": "RACE-TOPOLOGY-COMPLETE",
            "status": "OPEN",
            "note": (
                f"{routed_count}/{len(REQUIRED_EDGE_IDS)} principal edges routed; "
                "external ICD endpoints and/or source sensor nodes remain OPEN."
            ),
        },
    }
    topology["rev_hash"] = _revision_hash(frame, edges)
    return topology


def evaluate_topology(edges: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Evaluate required-edge presence separately from route completeness."""
    by_id = {str(edge.get("id")): edge for edge in edges if isinstance(edge, Mapping)}
    missing = sorted(set(REQUIRED_EDGE_IDS) - set(by_id))
    unrouted = sorted(
        edge_id
        for edge_id in REQUIRED_EDGE_IDS
        if edge_id in by_id and by_id[edge_id].get("routed") is not True
    )
    critical_missing = sorted(CRITICAL_EDGE_IDS.intersection(missing))
    return {
        "ok": not missing and not unrouted,
        "fires": bool(critical_missing),
        "reason": (
            "Missing critical edge(s): " + ", ".join(critical_missing)
            if critical_missing
            else "Topology incomplete" if missing or unrouted else "All principal edges routed"
        ),
        "missing_required_edges": missing,
        "unrouted_required_edges": unrouted,
        "critical_missing_edges": critical_missing,
    }


def prove_catch(topology: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """Demonstrate that deleting HV DC− or coolant-in fires the critical gate."""
    if topology is None:
        topology = build_fpk_topology(_selftest_state())
    edges = topology.get("edges")
    if not isinstance(edges, list):
        raise ValueError("prove_catch requires topology.edges")

    verdicts: dict[str, Any] = {}
    for edge_id, result_key in (
        ("HV_DC_NEG", "missing_hv_dc_neg"),
        ("COOLANT_IN", "missing_coolant_in"),
    ):
        adversarial = [copy.deepcopy(edge) for edge in edges if edge.get("id") != edge_id]
        verdict = evaluate_topology(adversarial)
        verdicts[result_key] = {
            "fired": verdict["fires"] and edge_id in verdict["critical_missing_edges"],
            "details": verdict,
        }
    return {
        "ok": all(item["fired"] for item in verdicts.values()),
        **verdicts,
    }


def render_topology_markdown(topology: Mapping[str, Any], catch: Mapping[str, Any]) -> str:
    """Render the human-readable topology freeze report."""
    lines = [
        "# JLR FE Front FPK — Phase T topology freeze",
        "",
        f"**Revision:** `{topology['rev_hash']}`  ",
        f"**Routed:** **{topology['routed_count']} / {topology['required_count']}**  ",
        "**RACE-TOPOLOGY-COMPLETE:** **OPEN**",
        "",
        "Bay-relative `u/v/w` anchors are concept-form geometry derived from "
        "`fpk_concentric_geometry` and state. They are **not FIA port millimetres**. "
        "External connector/port endpoints remain `OPEN_INTERFACE_ICD`.",
        "",
        "## Principal edges",
        "",
        "| Edge | Path | Status |",
        "|---|---|---|",
    ]
    for edge in topology["edges"]:
        via = " → ".join(edge["via"])
        path = f"`{edge['from_part']}` → "
        if via:
            path += f"`{via}` → "
        path += f"`{edge['to_part']}`"
        lines.append(
            f"| `{edge['id']}` — {edge['label']} | {path} | "
            f"`{edge['route']['status']}` |"
        )
    lines.extend(
        [
            "",
            "## proveCatch",
            "",
            f"- Remove `HV_DC_NEG`: **{'FIRES' if catch['missing_hv_dc_neg']['fired'] else 'MISSED'}**",
            f"- Remove `COOLANT_IN`: **{'FIRES' if catch['missing_coolant_in']['fired'] else 'MISSED'}**",
            "",
            "## Honest residuals",
            "",
            "- Exact FIA/chassis port coordinates are not claimed.",
            "- External HV, coolant, LV, and CAN endpoints remain open pending the supplier/chassis ICD.",
            "- Temperature routes remain open until their sensor nodes exist in the stamped physics tree.",
            "- The race hold remains OPEN until every principal edge is routed.",
            "",
        ]
    )
    return "\n".join(lines)


def stamp_topology(out_dir: Path) -> dict[str, Any]:
    """Stamp state.fpkTopology and write the Phase-T markdown report."""
    state_path = out_dir / "state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    topology = build_fpk_topology(state)
    catch = prove_catch(topology)
    topology["proveCatch"] = catch
    topology["stamped_at"] = _now()
    state["fpkTopology"] = topology
    state_path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    report_path = out_dir / "JLR-FE-FRONT-FPK-TOPOLOGY.md"
    report_path.write_text(render_topology_markdown(topology, catch), encoding="utf-8")
    return {
        "ok": catch["ok"],
        "state_path": str(state_path),
        "report_path": str(report_path),
        "routed_count": topology["routed_count"],
        "required_count": topology["required_count"],
        "rev_hash": topology["rev_hash"],
        "proveCatch": catch,
    }


def _selftest_state() -> dict[str, Any]:
    routed_nodes = (
        "sic_half_bridge_1",
        "sic_half_bridge_2",
        "sic_half_bridge_3",
        "ac_bus_u",
        "ac_bus_v",
        "ac_bus_w",
        "phase_coil_u",
        "phase_coil_v",
        "phase_coil_w",
        "mcu_cold_plate",
        "motor_cooling_jacket",
        "resolver",
        "resolver_excitation_demod",
        "oem_inverter_control_board",
    )
    return {
        "orchestratorContract": {
            "quantities": {
                "front_bay_envelope_w_mm": {"value": 343},
                "front_bay_envelope_d_mm": {"value": 259},
                "front_bay_envelope_h_mm": {"value": 267},
                "rotor_airgap_diameter_mm": {"value": 121.98},
                "stack_length_mm": {"value": 97.58},
                "gear_ratio": {"value": 8.0},
                "mgu_shaft_torque_nm": {"value": 119.7},
                "phase_current_design_a": {"value": 535},
            }
        },
        "fpkPhysicsTree": {
            "part_index": [{"id": node_id} for node_id in routed_nodes],
        },
    }


def _selftest() -> None:
    topology = build_fpk_topology(_selftest_state())
    assert topology["required_count"] == 17
    assert topology["routed_count"] == 7
    assert topology["race_hold"]["status"] == "OPEN"
    assert not topology["claims"]["fia_port_xyz"]
    assert all("xyz_mm" not in json.dumps(edge).lower() for edge in topology["edges"])
    catch = prove_catch(topology)
    assert catch["ok"], catch
    print(
        "fpk_topology --selftest OK — "
        f"{topology['routed_count']}/{topology['required_count']} routed; "
        "missing HV_DC_NEG=FIRES; missing COOLANT_IN=FIRES"
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--selftest", action="store_true")
    parser.add_argument("--stamp", type=Path)
    args = parser.parse_args()
    if args.selftest:
        _selftest()
        return 0
    if args.stamp:
        print(json.dumps(stamp_topology(args.stamp), indent=2))
        return 0
    parser.error("choose --selftest or --stamp OUT_DIR")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
