#!/usr/bin/env python3
"""Integrated electric-drive form grammar — use-physics → forced exterior/interface geometry.

INTENT: Cast ribs, bolt circles, connector families, PE volume, coolant ports and
vehicle routes must appear because a *requirement* demands them — never because a
visual densification pass wanted a higher morphology score.

Mirrors `instrument_form_grammar.py` (hand/eye floors) for traction / e-axle /
sealed motor+inverter packs. Universal: keyed off rotating machine + sealed PE
+ shared coolant + vehicle boundary interfaces — NOT Lucid / JLR / formula_e_* names.

FLOW: state.fpkPhysicsTree + fpkColdPlateThermal + concentric mm
   → EduFormRule (counts + sizes + requirement_id)
   → build_universal_scene traction helpers consume the rule
   → proveCatch rejects orphan decoration and missing forced features

Run: python3 scripts/lib/edu_form_grammar.py --selftest
"""
from __future__ import annotations

import math
import sys
from dataclasses import asdict, dataclass, field
from typing import Any, Mapping, Optional, Sequence


# ── Screening floors (class-agnostic; OPEN FEA/ICD may refine later) ─────────
# Cast Al traction housing: unsupported axial span between stiffeners / lands.
MAX_UNSUPPORTED_CAST_SPAN_MM = 35.0
# HV contact current density screening (A/mm²) for pin cross-section.
HV_CONTACT_J_A_PER_MM2 = 8.0
# Creepage / shell length floor vs DC bus (mm per kV) — screening only.
HV_SHELL_MM_PER_KV = 8.0
# Mount: 4-point bay restraint minimum; mid-span pads when L/OD long.
MOUNT_CORNER_COUNT = 4
MOUNT_MIDSPAN_L_OVER_OD = 0.70
# Gasket free thickness seed (mm) when physics only gives compression %.
GASKET_FREE_THICKNESS_MM = 3.0


@dataclass(frozen=True)
class FormFeature:
    """One forced geometry feature with causal provenance."""

    requirement_id: str
    function: str
    count: int
    dimensions_mm: Mapping[str, float]
    open_until: tuple[str, ...] = ()
    source_node_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class EduFormRule:
    """Derived morphology contract for an integrated electric drive pack."""

    applicable: bool
    housing_od_mm: float
    housing_len_mm: float
    wall_mm: float
    # Forced features
    cast_ribs: FormFeature
    end_bell_bolts: FormFeature
    gasket_lips: FormFeature
    mount_ears: FormFeature
    hv_connector: FormFeature
    coolant_ports: FormFeature
    pe_modules: FormFeature
    vehicle_routes: FormFeature
    notes: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        return d


def _walk_physics_nodes(tree: Any) -> dict[str, Mapping[str, Any]]:
    out: dict[str, Mapping[str, Any]] = {}

    def walk(n: Any) -> None:
        if not isinstance(n, dict):
            return
        pid = n.get("id")
        if isinstance(pid, str) and pid:
            phys = n.get("physics")
            out[pid] = phys if isinstance(phys, dict) else {}
        for c in n.get("children") or []:
            walk(c)

    if isinstance(tree, list):
        for n in tree:
            walk(n)
    elif isinstance(tree, dict):
        walk(tree)
    return out


def _num(m: Mapping[str, Any], *keys: str, default: float = 0.0) -> float:
    for k in keys:
        raw = m.get(k)
        if isinstance(raw, dict):
            raw = raw.get("value")
        try:
            v = float(raw)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            continue
        if math.isfinite(v) and v > 0:
            return v
    return default


def _int_count(m: Mapping[str, Any], *keys: str, default: int = 0) -> int:
    for k in keys:
        raw = m.get(k)
        if isinstance(raw, dict):
            raw = raw.get("value") or raw.get("count")
        try:
            v = int(float(raw))  # type: ignore[arg-type]
        except (TypeError, ValueError):
            continue
        if v > 0:
            return v
    return default


