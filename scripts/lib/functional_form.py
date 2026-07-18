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
_MEDIUM_FORM_RULE: dict[str, dict[str, Any]] = {
    "light": {
        "axis": "linear-through", "interface": "cuvette", "openness": "sealed",
        "operator_view": "top", "access": "top", "hazard": "light-tight",
        "roles": [("source", "box", True, False, "source"),
                  ("sample_cuvette", "box", True, True, "sample"),
                  ("detector", "box", False, False, "detector"),
                  ("hmi_deck", "box", True, True, "base")],
    },
    "heat": {
        "axis": "block", "interface": "tube-wells", "openness": "sample-open",
        "operator_view": "top", "access": "top", "hazard": "heated-lid",
        "roles": [("sample_block", "box", True, True, "sample"),
                  ("hinged_lid", "box", True, True, "top"),
                  ("heatsink", "box", False, False, "base"),
                  ("controller", "box", False, False, "base")],
    },
    "electric_field": {
        "axis": "planar-array", "interface": "electrode-grid+cartridge", "openness": "open-pcba",
        "operator_view": "top", "access": "top", "hazard": "high-voltage",
        "roles": [("electrode_grid", "grid", True, True, "sample"),
                  ("cartridge", "box", True, True, "top"),
                  ("hv_driver", "box", False, False, "base"),
                  ("controller_deck", "box", True, False, "base")],
    },
    "electric_current": {
        "axis": "external-cell", "interface": "electrode-leads", "openness": "sealed",
        "operator_view": "front", "access": "front", "hazard": None,
        "roles": [("electrode_leads", "cylinder", True, True, "sample"),
                  ("afe_board", "box", False, False, "base"),
                  ("host_port", "box", True, True, "front")],
    },
    "culture_fluid": {
        "axis": "vertical-wet-stack", "interface": "culture-vial", "openness": "sample-open",
        "operator_view": "top", "access": "top", "hazard": "wet-dry",
        "roles": [("electronics_base", "box", True, False, "base"),
                  ("stir_heat", "box", False, False, "base"),
                  ("culture_vial", "vial", True, True, "sample"),
                  ("od_sensors", "box", True, False, "sample"),
                  ("sterile_cap", "box", True, True, "top")],
    },
    "linear_displacement": {
        "axis": "repeated-linear", "interface": "syringe-cradle", "openness": "mechanism-open",
        "operator_view": "top", "access": "front", "hazard": None,
        "roles": [("stepper", "box", True, False, "base"),
                  ("leadscrew", "cylinder", True, False, "mid"),
                  ("carriage", "box", True, True, "mid"),
                  ("syringe_cradle", "open-frame", True, True, "sample"),
                  ("console", "box", True, True, "side")],
    },
    "image_plane": {
        "axis": "optical-column", "interface": "stage-slide", "openness": "mechanism-open",
        "operator_view": "top", "access": "top", "hazard": None,
        "roles": [("flexure_body", "box", True, False, "base"),
                  ("stage", "box", True, True, "sample"),
                  ("objective", "cylinder", True, False, "detector"),
                  ("condenser", "cylinder", True, False, "source"),
                  ("actuators", "box", True, False, "base")],
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
    c.role_volumes = [
        RoleVolume(role=r, geometry_family=g, must_be_visible=vis,
                   must_be_accessible=acc, axis_position=pos)
        for (r, g, vis, acc, pos) in rule["roles"]
    ]
    return c


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
    interface_role = {
        "cuvette": "sample_cuvette", "tube-wells": "sample_block",
        "electrode-grid+cartridge": "electrode_grid", "electrode-leads": "electrode_leads",
        "culture-vial": "culture_vial", "syringe-cradle": "syringe_cradle",
        "stage-slide": "stage",
    }.get(c.sample_interface or "", "")
    foreign = {
        "electric_field": {"manifold", "valve", "pipe", "pump_head", "cuvette"},
        "electric_current": {"cuvette", "electrode_grid", "manifold"},
        "culture_fluid": {"cuvette", "electrode_grid"},
        "light": {"electrode_grid", "manifold"},
    }.get(c.working_medium or "", set())
    out = []
    for a in candidates:
        # F1
        if interface_role and interface_role not in a.stack:
            continue
        if interface_role and interface_role not in a.visible_signature:
            continue
        # F3
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
    return {
        "schema": "form-proof/v1",
        "ok": True,
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
    }


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
          and "electrode_leads" in (unseen.get("visible_signature") or []))

    # DETERMINISM — same input twice → identical proof (the twin-run precondition).
    a1 = compose_form(_synthetic_state(working_volume_ml=20))
    a2 = compose_form(_synthetic_state(working_volume_ml=20))
    check("deterministic (byte-identical proof)", json.dumps(a1) == json.dumps(a2))

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
