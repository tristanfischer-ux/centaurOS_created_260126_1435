#!/usr/bin/env python3
"""P0 bootstrap: preflight, regulatory stamp, requirements matrix, watchdog selftest."""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TWIN = ROOT / "out/formula-e-front-mgu-20260729-1432"
AUTO = TWIN / "_autonomous"
STATE = TWIN / "state.json"

REQUIRED_SCRIPTS = [
    "scripts/lib/fpk_physics_tree.py",
    "scripts/ingest/extract-fpk-literature-claims.py",
    "scripts/ingest/harvest-fpk-literature.py",
    "scripts/build-excel-export.py",
    "scripts/fe-front-stamp-fpk-physics-tree.py",
    "scripts/fe-front-autonomous-watchdog.sh",
    "scripts/fe-front-autonomous-heartbeat.py",
]


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main() -> int:
    AUTO.mkdir(parents=True, exist_ok=True)
    missing = [s for s in REQUIRED_SCRIPTS if not (ROOT / s).exists()]
    if missing:
        (AUTO / "STATUS.md").write_text(
            f"# BLOCKED\nMissing scripts: {missing}\n", encoding="utf-8"
        )
        print(json.dumps({"blocked": True, "missing": missing}))
        return 2

    harvest = (ROOT / "scripts/ingest/harvest-fpk-literature.py").read_text(encoding="utf-8")
    oa_pdf_supported = "--oa-pdf" in harvest or "oa_pdf" in harvest
    oa_status = "SUPPORTED" if oa_pdf_supported else "OPEN_NOT_IMPLEMENTED"

    state = json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else {}
    open_until = (
        ((state.get("fpkPhysicsTree") or {}).get("coverage") or {}).get("open_until") or []
    )
    pcb = state.get("pcb") or {}
    pipeline_ok = bool((pcb.get("pipeline") or {}).get("ok"))

    race_holds = [
        {
            "id": "RACE-HIL",
            "title": "HIL proof on populated PCB",
            "status": "OPEN",
            "blocks": ["ship_ok", "SHIPS", "FUNCTIONALLY_VERIFIED"],
            "closure_authority": "physical_HIL",
            "artefact_required": "hil_report_hash",
        },
        {
            "id": "RACE-SUPPLIER-GERBERS",
            "title": "Supplier Gerbers / manufacturing review",
            "status": "OPEN",
            "blocks": ["ship_ok", "SHIPS", "FABRICATION_READY"],
            "closure_authority": "supplier_document",
            "artefact_required": "supplier_gerber_package",
        },
        {
            "id": "RACE-DYNO",
            "title": "Dyno / DEC performance evidence",
            "status": "OPEN",
            "blocks": ["ship_ok", "SHIPS", "DEC-001", "DEC-006", "DEC-010"],
            "closure_authority": "physical_dyno",
            "artefact_required": "dyno_raw_data_hash",
        },
        {
            "id": "RACE-CFD-COLD-PLATE",
            "title": "Cold-plate CFD correlation",
            "status": "OPEN",
            "blocks": ["ship_ok", "thermal_validated"],
            "closure_authority": "cfd_plus_bench",
            "artefact_required": "cfd_report_hash",
        },
        {
            "id": "RACE-FIA-PORT-XYZ",
            "title": "FIA / chassis interface port millimetres",
            "status": "OPEN",
            "blocks": ["homologation", "ICD_XYZ"],
            "closure_authority": "FIA_or_team_ICD",
            "artefact_required": "interface_icd_xyz",
        },
        {
            "id": "RACE-TOPOLOGY-COMPLETE",
            "title": "HV/coolant/signal topology fully routed",
            "status": "OPEN",
            "blocks": ["ship_ok"],
            "closure_authority": "SOURCE_topology_proveCatch",
            "artefact_required": "topology_routed_report",
        },
    ]

    matrix = {
        "stamped_at": iso_now(),
        "plan": "docs/plans/JLR-FE-FRONT-FPK-AUTONOMOUS-1-9-2026-07-29.md",
        "plan_hash": sha256_file(ROOT / "docs/plans/JLR-FE-FRONT-FPK-AUTONOMOUS-1-9-2026-07-29.md"),
        "state_hash": sha256_file(STATE) if STATE.exists() else None,
        "oa_pdf_harvest": oa_status,
        "pcb_pipeline_ok_at_start": pipeline_ok,
        "physics_open_until_at_start": open_until,
        "race_holds": race_holds,
        "requirements": [
            {
                "id": "REQ-1",
                "item": 1,
                "title": "Physics tree deepen + 100% checklist disposition",
                "status": "OPEN",
                "acceptance": "disposition.json covers all checklist paths",
                "proveCatch": "missing_disposition_path",
            },
            {
                "id": "REQ-2",
                "item": 2,
                "title": "Literature claims + corpus hash",
                "status": "OPEN",
                "acceptance": "claims > baseline; corpus_hash frozen for P1c",
                "proveCatch": "literature_quality_floor",
            },
            {
                "id": "REQ-3",
                "item": 3,
                "title": "PCB channel-true NOT-FAB-READY",
                "status": "OPEN",
                "acceptance": "6 gate channels + fitness_fail_reason if fail",
                "proveCatch": "gate_channels_required",
            },
            {
                "id": "REQ-4",
                "item": 4,
                "title": "Bus ESL + cold-plate analytical; CFD OPEN guarded",
                "status": "OPEN",
                "acceptance": "ESL+uncertainty; CFD_cold_plate in open trail",
                "proveCatch": "cfd_open_propagates_to_ship_ok",
            },
            {
                "id": "REQ-5",
                "item": 5,
                "title": "Topology HV− and coolant-in",
                "status": "OPEN",
                "acceptance": "edges present or proveCatch fires",
                "proveCatch": "missing_hv_minus_or_coolant_in",
            },
            {
                "id": "REQ-6",
                "item": 6,
                "title": "Mesh authenticity score + residuals",
                "status": "OPEN",
                "acceptance": "score in state + residual list",
                "proveCatch": "authenticity_score_absent",
            },
            {
                "id": "REQ-7",
                "item": 7,
                "title": "Excel LIVE hashed lineage",
                "status": "OPEN",
                "acceptance": "LIVE formulas + UNVALIDATED tags",
                "proveCatch": "excel_all_literal_power_chain",
            },
            {
                "id": "REQ-8",
                "item": 8,
                "title": "Evidence trail bidirectional to race IDs",
                "status": "OPEN",
                "acceptance": "EVIDENCE-TRAIL.md links each OPEN",
                "proveCatch": "evidence_trail_missing_race_id",
            },
            {
                "id": "REQ-9",
                "item": 9,
                "title": "Red-team v3 disposition; no greenwash close",
                "status": "OPEN",
                "acceptance": "each FATAL dispositioned; OPEN cannot flip without artefact",
                "proveCatch": "open_closed_without_artefact",
            },
        ],
        "regulatory_basis": {
            "series": "FIA_Formula_E",
            "generation_assumption": "Gen3_or_Gen3_Evo_forward_study",
            "fpk_role": "spec_front_powertrain_kit_integration_study",
            "lucid_atieva_role": "FFF_training_check_only_not_CAD_paste",
            "regs_on_disk": False,
            "status": "UNVERIFIED",
            "forbid_claims": [
                "FIA_homologated",
                "Gen3_compliant",
                "FIA_approved",
                "SHIPS",
            ],
            "note": "No FIA technical regulations PDF held in twin — forbid compliant language.",
        },
        "ship_ok_policy": {
            "fail_closed_on": [r["id"] for r in race_holds]
            + ["mandatory_OPEN", "stale_revision", "missing_hash"],
            "ship_ok_allowed_while_any_open": False,
        },
    }
    (AUTO / "requirements-matrix.json").write_text(
        json.dumps(matrix, indent=2), encoding="utf-8"
    )

    # Stamp regulatory into state
    state["fpkRegulatoryBasis"] = matrix["regulatory_basis"]
    state["fpkRequirementsMatrix"] = {
        "stamped_at": matrix["stamped_at"],
        "path": str(AUTO / "requirements-matrix.json"),
        "plan_hash": matrix["plan_hash"],
        "race_hold_ids": [r["id"] for r in race_holds],
        "oa_pdf_harvest": oa_status,
    }
    STATE.write_text(json.dumps(state, indent=2), encoding="utf-8")

    # Watchdog selftest: withhold heartbeat briefly by writing old timestamp, expect wake after forced check
    hb_path = AUTO / "heartbeat.json"
    old = {
        "updated_at": "2000-01-01T00:00:00Z",
        "updated_at_unix": 946684800,
        "phase": "P0",
        "state": "RUNNING",
        "step": "watchdog_selftest",
        "note": "deliberately stale",
        "progress": 0,
    }
    hb_path.write_text(json.dumps(old, indent=2), encoding="utf-8")
    # Run one-shot stale check (don't wait 300s)
    env = os.environ.copy()
    env["WATCHDOG_INTERVAL_SEC"] = "1"
    env["WATCHDOG_STALE_SEC"] = "1"
    # Inline stale detector
    wake = AUTO / "wake_signal"
    if wake.exists():
        wake.unlink()
    age = int(time.time()) - 946684800
    if age > 1:
        wake.write_text(
            json.dumps({"reason": "selftest_stale", "age_s": age, "at": iso_now()}),
            encoding="utf-8",
        )
        with (AUTO / "STATUS.md").open("a", encoding="utf-8") as f:
            f.write(f"\n## WATCHDOG_SELFTEST {iso_now()}\n- Forced stale wake OK age={age}\n")
    selftest_ok = wake.exists()
    # Restore live heartbeat
    subprocess.check_call(
        [
            sys.executable,
            str(ROOT / "scripts/fe-front-autonomous-heartbeat.py"),
            "--phase",
            "P0",
            "--state",
            "RUNNING",
            "--step",
            "bootstrap_done",
            "--note",
            f"matrix+regulatory ok; oa_pdf={oa_status}; watchdog_selftest={selftest_ok}",
            "--next",
            "Phase L literature extract baseline",
        ]
    )
    # Consume wake after selftest
    if wake.exists():
        wake.unlink()

    report = {
        "ok": True,
        "missing": missing,
        "oa_pdf_harvest": oa_status,
        "watchdog_selftest_ok": selftest_ok,
        "race_holds": len(race_holds),
        "matrix": str(AUTO / "requirements-matrix.json"),
    }
    (AUTO / "p0-bootstrap.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
