#!/usr/bin/env python3
"""Stamp recursive FPK physics tree into the live front twin.

INTENT: bottom-up first-principles tree (materials → parts → assemblies)
becomes state.fpkPhysicsTree + contract quantity writeback + markdown checklist.

Usage:
  python3 scripts/fe-front-stamp-fpk-physics-tree.py \
    --twin out/formula-e-front-mgu-20260729-1432
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.lib.fpk_physics_tree import (  # noqa: E402
    build_fpk_physics_tree,
    coverage_report,
    extract_quantity_writeback,
    flatten_tree,
    generate_checklist_disposition,
    render_checklist_md,
)
from scripts.lib.fpk_bus_esl import (  # noqa: E402
    build_fpk_esl_thermal,
    evaluate_cfd_open_gate,
    render_esl_thermal_markdown,
)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--twin",
        type=Path,
        default=ROOT / "out" / "formula-e-front-mgu-20260729-1432",
    )
    args = ap.parse_args()
    state_path = args.twin / "state.json"
    if not state_path.is_file():
        print(f"missing {state_path}", file=sys.stderr)
        return 1

    state = json.loads(state_path.read_text())
    oc = state.setdefault("orchestratorContract", {})
    qs = oc.setdefault("quantities", {})

    root = build_fpk_physics_tree(qs)
    cov = coverage_report(root)
    wb = extract_quantity_writeback(root)
    for k, v in wb.items():
        qs[k] = v

    stamped_at = datetime.now(ZoneInfo("Europe/London")).isoformat(timespec="seconds")
    bus_esl, cold_plate_thermal = build_fpk_esl_thermal(qs)
    cfd_gate = evaluate_cfd_open_gate(
        cold_plate_thermal["open_until"],
        requested_ship_ok=True,
    )
    state["fpkBusEsl"] = {
        "stamped_at": stamped_at,
        "source": "scripts/lib/fpk_bus_esl.py",
        **bus_esl,
    }
    state["fpkColdPlateThermal"] = {
        "stamped_at": stamped_at,
        "source": "scripts/lib/fpk_bus_esl.py",
        **cold_plate_thermal,
        "ship_gate": cfd_gate,
        "ship_ok": cfd_gate["ship_ok"],
    }
    state["fpkPhysicsTree"] = {
        "stamped_at": stamped_at,
        "source": "scripts/lib/fpk_physics_tree.py",
        "plan": "docs/plans/JLR-FE-FRONT-FPK-PHYSICS-BOTTOM-UP-2026-07-29.md",
        "coverage": cov,
        "tree": root.to_dict(),
        "ship_ok": False,
        "mandatory_open_gate": cfd_gate,
        "part_index": [
            {
                "id": n.id,
                "name": n.name,
                "parent_id": n.parent_id,
                "assembly": n.assembly,
                "kind": n.kind,
                "material_id": n.material_id,
                "special_manufacture": n.special_manufacture,
                "domains": list(n.domains),
                "open_until": list(n.open_until),
                "physics_keys": sorted(n.physics.keys()),
            }
            for n in flatten_tree(root)
        ],
    }

    state_path.write_text(json.dumps(state, indent=2) + "\n")
    md_path = args.twin / "JLR-FE-FRONT-FPK-PHYSICS-TREE.md"
    md_path.write_text(render_checklist_md(root))
    esl_thermal_md_path = args.twin / "JLR-FE-FRONT-FPK-ESL-THERMAL.md"
    esl_thermal_md_path.write_text(
        render_esl_thermal_markdown(bus_esl, cold_plate_thermal, cfd_gate)
    )
    checklist_path = args.twin / "_physics_checklist_council" / "merged.json"
    if not checklist_path.is_file():
        print(f"missing {checklist_path}", file=sys.stderr)
        return 1
    checklist = json.loads(checklist_path.read_text())
    checklist_parts = checklist.get("parts")
    if not isinstance(checklist_parts, list):
        print(f"invalid checklist parts in {checklist_path}", file=sys.stderr)
        return 1
    disposition = generate_checklist_disposition(root, checklist_parts)
    expected_total = checklist.get("unique_part_paths")
    if disposition["checklist_paths_total"] != expected_total:
        print(
            "checklist count mismatch: "
            f"declared={expected_total} classified={disposition['checklist_paths_total']}",
            file=sys.stderr,
        )
        return 1
    if disposition["coverage_pct"] != 100.0:
        print(f"incomplete disposition: {disposition['coverage_pct']}%", file=sys.stderr)
        return 1
    autonomous_dir = args.twin / "_autonomous"
    autonomous_dir.mkdir(parents=True, exist_ok=True)
    disposition_path = autonomous_dir / "checklist_disposition.json"
    disposition_path.write_text(json.dumps(disposition, indent=2) + "\n")
    diff_path = autonomous_dir / "checklist_vs_tree_diff.json"
    diff_path.write_text(
        json.dumps(
            {
                "checklist_paths_total": disposition["checklist_paths_total"],
                "tree_ids_found": cov["node_count"],
                "mapped": disposition["counts"]["mapped"],
                "duplicates": disposition["counts"]["duplicate"],
                "na": disposition["counts"]["na"],
                "open": disposition["counts"]["open"],
                "classified": disposition["classified_paths"],
                "coverage_pct": disposition["coverage_pct"],
                "ship_ok": False,
                "open_sample": [
                    entry["path"]
                    for entry in disposition["entries"]
                    if entry["disposition"] == "open"
                ][:50],
            },
            indent=2,
        )
        + "\n"
    )

    print(
        f"stamped fpkPhysicsTree → {state_path}\n"
        f"  nodes={cov['node_count']} leaves={cov['leaf_count']} "
        f"coverage={cov['physics_coverage_pct']}%\n"
        f"  report={md_path}\n"
        f"  esl_thermal={esl_thermal_md_path} "
        f"ESL={bus_esl['esl_nh_range']} nH "
        f"source_to_inlet_dT="
        f"{cold_plate_thermal['temperature_rise_k']['source_interface_to_inlet']} K\n"
        f"  disposition={disposition_path} "
        f"mapped={disposition['counts']['mapped']} "
        f"duplicate={disposition['counts']['duplicate']} "
        f"na={disposition['counts']['na']} "
        f"open={disposition['counts']['open']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
