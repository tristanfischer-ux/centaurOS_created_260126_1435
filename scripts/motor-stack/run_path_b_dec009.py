#!/usr/bin/env python3
"""Path B: clean DEC-009 geometry kit-case solve (magnets frozen).

Prerequisite: Path A matched (reproducible under REBALANCED freeze).

Uses twin's live DEC-009 architecture (24,000 rpm / 130 mm stack, design
current as stamped). Freezes baseline magnets 6×22.5 via FIA_MAGNET_* so
derive_fia_geometry cannot re-size them.

Does NOT overwrite the failed em_fia_front_kit_case_DEC009.json.
Does NOT restamp product torque or mint ship_ok.
Restores state via try/finally.

Single-writer twin discipline: does not defend against a concurrent process
writing the OUT path mid-solve. Dirty-tree gate covers kit_case + Path A/B
runners vs HEAD (not the full import closure).
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
TWIN = REPO / "out" / "formula-e-front-mgu-20260729-1432"
REBALANCED = TWIN / "_motor_stack" / "em_fia_front_kit_case_REBALANCED.json"
OUT = TWIN / "_motor_stack" / "em_fia_front_kit_case_PATH_B_DEC009.json"
COMPARE = TWIN / "_motor_stack" / "path_b_dec009_compare.json"
STATE = TWIN / "state.json"
PATH_A_COMPARE = TWIN / "_motor_stack" / "path_a_replay_0802_compare.json"

# Path B always freezes these constants (A/B rebalance baseline magnets).
# REBALANCED must agree or we refuse — silent drift is not allowed.
BASELINE_MAG_T_MM = 6.0
BASELINE_MAG_L_MM = 22.5
DEC009_STACK_MM = 130.0
DEC009_RPM = 24000.0


def _iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def _require_clean_solver_tree() -> None:
    """Refuse if kit_case or runners differ from HEAD (dirty worktree)."""
    paths = [
        "scripts/motor-stack/em_fia_front_kit_case.py",
        "scripts/motor-stack/run_path_a_replay_0802.py",
        "scripts/motor-stack/run_path_b_dec009.py",
    ]
    r = subprocess.run(
        ["git", "diff", "HEAD", "--"] + paths,
        cwd=str(REPO),
        text=True,
        capture_output=True,
        check=False,
    )
    r2 = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard", "--"] + paths,
        cwd=str(REPO),
        text=True,
        capture_output=True,
        check=False,
    )
    dirty = ((r.stdout or "") + (r2.stdout or "")).strip()
    if dirty:
        raise SystemExit(
            "REFUSE: solver/runner differs from HEAD — commit before Path A/B "
            "(ensures Path A/B share the same code as the recorded git_sha).\n"
            + dirty[:2000]
        )


def _sha256_file(path: Path) -> str:
    import hashlib
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _restore_state_verified(backup: Path) -> str:
    """Byte-for-byte restore; return backup sha256 and assert STATE matches."""
    if not backup.is_file():
        raise FileNotFoundError(f"state backup missing: {backup}")
    backup_sha = _sha256_file(backup)
    shutil.copy2(backup, STATE)
    state_sha = _sha256_file(STATE)
    if state_sha != backup_sha:
        raise RuntimeError(
            f"state restore mismatch: backup={backup_sha} state={state_sha}"
        )
    return backup_sha





def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--force",
        action="store_true",
        help="Allow Path B without path_a_matched=true (records force in compare).",
    )
    args = ap.parse_args(argv)

    if not REBALANCED.is_file():
        print("MISSING", REBALANCED, file=sys.stderr)
        return 2

    head_sha = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=str(REPO), text=True
    ).strip()
    path_a_meta: dict | None = None
    if not PATH_A_COMPARE.is_file():
        if not args.force:
            print(
                "REFUSE Path B: missing path_a_replay_0802_compare.json "
                "(pass --force to override)",
                file=sys.stderr,
            )
            return 3
        print("WARN: --force with missing Path A compare", flush=True)
    else:
        pa = json.loads(PATH_A_COMPARE.read_text(encoding="utf-8"))
        path_a_meta = {
            "path_a_matched": pa.get("path_a_matched"),
            "git_sha": pa.get("git_sha"),
            "geometry_freeze_ok": pa.get("geometry_freeze_ok"),
            "path_a_reproducible_under_freeze": pa.get("path_a_reproducible_under_freeze"),
            "reference_mean_nm": pa.get("reference_mean_nm"),
        }
        if not pa.get("path_a_matched") and not args.force:
            print(
                "REFUSE Path B: path_a_matched is false — investigate code first "
                "(pass --force to override)",
                file=sys.stderr,
            )
            return 3
        if pa.get("geometry_freeze_ok") is not True and not args.force:
            print(
                "REFUSE Path B: Path A compare lacks geometry_freeze_ok=true "
                "(pass --force to override)",
                file=sys.stderr,
            )
            return 3
        pa_sha = pa.get("git_sha")
        if not pa_sha and not args.force:
            print(
                "REFUSE Path B: Path A compare missing git_sha "
                "(pass --force to override)",
                file=sys.stderr,
            )
            return 3
        if pa_sha and pa_sha != head_sha and not args.force:
            print(
                f"REFUSE Path B: Path A compare git_sha={pa_sha} != HEAD={head_sha} "
                "(re-run Path A on this revision, or pass --force)",
                file=sys.stderr,
            )
            return 3
        if not pa.get("path_a_matched") and args.force:
            print("WARN: --force despite path_a_matched=false", flush=True)

    sys.path.insert(0, str(REPO / "scripts" / "lib"))
    from twin_write_guard import assert_stage_open

    assert_stage_open(TWIN, "run_path_b_dec009")
    _require_clean_solver_tree()

    run_id = _iso()
    backup = TWIN / f"state.json.pathB-backup-{run_id.replace(':', '')}-{uuid.uuid4().hex[:8]}"
    shutil.copy2(STATE, backup)
    state = json.loads(STATE.read_text(encoding="utf-8"))
    q = ((state.get("orchestratorContract") or {}).get("quantities")) or {}

    honesty_keys = [
        "binding_duty_shaft_torque_nm",
        "last_sign_consistent_kit_case_fe_mean_nm",
        "last_coherent_kit_case_fe_mean_nm",
        "mgu_fe_shaft_torque_nm",
        "dec_009_baseline_reference",
        "dec_009_adopted_torque_ratio",
        "max_rotor_speed_rpm",
        "stack_length_mm",
        "mgu_base_speed_rpm",
        "phase_current_design_a",
        "phase_current_max_a",
        "mgu_efficiency",
        "inverter_efficiency",
    ]
    honesty_snap = {k: q.get(k) for k in honesty_keys}
    ship_ok_snap = state.get("ship_ok")

    stack = (q.get("stack_length_mm") or {}).get("value")
    rpm = (q.get("max_rotor_speed_rpm") or {}).get("value")
    i_design = (q.get("phase_current_design_a") or {}).get("value")
    if stack is None or abs(float(stack) - DEC009_STACK_MM) > 0.05:
        print(f"REFUSE: stack_length_mm={stack!r} not DEC-009 130 mm", file=sys.stderr)
        return 4
    if rpm is None or abs(float(rpm) - DEC009_RPM) > 0.5:
        print(f"REFUSE: max_rotor_speed_rpm={rpm!r} not DEC-009 24000", file=sys.stderr)
        return 4
    conc = state.get("fpkConcentricGeometry") or {}
    if isinstance(conc, dict) and conc.get("active_length_mm") is not None:
        if abs(float(conc["active_length_mm"]) - DEC009_STACK_MM) > 0.05:
            print(
                f"REFUSE: fpkConcentricGeometry.active_length_mm="
                f"{conc['active_length_mm']!r} not DEC-009 130 mm "
                "(mixed architecture)",
                file=sys.stderr,
            )
            return 4

    # Magnets: constants are the freeze. REBALANCED must agree or refuse.
    reb = json.loads(REBALANCED.read_text(encoding="utf-8"))
    mg = reb.get("machine_geometry") or {}
    reb_t = mg.get("magnet_thickness_mm")
    reb_l = mg.get("magnet_length_mm")
    if reb_t is None or reb_l is None:
        print(
            "REFUSE: REBALANCED machine_geometry missing magnet_thickness_mm "
            "or magnet_length_mm (baseline agreement required)",
            file=sys.stderr,
        )
        return 5
    if abs(float(reb_t) - BASELINE_MAG_T_MM) > 0.01:
        print(
            f"REFUSE: REBALANCED magnet_thickness_mm={reb_t} != baseline {BASELINE_MAG_T_MM}",
            file=sys.stderr,
        )
        return 5
    if abs(float(reb_l) - BASELINE_MAG_L_MM) > 0.01:
        print(
            f"REFUSE: REBALANCED magnet_length_mm={reb_l} != baseline {BASELINE_MAG_L_MM}",
            file=sys.stderr,
        )
        return 5
    mag_t = BASELINE_MAG_T_MM
    mag_l = BASELINE_MAG_L_MM

    rc = 1
    backup_sha = None
    try:
        # Do not flip ship_ok during the solve; restore snap in finally
        if OUT.is_file():
            stale = OUT.with_suffix(OUT.suffix + f".stale-{run_id.replace(':', '')}-{uuid.uuid4().hex[:8]}")
            OUT.rename(stale)
            print(f"STALE OUT moved aside -> {stale.name}", flush=True)

        env = os.environ.copy()
        env["PYTHONPATH"] = str(REPO / "scripts" / "motor-stack") + os.pathsep + env.get(
            "PYTHONPATH", ""
        )
        env["FIA_MAGNET_THICKNESS_MM"] = str(mag_t)
        env["FIA_MAGNET_LENGTH_MM"] = str(mag_l)

        cmd = [
            str(REPO / ".venv" / "bin" / "python"),
            str(REPO / "scripts" / "motor-stack" / "em_fia_front_kit_case.py"),
            "--twin",
            str(TWIN),
            "--output",
            str(OUT),
        ]
        print(
            f"PATH B run_id={run_id} DEC-009 | stack={stack} rpm={rpm} "
            f"I_design={i_design} MAGNET OVERRIDE t={mag_t} L={mag_l}"
            f"{' FORCE' if args.force else ''}",
            flush=True,
        )
        print("RUNNING", " ".join(cmd), flush=True)
        proc = subprocess.run(cmd, cwd=str(REPO), env=env)
        rc = proc.returncode
    finally:
        backup_sha = _restore_state_verified(backup)

    compare: dict = {
        "schema": "forgeos.fpk.path_b_dec009_compare/v1",
        "ran_at": _iso(),
        "run_id": run_id,
        "git_sha": head_sha,
        "path_a_gate": str(PATH_A_COMPARE) if PATH_A_COMPARE.is_file() else None,
        "path_a_meta": path_a_meta,
        "forced": bool(args.force),
        "output": str(OUT),
        "failed_dec009_not_overwritten": str(
            TWIN / "_motor_stack" / "em_fia_front_kit_case_DEC009.json"
        ),
        "kit_case_exit": rc,
        "state_backup_sha256": backup_sha,
        "freeze": {
            "stack_length_mm": float(stack),
            "max_rotor_speed_rpm": float(rpm),
            "magnet_thickness_mm": mag_t,
            "magnet_length_mm": mag_l,
            "magnet_source": "BASELINE_CONSTANTS_require_REBALANCED_agree",
            "phase_current_design_a": i_design,
        },
    }

    if rc == 0 and OUT.is_file():
        art = json.loads(OUT.read_text(encoding="utf-8"))
        wic = art.get("works_in_kit_context") or {}
        sw = (art.get("rotor_position_sweep") or {}).get("summary") or {}
        g = art.get("machine_geometry") or {}
        aiq = art.get("input_quantities") or {}
        mean = wic.get("torque_magnitude_mean_nm") or sw.get("torque_magnitude_mean_nm")
        compare["summary"] = {
            "torque_magnitude_mean_nm": mean,
            "required_shaft_torque_nm": wic.get("required_shaft_torque_nm"),
            "mean_torque_vs_required_ratio": wic.get("mean_torque_vs_required_ratio"),
            "torque_reliable": wic.get("torque_reliable"),
            "duty_torque_screen_ok": wic.get("duty_torque_screen_ok"),
            "sign_reversals": sw.get("sign_reversals"),
            "torque_sign_consistent": sw.get("torque_sign_consistent"),
            "torque_magnitude_min_nm": sw.get("torque_magnitude_min_nm"),
            "torque_magnitude_max_nm": sw.get("torque_magnitude_max_nm"),
            "active_length_mm": g.get("active_length_mm"),
            "magnet_thickness_mm": g.get("magnet_thickness_mm"),
            "magnet_length_mm": g.get("magnet_length_mm"),
            "max_rotor_speed_rpm": aiq.get("max_rotor_speed_rpm"),
            "phase_current_design_a": aiq.get("phase_current_design_a"),
            "current_angle_electrical_deg": (art.get("loaded_point") or {}).get(
                "current_angle_electrical_deg"
            ),
            "ship_ok": art.get("ship_ok"),
        }
        geom_ok = (
            abs(float(g.get("active_length_mm") or 0) - DEC009_STACK_MM) < 0.05
            and abs(float(aiq.get("max_rotor_speed_rpm") or 0) - DEC009_RPM) < 0.5
            and i_design is not None
            and abs(float(aiq.get("phase_current_design_a") or 0) - float(i_design)) < 0.5
            and abs(float(g.get("magnet_thickness_mm") or 0) - mag_t) < 0.01
            and abs(float(g.get("magnet_length_mm") or 0) - mag_l) < 0.01
        )
        _sr = compare["summary"].get("sign_reversals")
        sign_ok = bool(
            compare["summary"].get("torque_sign_consistent") is True
            and _sr is not None
            and int(_sr) == 0
            and mean is not None
            and float(mean) > 0
        )
        compare["geometry_freeze_ok"] = geom_ok
        # Forced runs are non-canonical: never mint coherent/duty flags
        prereq_ok = (not args.force) and bool(
            (path_a_meta or {}).get("path_a_matched")
            and (path_a_meta or {}).get("geometry_freeze_ok") is True
            and (path_a_meta or {}).get("git_sha") == head_sha
        )
        compare["path_b_prerequisite_ok"] = prereq_ok
        compare["path_b_fe_coherent"] = bool(geom_ok and sign_ok and rc == 0 and prereq_ok)
        compare["path_b_duty_clear"] = bool(
            compare["path_b_fe_coherent"]
            and compare["summary"].get("duty_torque_screen_ok") is True
        )
        if compare["path_b_fe_coherent"] and not compare["path_b_duty_clear"]:
            compare["next"] = (
                "Record Path B FE as kit-case SIGHT candidate; still no Bar A close "
                "unless duty clears under named bar"
            )
        elif compare["path_b_fe_coherent"] and compare["path_b_duty_clear"]:
            compare["next"] = "Duty clear under kit-case — council before any ship_ok / Bar A"
        else:
            compare["next"] = "Path B incoherent — investigate excitation/geometry; no ship_ok"
    else:
        compare["error"] = (
            f"kit_case_exit={rc}; OUT exists={OUT.is_file()} — refusing stale OUT as coherent"
        )
        compare["path_b_prerequisite_ok"] = (not args.force) and bool(
            (path_a_meta or {}).get("path_a_matched")
            and (path_a_meta or {}).get("geometry_freeze_ok") is True
            and (path_a_meta or {}).get("git_sha") == head_sha
        )
        compare["path_b_fe_coherent"] = False
        compare["path_b_duty_clear"] = False
        compare["next"] = "Re-run or investigate kit_case failure"

    st3 = json.loads(STATE.read_text(encoding="utf-8"))
    q3 = st3["orchestratorContract"]["quantities"]
    compare["honesty_restored"] = {
        "binding": (q3.get("binding_duty_shaft_torque_nm") or {}).get("value"),
        "fe_mean": (q3.get("last_sign_consistent_kit_case_fe_mean_nm") or {}).get("value"),
        "product_basis": (q3.get("mgu_fe_shaft_torque_nm") or {}).get("basis"),
        "ship_ok": st3.get("ship_ok"),
        "rpm": (q3.get("max_rotor_speed_rpm") or {}).get("value"),
        "stack": (q3.get("stack_length_mm") or {}).get("value"),
    }
    COMPARE.write_text(json.dumps(compare, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(compare, indent=2))
    return 0 if rc == 0 and OUT.is_file() else (rc or 1)


if __name__ == "__main__":
    raise SystemExit(main())
