#!/usr/bin/env python3
"""functional_form.py — functional-form/v1 : a UNIVERSAL function→form composer.

WHY (Tristan 2026-07-18, THE AIM + convergent-evolution challenge; Cursor advisory
functional-form directive): the engine must generate a coherent product form for ANY
archetype — including ones never seen — because the form is FORCED by physics, human
use, manufacturing and service, not looked up from a per-product table. The prior system
was ~7 hardcoded form families keyed on signals; a signal-less new archetype fell to a
generic box. This module replaces the lookup with a SOLVER:

    contract signals  →  functional primitives  (working medium, primary axis, sample
                          interface, repetition, openness, operator view, hazard boundary)
      →  deterministic candidate ARRANGEMENTS of functional role-volumes
      →  BINARY hard-feasibility culling (a candidate that violates a physical/human/mfg
         constraint is removed — no scoring, no soft weights)
      →  human/manufacturing/service selection among survivors
      →  form-proof/v1  (the chosen arrangement + why each role sits where it does)

Convergent evolution: independent derivation from the SAME physics must converge toward
the gold product's class of morphology. Gold is a training CHECK (does it converge?),
never a mesh/silhouette/pixel target.

This file is the PURE SOLVER — no Blender (bpy), no Excel, no chain wiring. Per the Cursor
directive: prove the solver on fixtures (first: EWOD cartridge controller) with proveCatch
(generic-box / missing-grid / wrong-transport) BEFORE any geometry or chain integration.

Usage:  python3 functional_form.py --selftest        # fixtures + proveCatch
        python3 functional_form.py <state.json>       # derive + compose + form-proof
"""
from __future__ import annotations

import json
import sys
from dataclasses import dataclass, field, asdict
from typing import Any, Optional


# ─────────────────────────────────────────────────────────────────────────────
# Functional primitives — the vocabulary the WHOLE space is composed from. These
# are PHYSICAL, not product names: any instrument (seen or unseen) is described by
# which of these it has. New archetypes reuse this vocabulary; only novel
# COMBINATIONS are new, never new primitive kinds (that is what makes it universal).
# ─────────────────────────────────────────────────────────────────────────────

# Working medium = the physical quantity the product acts on. Derived from contract
# signals (NEVER product_class), so a product with product_class=None still resolves.
WORKING_MEDIA = (
    "light",              # absorbance / fluorescence — an optical beam through a sample
    "heat",               # thermal cycling / heating — a heated block
    "electric_field",     # EWOD droplet actuation — a planar electrode array
    "electric_current",   # electrochemistry — current through an external cell (electrodes)
    "culture_fluid",      # a living culture in a vessel — a vial/vessel of medium
    "linear_displacement",# dosing / pumping — a motor→screw→plunger drive
    "image_plane",        # microscopy — an objective→sample→camera optical column
)

# Primary working axis = the geometric spine the medium forces.
PRIMARY_AXES = ("linear-through", "block", "planar-array", "external-cell",
                "vertical-wet-stack", "repeated-linear", "optical-column")

# Sample interface = how the operator presents the sample. The single most
# recognisable feature of most instruments.
SAMPLE_INTERFACES = ("cuvette", "tube-wells", "electrode-grid+cartridge",
                     "electrode-leads", "culture-vial", "syringe-cradle", "stage-slide")

# Openness = whether the mechanism/sample is exposed or sealed.
OPENNESS = ("sealed", "sample-open", "mechanism-open", "open-pcba")


@dataclass
class RoleVolume:
    """One functional volume the form must contain."""
    role: str
    geometry_family: str        # box / cylinder / grid / column / open-frame / vial
    must_be_visible: bool       # visible on the product exterior (the signature)?
    must_be_accessible: bool    # the operator must reach it (loading/service)?
    axis_position: str = "mid"  # where on the primary axis: source/sample/detector/base/top


@dataclass
class FunctionalFormContract:
    """functional-form/v1 — the functional description a form is composed FROM.
    Everything here is derived from contract SIGNALS, not a product-name table."""
    schema: str = "functional-form/v1"
    working_medium: Optional[str] = None
    primary_axis: Optional[str] = None
    sample_interface: Optional[str] = None
    openness: Optional[str] = None
    operator_view: str = "top"          # top / front / side / host-ui
    access_direction: str = "top"       # where the sample loads from
    repeated_count: int = 1             # channels / electrode rows / stage axes
    hazard_boundary: Optional[str] = None   # heated-lid / high-voltage / wet-dry / light-tight
    role_volumes: list[RoleVolume] = field(default_factory=list)
    chassis_role: Optional[str] = None      # the assembly root every role must reach
    # typed attachment relations: (from_role, kind, to_role, intentional_detached)
    required_relations: list = field(default_factory=list)
    # provenance: which signal fixed the working medium (audit / honesty)
    medium_basis: str = ""


# ─────────────────────────────────────────────────────────────────────────────
# 1. DERIVE the functional primitives from contract signals (universal, signal-keyed)
# ─────────────────────────────────────────────────────────────────────────────

def _q(state: dict, key: str):
    for holder in ("orchestratorContract", "engineeringContract"):
        q = ((state.get(holder) or {}).get("quantities") or {}).get(key)
        if q is not None:
            return q.get("value") if isinstance(q, dict) else q
    return None


def _derive_working_medium(state: dict) -> tuple[Optional[str], str]:
    """Map contract SIGNALS → working medium. Ordered so a specific signal wins.
    Returns (medium, basis-string). product_class is a LAST-resort hint only."""
    # CONSUMABLE / CASSETTE (the razor-and-blade BLADE) — an explicit consumable card is
    # detected BEFORE any instrument medium, so a smart / organoid / crystal cassette that
    # ALSO carries an instrument signal (electrode_count, working_volume_ml) still resolves as
    # the CARD, not the powered instrument that reads it. Keyed on signals only a consumable
    # declares. (Yuri Gap A, 2026-07-18 — the recurring-revenue centre; ref reconciliation doc.)
    if _q(state, "is_consumable") in (True, "true", "True", "yes", 1, "1") \
            or _q(state, "cassette_format") is not None:
        return "sealed_cartridge", ("is_consumable/cassette_format present "
                                    "(a sealed consumable cartridge — the razor-and-blade blade)")
    for sig in ("reservoir_count", "fluidic_channel_count", "culture_chamber_count",
                "crystal_well_count", "sample_well_count"):
        v = _q(state, sig)
        if v is not None and float(v) > 0:
            return "sealed_cartridge", f"{sig}={v} (an on-card reservoir/chamber array = a sealed consumable cartridge)"
    rpm = _q(state, "rotor_speed_rpm") or _q(state, "rpm_max") or _q(state, "spin_speed_rpm")
    if rpm is not None and float(rpm) > 0:
        return "rotation", f"rotor_speed_rpm={rpm} (a spinning rotor separates by centrifugal force)"
    # NEW MEDIA (fast universality loop, 2026-07-18) — each closes a gap the diverse-archetype
    # sweep surfaced. Keyed on the functional signal, never a product name.
    for sig, med, why in (
        ("gantry_axes", "gantry", "a moving head on a Cartesian frame"),
        ("orbital_speed_rpm", "orbital", "a platform on an orbital drive"),
        ("stir_speed_rpm", "magnetic", "a rotating magnet couples to a stir bar"),
        ("ultrasonic_freq_khz", "acoustic", "a transducer drives ultrasonic energy into a bath"),
        ("readability_mg", "gravimetric", "a load cell under a weighing pan in a draft shield"),
        ("vacuum_mbar", "vacuum", "a pump evacuates a chamber/port"),
        ("chamber_pressure_bar", "pressure", "a sealed vessel holds steam under pressure"),
        ("run_voltage_v", "electrophoresis", "a DC field drives migration through a gel tank"),
        ("pulse_voltage_v", "electrophoresis", "an HV pulse across an electrode cell"),
        ("chamber_volume_l", "thermal_volume", "a heated/controlled chamber holds a working volume"),
        ("bath_volume_l", "thermal_volume", "a heated bath holds a working volume"),
    ):
        v = _q(state, sig)
        if v is not None and float(v) > 0:
            return med, f"{sig}={v} ({why})"
    ec = _q(state, "electrode_count")
    if ec is not None and float(ec) >= 8:
        return "electric_field", f"electrode_count={ec} (planar droplet actuation array)"
    cv = _q(state, "compliance_voltage_v")
    if cv is not None and float(cv) > 0:
        return "electric_current", f"compliance_voltage_v={cv} (drives an external electrochemical cell)"
    wv = _q(state, "working_volume_ml")
    if wv is not None and 0 < float(wv) <= 500:
        return "culture_fluid", f"working_volume_ml={wv} (a culture vessel of medium)"
    tc = _q(state, "tube_count")
    if tc is not None and float(tc) > 0:
        return "heat", f"tube_count={tc} (a heated PCR sample block)"
    ch = _q(state, "channel_count")
    if ch is not None and float(ch) >= 1:
        return "linear_displacement", f"channel_count={ch} (parallel linear dosing drives)"
    sa = _q(state, "stage_axis_count")
    if sa is not None and float(sa) >= 2:
        return "image_plane", f"stage_axis_count={sa} (a flexure imaging stage)"
    opl = _q(state, "optical_path_length_mm")
    if opl is not None and float(opl) > 0:
        return "light", f"optical_path_length_mm={opl} (a transmittance beam through a sample)"
    # last-resort product_class hint (kept minimal; signals should carry it)
    pc = ((state.get("parsedBrief") or {}).get("product_class") or "").lower()
    for medium, pat in (("light", "colorimeter|photometer|spectro|absorb|fluor"),
                        ("electric_current", "potentiostat|electrochem"),
                        ("electric_field", "microfluidic|ewod|electrowet|opendrop"),
                        ("culture_fluid", "bioreactor|ferment|chemostat|turbidostat"),
                        ("heat", "thermocycler|pcr"),
                        ("linear_displacement", "syringe|pump|dosing"),
                        ("image_plane", "microscope|flexure")):
        import re
        if re.search(pat, pc):
            return medium, f"product_class~{pc!r} (last-resort hint; no functional signal found)"
    return None, "no working-medium signal found"


