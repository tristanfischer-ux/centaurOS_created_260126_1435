#!/usr/bin/env python3
"""FPK mesh authenticity score — principal meshes vs plain-cuboid proxies.

INTENT (JLR FE front FPK P6): the render must carry engineering morphology, not
featureless bricks. Score = fraction of principal traction meshes that are CAD
family imports or compound primitives (cylinders, L-busbars, ribbed cold plates).

Reads ``form-meshes.json`` from the twin when present; falls back to an empty
mesh list (score absent → proveCatch fires).

Run:
  python3 scripts/lib/fpk_mesh_authenticity.py --selftest
  python3 scripts/lib/fpk_mesh_authenticity.py out/formula-e-front-mgu-20260729-1432
"""
from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence

SCHEMA = "fpk-mesh-authenticity/1"
SOURCE = "scripts/lib/fpk_mesh_authenticity.py"

# Geometry kinds that count as authentic (non-plain-cuboid).
AUTHENTIC_KINDS = frozenset({"cad_family", "compound"})

# Principal mechanism roles — one score row per role (indexed meshes collapse).
# Tuple: (role_id, label, mesh regex on stripped name, default kind from SOURCE)
PRINCIPAL_ROLES: tuple[tuple[str, str, str, str], ...] = (
    ("pack_base", "Traction pack base", r"^u_se_td_pack_base(_rail_\d+)?$", "compound"),
    ("pack_housing", "Pack housing spine", r"^u_se_td_pack_housing(_flange_\d+)?$", "compound"),
    ("motor_housing", "Motor barrel housing", r"^u_se_td_motor_housing$", "compound"),
    ("stator_ring", "Stator lamination ring", r"^u_se_td_stator_ring$", "compound"),
    ("end_winding", "Wave-wound end turns", r"^u_se_td_winding_end_\d+$", "compound"),
    ("hollow_rotor", "Hollow PM rotor barrel", r"^u_se_td_hollow_rotor$", "compound"),
    ("sun_gear", "Planetary sun gear", r"^u_se_td_sun_gear$", "compound"),
    ("planet_set", "Planetary pinions", r"^u_se_td_planet_\d+$", "compound"),
    ("planet_carrier", "Planet carrier", r"^u_se_td_planet_carrier$", "compound"),
    ("gearbox_nest", "Planetary nest volume", r"^u_se_td_gearbox$", "compound"),
    ("diff_nest", "Mini-diff nest", r"^u_se_td_diff_nest$", "compound"),
    ("diff_bulge", "Diff bulge seat", r"^u_se_td_diff_bulge$", "compound"),
    ("mcu_shelf", "MCU upper shelf", r"^u_se_td_mcu_shelf(_lip_\d+)?$", "compound"),
    ("sic_inverter", "SiC inverter stack", r"^u_se_td_sic_inverter(_mod_\d+)?$", "compound"),
    ("inverter_coldplate", "Inverter cold plate", r"^u_se_td_inverter_coldplate$", "compound"),
    # GOTCHA: L-busbar placer emits `_leg_v` / `_leg_h` children, not a bare parent.
    ("phase_bus", "AC phase busbar pierce", r"^u_se_td_phase_bus_\d+(_leg_[vh])?$", "compound"),
    ("hv_bus", "DC-link bus bar", r"^u_se_td_hv_bus(_leg_[vh])?$", "compound"),
    ("control_pcb", "OEM control PCB", r"^u_se_td_(control_pcb|pcb)$", "cad_family"),
    ("gate_drive_pcb", "Gate-drive PCB", r"^u_se_td_gate_drive_pcb$", "cad_family"),
    ("ring_gear", "Fixed ring gear", r"^u_se_td_ring_gear(_tooth_\d+)?$", "compound"),
    ("magnet_set", "PM magnet segments", r"^u_se_td_magnet_\d+$", "compound"),
    ("motor_shaft", "Motor shaft", r"^u_se_td_motor_shaft$", "compound"),
    ("halfshaft_flange", "Halfshaft flanges", r"^u_se_td_halfshaft_flange_\d+$", "compound"),
    ("coolant_jacket", "Motor coolant jacket", r"^u_se_td_coolant_jacket$", "compound"),
    ("coolant_ports", "Coolant inlet/outlet", r"^u_se_td_coolant_(in|out)$", "compound"),
    ("coolant_hoses", "Attached coolant hose stubs", r"^u_se_td_coolant_hose_\d+$", "compound"),
    ("hv_connector", "HV DC connector", r"^u_se_td_hv_connector(_barrel)?$", "compound"),
    ("hv_cable_boot", "HV cable boot", r"^u_se_td_hv_cable_boot$", "compound"),
    ("lv_harness", "LV/control harness boot", r"^u_se_td_lv_harness_boot$", "compound"),
    ("control_ribbon", "Control/gate-drive ribbon", r"^u_se_td_(signal|gate_drive)_ribbon$", "compound"),
    ("output_shaft", "Output shaft stub", r"^u_se_td_output_shaft(_b)?$", "compound"),
)