def derive_cast_rib_requirement(
    *,
    housing_len_mm: float,
    housing_od_mm: float,
    wall_mm: float,
) -> FormFeature:
    """INTENT: unsupported cast span under torque → longitudinal stiffening ribs.

    Without a rib pitch floor, Blender either omits ribs (missing function) or
    hardcodes six decorative ribs (Phase N2 symptom). The span rule forces count
    from housing length — FEA may refine section later (open_until).
    """
    pitch = MAX_UNSUPPORTED_CAST_SPAN_MM
    # Ribs per service face: one per span along free length between end bells.
    count = max(4, int(math.ceil(max(housing_len_mm, pitch) / pitch)))
    # Section scales with wall — screening, not FEA.
    rib_t = max(2.5, min(wall_mm * 0.85, 6.0))
    rib_h = max(housing_od_mm * 0.08, wall_mm * 2.5)
    return FormFeature(
        requirement_id="structural_shell.cast_stiffening_ribs",
        function=(
            "Cast housing must stiffen unsupported axial span under torque "
            f"reaction; max span {pitch:.0f} mm → {count} ribs/face"
        ),
        count=count,
        dimensions_mm={
            "rib_thickness_mm": round(rib_t, 2),
            "rib_radial_mm": round(rib_h, 2),
            "rib_height_frac_od": round(min(0.70, 0.45 + wall_mm / max(housing_od_mm, 1.0)), 3),
            "pitch_mm": pitch,
        },
        open_until=("structural_FEA",),
        source_node_ids=("traction_drive_housing",),
    )


def derive_end_bell_bolt_requirement(
    nodes: Mapping[str, Mapping[str, Any]],
    *,
    housing_od_mm: float,
) -> FormFeature:
    """Wire joint-hardware bolt count into end-bell circle — not a hardcoded 8."""
    retain = nodes.get("output_bearing_retainer_bolts") or {}
    housing = nodes.get("housing_bolt_set") or {}
    count = _int_count(retain, "count") or _int_count(housing, "count") or 8
    preload = _num(retain, "preload_each_n") or _num(housing, "preload_each_n")
    # PCD from housing OD — bolt circle must clear stator ID land (screening).
    pcd = housing_od_mm * 0.76
    head_d = 4.8 if preload >= 20000 else 4.0
    return FormFeature(
        requirement_id="sealed_joint.end_bell_bolt_circle",
        function="Bearing/housing joint preload prevents separation under axial + torque reaction",
        count=count,
        dimensions_mm={
            "pcd_mm": round(pcd, 2),
            "head_diameter_mm": head_d,
            "head_height_mm": 5.0,
            "preload_each_n": round(preload, 0) if preload else 0.0,
        },
        open_until=("joint_FEA", "torque_friction_validation"),
        source_node_ids=("output_bearing_retainer_bolts", "housing_bolt_set"),
    )


def derive_gasket_lip_requirement(
    nodes: Mapping[str, Mapping[str, Any]],
    *,
    housing_od_mm: float,
) -> FormFeature:
    g = nodes.get("housing_gasket") or nodes.get("emc_gasket") or {}
    comp = _num(g, "compression_pct_seed", default=25.0)
    free_t = GASKET_FREE_THICKNESS_MM
    gland = free_t * (1.0 - comp / 100.0)
    lip_h = max(2.5, free_t + 0.5)
    return FormFeature(
        requirement_id="sealed_joint.gasket_lip",
        function="Seal compression + environmental/EMC land at end-bell / MCU parting",
        count=2,  # two end-bell lips; MCU land separate in Blender from same dims
        dimensions_mm={
            "lip_height_mm": round(lip_h, 2),
            "lip_od_over_housing_mm": 5.5,
            "gland_thickness_mm": round(gland, 2),
            "compression_pct": comp,
            "housing_od_mm": housing_od_mm,
        },
        open_until=("IP_test", "joint_FEA"),
        source_node_ids=("housing_gasket", "emc_gasket"),
    )