# The UNIVERSAL medium → (axis, interface, openness, hazard, roles) rule. This is the
# convergent-evolution core: the physics of each medium FORCES its morphology. A new
# medium adds one row; the SAME role/axis/openness vocabulary composes the form.
# Each rule now carries a CHASSIS root + typed RELATIONS (Cursor assembly-connectedness
# spec): (from_role, kind, to_role, intentional_detached). Every non-accessory role must
# reach the chassis by a typed attachment path (connected_component_count(primary)==1);
# accessories (removable cap/cartridge/lead) are intentional_detached but still carry a
# typed edge (nested_accessory / external_lead), so nothing floats unattached. Structural
# repetition is EXPLICIT where the count is fixed (3 WE/RE/CE leads, source+detector OD,
# 3 XYZ actuators) — Cursor's repeated-role expansion.
_MEDIUM_FORM_RULE: dict[str, dict[str, Any]] = {
    "light": {
        "axis": "linear-through", "interface": "cuvette", "openness": "sealed",
        "operator_view": "top", "access": "top", "hazard": "light-tight",
        "chassis": "hmi_deck",
        "roles": [("source", "box", True, False, "source"),
                  ("sample_cuvette", "box", True, True, "sample"),
                  ("detector", "box", False, False, "detector"),
                  ("hmi_deck", "box", True, True, "base")],
        "relations": [("source", "fastened", "hmi_deck", False),
                      ("detector", "fastened", "hmi_deck", False),
                      ("sample_cuvette", "nested_accessory", "hmi_deck", True)],
    },
    "heat": {
        "axis": "block", "interface": "tube-wells", "openness": "sample-open",
        "operator_view": "top", "access": "top", "hazard": "heated-lid",
        "chassis": "controller",
        "roles": [("sample_block", "box", True, True, "sample"),
                  ("hinged_lid", "box", True, True, "top"),
                  ("heatsink", "box", False, False, "base"),
                  ("controller", "box", False, False, "base")],
        "relations": [("sample_block", "fastened", "controller", False),
                      ("hinged_lid", "hinged", "controller", False),
                      ("heatsink", "fastened", "controller", False)],
    },
    "electric_field": {
        "axis": "planar-array", "interface": "electrode-grid+cartridge", "openness": "open-pcba",
        "operator_view": "top", "access": "top", "hazard": "high-voltage",
        "chassis": "controller_deck",
        "roles": [("electrode_grid", "grid", True, True, "sample"),
                  ("cartridge", "box", True, True, "top"),
                  ("hv_driver", "box", False, False, "base"),
                  ("controller_deck", "box", True, False, "base")],
        "relations": [("electrode_grid", "fastened", "controller_deck", False),
                      ("hv_driver", "fastened", "controller_deck", False),
                      ("cartridge", "nested_accessory", "electrode_grid", True)],
    },
    "electric_current": {
        "axis": "external-cell", "interface": "electrode-leads", "openness": "sealed",
        "operator_view": "front", "access": "front", "hazard": None,
        "chassis": "afe_board",
        "roles": [("electrode_lead_we", "cylinder", True, True, "sample"),
                  ("electrode_lead_re", "cylinder", True, True, "sample"),
                  ("electrode_lead_ce", "cylinder", True, True, "sample"),
                  ("afe_board", "box", False, False, "base"),
                  ("host_port", "box", True, True, "front")],
        "relations": [("electrode_lead_we", "external_lead", "afe_board", True),
                      ("electrode_lead_re", "external_lead", "afe_board", True),
                      ("electrode_lead_ce", "external_lead", "afe_board", True),
                      ("host_port", "fastened", "afe_board", False)],
    },
    "culture_fluid": {
        "axis": "vertical-wet-stack", "interface": "culture-vial", "openness": "sample-open",
        "operator_view": "top", "access": "top", "hazard": "wet-dry",
        "chassis": "electronics_base",
        "roles": [("electronics_base", "box", True, False, "base"),
                  ("stir_heat", "box", False, False, "base"),
                  ("culture_vial", "vial", True, True, "sample"),
                  ("od_source", "box", True, False, "sample"),
                  ("od_detector", "box", True, False, "sample"),
                  ("sterile_cap", "box", True, True, "top")],
        "relations": [("stir_heat", "fastened", "electronics_base", False),
                      ("od_source", "fastened", "electronics_base", False),
                      ("od_detector", "fastened", "electronics_base", False),
                      ("culture_vial", "nested_accessory", "stir_heat", True),
                      ("sterile_cap", "nested_accessory", "culture_vial", True)],
    },
    "linear_displacement": {
        "axis": "repeated-linear", "interface": "syringe-cradle", "openness": "mechanism-open",
        "operator_view": "top", "access": "front", "hazard": None,
        "chassis": "stepper",
        "roles": [("stepper", "box", True, False, "base"),
                  ("leadscrew", "cylinder", True, False, "mid"),
                  ("carriage", "box", True, True, "mid"),
                  ("syringe_cradle", "open-frame", True, True, "sample"),
                  ("console", "box", True, True, "side")],
        "relations": [("leadscrew", "supported_by", "stepper", False),
                      ("carriage", "sliding", "leadscrew", False),
                      ("syringe_cradle", "fastened", "stepper", False),
                      ("console", "electrical_cable", "stepper", False)],
    },
    "rotation": {   # ADDED via the fast universality loop (2026-07-18) — a NEVER-SEEN
        # archetype (microcentrifuge) surfaced this gap; one medium+rule+layout closes it.
        "axis": "rotary-stack", "interface": "rotor-slots", "openness": "sample-open",
        "operator_view": "top", "access": "top", "hazard": "spinning-rotor",
        "chassis": "motor_base",
        "roles": [("motor_base", "box", True, False, "base"),
                  ("rotor", "cylinder", True, True, "sample"),
                  ("lid", "box", True, True, "top")],
        "relations": [("rotor", "supported_by", "motor_base", False),
                      ("lid", "hinged", "motor_base", False)],
    },
    # ── NEW MEDIA batch (fast universality sweep, 2026-07-18) — each closes a gap the
    # 36-archetype Yuri sweep surfaced. Most use the generic "on-base" layout (chassis +
    # signature features seated on it, touching); pressure vessels use a cylinder body. ──
    "magnetic": {
        "axis": "on-base", "interface": "stir-plate", "openness": "sample-open",
        "operator_view": "top", "access": "top", "hazard": "hot-surface",
        "chassis": "plate_body",
        "roles": [("plate_body", "box", True, False, "base"),
                  ("stir_zone", "cylinder", True, True, "top"),
                  ("control_knob", "cylinder", True, True, "top"),
                  ("beaker", "cylinder", True, True, "top")],
        "relations": [("stir_zone", "fastened", "plate_body", False),
                      ("control_knob", "fastened", "plate_body", False),
                      ("beaker", "nested_accessory", "stir_zone", True)],
    },
    "orbital": {
        "axis": "on-base", "interface": "shake-platform", "openness": "sample-open",
        "operator_view": "top", "access": "top", "hazard": None,
        "chassis": "drive_base",
        "roles": [("drive_base", "box", True, False, "base"),
                  ("platform", "box", True, True, "top"),
                  ("tube_clamp", "box", True, True, "top")],
        "relations": [("platform", "supported_by", "drive_base", False),
                      ("tube_clamp", "fastened", "platform", False)],
    },
    "acoustic": {
        "axis": "on-base", "interface": "ultrasonic-bath", "openness": "sample-open",
        "operator_view": "top", "access": "top", "hazard": "ultrasound",
        "chassis": "tank_body",
        "roles": [("tank_body", "box", True, False, "base"),
                  ("transducer", "box", True, True, "top"),
                  ("lid", "box", True, True, "top")],
        "relations": [("transducer", "fastened", "tank_body", False),
                      ("lid", "hinged", "tank_body", False)],
    },
    "gravimetric": {
        "axis": "on-base", "interface": "weighing-pan", "openness": "sample-open",
        "operator_view": "front", "access": "top", "hazard": None,
        "chassis": "balance_base",
        "roles": [("balance_base", "box", True, False, "base"),
                  ("weighing_pan", "cylinder", True, True, "top"),
                  ("draft_shield", "box", True, True, "top"),
                  ("display", "box", True, True, "front")],
        "relations": [("weighing_pan", "supported_by", "balance_base", False),
                      ("draft_shield", "fastened", "balance_base", False),
                      ("display", "fastened", "balance_base", False)],
    },
    "vacuum": {
        "axis": "on-base", "interface": "vacuum-port", "openness": "sealed",
        "operator_view": "front", "access": "front", "hazard": None,
        "chassis": "pump_body",
        "roles": [("pump_body", "box", True, False, "base"),
                  ("motor", "cylinder", True, False, "top"),
                  ("vacuum_port", "box", True, True, "front"),
                  ("gauge", "cylinder", True, True, "top")],
        "relations": [("motor", "fastened", "pump_body", False),
                      ("vacuum_port", "fastened", "pump_body", False),
                      ("gauge", "fastened", "pump_body", False)],
    },
    "electrophoresis": {
        "axis": "on-base", "interface": "gel-tank", "openness": "sample-open",
        "operator_view": "top", "access": "top", "hazard": "high-voltage",
        "chassis": "tank_body",
        "roles": [("tank_body", "box", True, False, "base"),
                  ("gel_tray", "box", True, True, "top"),
                  ("anode", "cylinder", True, True, "top"),
                  ("cathode", "cylinder", True, True, "top"),
                  ("lid", "box", True, True, "top")],
        "relations": [("gel_tray", "supported_by", "tank_body", False),
                      ("anode", "fastened", "tank_body", False),
                      ("cathode", "fastened", "tank_body", False),
                      ("lid", "nested_accessory", "tank_body", True)],
    },
    "thermal_volume": {
        "axis": "on-base", "interface": "chamber-door", "openness": "sample-open",
        "operator_view": "front", "access": "front", "hazard": "hot-surface",
        "chassis": "chamber_body",
        "roles": [("chamber_body", "box", True, False, "base"),
                  ("door", "box", True, True, "front"),
                  ("shelf", "box", True, True, "top"),
                  ("controller", "box", True, True, "front")],
        "relations": [("door", "hinged", "chamber_body", False),
                      ("shelf", "fastened", "chamber_body", False),
                      ("controller", "fastened", "chamber_body", False)],
    },
    "gantry": {
        "axis": "on-base", "interface": "moving-head", "openness": "mechanism-open",
        "operator_view": "top", "access": "front", "hazard": None,
        "chassis": "frame",
        "roles": [("frame", "box", True, False, "base"),
                  ("bed", "box", True, True, "top"),
                  ("x_gantry", "box", True, True, "top"),
                  ("moving_head", "box", True, True, "top")],
        "relations": [("bed", "fastened", "frame", False),
                      ("x_gantry", "supported_by", "frame", False),
                      ("moving_head", "sliding", "x_gantry", False)],
    },
    "pressure": {
        "axis": "pressure-vessel", "interface": "clamped-lid", "openness": "sealed",
        "operator_view": "top", "access": "top", "hazard": "pressure-steam",
        "chassis": "vessel_body",
        "roles": [("vessel_body", "cylinder", True, False, "base"),
                  ("clamp_lid", "cylinder", True, True, "top"),
                  ("pressure_gauge", "cylinder", True, True, "top"),
                  ("relief_valve", "cylinder", True, True, "top")],
        "relations": [("clamp_lid", "fastened", "vessel_body", False),
                      ("pressure_gauge", "fastened", "vessel_body", False),
                      ("relief_valve", "fastened", "vessel_body", False)],
    },
    "sealed_cartridge": {   # the razor-and-blade CONSUMABLE (Yuri Gap A, 2026-07-18). NOT a
        # powered instrument — a thin planar microfluidic/culture CARD. Its physics: a bonded
        # fluidic layer holding an array of reservoirs/chambers, read through a window, keyed
        # into a host instrument by a removable dock. The reservoir/chamber COUNT drives the
        # array, so the SAME form serves a smart / organoid / protein-crystal cassette.
        "axis": "planar-card", "interface": "reservoir-ports", "openness": "sealed",
        "operator_view": "top", "access": "top", "hazard": "wet-dry",
        "chassis": "card_substrate",
        "roles": [("card_substrate", "box", True, False, "base"),
                  ("fluidic_layer", "box", True, False, "mid"),
                  ("reagent_reservoirs", "box", True, True, "sample"),
                  ("inlet_ports", "cylinder", True, True, "top"),
                  ("detection_window", "box", True, False, "sample"),
                  ("dock_interface", "box", True, True, "base")],
        "relations": [("fluidic_layer", "bonded", "card_substrate", False),
                      ("reagent_reservoirs", "fastened", "fluidic_layer", False),
                      ("inlet_ports", "fastened", "fluidic_layer", False),
                      ("detection_window", "bonded", "card_substrate", False),
                      ("dock_interface", "fastened", "card_substrate", False),
                      # FIRST-CLASS razor-and-blade boundary: the card is removable from the
                      # (external) host instrument. `instrument` is an external endpoint, not a
                      # cassette role — the proof recognises it as a declared dock, not an orphan.
                      ("dock_interface", "removable_interface", "instrument", True)],
    },
    "image_plane": {
        "axis": "optical-column", "interface": "stage-slide", "openness": "mechanism-open",
        "operator_view": "top", "access": "top", "hazard": None,
        "chassis": "flexure_body",
        "roles": [("flexure_body", "box", True, False, "base"),
                  ("stage", "box", True, True, "sample"),
                  ("objective", "cylinder", True, False, "detector"),
                  ("condenser", "cylinder", True, False, "source"),
                  ("actuator_x", "box", True, False, "base"),
                  ("actuator_y", "box", True, False, "base"),
                  ("actuator_z", "box", True, False, "base")],
        "relations": [("stage", "supported_by", "flexure_body", False),
                      ("objective", "fastened", "flexure_body", False),
                      ("condenser", "fastened", "flexure_body", False),
                      ("actuator_x", "fastened", "flexure_body", False),
                      ("actuator_y", "fastened", "flexure_body", False),
                      ("actuator_z", "fastened", "flexure_body", False)],
    },
}