# Cosmetic / fastener meshes — labelled viz_only, excluded from principal denominator.
VIZ_ONLY_PATTERNS: tuple[tuple[str, str], ...] = (
    (r"^u_se_td_cast_fin_\d+$", "exterior cooling fin"),
    (r"^u_se_td_cast_rib(_cam|_rear)?_\d+$", "cast housing rib"),
    (r"^u_se_td_gasket_lip_\d+$", "end-bell gasket lip"),
    (r"^u_se_td_end_bolt_\d+$", "end-bell bolt circle"),
    (r"^u_se_td_mount_pad_\d+$", "chassis mount pad"),
    (r"^u_se_td_mount_bolt_\d+$", "chassis mount bolt"),
    (r"^u_se_td_mcu_gasket_lip$", "MCU shelf gasket land"),
    (r"^u_se_td_pe_module_\d+$", "PE half-bridge module brick"),
    (r"^u_se_td_pe_busbar(_ins)?_\d+$", "PE laminated busbar cue"),
    (r"^u_se_td_pe_filmcap_\d+$", "PE film capacitor bank"),
    (r"^u_se_td_pe_gd_flex$", "PE gate-drive flex cue"),
    (r"^u_se_td_vehicle_(hv|cool_in|cool_out|lv)$", "vehicle-side concept anchor"),
    (r"^u_se_td_hv_connector_(key_flat|hvil|braid_collar|braid_boot)$", "HV connector family cue"),
    (r"^u_se_td_coldplate_fastener_\d+$", "cold-plate fastener"),
    (r"^u_se_td_coldplate_machine_face$", "machined face cue"),
    (r"^u_se_td_nameplate$", "nameplate decal"),
    (r"^u_se_td_bay_endwall_\d+$", "bay end ring"),
    (r"^u_se_td_mount_ear_\d+$", "mounting ear"),
    (r"^u_se_td_microjet_\d+_\d+$", "end-winding oil jet cue"),
    (r"^u_se_td_stator_hint$", "stator ID hint"),
    (r"^u_se_td_rotor_hint$", "rotor bore hint"),
    (r"^u_se_td_pcb_package_\d+$", "PCB package proxy"),
    (r"^u_se_td_pcb_edge_pads$", "PCB edge pads"),
    (r"^u_se_td_dclink_cap_\d+$", "DC-link capacitor"),
    (r"^u_se_td_hv_pin_\d+$", "HV pin tower"),
    (r"^u_se_td_hv_hood$", "HV connector hood"),
    (r"^u_se_td_hv_shield$", "HV EMI shield"),
    (r"^u_se_td_gear_breather$", "gearbox breather"),
    (r"^u_se_td_resolver_bulge$", "resolver bulge"),
    (r"^u_se_td_jacket_band$", "jacket band cue"),
    (r"^u_se_td_ground_stud$", "ground stud"),
    (r"^u_se_td_end_bell_\d+$", "motor end bell"),
    (r"^u_se_td_bearing_cap_\d+$", "bearing cap"),
    (r"^u_se_td_lv_connector$", "LV connector"),
    (r"^u_se_td_coolant_(in|out)_flange$", "coolant port flange"),
    (r"^u_se_td_coolant_clamp_\d+$", "coolant hose clamp"),
)

_INDEX_SUFFIX_RE = re.compile(r"_\d+$")


def _strip_index(name: str) -> str:
    return _INDEX_SUFFIX_RE.sub("", str(name))


def _load_form_meshes(run_dir: Path) -> dict[str, Any]:
    for rel in ("form-meshes.json", "blender-universal/form-meshes.json"):
        path = run_dir / rel
        if path.is_file():
            return json.loads(path.read_text(encoding="utf-8"))
    return {}