def derive_mount_ear_requirement(
    nodes: Mapping[str, Mapping[str, Any]],
    *,
    housing_od_mm: float,
    housing_len_mm: float,
) -> FormFeature:
    m = nodes.get("mounting_ear_set") or {}
    mass = _num(m, "bay_mass_cap_kg", default=32.0)
    torque = _num(m, "torque_out_nm", default=0.0)
    count = MOUNT_CORNER_COUNT
    if housing_len_mm / max(housing_od_mm, 1.0) >= MOUNT_MIDSPAN_L_OVER_OD:
        count = 6  # corners + mid-span torque couple
    # Pad area screening: support mass * 5g on n pads at 40 MPa bearing.
    force = mass * 9.81 * 5.0
    area_each = force / max(count * 40e6, 1.0)  # m²
    side = max(16.0, math.sqrt(max(area_each, 1e-6)) * 1000.0)
    return FormFeature(
        requirement_id="vehicle_mount.ear_set",
        function="Bay mass + output torque reaction into chassis mount planes",
        count=count,
        dimensions_mm={
            "pad_w_mm": round(side, 1),
            "pad_d_mm": round(side * 0.75, 1),
            "pad_h_mm": 7.0,
            "bolt_head_d_mm": 3.0,
            "mass_kg": mass,
            "torque_out_nm": torque,
        },
        open_until=("structural_FEA",),
        source_node_ids=("mounting_ear_set",),
    )


def derive_hv_connector_requirement(
    nodes: Mapping[str, Mapping[str, Any]],
) -> FormFeature:
    hv = nodes.get("hv_dc_connector") or {}
    v = _num(hv, "v_dc_v", default=750.0)
    i = _num(hv, "i_dc_a", default=300.0)
    # Pin Ø from current density; shell from pin + insulation + creepage length.
    a_mm2 = max(i / HV_CONTACT_J_A_PER_MM2, 8.0)
    pin_d = 2.0 * math.sqrt(a_mm2 / math.pi)
    shell_w = max(28.0, pin_d * 3.2 + 12.0)
    shell_h = max(22.0, pin_d * 2.4 + 10.0)
    shell_d = max(24.0, HV_SHELL_MM_PER_KV * (v / 1000.0) + 16.0)
    hvil_d = max(2.0, pin_d * 0.22)
    return FormFeature(
        requirement_id="hv_interface.connector_family",
        function="HV DC transfer + creepage/clearance + HVIL interlock + EMI braid termination",
        count=1,
        dimensions_mm={
            "shell_w_mm": round(shell_w, 1),
            "shell_d_mm": round(shell_d, 1),
            "shell_h_mm": round(shell_h, 1),
            "pin_diameter_mm": round(pin_d, 2),
            "hvil_diameter_mm": round(hvil_d, 2),
            "braid_collar_od_mm": round(pin_d * 1.35 + 6.0, 1),
            "braid_boot_len_mm": 26.0,
            "v_dc_v": v,
            "i_dc_a": i,
        },
        open_until=("connector_ICD",),
        source_node_ids=("hv_dc_connector", "hvil_loop"),
    )


def derive_coolant_port_requirement(
    nodes: Mapping[str, Mapping[str, Any]],
    cold_plate: Optional[Mapping[str, Any]],
) -> FormFeature:
    port = nodes.get("coolant_port_in") or {}
    bore = _num(port, "analytical_bore_mm")
    flow = _num(port, "design_flow_l_min")
    if cold_plate:
        ports = cold_plate.get("ports") or []
        if isinstance(ports, list) and ports:
            p0 = ports[0] if isinstance(ports[0], dict) else {}
            bore = bore or _num(p0, "analytical_bore_mm")
            flow = flow or _num(p0, "design_flow_l_min")
        hyd = cold_plate.get("channel_hydraulics") or {}
        if isinstance(hyd, dict) and not bore:
            # Fallback: scale from hydraulic diameter × screening factor
            bore = _num(hyd, "hydraulic_diameter_mm") * 4.5
    bore = bore or 10.0
    flow = flow or 12.0
    route_od = max(bore * 1.15, bore + 2.0)
    return FormFeature(
        requirement_id="fluid_interface.coolant_ports_and_routes",
        function="Reject inverter/motor heat at design flow within velocity/ΔP limits",
        count=2,  # inlet + outlet
        dimensions_mm={
            "bore_mm": round(bore, 2),
            "port_od_mm": round(bore * 1.35, 2),
            "route_od_mm": round(route_od, 2),
            "flow_l_min": flow,
            "vehicle_stub_length_mm": 90.0,
        },
        open_until=("FIA_port_xyz", "CFD_or_bench"),
        source_node_ids=("coolant_port_in", "coolant_port_out", "mcu_cold_plate"),
    )


