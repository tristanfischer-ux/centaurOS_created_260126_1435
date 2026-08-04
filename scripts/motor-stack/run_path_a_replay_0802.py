#!/usr/bin/env python3
"""Path A: replay 08-02/REBALANCED geometry with today's kit-case code.

Does NOT overwrite REBALANCED. Does NOT restamp product torque. Restores state
via try/finally even on interrupt or parse failure.

Single-writer twin discipline: does not defend against a concurrent process
writing the OUT path mid-solve. Dirty-tree gate covers kit_case + Path A/B
runners vs HEAD (not the full import closure).
"""
from __future__ import annotations

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
OUT = TWIN / "_motor_stack" / "em_fia_front_kit_case_REPLAY_0802.json"
COMPARE = TWIN / "_motor_stack" / "path_a_replay_0802_compare.json"
STATE = TWIN / "state.json"
REF_MEAN_NM = 81.558081
EXPECTED_ACTIVE_MM = 97.58
EXPECTED_RPM = 19500.0
EXPECTED_I_A = 477.0
BASELINE_MAG_T_MM = 6.0
BASELINE_MAG_L_MM = 22.5


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





def main() -> int:
    if not REBALANCED.is_file():
        print("MISSING", REBALANCED, file=sys.stderr)
        return 2
    reb = json.loads(REBALANCED.read_text(encoding="utf-8"))
    iq = reb.get("input_quantities") or {}
    if not iq:
        print("REBALANCED has no input_quantities", file=sys.stderr)
        return 2

    sys.path.insert(0, str(REPO / "scripts" / "lib"))
    from twin_write_guard import assert_stage_open

    assert_stage_open(TWIN, "run_path_a_replay_0802")
    _require_clean_solver_tree()

    run_id = _iso()
    backup = TWIN / f"state.json.pathA-backup-{run_id.replace(':', '')}-{uuid.uuid4().hex[:8]}"
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

    required_iq = (
        "active_length_mm",
        "max_rotor_speed_rpm",
        "phase_current_design_a",
        "machine_efficiency_assumption",
        "inverter_efficiency_assumption",
    )
    missing = [k for k in required_iq if iq.get(k) is None]
    if missing:
        print(f"REFUSE: REBALANCED input_quantities missing {missing}", file=sys.stderr)
        return 5
    try:
        active = float(iq["active_length_mm"])
        rpm = float(iq["max_rotor_speed_rpm"])
        i_a = float(iq["phase_current_design_a"])
        float(iq["machine_efficiency_assumption"])
        float(iq["inverter_efficiency_assumption"])
    except (TypeError, ValueError) as e:
        print(f"REFUSE: non-numeric REBALANCED freeze field: {e}", file=sys.stderr)
        return 5
    if abs(active - EXPECTED_ACTIVE_MM) > 0.05 or abs(rpm - EXPECTED_RPM) > 0.5 or abs(i_a - EXPECTED_I_A) > 0.5:
        print(
            f"REFUSE: REBALANCED operating point {active}/{rpm}/{i_a} "
            f"!= expected 08-02 {EXPECTED_ACTIVE_MM}/{EXPECTED_RPM}/{EXPECTED_I_A}",
            file=sys.stderr,
        )
        return 5
    mg = reb.get("machine_geometry") or {}
    mag_t = mg.get("magnet_thickness_mm")
    mag_l = mg.get("magnet_length_mm")
    if mag_t is None or mag_l is None:
        print("REFUSE: REBALANCED missing magnet dims — incomplete freeze", file=sys.stderr)
        return 5
    try:
        mag_t_f = float(mag_t); mag_l_f = float(mag_l)
    except (TypeError, ValueError):
        print(f"REFUSE: non-numeric magnet dims t={mag_t!r} L={mag_l!r}", file=sys.stderr)
        return 5
    if abs(mag_t_f - BASELINE_MAG_T_MM) > 0.01 or abs(mag_l_f - BASELINE_MAG_L_MM) > 0.01:
        print(
            f"REFUSE: REBALANCED magnets {mag_t_f}x{mag_l_f} != baseline "
            f"{BASELINE_MAG_T_MM}x{BASELINE_MAG_L_MM}",
            file=sys.stderr,
        )
        return 5

    rc = 1
    backup_sha = None
    try:
        def setv(key: str, value, unit: str | None = None, basis: str = "path_a_replay_0802"):
            row = dict(q.get(key) or {}) if isinstance(q.get(key), dict) else {}
            row["value"] = value
            if unit:
                row["unit"] = unit
            row["basis"] = basis
            row["source"] = "path_a_replay_from_REBALANCED_input_quantities"
            row["provenance"] = {
                "source": "em_fia_front_kit_case_REBALANCED.json#input_quantities",
                "path_a": True,
                "run_id": run_id,
                "note": "temporary for Path A solve only; restored after",
            }
            q[key] = row

        setv("stack_length_mm", active, "mm")
        setv("max_rotor_speed_rpm", rpm, "rpm")
        setv("mgu_base_speed_rpm", rpm, "rpm")
        setv("phase_current_design_a", i_a, "A")
        setv("phase_current_max_a", i_a, "A")
        setv("continuous_power_kw", iq.get("continuous_electrical_power_kw", 250), "kW")
        setv("front_regen_electrical_cap_kw", iq.get("front_regen_electrical_cap_kw", 250), "kW")

        # Prefer REBALANCED machine_geometry radial dims; fall back to IQ
        conc = dict(state.get("fpkConcentricGeometry") or {})
        for k in (
            "rotor_inner_diameter_mm",
            "rotor_outer_diameter_mm",
            "stator_inner_diameter_mm",
            "stator_outer_diameter_mm",
            "radial_airgap_mm",
            "housing_outer_diameter_mm",
            "housing_length_mm",
        ):
            val = mg.get(k)
            if val is None:
                val = iq.get(k)
            if val is not None:
                conc[k] = val
        conc["active_length_mm"] = active
        state["fpkConcentricGeometry"] = conc

        for k in ("turns_per_coil", "turns_per_phase", "winding_parallel_paths", "twin_stator_slots"):
            if iq.get(k) is not None:
                setv(k, iq[k])

        if iq.get("machine_efficiency_assumption") is not None:
            setv("mgu_efficiency", iq["machine_efficiency_assumption"], basis="path_a_replay_0802")
        if iq.get("inverter_efficiency_assumption") is not None:
            setv(
                "inverter_efficiency",
                iq["inverter_efficiency_assumption"],
                basis="path_a_replay_0802",
            )

        state.setdefault("orchestratorContract", {})["quantities"] = q
        state["ship_ok"] = False
        STATE.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

        # Never treat a pre-existing OUT as this run's result
        if OUT.is_file():
            stale = OUT.with_suffix(OUT.suffix + f".stale-{run_id.replace(':', '')}-{uuid.uuid4().hex[:8]}")
            OUT.rename(stale)
            print(f"STALE OUT moved aside -> {stale.name}", flush=True)

        env = os.environ.copy()
        env["PYTHONPATH"] = str(REPO / "scripts" / "motor-stack") + os.pathsep + env.get(
            "PYTHONPATH", ""
        )
        if mag_t is not None:
            env["FIA_MAGNET_THICKNESS_MM"] = str(mag_t)
        if mag_l is not None:
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
            f"run_id={run_id} MAGNET OVERRIDE t={env.get('FIA_MAGNET_THICKNESS_MM')} "
            f"L={env.get('FIA_MAGNET_LENGTH_MM')}",
            flush=True,
        )
        print("RUNNING", " ".join(cmd), flush=True)
        proc = subprocess.run(cmd, cwd=str(REPO), env=env)
        rc = proc.returncode
    finally:
        backup_sha = _restore_state_verified(backup)

    compare: dict = {
        "schema": "forgeos.fpk.path_a_replay_0802_compare/v1",
        "ran_at": _iso(),
        "run_id": run_id,
        "git_sha": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=str(REPO), text=True
        ).strip(),
        "rebalanced": str(REBALANCED),
        "replay": str(OUT),
        "kit_case_exit": rc,
        "state_backup_sha256": backup_sha,
        "reference_mean_nm": REF_MEAN_NM,
        "expected_freeze": {
            "active_length_mm": active,
            "max_rotor_speed_rpm": rpm,
            "phase_current_design_a": i_a,
            "magnet_thickness_mm": float(mag_t) if mag_t is not None else None,
            "magnet_length_mm": float(mag_l) if mag_l is not None else None,
            "machine_efficiency_assumption": iq.get("machine_efficiency_assumption"),
            "inverter_efficiency_assumption": iq.get("inverter_efficiency_assumption"),
        },
    }

    # Only accept OUT if kit_case exited 0 and file exists after THIS run
    if rc == 0 and OUT.is_file():
        art = json.loads(OUT.read_text(encoding="utf-8"))
        wic = art.get("works_in_kit_context") or {}
        sw = (art.get("rotor_position_sweep") or {}).get("summary") or {}
        g = art.get("machine_geometry") or {}
        aiq = art.get("input_quantities") or {}
        mean = wic.get("torque_magnitude_mean_nm") or sw.get("torque_magnitude_mean_nm")
        compare["replay_summary"] = {
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
            "machine_efficiency_assumption": aiq.get("machine_efficiency_assumption"),
            "inverter_efficiency_assumption": aiq.get("inverter_efficiency_assumption"),
        }
        if mean is not None:
            compare["delta_mean_nm"] = float(mean) - REF_MEAN_NM
            compare["delta_mean_pct"] = 100.0 * (float(mean) - REF_MEAN_NM) / REF_MEAN_NM

        exp = compare["expected_freeze"]
        geom_ok = (
            abs(float(g.get("active_length_mm") or 0) - float(exp["active_length_mm"])) < 0.05
            and abs(float(aiq.get("max_rotor_speed_rpm") or 0) - float(exp["max_rotor_speed_rpm"]))
            < 0.5
            and abs(float(aiq.get("phase_current_design_a") or 0) - float(exp["phase_current_design_a"]))
            < 0.5
            and exp.get("magnet_thickness_mm") is not None
            and abs(float(g.get("magnet_thickness_mm") or 0) - float(exp["magnet_thickness_mm"]))
            < 0.01
            and abs(float(g.get("magnet_length_mm") or 0) - float(exp["magnet_length_mm"])) < 0.01
        )
        if exp.get("machine_efficiency_assumption") is not None:
            geom_ok = geom_ok and abs(
                float(aiq.get("machine_efficiency_assumption") or 0)
                - float(exp["machine_efficiency_assumption"])
            ) < 1e-5
        if exp.get("inverter_efficiency_assumption") is not None:
            geom_ok = geom_ok and abs(
                float(aiq.get("inverter_efficiency_assumption") or 0)
                - float(exp["inverter_efficiency_assumption"])
            ) < 1e-5
        compare["geometry_freeze_ok"] = geom_ok

        _sr = compare["replay_summary"].get("sign_reversals")
        torque_ok = bool(
            compare["replay_summary"].get("torque_sign_consistent") is True
            and _sr is not None
            and int(_sr) == 0
            and mean is not None
            and abs(float(mean) - REF_MEAN_NM) / REF_MEAN_NM < 0.05
        )
        compare["path_a_matched"] = bool(geom_ok and torque_ok and rc == 0)
        # Reproducibility under freeze — not general solver innocence
        compare["path_a_reproducible_under_freeze"] = compare["path_a_matched"]
        compare["path_a_code_innocent"] = compare["path_a_matched"]  # legacy alias
        compare["next"] = (
            "Path B clean DEC-009 geometry solve"
            if compare["path_a_matched"]
            else "Stop — investigate code/geometry restore before Path B"
        )
    else:
        compare["error"] = (
            f"kit_case_exit={rc}; OUT exists={OUT.is_file()} — refusing to treat stale OUT as match"
        )
        compare["path_a_matched"] = False
        compare["path_a_reproducible_under_freeze"] = False
        compare["path_a_code_innocent"] = False
        compare["next"] = "Re-run Path A after kit_case success"

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
    return 0 if rc == 0 and OUT.is_file() and compare.get("path_a_matched") else (rc or 1)


if __name__ == "__main__":
    raise SystemExit(main())