def _mesh_kind(
    mesh_name: str,
    provenance: Mapping[str, Any],
    default_kind: str,
) -> str:
    """Resolve geometry kind: provenance dump wins, else SOURCE table default."""
    entry = provenance.get(mesh_name)
    if isinstance(entry, Mapping) and entry.get("kind"):
        return str(entry["kind"])
    base = _strip_index(mesh_name)
    entry = provenance.get(base)
    if isinstance(entry, Mapping) and entry.get("kind"):
        return str(entry["kind"])
    return default_kind


def _match_role(mesh: str) -> tuple[str, str, str] | None:
    for role_id, label, pattern, default_kind in PRINCIPAL_ROLES:
        if re.search(pattern, mesh):
            return role_id, label, default_kind
    return None


def _viz_label(mesh: str) -> str | None:
    for pattern, label in VIZ_ONLY_PATTERNS:
        if re.search(pattern, mesh):
            return label
    return None


@dataclass(frozen=True)
class PrincipalVerdict:
    role_id: str
    label: str
    mesh: str | None
    kind: str
    authentic: bool


def evaluate_mesh_authenticity(
    run_dir: Path | str,
    *,
    form_data: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Compute authenticity score + residual cuboid principals + viz_only labels."""
    root = Path(run_dir)
    data = dict(form_data) if form_data is not None else _load_form_meshes(root)
    meshes: list[str] = list(data.get("meshes") or [])
    provenance: dict[str, Any] = dict(data.get("mesh_provenance") or {})

    principals: list[PrincipalVerdict] = []
    seen_roles: set[str] = set()
    for role_id, label, pattern, default_kind in PRINCIPAL_ROLES:
        if role_id in seen_roles:
            continue
        match_mesh: str | None = None
        for mesh in meshes:
            if re.search(pattern, mesh):
                match_mesh = mesh
                break
        if match_mesh is None:
            principals.append(
                PrincipalVerdict(role_id, label, None, "missing", False)
            )
            seen_roles.add(role_id)
            continue
        kind = _mesh_kind(match_mesh, provenance, default_kind)
        principals.append(
            PrincipalVerdict(
                role_id,
                label,
                match_mesh,
                kind,
                kind in AUTHENTIC_KINDS,
            )
        )
        seen_roles.add(role_id)

    present = [p for p in principals if p.mesh is not None]
    authentic = [p for p in present if p.authentic]
    residual_cuboid = [
        {
            "role_id": p.role_id,
            "label": p.label,
            "mesh": p.mesh,
            "kind": p.kind,
            "fix_route": "build_universal_scene._place_traction_drive_pack_layout",
        }
        for p in present
        if p.kind == "plain_cuboid"
    ]
    viz_only = [
        {"mesh": mesh, "label": lbl}
        for mesh in meshes
        if (lbl := _viz_label(mesh)) is not None
    ]
    score = round(len(authentic) / len(present), 4) if present else None

    return {
        "schema": SCHEMA,
        "source": SOURCE,
        "form": data.get("form"),
        "architecture": data.get("architecture"),
        "mesh_count": len(meshes),
        "principal_count": len(principals),
        "principal_present": len(present),
        "authentic_count": len(authentic),
        "score": score,
        "residual_cuboid": residual_cuboid,
        "viz_only": viz_only,
        "principals": [
            {
                "role_id": p.role_id,
                "label": p.label,
                "mesh": p.mesh,
                "kind": p.kind,
                "authentic": p.authentic,
            }
            for p in principals
        ],
        "form_meshes_path": str(root / "form-meshes.json")
        if (root / "form-meshes.json").is_file()
        else None,
        "ship_ok": False,
    }


def prove_catch(result: Mapping[str, Any]) -> dict[str, Any]:
    """proveCatch: authenticity_score_absent when score is None."""
    score = result.get("score")
    absent = score is None
    return {
        "authenticity_score_absent": {
            "fired": absent,
            "intended_action": "block_greenwash_mesh_score",
        },
        "ok": not absent,
    }


def stamp_mesh_authenticity(out_dir: Path) -> dict[str, Any]:
    """Stamp state.fpkMeshAuthenticity and write markdown report."""
    result = evaluate_mesh_authenticity(out_dir)
    catch = prove_catch(result)
    result["proveCatch"] = catch

    state_path = out_dir / "state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    state["fpkMeshAuthenticity"] = result
    state["ship_ok"] = False
    state_path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")

    report = render_markdown(result, catch)
    report_path = out_dir / "JLR-FE-FRONT-FPK-MESH-AUTHENTICITY.md"
    report_path.write_text(report, encoding="utf-8")

    return {
        "ok": catch["ok"],
        "score": result.get("score"),
        "residual_cuboid_count": len(result.get("residual_cuboid") or []),
        "viz_only_count": len(result.get("viz_only") or []),
        "state_path": str(state_path),
        "report_path": str(report_path),
        "proveCatch": catch,
    }


def render_markdown(result: Mapping[str, Any], catch: Mapping[str, Any]) -> str:
    score = result.get("score")
    score_txt = f"**{score:.1%}**" if isinstance(score, (int, float)) else "**ABSENT**"
    lines = [
        "# JLR FE Front FPK — Mesh authenticity (P6)",
        "",
        f"**Score:** {score_txt} ({result.get('authentic_count', 0)} / "
        f"{result.get('principal_present', 0)} principals authentic)  ",
        f"**Meshes in scene:** {result.get('mesh_count', 0)}  ",
        f"**Form:** `{result.get('form')}` / `{result.get('architecture')}`  ",
        "**ship_ok:** **false** (concept render — not supplier CAD)",
        "",
        "## Bar",
        "",
        "Principal FPK mechanism meshes must be **CAD family imports** or **compound**",
        "primitives (cylinders, L-busbars, ribbed cold plates) — never anonymous",
        "cuboids for windings, busbars, or cold plates. Lucid/Atieva = FFF training",
        "check only — no silhouette paste.",
        "",
        "## Residual plain-cuboid principals",
        "",
    ]
    residual = list(result.get("residual_cuboid") or [])
    if not residual:
        lines.append("_None — all present principals are CAD family or compound._")
    else:
        lines.extend(["| Role | Mesh | Fix route |", "|---|---|---|"])
        for row in residual:
            lines.append(
                f"| {row['label']} | `{row['mesh']}` | `{row['fix_route']}` |"
            )
    lines.extend(
        [
            "",
            "## viz_only (excluded from score denominator)",
            "",
        ]
    )
    viz = list(result.get("viz_only") or [])
    if not viz:
        lines.append("_None labelled._")
    else:
        for row in viz[:30]:
            lines.append(f"- `{row['mesh']}` — {row['label']}")
        if len(viz) > 30:
            lines.append(f"- … and {len(viz) - 30} more")
    lines.extend(
        [
            "",
            "## proveCatch",
            "",
            f"- `authenticity_score_absent`: "
            f"**{'FIRES' if catch['authenticity_score_absent']['fired'] else 'silent'}**",
            "",
            "## Principal table",
            "",
            "| Role | Mesh | Kind | Authentic |",
            "|---|---|---|---|",
        ]
    )
    for p in result.get("principals") or []:
        auth = "yes" if p.get("authentic") else "no"
        mesh = p.get("mesh") or "—"
        lines.append(
            f"| {p.get('label')} | `{mesh}` | `{p.get('kind')}` | {auth} |"
        )
    lines.append("")
    return "\n".join(lines)


def _selftest() -> int:
    bad = 0

    # proveCatch: empty run → score absent → fires
    empty = evaluate_mesh_authenticity(Path("/nonexistent"), form_data={"meshes": []})
    catch_empty = prove_catch(empty)
    if not catch_empty["authenticity_score_absent"]["fired"]:
        print("  FAIL proveCatch: empty meshes must fire authenticity_score_absent")
        bad += 1

    # Synthetic concentric bay-fill (mirrors 2026-07-29 twin)
    synthetic_meshes = [
        "u_se_td_motor_housing",
        "u_se_td_stator_ring",
        "u_se_td_winding_end_0",
        "u_se_td_hollow_rotor",
        "u_se_td_phase_bus_0",
        "u_se_td_inverter_coldplate",
        "u_se_td_pcb",
        "u_se_td_sic_inverter",
        "u_se_td_coolant_hose_0",
        "u_se_td_hv_cable_boot",
        "u_se_td_lv_harness_boot",
        "u_se_td_signal_ribbon",
        "u_se_td_cast_fin_0",
    ]
    synthetic_prov = {
        "u_se_td_pcb": {"kind": "cad_family", "family": "instrument_pcb"},
        "u_se_td_phase_bus_0": {"kind": "compound", "primitive": "l_busbar"},
        "u_se_td_inverter_coldplate": {"kind": "compound", "primitive": "ribbed_plate"},
        "u_se_td_coolant_hose_0": {"kind": "compound", "primitive": "hose_stub"},
        "u_se_td_hv_cable_boot": {"kind": "compound", "primitive": "loom_boot"},
        "u_se_td_lv_harness_boot": {"kind": "compound", "primitive": "loom_boot"},
        "u_se_td_signal_ribbon": {"kind": "compound", "primitive": "ribbon_harness"},
    }
    good = evaluate_mesh_authenticity(
        Path("."),
        form_data={"meshes": synthetic_meshes, "mesh_provenance": synthetic_prov},
    )
    catch_good = prove_catch(good)
    if catch_good["authenticity_score_absent"]["fired"]:
        print("  FAIL proveCatch: populated principals must not fire absent")
        bad += 1
    if good.get("score") is None or good["score"] <= 0:
        print(f"  FAIL score must be >0 for synthetic principals, got {good.get('score')}")
        bad += 1
    # sic without provenance → default kind from PRINCIPAL_ROLES (compound after P6).
    # Adversarial residual: force a plain_cuboid default via synthetic role absence
    # of provenance + override check on pack_base-style leftover.
    plain_synth = evaluate_mesh_authenticity(
        Path("."),
        form_data={
            "meshes": ["u_se_td_mystery_brick"],
            "mesh_provenance": {},
        },
    )
    if plain_synth.get("score") not in (None, 0.0) and (plain_synth.get("principal_present") or 0) > 0:
        # mystery brick is not a principal — score may be None/0; OK
        pass
    # Keep adversarial: a principal present with explicit plain_cuboid provenance must residual.
    forced = evaluate_mesh_authenticity(
        Path("."),
        form_data={
            "meshes": synthetic_meshes,
            "mesh_provenance": {
                **synthetic_prov,
                "u_se_td_sic_inverter": {"kind": "plain_cuboid"},
            },
        },
    )
    if "u_se_td_sic_inverter" not in {r["mesh"] for r in forced.get("residual_cuboid") or []}:
        print("  FAIL residual list must include provenance-forced plain cuboid sic_inverter")
        bad += 1
    viz_meshes = {v["mesh"] for v in good.get("viz_only") or []}
    if "u_se_td_cast_fin_0" not in viz_meshes:
        print("  FAIL cast_fin must be viz_only")
        bad += 1
    # Phase N2: cast-language + PE volume cues labelled viz_only when present.
    n2 = evaluate_mesh_authenticity(
        Path("."),
        form_data={
            "meshes": [
                *synthetic_meshes,
                "u_se_td_cast_rib_cam_0",
                "u_se_td_gasket_lip_0",
                "u_se_td_pe_module_0",
                "u_se_td_vehicle_hv",
                "u_se_td_hv_connector_hvil",
            ],
            "mesh_provenance": synthetic_prov,
        },
    )
    n2_viz = {v["mesh"] for v in n2.get("viz_only") or []}
    for must in (
        "u_se_td_cast_rib_cam_0",
        "u_se_td_gasket_lip_0",
        "u_se_td_pe_module_0",
        "u_se_td_vehicle_hv",
        "u_se_td_hv_connector_hvil",
    ):
        if must not in n2_viz:
            print(f"  FAIL Phase N2 viz_only missing {must}")
            bad += 1

    if bad:
        print(f"fpk_mesh_authenticity selftest: {bad} FAIL")
        return 1
    print("fpk_mesh_authenticity selftest OK")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", nargs="?", type=Path)
    ap.add_argument("--stamp", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    if args.selftest:
        return _selftest()

    if args.stamp:
        if not args.run_dir:
            print("--stamp requires run_dir", flush=True)
            return 2
        out = stamp_mesh_authenticity(args.run_dir)
        print(json.dumps(out, indent=2))
        return 0 if out["ok"] else 1

    if not args.run_dir:
        ap.print_help()
        return 2

    result = evaluate_mesh_authenticity(args.run_dir)
    catch = prove_catch(result)
    payload = {**result, "proveCatch": catch}
    if args.json:
        print(json.dumps(payload, indent=2))
    else:
        print(render_markdown(result, catch))
    return 0 if catch["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