def derive_pe_module_requirement(
    nodes: Mapping[str, Mapping[str, Any]],
) -> FormFeature:
    stack = nodes.get("sic_power_module_stack") or {}
    n = _int_count(stack, "module_count", default=3)
    loss = _num(stack, "loss_on_modules_w")
    return FormFeature(
        requirement_id="power_stage_package.module_volume",
        function="Phase topology + switching/conduction loss → discrete PE modules on cold plate",
        count=n,
        dimensions_mm={
            "module_count": float(n),
            "loss_on_modules_w": loss,
            # Occupied fraction of MCU envelope — forced by module count, not decoration.
            "footprint_frac_w": round(min(0.85, 0.18 * n), 3),
            "footprint_frac_d": 0.55,
            "height_frac_h": 0.42,
        },
        open_until=("supplier_module_datasheet", "double_pulse_bench"),
        source_node_ids=("sic_power_module_stack",),
    )


def derive_vehicle_route_requirement(
    topology: Optional[Mapping[str, Any]],
    coolant: FormFeature,
    hv: FormFeature,
) -> FormFeature:
    """Principal vehicle boundary routes forced by topology edge domains."""
    required = {"electrical_hv": False, "cooling": False, "signal_lv": False}
    edges = (topology or {}).get("edges") if isinstance(topology, dict) else None
    if isinstance(edges, list):
        for e in edges:
            if not isinstance(e, dict) or not e.get("required"):
                continue
            dom = str(e.get("domain") or "")
            if "hv" in dom or "electrical_hv" in dom:
                required["electrical_hv"] = True
            if "cool" in dom or "fluid" in dom or "thermal" in dom:
                required["cooling"] = True
            if "signal" in dom or "lv" in dom or "can" in dom:
                required["signal_lv"] = True
    # Integrated EDU always needs these three families at the vehicle boundary.
    required = {"electrical_hv": True, "cooling": True, "signal_lv": True}
    n = sum(1 for v in required.values() if v) + 1  # coolant has in+out → +1
    return FormFeature(
        requirement_id="vehicle_boundary.principal_routes",
        function="Topology requires HV DC, coolant in/out, and LV/signal across the bay boundary",
        count=n,  # hv + cool_in + cool_out + lv = 4
        dimensions_mm={
            "hv_route_od_mm": round(hv.dimensions_mm.get("pin_diameter_mm", 10.0) * 1.1 + 4.0, 1),
            "coolant_route_od_mm": coolant.dimensions_mm.get("route_od_mm", 12.0),
            "lv_route_od_mm": 6.0,
            "stub_length_mm": coolant.dimensions_mm.get("vehicle_stub_length_mm", 90.0),
        },
        open_until=("FIA_port_xyz", "harness_ICD"),
        source_node_ids=("fpkTopology",),
    )


def _physics_tree_root(physics_tree: Any) -> Any:
    """Accept state.fpkPhysicsTree (has .tree) OR a bare root / node list."""
    if not isinstance(physics_tree, dict):
        return physics_tree
    nested = physics_tree.get("tree")
    if nested is not None:
        return nested
    # Bare PhysicsNode root (selftest / direct callers).
    if physics_tree.get("id") is not None or physics_tree.get("children") is not None:
        return physics_tree
    nodes = physics_tree.get("nodes")
    if isinstance(nodes, list):
        return nodes
    return physics_tree