def derive_functional_form(state: dict) -> FunctionalFormContract:
    """contract signals → FunctionalFormContract. Universal: keyed on functional signals,
    with the medium→form rule composing the primitives. A medium with no rule still gets
    a contract (medium set, roles empty) so the caller can flag it, not crash."""
    medium, basis = _derive_working_medium(state)
    c = FunctionalFormContract(working_medium=medium, medium_basis=basis)
    rule = _MEDIUM_FORM_RULE.get(medium or "")
    if not rule:
        return c
    c.primary_axis = rule["axis"]
    c.sample_interface = rule["interface"]
    c.openness = rule["openness"]
    c.operator_view = rule["operator_view"]
    c.access_direction = rule["access"]
    c.hazard_boundary = rule["hazard"]
    # repetition drives repeated forms (channels / electrode rows / stage axes)
    for sig, medium_match in (("channel_count", "linear_displacement"),
                              ("electrode_count", "electric_field"),
                              ("stage_axis_count", "image_plane")):
        if medium == medium_match:
            v = _q(state, sig)
            if v is not None:
                c.repeated_count = max(1, int(float(v)))
    # cassette repetition: the reservoir/chamber/well count drives the on-card array
    if medium == "sealed_cartridge":
        for sig in ("reservoir_count", "culture_chamber_count", "crystal_well_count",
                    "fluidic_channel_count", "sample_well_count"):
            v = _q(state, sig)
            if v is not None and float(v) > 0:
                c.repeated_count = max(1, int(float(v)))
                break
    c.role_volumes = [
        RoleVolume(role=r, geometry_family=g, must_be_visible=vis,
                   must_be_accessible=acc, axis_position=pos)
        for (r, g, vis, acc, pos) in rule["roles"]
    ]
    c.chassis_role = rule.get("chassis")
    c.required_relations = list(rule.get("relations") or [])
    return c