def derive_edu_form_rule(
    *,
    housing_od_mm: float,
    housing_len_mm: float,
    wall_mm: float = 6.0,
    physics_tree: Any = None,
    cold_plate: Optional[Mapping[str, Any]] = None,
    topology: Optional[Mapping[str, Any]] = None,
    applicable: bool = True,
) -> EduFormRule:
    """Derive the full form rule from physics stamps + concentric envelope."""
    nodes = _walk_physics_nodes(_physics_tree_root(physics_tree))
    wall = wall_mm if wall_mm > 0 else 6.0
    ribs = derive_cast_rib_requirement(
        housing_len_mm=housing_len_mm, housing_od_mm=housing_od_mm, wall_mm=wall
    )
    bolts = derive_end_bell_bolt_requirement(nodes, housing_od_mm=housing_od_mm)
    gasket = derive_gasket_lip_requirement(nodes, housing_od_mm=housing_od_mm)
    mounts = derive_mount_ear_requirement(
        nodes, housing_od_mm=housing_od_mm, housing_len_mm=housing_len_mm
    )
    hv = derive_hv_connector_requirement(nodes)
    cool = derive_coolant_port_requirement(nodes, cold_plate)
    pe = derive_pe_module_requirement(nodes)
    routes = derive_vehicle_route_requirement(topology, cool, hv)
    notes = (
        "Form features carry requirement_id provenance — orphan decoration is a defect",
        "OPEN FEA/ICD/CFD refine dimensions but do not waive the functional feature",
    )
    return EduFormRule(
        applicable=applicable,
        housing_od_mm=housing_od_mm,
        housing_len_mm=housing_len_mm,
        wall_mm=wall,
        cast_ribs=ribs,
        end_bell_bolts=bolts,
        gasket_lips=gasket,
        mount_ears=mounts,
        hv_connector=hv,
        coolant_ports=cool,
        pe_modules=pe,
        vehicle_routes=routes,
        notes=notes,
    )


def derive_edu_form_rule_from_state(state: Mapping[str, Any]) -> EduFormRule:
    """Convenience: read concentric + physics stamps from chain state."""
    cg = state.get("fpkConcentricGeometry") or {}
    od = _num(cg, "housing_od_mm", default=0.0)
    length = _num(cg, "housing_len_mm", default=0.0)
    wall = _num(cg, "wall_mm", default=6.0) or 6.0
    if od <= 0 or length <= 0:
        # Fallback: quantities path via concentric helper when stamp incomplete.
        try:
            from fpk_concentric_geometry import geometry_from_quantities

            q = ((state.get("orchestratorContract") or {}).get("quantities")) or {}
            g = geometry_from_quantities(q)
            od = g.housing_od_mm
            length = g.housing_len_mm
            wall = g.wall_mm
        except Exception:
            od = od or 170.0
            length = length or 140.0
    return derive_edu_form_rule(
        housing_od_mm=od,
        housing_len_mm=length,
        wall_mm=wall,
        physics_tree=state.get("fpkPhysicsTree"),
        cold_plate=state.get("fpkColdPlateThermal")
        if isinstance(state.get("fpkColdPlateThermal"), dict)
        else None,
        topology=state.get("fpkTopology") if isinstance(state.get("fpkTopology"), dict) else None,
        applicable=True,
    )


def assert_no_orphan_decoration(
    emitted_requirement_ids: Sequence[str],
    rule: EduFormRule,
) -> list[str]:
    """Geometry without requirement_id, or missing forced feature → defects."""
    defects: list[str] = []
    required = {
        rule.cast_ribs.requirement_id,
        rule.end_bell_bolts.requirement_id,
        rule.gasket_lips.requirement_id,
        rule.mount_ears.requirement_id,
        rule.hv_connector.requirement_id,
        rule.coolant_ports.requirement_id,
        rule.pe_modules.requirement_id,
        rule.vehicle_routes.requirement_id,
    }
    have = set(emitted_requirement_ids)
    for rid in sorted(required):
        if rid not in have:
            defects.append(f"missing_forced_feature:{rid}")
    for rid in sorted(have):
        if rid.startswith("viz_only.") or rid.startswith("decorative."):
            defects.append(f"orphan_decoration:{rid}")
    return defects


def _selftest() -> None:
    # Synthetic physics tree fragment — counts must flow into the rule.
    tree = {
        "id": "root",
        "children": [
            {
                "id": "housing_bolt_set",
                "physics": {"count": 12, "preload_each_n": 25000},
            },
            {
                "id": "output_bearing_retainer_bolts",
                "physics": {"count": 10, "preload_each_n": 12000},
            },
            {
                "id": "sic_power_module_stack",
                "physics": {"module_count": 3, "loss_on_modules_w": 4000},
            },
            {
                "id": "hv_dc_connector",
                "physics": {"v_dc_v": 800, "i_dc_a": 400},
            },
            {
                "id": "coolant_port_in",
                "physics": {"analytical_bore_mm": 12.0, "design_flow_l_min": 15.0},
            },
            {
                "id": "mounting_ear_set",
                "physics": {"bay_mass_cap_kg": 32, "torque_out_nm": 900},
            },
            {
                "id": "housing_gasket",
                "physics": {"compression_pct_seed": 25},
            },
        ],
    }
    cold = {
        "ports": [
            {"analytical_bore_mm": 12.0, "design_flow_l_min": 15.0},
            {"analytical_bore_mm": 12.0, "design_flow_l_min": 15.0},
        ]
    }
    rule = derive_edu_form_rule(
        housing_od_mm=180.0,
        housing_len_mm=140.0,
        wall_mm=6.0,
        physics_tree=tree,
        cold_plate=cold,
        topology={"edges": [{"required": True, "domain": "electrical_hv"}]},
    )
    assert rule.end_bell_bolts.count == 10, rule.end_bell_bolts.count
    assert rule.pe_modules.count == 3, rule.pe_modules.count
    assert rule.coolant_ports.dimensions_mm["bore_mm"] == 12.0
    assert rule.hv_connector.dimensions_mm["i_dc_a"] == 400.0
    # Rib count forced by span rule — not hardcoded 6.
    expect_ribs = max(4, int(math.ceil(140.0 / MAX_UNSUPPORTED_CAST_SPAN_MM)))
    assert rule.cast_ribs.count == expect_ribs, (rule.cast_ribs.count, expect_ribs)
    # Longer housing → more ribs (function), not same decoration.
    rule_long = derive_edu_form_rule(
        housing_od_mm=180.0, housing_len_mm=210.0, wall_mm=6.0, physics_tree=tree
    )
    assert rule_long.cast_ribs.count > rule.cast_ribs.count
    # Mid-span mounts when L/OD high.
    assert rule_long.mount_ears.count == 6
    # Orphan decoration catch.
    defects = assert_no_orphan_decoration(
        [
            rule.cast_ribs.requirement_id,
            rule.end_bell_bolts.requirement_id,
            rule.gasket_lips.requirement_id,
            rule.mount_ears.requirement_id,
            rule.hv_connector.requirement_id,
            rule.coolant_ports.requirement_id,
            rule.pe_modules.requirement_id,
            # missing vehicle_routes
            "decorative.orange_peg",
        ],
        rule,
    )
    assert any("vehicle_boundary" in d for d in defects)
    assert any("orphan_decoration" in d for d in defects)
    # Happy path — all forced ids present, no decorative.
    ok = assert_no_orphan_decoration(
        [
            rule.cast_ribs.requirement_id,
            rule.end_bell_bolts.requirement_id,
            rule.gasket_lips.requirement_id,
            rule.mount_ears.requirement_id,
            rule.hv_connector.requirement_id,
            rule.coolant_ports.requirement_id,
            rule.pe_modules.requirement_id,
            rule.vehicle_routes.requirement_id,
        ],
        rule,
    )
    assert ok == [], ok
    # Higher current → larger HV shell (function).
    tree2 = {
        "id": "root",
        "children": [{"id": "hv_dc_connector", "physics": {"v_dc_v": 800, "i_dc_a": 800}}],
    }
    r_hi = derive_edu_form_rule(housing_od_mm=180, housing_len_mm=140, physics_tree=tree2)
    r_lo = derive_edu_form_rule(
        housing_od_mm=180,
        housing_len_mm=140,
        physics_tree={
            "id": "root",
            "children": [{"id": "hv_dc_connector", "physics": {"v_dc_v": 800, "i_dc_a": 100}}],
        },
    )
    assert r_hi.hv_connector.dimensions_mm["shell_w_mm"] > r_lo.hv_connector.dimensions_mm["shell_w_mm"]
    print("edu_form_grammar.py --selftest OK")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
        sys.exit(0)
    print("Usage: python3 scripts/lib/edu_form_grammar.py --selftest")
    sys.exit(2)