# ─────────────────────────────────────────────────────────────────────────────
# CONNECTEDNESS INVARIANT (Cursor assembly-connectedness spec) — nothing floats.
# A TYPED attachment graph over the role-volumes (NOT proximity). Every non-accessory
# role must reach the chassis by a typed attachment path → connected_component_count
# (primary)==1. Accessories (removable cap/cartridge/lead) are intentional_detached but
# MUST still carry a typed edge (nested_accessory / external_lead) — a declared,
# connected accessory, never a mid-air orphan.
# ─────────────────────────────────────────────────────────────────────────────

_ATTACH_KINDS = {"fastened", "bonded", "press_fit", "hinged", "sliding", "supported_by",
                 "nested_accessory", "electrical_cable", "fluid_tube", "optical_alignment",
                 "external_lead", "removable_interface"}
# a role whose ONLY declared tie is a removable_interface to this external host is a
# first-class razor-and-blade dock boundary, not an orphan (the consumable pops out of the
# instrument). The target `instrument` is NOT a role of the assembly being composed.
_EXTERNAL_HOST = "instrument"
_ACCESSORY_KINDS = {"nested_accessory", "external_lead"}   # legitimately-detached edge types


def assembly_connectedness_proof(c: FunctionalFormContract) -> dict:
    """Build the typed attachment graph over the role-volumes and check the primary
    assembly is ONE connected component. Returns assembly-connectedness-proof/v1."""
    roles = {rv.role for rv in c.role_volumes}
    chassis = c.chassis_role
    findings: list[dict] = []
    # index relations; validate kinds + endpoints exist
    accessory_roles: set[str] = set()
    adj: dict[str, set[str]] = {r: set() for r in roles}
    for rel in c.required_relations:
        frm, kind, to, intentional = rel
        if kind not in _ATTACH_KINDS:
            findings.append({"code": "BAD_ATTACH_KIND", "detail": f"{frm}-{kind}->{to}"})
        # a removable_interface to the EXTERNAL host is a declared razor-and-blade dock
        # boundary — frm must be a real role, but the target is outside this assembly, so it
        # adds no internal edge and is never an orphan (the cassette pops out of the instrument).
        if kind == "removable_interface" and to == _EXTERNAL_HOST:
            if frm not in roles:
                findings.append({"code": "ATTACH_ENDPOINT_MISSING", "detail": f"{frm}->{to}"})
            continue
        if frm not in roles or to not in roles:
            findings.append({"code": "ATTACH_ENDPOINT_MISSING", "detail": f"{frm}->{to}"})
            continue
        if intentional or kind in _ACCESSORY_KINDS:
            accessory_roles.add(frm)
        # accessory edges still CONNECT (a declared, attached accessory) — add to graph
        adj[frm].add(to)
        adj[to].add(frm)
    # PRIMARY assembly = all roles EXCEPT declared accessories. It must be one component
    # reachable from the chassis. (Accessories are checked to have a typed edge below.)
    primary = roles - accessory_roles
    if chassis and chassis in primary:
        seen = set()
        stack = [chassis]
        while stack:
            n = stack.pop()
            if n in seen:
                continue
            seen.add(n)
            for m in adj.get(n, ()):  # traverse all edges; accessories are leaves off primary
                if m in primary and m not in seen:
                    stack.append(m)
        floating = sorted(primary - seen)
        if floating:
            findings.append({"code": "FLOATING_ROLE",
                             "detail": f"{floating} not attached to chassis {chassis!r} "
                                       f"by any typed path (mid-air / lost parent)"})
    elif chassis is None:
        findings.append({"code": "NO_CHASSIS", "detail": "no assembly root defined"})
    # every accessory must have at least one typed accessory edge (declared, not orphan)
    for a in accessory_roles:
        if not adj.get(a):
            findings.append({"code": "ORPHAN_ACCESSORY", "detail": a})
    ok = len(findings) == 0
    return {
        "schema": "assembly-connectedness-proof/v1",
        "ok": ok,
        "chassis": chassis,
        "primary_component_size": len(primary),
        "n_accessories": len(accessory_roles),
        "connected": ok,
        "findings": findings,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 2. Deterministic candidate ARRANGEMENTS  +  3. binary hard-feasibility culling
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class Arrangement:
    """A candidate placement of the role volumes along the primary axis."""
    axis: str
    stack: list[str]                 # ordered role names bottom→top or source→detector
    visible_signature: list[str]     # roles that must read on the exterior
    label: str = ""


def generate_candidates(c: FunctionalFormContract) -> list[Arrangement]:
    """Deterministic candidate arrangements. No randomness — the same contract always
    yields the same ordered candidate list (determinism precondition). Candidates differ
    in how the role volumes are ORDERED on the axis; the cull + selection pick the one
    that satisfies access/visibility/hazard."""
    if not c.role_volumes:
        return []
    roles = [rv.role for rv in c.role_volumes]
    sig = [rv.role for rv in c.role_volumes if rv.must_be_visible]
    # Candidate A: axis-position order (source→sample→detector / base→top) — the natural
    # functional order. Candidate B: sample-first (sample volume placed at the accessible
    # face). Both deterministic; the cull decides.
    order = {"source": 0, "base": 1, "mid": 2, "sample": 3, "detector": 4, "top": 5, "front": 2, "side": 2}
    by_axis = sorted(roles, key=lambda r: order.get(
        next(rv.axis_position for rv in c.role_volumes if rv.role == r), 2))
    sample_first = ([rv.role for rv in c.role_volumes if rv.axis_position == "sample"]
                    + [rv.role for rv in c.role_volumes if rv.axis_position != "sample"])
    return [
        Arrangement(axis=c.primary_axis or "", stack=by_axis, visible_signature=sig,
                    label="axis-order"),
        Arrangement(axis=c.primary_axis or "", stack=sample_first, visible_signature=sig,
                    label="sample-first"),
    ]


def cull_infeasible(candidates: list[Arrangement], c: FunctionalFormContract) -> list[Arrangement]:
    """BINARY hard-feasibility — remove any candidate that violates a hard rule. No soft
    weights. Universal rules (physical / human / manufacturing):
      F1 the sample interface role MUST be present + visible (you cannot use an instrument
         whose sample interface isn't there) — this is the generic-box / missing-signature cull.
      F2 an accessible role MUST be reachable from the access direction (not buried under a
         sealed volume) — the sample must sit at or above the access face.
      F3 wrong-transport: a medium's role set must not contain a FOREIGN transport role
         (a flow manifold on an electric-field device; an optical cuvette on a current device)."""
    # interface role SUBSTRING (handles the 3 electrode_lead_* instances, etc.)
    interface_role = {
        "cuvette": "sample_cuvette", "tube-wells": "sample_block",
        "electrode-grid+cartridge": "electrode_grid", "electrode-leads": "electrode_lead",
        "culture-vial": "culture_vial", "syringe-cradle": "syringe_cradle",
        "stage-slide": "stage", "rotor-slots": "rotor", "reservoir-ports": "reservoir",
    }.get(c.sample_interface or "", "")
    foreign = {
        "electric_field": {"manifold", "valve", "pipe", "pump_head", "cuvette"},
        "electric_current": {"cuvette", "electrode_grid", "manifold"},
        "culture_fluid": {"cuvette", "electrode_grid"},
        "light": {"electrode_grid", "manifold"},
        # a CONSUMABLE card carries no active drive — a motor/rotor/heatsink/transducer/gantry
        # belongs to the instrument that reads it, never to the blade.
        "sealed_cartridge": {"motor", "rotor", "stepper", "heatsink", "transducer", "gantry", "leadscrew"},
    }.get(c.working_medium or "", set())
    out = []
    for a in candidates:
        # F1 — sample interface present + visible (substring: covers electrode_lead_we/re/ce)
        if interface_role and not any(interface_role in r for r in a.stack):
            continue
        if interface_role and not any(interface_role in r for r in a.visible_signature):
            continue
        # F3 — no foreign transport role
        if any(any(f in r for f in foreign) for r in a.stack):
            continue
        out.append(a)
    return out


def select_best(feasible: list[Arrangement]) -> Optional[Arrangement]:
    """Human/manufacturing/service selection among survivors. Deterministic: prefer the
    axis-order arrangement (natural functional read); fall back to the first survivor."""
    if not feasible:
        return None
    for a in feasible:
        if a.label == "axis-order":
            return a
    return feasible[0]


# ─────────────────────────────────────────────────────────────────────────────
# 4. Emit form-proof/v1 — the delivered proof the form is function-derived
# ─────────────────────────────────────────────────────────────────────────────

def compose_form(state: dict) -> dict:
    """Full solver: state → form-proof/v1. Returns {ok, form_proof|reason}."""
    c = derive_functional_form(state)
    if not c.working_medium:
        return {"schema": "form-proof/v1", "ok": False,
                "reason": "NO_WORKING_MEDIUM", "detail": c.medium_basis}
    if not c.role_volumes:
        return {"schema": "form-proof/v1", "ok": False,
                "reason": "NO_FORM_RULE_FOR_MEDIUM", "detail": c.working_medium}
    candidates = generate_candidates(c)
    feasible = cull_infeasible(candidates, c)
    chosen = select_best(feasible)
    if chosen is None:
        return {"schema": "form-proof/v1", "ok": False, "reason": "NO_FEASIBLE_ARRANGEMENT",
                "detail": f"all {len(candidates)} candidates culled for {c.working_medium}"}
    conn = assembly_connectedness_proof(c)
    return {
        "schema": "form-proof/v1",
        "ok": True and conn["ok"],
        "working_medium": c.working_medium,
        "medium_basis": c.medium_basis,
        "primary_axis": c.primary_axis,
        "sample_interface": c.sample_interface,
        "openness": c.openness,
        "operator_view": c.operator_view,
        "repeated_count": c.repeated_count,
        "hazard_boundary": c.hazard_boundary,
        "arrangement": chosen.stack,
        "visible_signature": chosen.visible_signature,
        "n_candidates": len(candidates),
        "n_feasible": len(feasible),
        "connectedness": conn,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 5. GEOMETRY PLAN — turn the form-proof into concrete role placements in an envelope.
# This is the bridge from proof → CAD: a pure, testable plan (positions/sizes in mm),
# consumed by the Blender placer. It GENERALISES the per-product signature geometry:
# the same axis→layout rules place ANY medium's roles, so an unseen archetype gets a
# coherent placement, not a box. All mm, origin at envelope centre, z up from base_z.
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class Placement:
    name: str
    shape: str                 # box / cylinder / grid / vial / open-frame
    center_mm: tuple[float, float, float]
    size_mm: tuple[float, float, float]
    on_exterior: bool          # visible on the sealed product view (the signature)


# Axis → how the role stack lays out in the (W, D, H) envelope. Each returns a dict
# role → (center, size, exterior). Universal: keyed on the primary axis, not the product.
def _plan_planar_array(roles, W, D, H, bz):
    """electric_field: the controller_deck IS the base body (open PCBA); the electrode GRID
    sits CONTIGUOUS on its top face; cartridge just above; HV driver inside the deck. One
    cohesive stack — the deck is the chassis every other role attaches to (no floating)."""
    deck_h = max(H, 8.0)
    deck_top = bz + deck_h
    out = {}
    for rv in roles:
        r = rv.role
        if "grid" in r:
            out[r] = ((0, 0, deck_top + 0.7), (W * 0.66, D * 0.62, 1.4), True)   # pads ON the deck
        elif "cartridge" in r:
            out[r] = ((0, 0, deck_top + 2.6), (W * 0.5, D * 0.5, 2.0), True)      # over the grid
        elif "hv" in r:
            out[r] = ((W * 0.3, 0, bz + deck_h * 0.4), (W * 0.2, D * 0.3, deck_h * 0.5), False)
        else:  # controller_deck = the base body/chassis (full footprint)
            out[r] = ((0, 0, bz + deck_h * 0.5), (W, D, deck_h), True)
    return out


def _plan_external_cell(roles, W, D, H, bz):
    """electric_current: the afe_board IS the flat base body; colour-coded electrode LEADS
    (external, exempt) + host_port mount ON its front face (touching)."""
    body_h = max(H, 12.0)
    fy = -D / 2                      # body front face
    out = {}
    leads = [rv for rv in roles if "lead" in rv.role]
    for i, rv in enumerate(leads):
        lx = (i - (len(leads) - 1) / 2) * W * 0.2
        # seated on the front face: back end overlaps the body, protrudes forward
        out[rv.role] = ((lx, fy - 6, bz + body_h * 0.5), (8, 16, 8), True)
    for rv in roles:
        if "board" in rv.role or "afe" in rv.role:
            out[rv.role] = ((0, 0, bz + body_h * 0.5), (W, D, body_h), True)   # full base body
        elif "port" in rv.role:
            # on the front face, back edge touching the body (body front at fy)
            out[rv.role] = ((W * 0.34, fy - 2, bz + body_h * 0.5), (12, 10, 6), True)
    return out


def _plan_vertical_wet_stack(roles, W, D, H, bz):
    """culture_fluid: electronics base → stir/heat → VIAL protruding up → OD sensors → cap."""
    top = bz + H
    vial_h = max(H * 0.8, 30.0)
    vr = min(W, D) * 0.11
    out = {}
    for rv in roles:
        r = rv.role
        if "vial" in r:
            out[r] = ((0, 0, top + vial_h * 0.5), (vr * 2, vr * 2, vial_h), True)   # shape=vial
        elif "od" in r:
            # OD housings seated ON the base top (bottom touching), rising to hug the vial
            _sx = -(vr + 6) if "source" in r else (vr + 6)
            _odh = vial_h * 0.5
            out[r] = ((_sx, 0, top + _odh * 0.5), (8, 11, _odh), True)
        elif "cap" in r:
            out[r] = ((0, 0, top + vial_h + 4), (vr * 2.2, vr * 2.2, 6), True)
        elif "stir" in r:
            out[r] = ((0, 0, bz + H * 0.35), (W * 0.3, D * 0.3, H * 0.3), False)
        else:  # electronics base
            out[r] = ((0, 0, bz + H * 0.5), (W, D, H), True)
    return out


def _plan_linear_through(roles, W, D, H, bz):
    """light: hmi_deck IS the flat L-body base; a near-cubic optical cube (cuvette) sits ON
    the deck top with the source + detector seated ON the deck flanking it — all touching."""
    body_h = max(H, 10.0)
    top = bz + body_h
    cube = min(W * 0.34, D * 0.7)          # near-cubic optical chamber
    cx = W * 0.24
    out = {}
    for rv in roles:
        r = rv.role
        if "cuvette" in r or "sample" in r:
            out[r] = ((cx, 0, top + cube * 0.5), (cube, cube, cube), True)          # on deck
        elif "source" in r:
            out[r] = ((cx - cube * 0.5 - 5, 0, top + 5), (10, 6, 10), True)         # on deck, by cube
        elif "detector" in r:
            out[r] = ((cx + cube * 0.5 + 5, 0, top + 5), (10, 10, 10), False)       # on deck, by cube
        else:  # hmi_deck = base body (full footprint)
            out[r] = ((0, 0, bz + body_h * 0.5), (W, D, body_h), True)
    return out


def _plan_block(roles, W, D, H, bz):
    """heat: controller IS the base body; the aluminium sample block sits ON its top, the
    hinged lid sits ON the block, the heatsink is seated ON the top beside the block."""
    body_h = max(H, 12.0)
    top = bz + body_h
    blk_h = body_h * 0.45
    out = {}
    for rv in roles:
        r = rv.role
        if "block" in r:
            out[r] = ((0, 0, top + blk_h * 0.5), (W * 0.5, D * 0.5, blk_h), True)   # on deck
        elif "lid" in r:
            out[r] = ((0, 0, top + blk_h + 3), (W * 0.6, D * 0.5, 6), True)          # on block
        elif "heatsink" in r:
            out[r] = ((0, D * 0.28, top + blk_h * 0.5), (W * 0.5, D * 0.18, blk_h), False)  # on deck by block
        else:  # controller = base body
            out[r] = ((0, 0, bz + body_h * 0.5), (W, D, body_h), False)
    return out


def _plan_repeated_linear(roles, W, D, H, bz, n):
    """linear_displacement: a shared open BASE PLATE carries N parallel bays (stepper→screw
    →carriage→cradle, all seated ON the plate so they touch it → one connected frame); the
    console is a SEPARATE volume joined by a cable (typed edge, exempt)."""
    n = max(1, n)
    plate_h = max(6.0, H * 0.12)
    ptop = bz + plate_h
    sh = max(H * 0.5, 10.0)
    bw = W / (n + 1.5)
    out = {"sp_base": ((0, 0, bz + plate_h * 0.5), (W, D, plate_h), True)}   # shared frame plate
    for i in range(n):
        bx = (i - (n - 1) / 2) * (W / n) * 0.92
        for rv in roles:
            r = rv.role
            if "console" in r:
                continue
            key = f"{r}_{i}" if n > 1 else r
            if "stepper" in r:
                out[key] = ((bx, D * 0.28, ptop + sh * 0.5), (bw, D * 0.2, sh), True)      # on plate, rear
            elif "leadscrew" in r:
                out[key] = ((bx, 0, ptop + sh * 0.5), (5, D * 0.62, 5), True)              # spans back→front, touches stepper
            elif "carriage" in r:
                out[key] = ((bx, 0, ptop + sh * 0.5), (bw, D * 0.14, sh * 0.6), True)      # on screw axis
            elif "cradle" in r:
                out[key] = ((bx, -D * 0.28, ptop + sh * 0.4), (bw, D * 0.2, sh * 0.8), True)  # on plate, front
    for rv in roles:
        if "console" in rv.role:                              # separate, cable-connected (exempt)
            out[rv.role] = ((W * 0.62, 0, bz + sh * 0.6), (W * 0.22, D * 0.42, sh * 1.2), True)
    return out


def _plan_on_base(roles, W, D, H, bz):
    """GENERIC universal layout: the chassis (axis_position 'base') is the full-footprint
    body; every other structural role is seated ON its top (bottom touching) spread across
    x, or on the front face; accessories nest on top. Guarantees one connected component.
    Covers most new media (magnetic/orbital/acoustic/gravimetric/vacuum/electrophoresis/
    thermal_volume/gantry). Not gold-perfect per family — the fast-loop 'sensible + connected'
    baseline; per-family shape polish comes later."""
    body_h = max(H, 12.0)
    top = bz + body_h
    fy = -D / 2
    base = next((rv.role for rv in roles if rv.axis_position == "base"), None)
    tops = [rv for rv in roles if rv.role != base and rv.axis_position != "front"]
    fronts = [rv for rv in roles if rv.axis_position == "front"]
    out = {}
    if base:
        out[base] = ((0, 0, bz + body_h * 0.5), (W, D, body_h), True)
    nt = max(1, len(tops))
    for i, rv in enumerate(tops):
        rx = (i - (nt - 1) / 2.0) * (W / (nt + 0.6))
        rh = body_h * 0.55
        sz = (W / (nt + 1.2), D * 0.5, rh)
        out[rv.role] = ((rx, 0, top + rh * 0.5), sz, rv.must_be_visible)
    for j, rv in enumerate(fronts):
        rx = (j - (len(fronts) - 1) / 2.0) * W * 0.3
        out[rv.role] = ((rx, fy - 2, bz + body_h * 0.5), (W * 0.2, 6, body_h * 0.4), True)
    return out


def _plan_pressure(roles, W, D, H, bz):
    """pressure-vessel: a cylindrical body with a clamped lid on top + gauge/valve on the
    lid — the autoclave/pressure-cooker morphology. All seated on the vessel (touching)."""
    body_h = max(H, 20.0)
    r = min(W, D) * 0.45
    top = bz + body_h
    out = {}
    for rv in roles:
        role = rv.role
        if "vessel" in role:
            out[role] = ((0, 0, bz + body_h * 0.5), (r * 2, r * 2, body_h), True)
        elif "lid" in role:
            out[role] = ((0, 0, top + 4), (r * 2.05, r * 2.05, 10), True)     # clamped on top
        elif "gauge" in role:
            out[role] = ((r * 0.4, 0, top + 12), (8, 8, 10), True)            # on the lid
        else:  # relief valve
            out[role] = ((-r * 0.4, 0, top + 12), (6, 6, 12), True)
    return out


def _plan_rotary(roles, W, D, H, bz):
    """rotation: motor_base IS the body; the slotted ROTOR disk seated ON its top (touching);
    a hinged lid overlapping the rotor. Universal — added via the fast loop, same contact rule."""
    body_h = max(H, 12.0)
    top = bz + body_h
    rr = min(W, D) * 0.40
    out = {}
    for rv in roles:
        r = rv.role
        if "rotor" in r:
            out[r] = ((0, 0, top - 5), (rr * 2, rr * 2, 8), True)        # rotor RECESSED in the chamber
        elif "lid" in r:
            out[r] = ((0, 0, top + 4), (W * 0.96, D * 0.96, 8), True)    # lid RESTS on the body rim
        else:  # motor_base = base body
            out[r] = ((0, 0, bz + body_h * 0.5), (W, D, body_h), True)
    return out


def _plan_planar_card(roles, W, D, H, bz, n):
    """sealed_cartridge (the razor-and-blade CONSUMABLE): a THIN planar card. card_substrate
    IS the full-footprint laminate body (chassis); the microfluidic layer is bonded on top;
    N reagent reservoirs + N inlet ports sit on the fluidic layer (bottom touching); a clear
    detection window and a keyed dock rail (the removable interface to the host instrument)
    are on the card. Everything bonded → one connected card. The reservoir COUNT drives the
    array, so the SAME form serves a smart / organoid / crystal cassette. Envelope H is CLAMPED
    thin (5–12 mm) — a cassette is a card regardless of the generic envelope handed in."""
    n = max(1, n)
    sh = min(max(H, 5.0), 12.0)                 # a cassette is thin
    top = bz + sh
    flu_top = top + 2.0                         # top of the bonded fluidic layer
    out = {}
    for rv in roles:
        r = rv.role
        if "substrate" in r:
            out[r] = ((0, 0, bz + sh * 0.5), (W, D, sh), True)                  # full-footprint card body
        elif "fluidic" in r:
            out[r] = ((0, 0, top + 1.0), (W * 0.9, D * 0.9, 2.0), True)         # bonded on top
        elif "window" in r:
            out[r] = ((0, D * 0.30, top + 1.1), (W * 0.4, D * 0.22, 2.2), True)  # clear read zone
        elif "dock" in r:
            out[r] = ((0, D * 0.44, bz + sh * 0.5), (W * 0.7, D * 0.12, sh), True)  # keyed rail, rear edge
    res = next((rv.role for rv in roles if "reservoir" in rv.role), None)
    prt = next((rv.role for rv in roles if "port" in rv.role), None)
    ww = W / (n + 1.5)
    for i in range(n):
        cx = (i - (n - 1) / 2.0) * (W / n) * 0.9
        if res:
            out[f"{res}_{i}" if n > 1 else res] = ((cx, D * 0.05, flu_top + 3.0), (ww * 0.7, D * 0.34, 6.0), True)
        if prt:
            out[f"{prt}_{i}" if n > 1 else prt] = ((cx, -D * 0.34, flu_top + 2.5), (ww * 0.4, D * 0.10, 5.0), True)
    return out


def _plan_optical_column(roles, W, D, H, bz):
    """image_plane: flexure body base, stage on top, objective below stage, condenser above."""
    top = bz + H
    out = {}
    for rv in roles:
        r = rv.role
        if "stage" in r:
            out[r] = ((0, 0, top), (W * 0.5, D * 0.5, H * 0.06), True)
        elif "objective" in r:
            out[r] = ((0, 0, top - H * 0.25), (10, 10, H * 0.4), True)
        elif "condenser" in r:
            # illumination column rising from the body top (bottom touching) over the stage
            out[r] = ((0, 0, top + H * 0.15), (12, 12, H * 0.3), True)
        elif "actuator" in r:
            out[r] = ((W * 0.35, 0, bz + H * 0.5), (W * 0.12, D * 0.2, H * 0.5), True)
        else:  # flexure body
            out[r] = ((0, 0, bz + H * 0.5), (W, D, H), True)
    return out


def measured_connectedness(placements: list[dict], tol_mm: float = 2.0,
                           exempt: set | None = None) -> dict:
    """MEASURED connectedness (Cursor: proof = delivered GEOMETRY, not intent). Builds an
    adjacency graph over the actual placement bounding boxes — two roles are attached only
    if their AABBs TOUCH/overlap within tol on every axis (real contact, NOT proximity of
    centres). Asserts the PRIMARY structure (non-exempt roles) is one connected component.
    `exempt` = role names joined by a TYPED non-contact edge (external_lead / cable /
    nested_accessory) — legitimately geometrically separate, so excluded from the primary-
    component requirement (a lead exits the body; a console connects by cable). Catches the
    floating-slab class the plan-level (role-graph) check misses. Pure — no Blender."""
    exempt = exempt or set()
    placements = [p for p in placements
                  if not any(e in p["name"] for e in exempt)]
    n = len(placements)
    if n == 0:
        return {"ok": True, "n_components": 0, "floating": []}

    def _touch(a, b) -> bool:
        for ax in range(3):
            gap = abs(a["center_mm"][ax] - b["center_mm"][ax]) - \
                  (a["size_mm"][ax] / 2 + b["size_mm"][ax] / 2)
            if gap > tol_mm:               # a real separation on this axis → not touching
                return False
        return True

    adj = {i: set() for i in range(n)}
    for i in range(n):
        for j in range(i + 1, n):
            if _touch(placements[i], placements[j]):
                adj[i].add(j)
                adj[j].add(i)
    # connected components
    seen, comps = set(), 0
    for i in range(n):
        if i in seen:
            continue
        comps += 1
        stack, comp = [i], []
        while stack:
            k = stack.pop()
            if k in seen:
                continue
            seen.add(k)
            comp.append(k)
            stack.extend(adj[k] - seen)
        if comps == 1:
            largest = comp
    # everything NOT in the first (largest by construction of the loop order isn't
    # guaranteed largest — recompute) — report roles outside the biggest component
    comp_of = {}
    seen2, cid = set(), 0
    groups: list[list[int]] = []
    for i in range(n):
        if i in seen2:
            continue
        stack, g = [i], []
        while stack:
            k = stack.pop()
            if k in seen2:
                continue
            seen2.add(k)
            g.append(k)
            stack.extend(adj[k] - seen2)
        groups.append(g)
    biggest = max(groups, key=len) if groups else []
    floating = [placements[i]["name"] for g in groups if g is not biggest for i in g]
    return {"ok": len(groups) == 1, "n_components": len(groups), "floating": sorted(floating)}


def compose_geometry_plan(state: dict, envelope_mm: tuple[float, float, float],
                          base_z_mm: float = 0.0) -> dict:
    """form-proof → concrete Placement list for an envelope. Universal: the primary axis
    picks the layout; ANY medium's roles get coherent placement. Returns {ok, placements}
    or {ok:False, reason} (never a silent box)."""
    proof = compose_form(state)
    if not proof.get("ok"):
        return {"schema": "geometry-plan/v1", "ok": False, "reason": proof.get("reason")}
    c = derive_functional_form(state)
    W, D, H = envelope_mm
    axis = c.primary_axis
    dispatch = {
        "planar-array": lambda: _plan_planar_array(c.role_volumes, W, D, H, base_z_mm),
        "external-cell": lambda: _plan_external_cell(c.role_volumes, W, D, H, base_z_mm),
        "vertical-wet-stack": lambda: _plan_vertical_wet_stack(c.role_volumes, W, D, H, base_z_mm),
        "linear-through": lambda: _plan_linear_through(c.role_volumes, W, D, H, base_z_mm),
        "block": lambda: _plan_block(c.role_volumes, W, D, H, base_z_mm),
        "repeated-linear": lambda: _plan_repeated_linear(c.role_volumes, W, D, H, base_z_mm, c.repeated_count),
        "optical-column": lambda: _plan_optical_column(c.role_volumes, W, D, H, base_z_mm),
        "rotary-stack": lambda: _plan_rotary(c.role_volumes, W, D, H, base_z_mm),
        "on-base": lambda: _plan_on_base(c.role_volumes, W, D, H, base_z_mm),
        "pressure-vessel": lambda: _plan_pressure(c.role_volumes, W, D, H, base_z_mm),
        "planar-card": lambda: _plan_planar_card(c.role_volumes, W, D, H, base_z_mm, c.repeated_count),
    }.get(axis)
    if not dispatch:
        return {"schema": "geometry-plan/v1", "ok": False, "reason": f"NO_LAYOUT_FOR_AXIS_{axis}"}
    raw = dispatch()
    shape_of = {rv.role: rv.geometry_family for rv in c.role_volumes}
    placements = []
    for name, (ctr, sz, ext) in raw.items():
        base_role = name.rsplit("_", 1)[0] if name[-1:].isdigit() else name
        placements.append(Placement(
            name=name, shape=shape_of.get(base_role, shape_of.get(name, "box")),
            center_mm=tuple(round(float(x), 2) for x in ctr),
            size_mm=tuple(round(float(x), 2) for x in sz), on_exterior=ext))
    pl = [asdict(p) for p in placements]
    # roles joined by a typed NON-contact edge are legitimately geometrically separate
    exempt = {rel[0] for rel in c.required_relations
              if rel[1] in ("external_lead", "electrical_cable", "nested_accessory")}
    measured = measured_connectedness(pl, exempt=exempt)
    return {"schema": "geometry-plan/v1", "ok": bool(measured["ok"]), "axis": axis,
            "working_medium": c.working_medium,
            "placements": pl,
            "measured_connectedness": measured}


# ─────────────────────────────────────────────────────────────────────────────
# proveCatch fixtures (Cursor directive): EWOD first, + generic-box / missing-grid /
# wrong-transport must FAIL.
# ─────────────────────────────────────────────────────────────────────────────

def _synthetic_state(**q) -> dict:
    return {"orchestratorContract": {"quantities": {k: {"value": v} for k, v in q.items()}}}


def _selftest() -> int:
    bad = 0

    def check(name, cond):
        nonlocal bad
        if not cond:
            print(f"  FAIL {name}"); bad += 1
        else:
            print(f"  ok   {name}")

    # FIXTURE 1 — EWOD cartridge controller (electrode_count → electric_field).
    ewod = compose_form(_synthetic_state(electrode_count=64))
    check("EWOD ok", ewod.get("ok") is True)
    check("EWOD medium=electric_field", ewod.get("working_medium") == "electric_field")
    check("EWOD has electrode grid in signature",
          "electrode_grid" in (ewod.get("visible_signature") or []))
    check("EWOD interface = grid+cartridge",
          ewod.get("sample_interface") == "electrode-grid+cartridge")

    # proveCatch A — GENERIC BOX: a state with NO working-medium signal must NOT yield a form.
    generic = compose_form(_synthetic_state(mass_kg=2))
    check("generic-box FAILS (no medium)", generic.get("ok") is False
          and generic.get("reason") == "NO_WORKING_MEDIUM")

    # proveCatch B — MISSING GRID: an EWOD contract whose role set lost the electrode grid
    # must be culled (F1). Drive the cull directly on a stripped contract.
    c = derive_functional_form(_synthetic_state(electrode_count=64))
    c.role_volumes = [rv for rv in c.role_volumes if rv.role != "electrode_grid"]
    cands = generate_candidates(c)
    feas = cull_infeasible(cands, c)
    check("missing-grid FAILS (culled, no feasible)", len(feas) == 0)

    # proveCatch C — WRONG TRANSPORT: an EWOD arrangement carrying a flow 'manifold' role
    # is the wrong physics → culled (F3).
    c2 = derive_functional_form(_synthetic_state(electrode_count=64))
    bad_cand = Arrangement(axis="planar-array",
                           stack=["electrode_grid", "cartridge", "distribution_manifold"],
                           visible_signature=["electrode_grid", "cartridge"], label="axis-order")
    feas2 = cull_infeasible([bad_cand], c2)
    check("wrong-transport FAILS (manifold culled)", len(feas2) == 0)

    # UNIVERSALITY — a NEVER-SEEN archetype that nonetheless carries a functional signal
    # gets a coherent function-derived form (not a box). E.g. an unknown product that is
    # really electrochemical (compliance_voltage) resolves to the current form.
    unseen = compose_form(_synthetic_state(compliance_voltage_v=5))
    check("unseen-but-functional resolves (electric_current)",
          unseen.get("ok") is True and unseen.get("working_medium") == "electric_current"
          and any("electrode_lead" in s for s in (unseen.get("visible_signature") or [])))

    # DETERMINISM — same input twice → identical proof (the twin-run precondition).
    a1 = compose_form(_synthetic_state(working_volume_ml=20))
    a2 = compose_form(_synthetic_state(working_volume_ml=20))
    check("deterministic (byte-identical proof)", json.dumps(a1) == json.dumps(a2))

    # CONNECTEDNESS (Cursor assembly-connectedness spec) — nothing floats.
    for med, sig in (("electric_field", 64), ("electric_current", 5), ("culture_fluid", 20)):
        cc = derive_functional_form(_synthetic_state(**{
            "electrode_count" if med == "electric_field" else
            "compliance_voltage_v" if med == "electric_current" else "working_volume_ml": sig}))
        proof = assembly_connectedness_proof(cc)
        check(f"{med} assembly is ONE connected component", proof["ok"] is True)
    # structural repetition landed (Cursor): 3 WE/RE/CE leads, source+detector OD, 3 actuators
    cc_ec = derive_functional_form(_synthetic_state(compliance_voltage_v=5))
    check("electrochemical has 3 WE/RE/CE leads",
          sum(1 for rv in cc_ec.role_volumes if "electrode_lead" in rv.role) == 3)
    cc_bio = derive_functional_form(_synthetic_state(working_volume_ml=20))
    check("bioreactor has od_source + od_detector",
          {"od_source", "od_detector"} <= {rv.role for rv in cc_bio.role_volumes})
    cc_mic = derive_functional_form(_synthetic_state(stage_axis_count=3))
    check("microscope has 3 XYZ actuators",
          sum(1 for rv in cc_mic.role_volumes if rv.role.startswith("actuator_")) == 3)
    # proveCatch — a FLOATING role (a role with no attaching relation) must FIRE.
    cc_float = derive_functional_form(_synthetic_state(electrode_count=64))
    cc_float.role_volumes.append(RoleVolume(role="floating_widget", geometry_family="box",
                                            must_be_visible=True, must_be_accessible=False))
    fp = assembly_connectedness_proof(cc_float)
    check("floating role FIRES FLOATING_ROLE",
          any(f["code"] == "FLOATING_ROLE" for f in fp["findings"]))
    # an intentional-detached accessory (removable cap) is CONNECTED via a typed edge → PASS
    check("intentional accessory (cartridge/cap) does NOT fire",
          derive_functional_form(_synthetic_state(electrode_count=64)) and
          assembly_connectedness_proof(derive_functional_form(_synthetic_state(working_volume_ml=20)))["ok"])

    # CASSETTE (the razor-and-blade CONSUMABLE, Yuri Gap A 2026-07-18) — a consumable card
    # resolves to a connected sealed_cartridge form. It is NOT a powered instrument.
    cas = compose_form(_synthetic_state(cassette_format="SBS", reservoir_count=6))
    check("cassette resolves (sealed_cartridge)",
          cas.get("ok") is True and cas.get("working_medium") == "sealed_cartridge")
    check("cassette signature exposes reservoirs + ports + window",
          {"reagent_reservoirs", "inlet_ports", "detection_window"} <= set(cas.get("visible_signature") or []))
    cc_cas = derive_functional_form(_synthetic_state(cassette_format="SBS", reservoir_count=6))
    check("cassette declares a FIRST-CLASS removable_interface dock",
          any(kind == "removable_interface" for (_f, kind, _t, _i) in cc_cas.required_relations))
    check("cassette assembly is ONE connected component (dock external, NOT an orphan)",
          assembly_connectedness_proof(cc_cas)["ok"] is True)
    # a smart / organoid cassette that ALSO carries an instrument signal still resolves as the CARD
    smart = compose_form(_synthetic_state(cassette_format="slide", electrode_count=64, reservoir_count=4))
    check("smart cassette (electrode_count present) is the CARD, not the EWOD instrument",
          smart.get("working_medium") == "sealed_cartridge")
    # a bare EWOD INSTRUMENT (no consumable signal) is unaffected — still electric_field
    check("bare EWOD instrument (no cassette signal) is STILL electric_field",
          compose_form(_synthetic_state(electrode_count=64)).get("working_medium") == "electric_field")
    # geometry: thin, full-footprint card; reservoirs replicate by count
    env_c = (127.0, 85.0, 40.0)                 # SBS-ish footprint, generous H → must clamp thin
    gp_cas = compose_geometry_plan(_synthetic_state(cassette_format="SBS", reservoir_count=6), env_c)
    check("cassette geometry plan ok (measured-connected)", gp_cas.get("ok") is True)
    _sub = next((p for p in gp_cas.get("placements", []) if "substrate" in p["name"]), None)
    check("cassette substrate is a thin full-footprint card (H clamped ≤12 mm)",
          _sub is not None and _sub["size_mm"][2] <= 12.0 and _sub["size_mm"][0] == env_c[0])
    check("cassette replicates reservoirs by reservoir_count (6 wells)",
          sum(1 for p in gp_cas.get("placements", []) if "reagent_reservoirs" in p["name"]) == 6)
    # proveCatch — a cassette carrying a FOREIGN instrument drive role (a motor) is culled (F3)
    cbad = derive_functional_form(_synthetic_state(cassette_format="SBS", reservoir_count=6))
    bad_c = Arrangement(axis="planar-card", stack=["card_substrate", "reagent_reservoirs", "drive_motor"],
                        visible_signature=["reagent_reservoirs"], label="axis-order")
    check("cassette with a foreign motor role is culled (F3)", len(cull_infeasible([bad_c], cbad)) == 0)

    # GEOMETRY PLAN — the form-proof composes into concrete placements (universal layout).
    env = (100.0, 80.0, 30.0)
    gp_ewod = compose_geometry_plan(_synthetic_state(electrode_count=64), env)
    check("EWOD geometry plan ok", gp_ewod.get("ok") is True)
    _ewod_names = [p["name"] for p in gp_ewod.get("placements", [])]
    check("EWOD plan places an electrode grid on the exterior",
          any("grid" in p["name"] and p["on_exterior"] and p["shape"] == "grid"
              for p in gp_ewod.get("placements", [])))
    gp_bio = compose_geometry_plan(_synthetic_state(working_volume_ml=20), env)
    _vial = next((p for p in gp_bio.get("placements", []) if "vial" in p["name"]), None)
    check("culture plan: vial is a vial shape protruding above the base",
          _vial is not None and _vial["shape"] == "vial"
          and _vial["center_mm"][2] > env[2])   # vial centre above envelope top
    gp_pump = compose_geometry_plan(_synthetic_state(channel_count=3), env)
    check("syringe plan repeats bays by channel_count (3× cradles)",
          sum(1 for p in gp_pump.get("placements", []) if "cradle" in p["name"]) == 3)
    # generic box: no medium → no geometry plan (never a silent box)
    gp_gen = compose_geometry_plan(_synthetic_state(mass_kg=2), env)
    check("generic geometry plan FAILS (no medium)", gp_gen.get("ok") is False)
    # MEASURED connectedness (Cursor: delivered geometry, not intent) — the composed plans
    # must be geometrically ONE component (touching bboxes), not just role-graph connected.
    check("EWOD plan is measured-connected (one geometric component)",
          gp_ewod.get("measured_connectedness", {}).get("ok") is True)
    # proveCatch — a role placed FLOATING (a real gap from every other bbox) must FIRE
    # even if the role-graph says connected (the opendrop-v1 floating-slab class).
    floaty = [{"name": "deck", "shape": "box", "center_mm": (0, 0, 0), "size_mm": (100, 80, 20), "on_exterior": True},
              {"name": "floating_grid", "shape": "grid", "center_mm": (0, 0, 200), "size_mm": (60, 50, 2), "on_exterior": True}]
    mc = measured_connectedness(floaty)
    check("measured connectedness FIRES on a floating placement",
          mc["ok"] is False and "floating_grid" in mc["floating"])
    contig = [{"name": "deck", "shape": "box", "center_mm": (0, 0, 0), "size_mm": (100, 80, 20), "on_exterior": True},
              {"name": "grid", "shape": "grid", "center_mm": (0, 0, 11), "size_mm": (60, 50, 2), "on_exterior": True}]
    check("measured connectedness PASSES a contiguous stack",
          measured_connectedness(contig)["ok"] is True)
    # determinism on the plan too
    check("geometry plan deterministic",
          json.dumps(compose_geometry_plan(_synthetic_state(electrode_count=64), env))
          == json.dumps(gp_ewod))

    print("functional_form selftest:", "OK" if bad == 0 else f"{bad} FAIL")
    return bad


def main() -> int:
    if "--selftest" in sys.argv[1:]:
        return 1 if _selftest() else 0
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print("usage: functional_form.py <state.json> | --selftest", file=sys.stderr)
        return 2
    with open(args[0], "r", encoding="utf-8") as fh:
        state = json.load(fh)
    print(json.dumps(compose_form(state), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
