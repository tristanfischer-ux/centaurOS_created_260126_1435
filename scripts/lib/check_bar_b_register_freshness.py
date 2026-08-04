#!/usr/bin/env python3
"""Deterministic Bar B register freshness — stamped file vs live twin rebuild.

⭐ WHY (Bar B handover 2026-08-03). The register was three days stale and wrong
in six of ten rows: torque 194 N·m (live ~78–81), rotor FoS 3.442 (live ~2.635),
coupled_ok true (live false), module 71 °C (live ~117 °C), PCB disposition None
when two routed boards existed. It simultaneously understated the thermal problem
and denied the PCB work.

A register that can silently drift is worse than no register: Jack reads it as
current state. This check fails when the on-disk
JLR-FE-FRONT-FPK-BAR-B-READINESS.json diverges from a LIVE rebuild via
fpk_bar_b_readiness.build_bar_b (same twin screens), OR when stamped
result_under_assumption markers disagree with the live screen artefacts
themselves (em_works / cool_scr / rotor_fos / pcb).

Hard stops also enforced here (honesty floor, not homologation):
  - ship_ok must be false on the stamped register
  - no row may be homologation CLOSED/CLEARED without measured evidence
    (we never allow CLOSED in software — any CLOSED is a fail)

Usage:
  check_bar_b_register_freshness.py --twin <dir> [--enforce]   # exit 47 when enforcing
  check_bar_b_register_freshness.py --selftest
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
import tempfile
from pathlib import Path
from typing import Any, Mapping, Optional

# Import sibling module without requiring package install.
_SCRIPTS_LIB = Path(__file__).resolve().parent
if str(_SCRIPTS_LIB) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_LIB))

from fpk_bar_b_readiness import (  # noqa: E402
    OUTPUT_JSON,
    build_bar_b,
    write_register,
)

EXIT_STALE = 47
SCHEMA = "forgeos.fpk.bar_b_register_freshness/v1"
REPORT_NAME = "bar-b-register-freshness.json"

# Relative / absolute tolerance for floating values extracted from
# result_under_assumption. Tight enough to catch the historical 194 vs 81
# torque lie and 71 vs 117 module-temp lie; loose enough for 1-decimal rounding.
REL_TOL = 0.02
ABS_TOL = 0.05
# FoS and temperatures get a slightly looser abs floor so 2.635 vs 2.64 is fine
# but 2.635 vs 3.442 still fails hard.
FOS_ABS_TOL = 0.05
TEMP_ABS_TOL = 0.5
TORQUE_ABS_TOL = 0.5


def _load(path: Path) -> Optional[dict[str, Any]]:
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def extract_markers(text: str) -> dict[str, Any]:
    """Pull the comparable markers embedded in result_under_assumption strings."""
    out: dict[str, Any] = {}
    if not text:
        return out
    t = text.replace("~", "≈")
    # Broad numeric / boolean harvest with preceding token.
    for m in re.finditer(
        r"(T_module|FoS|mean \|T\||required|Δp|iron_loss_w screening|iron_loss|"
        r"ESL seed nominal|boards|DRC violations|hil_present|coupled_ok|"
        r"duty_torque_screen_ok|disposition|EM duty screen ok)"
        r"[=:≈]?\s*(True|False|None|bespoke|[+-]?(?:\d+(?:\.\d*)?|\.\d+))",
        t,
    ):
        key = m.group(1)
        raw = m.group(2)
        # Alias free-form duty phrase onto the same key the builder emits.
        if key == "EM duty screen ok":
            key = "duty_torque_screen_ok"
        if raw in ("True", "False"):
            out[key] = raw == "True"
        elif raw == "None":
            out[key] = None
        elif raw == "bespoke":
            out[key] = "bespoke"
        else:
            try:
                out[key] = float(raw)
            except ValueError:
                out[key] = raw
    for m in re.finditer(r"coupled_ok\s*=\s*(True|False)", t):
        out["coupled_ok"] = m.group(1) == "True"
    for m in re.finditer(r"duty_torque_screen_ok\s*=\s*(True|False)", t):
        out["duty_torque_screen_ok"] = m.group(1) == "True"
    for m in re.finditer(r"hil_present\s*=\s*(True|False)", t):
        out["hil_present"] = m.group(1) == "True"
    for m in re.finditer(r"PCB disposition\s*=\s*([A-Za-z0-9_]+)", t):
        out["disposition"] = m.group(1)
        if out["disposition"] == "None":
            out["disposition"] = None
    for m in re.finditer(r"boards\s*=\s*(\d+)", t):
        out["boards"] = float(m.group(1))
    # Historical lie used "loaded FE torque≈194.0" — catch that alias too.
    for m in re.finditer(
        r"(?:loaded FE torque|loaded_torque|mean \|T\|)\s*≈\s*"
        r"([+-]?(?:\d+(?:\.\d*)?|\.\d+))",
        t,
    ):
        try:
            out.setdefault("mean |T|", float(m.group(1)))
            out["torque_nm"] = float(m.group(1))
        except ValueError:
            pass
    return out


def _num_close(a: Any, b: Any, *, abs_tol: float = ABS_TOL, rel_tol: float = REL_TOL) -> bool:
    if a is None and b is None:
        return True
    if isinstance(a, bool) or isinstance(b, bool):
        return a is b
    if isinstance(a, str) or isinstance(b, str):
        return str(a) == str(b)
    if a is None or b is None:
        return False
    try:
        fa, fb = float(a), float(b)
    except (TypeError, ValueError):
        return a == b
    return math.isclose(fa, fb, rel_tol=rel_tol, abs_tol=abs_tol)


def _tol_for(key: str) -> float:
    if key in ("FoS",):
        return FOS_ABS_TOL
    if key in ("T_module",):
        return TEMP_ABS_TOL
    if key in ("mean |T|", "required", "torque_nm"):
        return TORQUE_ABS_TOL
    return ABS_TOL


def _prefer_kit_case_em(motor_stack: Path) -> tuple[dict[str, Any], str]:
    """Prefer coherent Path B DEC-009 kit-case over baseline REBALANCED file.

    Path B is the live freeze FE (24k/130, magnets 6×22.5). The un-suffixed
    em_fia_front_kit_case.json often still holds pre-DEC-009 REBALANCED numbers
    (81.56 N·m) — quoting those as live_artefacts misleads Bar B freshness.
    """
    path_b = motor_stack / "em_fia_front_kit_case_PATH_B_DEC009.json"
    baseline = motor_stack / "em_fia_front_kit_case.json"
    for path, label in ((path_b, "PATH_B_DEC009"), (baseline, "kit_case")):
        em = _load(path) or {}
        if not em:
            continue
        g = em.get("machine_geometry") if isinstance(em.get("machine_geometry"), Mapping) else {}
        w = (
            em.get("works_in_kit_context")
            if isinstance(em.get("works_in_kit_context"), Mapping)
            else {}
        )
        sw = ((em.get("rotor_position_sweep") or {}).get("summary") or {})
        if path == path_b:
            try:
                active = float(g.get("active_length_mm") or 0)
                mag_t = float(g.get("magnet_thickness_mm") or 0)
                mag_l = float(g.get("magnet_length_mm") or 0)
                mean = w.get("torque_magnitude_mean_nm") or sw.get("torque_magnitude_mean_nm")
                sign_ok = sw.get("torque_sign_consistent") is True
                rev_ok = sw.get("sign_reversals") is not None and int(sw.get("sign_reversals")) == 0
                geom_ok = (
                    abs(active - 130.0) < 0.05
                    and abs(mag_t - 6.0) < 0.01
                    and abs(mag_l - 22.5) < 0.01
                )
                if mean is not None and float(mean) > 0 and sign_ok and rev_ok and geom_ok:
                    return em, label
            except (TypeError, ValueError):
                continue
        else:
            return em, label
    return {}, "none"


def live_artefact_snapshot(twin_dir: Path) -> dict[str, Any]:
    """Read the same twin screens build_bar_b uses — no invented numbers."""
    motor_stack = twin_dir / "_motor_stack"
    em, em_source = _prefer_kit_case_em(motor_stack)
    cool = _load(motor_stack / "analytical_fia_cooling_network_screen.json") or {}
    rotor = _load(motor_stack / "calculix_fia_rotor_screen.json") or {}
    state = _load(twin_dir / "state.json") or {}
    pcb_stage = _load(twin_dir / "pcb-stage.json") or {}
    pcb = state.get("pcb") if isinstance(state.get("pcb"), Mapping) else {}

    em_works = (
        em.get("works_in_kit_context")
        if isinstance(em.get("works_in_kit_context"), Mapping)
        else {}
    )
    cool_scr = (
        cool.get("screening_results")
        if isinstance(cool.get("screening_results"), Mapping)
        else {}
    )
    rotor_works = (
        rotor.get("works_in_kit_context")
        if isinstance(rotor.get("works_in_kit_context"), Mapping)
        else {}
    )
    rotor_scr = (
        rotor.get("screening_results")
        if isinstance(rotor.get("screening_results"), Mapping)
        else {}
    )
    rotor_margins = (
        rotor.get("margins") if isinstance(rotor.get("margins"), Mapping) else {}
    )
    rotor_fos = (
        rotor_works.get("minimum_factor_of_safety")
        or rotor.get("minimum_factor_of_safety")
        or rotor_scr.get("minimum_factor_of_safety")
        or rotor_scr.get("screening_fos_vs_yield")
        or rotor_scr.get("screening_fos")
        or rotor_margins.get("screening_fos_vs_assumed_yield")
        or rotor_margins.get("minimum_factor_of_safety")
    )

    mean_tq = em_works.get("torque_magnitude_mean_nm") or em_works.get(
        "loaded_torque_magnitude_nm"
    )
    required_tq = em_works.get("required_shaft_torque_nm")
    # Twin dual-bar stamps (stabilize) — architecture bar may differ from kit-case required
    q = (
        ((state.get("orchestratorContract") or {}).get("quantities"))
        if isinstance(state.get("orchestratorContract"), Mapping)
        else {}
    )
    if not isinstance(q, Mapping):
        q = {}
    arch_row = q.get("architecture_duty_shaft_torque_nm")
    bind_row = q.get("binding_duty_shaft_torque_nm")
    fe_row = q.get("last_sign_consistent_kit_case_fe_mean_nm")
    arch_duty = (
        arch_row.get("value") if isinstance(arch_row, Mapping) else None
    )
    bind_duty = (
        bind_row.get("value") if isinstance(bind_row, Mapping) else None
    )
    fe_mean_twin = fe_row.get("value") if isinstance(fe_row, Mapping) else None
    # Prefer twin FE label when Path B was adopted there
    if fe_mean_twin is not None and em_source == "PATH_B_DEC009":
        try:
            mean_tq = float(fe_mean_twin)
        except (TypeError, ValueError):
            pass
    if arch_duty is not None and em_source == "PATH_B_DEC009":
        try:
            required_tq = float(arch_duty)  # architecture power bar at freeze
        except (TypeError, ValueError):
            pass

    pcb_boards: list[Any] = []
    arch = pcb.get("architecture") if isinstance(pcb.get("architecture"), Mapping) else {}
    if isinstance(arch.get("boards"), list):
        pcb_boards = [
            b.get("boardId") for b in arch["boards"] if isinstance(b, Mapping)
        ]
    if not pcb_boards and isinstance(pcb_stage.get("boardPipelines"), list):
        pcb_boards = [
            b.get("boardId")
            for b in pcb_stage["boardPipelines"]
            if isinstance(b, Mapping)
        ]
    n_boards = len(pcb_boards) if pcb_boards else (
        2 if pcb_stage.get("boardPipelines") else 0
    )
    # state.pcb.boardPipelines as a non-empty mapping also counts (selftest shape).
    if n_boards == 0 and isinstance(pcb.get("boardPipelines"), Mapping) and pcb["boardPipelines"]:
        n_boards = len(pcb["boardPipelines"])
    elif n_boards == 0 and isinstance(pcb.get("boardPipelines"), list):
        n_boards = len(pcb["boardPipelines"])

    return {
        "mean_tq": mean_tq,
        "required_tq": required_tq,
        "architecture_duty_tq": arch_duty,
        "binding_duty_tq": bind_duty,
        "em_source": em_source,
        "duty_torque_screen_ok": em_works.get("duty_torque_screen_ok"),
        "torque_reliable": em_works.get("torque_reliable"),
        "t_module": cool_scr.get("maximum_module_temperature_c"),
        "coupled_ok": cool_scr.get("coupled_screen_ok"),
        "delta_p": cool_scr.get("total_delta_p_kpa"),
        "rotor_fos": rotor_fos,
        "disposition": pcb.get("disposition"),
        "n_boards": n_boards,
    }


def compare_stamped_to_artefacts(
    stamped: Mapping[str, Any],
    snap: Mapping[str, Any],
) -> list[dict[str, Any]]:
    """Cross-check stamped result_under_assumption markers against live screens.

    Catches the case where someone rewrites build_bar_b to hardcode old numbers
    (stamped-vs-rebuild would then both be wrong and agree). Pure arithmetic.
    """
    findings: list[dict[str, Any]] = []
    rows = {
        str(r.get("id")): r
        for r in (stamped.get("rows") or [])
        if isinstance(r, Mapping) and r.get("id")
    }

    # Per-row marker → live field map. Only fire when BOTH sides have a value.
    checks: list[tuple[str, str, str, float]] = [
        # (row_id, marker_key, snap_key, abs_tol)
        ("BARB-SIC-MODULE", "T_module", "t_module", TEMP_ABS_TOL),
        ("BARB-HEATER-PLATE", "T_module", "t_module", TEMP_ABS_TOL),
        ("BARB-FLOW-BENCH", "T_module", "t_module", TEMP_ABS_TOL),
        ("BARB-FLOW-BENCH", "coupled_ok", "coupled_ok", ABS_TOL),
        ("BARB-FLOW-BENCH", "Δp", "delta_p", ABS_TOL),
        ("BARB-ROTOR-RETENTION", "FoS", "rotor_fos", FOS_ABS_TOL),
        ("BARB-DUTY-CYCLE", "mean |T|", "mean_tq", TORQUE_ABS_TOL),
        ("BARB-DUTY-CYCLE", "torque_nm", "mean_tq", TORQUE_ABS_TOL),
        ("BARB-DUTY-CYCLE", "required", "required_tq", TORQUE_ABS_TOL),
        ("BARB-DUTY-CYCLE", "duty_torque_screen_ok", "duty_torque_screen_ok", ABS_TOL),
        ("BARB-DYNO", "mean |T|", "mean_tq", TORQUE_ABS_TOL),
        ("BARB-DYNO", "required", "required_tq", TORQUE_ABS_TOL),
        ("BARB-DYNO", "duty_torque_screen_ok", "duty_torque_screen_ok", ABS_TOL),
        ("BARB-GERBERS", "disposition", "disposition", ABS_TOL),
        ("BARB-GERBERS", "boards", "n_boards", ABS_TOL),
    ]

    for rid, mkey, skey, atol in checks:
        row = rows.get(rid)
        if not row:
            continue
        markers = extract_markers(str(row.get("result_under_assumption") or ""))
        if mkey not in markers:
            continue
        live_val = snap.get(skey)
        if live_val is None and mkey not in ("disposition", "coupled_ok", "duty_torque_screen_ok"):
            # Live screen missing this field — abstain, never invent.
            continue
        stamped_val = markers[mkey]
        if not _num_close(stamped_val, live_val, abs_tol=atol):
            findings.append({
                "kind": "artefact_divergence",
                "row": rid,
                "issue": (
                    f"{rid} stamped {mkey}={stamped_val!r} disagrees with live "
                    f"twin artefact {skey}={live_val!r}"
                ),
                "stamped": stamped_val,
                "live_artefact": live_val,
                "field": skey,
            })
    return findings


def compare_registers(
    stamped: Mapping[str, Any],
    live: Mapping[str, Any],
) -> dict[str, Any]:
    """Structural + numeric comparison of stamped register vs live rebuild. Pure."""
    findings: list[dict[str, Any]] = []

    if stamped.get("ship_ok") is True:
        findings.append({
            "kind": "ship_ok_minted",
            "issue": "stamped register has ship_ok=true — software must never mint this",
        })
    if live.get("ship_ok") is True:
        findings.append({
            "kind": "ship_ok_minted_live",
            "issue": "live rebuild produced ship_ok=true — builder regression",
        })

    s_rows = {
        str(r.get("id")): r
        for r in (stamped.get("rows") or [])
        if isinstance(r, Mapping) and r.get("id")
    }
    l_rows = {
        str(r.get("id")): r
        for r in (live.get("rows") or [])
        if isinstance(r, Mapping) and r.get("id")
    }

    if set(s_rows) != set(l_rows):
        findings.append({
            "kind": "row_set_mismatch",
            "issue": (
                f"stamped ids {sorted(s_rows)} != live ids {sorted(l_rows)}"
            ),
        })

    for rid, srow in s_rows.items():
        status = str(srow.get("homologation_status") or "").upper()
        if status in {"CLOSED", "CLEARED", "DONE", "PASS"}:
            findings.append({
                "kind": "hold_closed_in_software",
                "row": rid,
                "issue": (
                    f"{rid} homologation_status={srow.get('homologation_status')!r} "
                    "— Bar B holds must stay OPEN until measured evidence lands"
                ),
            })

        lrow = l_rows.get(rid)
        if not lrow:
            continue

        s_res = str(srow.get("result_under_assumption") or "")
        l_res = str(lrow.get("result_under_assumption") or "")
        if s_res != l_res:
            s_m = extract_markers(s_res)
            l_m = extract_markers(l_res)
            keys = sorted(set(s_m) | set(l_m))
            diverged = []
            for k in keys:
                if k not in s_m or k not in l_m or not _num_close(
                    s_m[k], l_m[k], abs_tol=_tol_for(k)
                ):
                    diverged.append(f"{k}: stamped={s_m.get(k)!r} live={l_m.get(k)!r}")
            if diverged or not keys:
                findings.append({
                    "kind": "result_stale",
                    "row": rid,
                    "issue": (
                        f"{rid} result_under_assumption diverges from live rebuild"
                        + (": " + "; ".join(diverged[:6]) if diverged else "")
                    ),
                    "stamped": s_res[:200],
                    "live": l_res[:200],
                })

        if srow.get("closure_class") != lrow.get("closure_class"):
            findings.append({
                "kind": "closure_class_drift",
                "row": rid,
                "issue": (
                    f"{rid} closure_class stamped={srow.get('closure_class')!r} "
                    f"live={lrow.get('closure_class')!r}"
                ),
            })

    return {
        "schema": SCHEMA,
        "findings": findings,
        "stale_count": len(findings),
        "ok": not findings,
        "stamped_row_count": len(s_rows),
        "live_row_count": len(l_rows),
    }


def audit_twin(twin_dir: Path) -> dict[str, Any]:
    """Compare on-disk register to live build_bar_b(twin) + raw screen artefacts."""
    twin_dir = twin_dir.resolve()
    stamped_path = twin_dir / OUTPUT_JSON
    stamped = _load(stamped_path)
    live = build_bar_b(twin_dir)
    snap = live_artefact_snapshot(twin_dir)

    if stamped is None:
        return {
            "schema": SCHEMA,
            "ok": False,
            "stale_count": 1,
            "findings": [{
                "kind": "register_missing",
                "issue": (
                    f"missing {stamped_path.name} — restamp with "
                    "fpk_bar_b_readiness.py --twin"
                ),
            }],
            "twin": str(twin_dir),
            "live_ship_ok": live.get("ship_ok"),
            "live_artefacts": snap,
        }

    report = compare_registers(stamped, live)
    # Second layer: stamped markers vs raw twin screens (independent of builder).
    art_findings = compare_stamped_to_artefacts(stamped, snap)
    # Dedupe by (kind, row, field) so rebuild+artefact double-hits don't inflate.
    seen = {
        (f.get("kind"), f.get("row"), f.get("field"), f.get("issue"))
        for f in report["findings"]
    }
    for f in art_findings:
        key = (f.get("kind"), f.get("row"), f.get("field"), f.get("issue"))
        if key not in seen:
            report["findings"].append(f)
            seen.add(key)
    report["stale_count"] = len(report["findings"])
    report["ok"] = not report["findings"]
    report["twin"] = str(twin_dir)
    report["stamped_at"] = stamped.get("stamped_at")
    report["live_stamped_at"] = live.get("stamped_at")
    report["stamped_ship_ok"] = stamped.get("ship_ok")
    report["live_ship_ok"] = live.get("ship_ok")
    report["live_artefacts"] = snap
    return report


def write_report(twin_dir: Path, report: Mapping[str, Any]) -> Path:
    """Always persist findings next to the twin (like physics_plausibility)."""
    path = twin_dir / REPORT_NAME
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return path


def _selftest() -> int:
    fails: list[str] = []

    def ck(name: str, ok: bool, detail: str = "") -> None:
        if not ok:
            fails.append(f"{name}: {detail}")

    # Minimal twin that build_bar_b accepts (mirrors fpk_bar_b_readiness.selftest).
    with tempfile.TemporaryDirectory(prefix="barb-fresh-") as raw:
        twin = Path(raw)
        (twin / "_motor_stack").mkdir()
        (twin / "state.json").write_text(
            json.dumps(
                {
                    "orchestratorContract": {
                        "quantities": {
                            "front_regen_electrical_cap_kw": {"value": 250},
                            "max_rotor_speed_rpm": {"value": 19500},
                            "inverter_dissipated_kw": {"value": 4.3},
                            "duty_regen_time_s": {"value": 24},
                            "duty_motoring_time_s": {"value": 76},
                            "mgu_iron_loss_w": {"value": 6035.1},
                        }
                    },
                    "homologationHonesty": {
                        "verdict": "NOT_HOMOLOGATED",
                        "hil_present": False,
                        "supplier_gerbers_present": False,
                    },
                    "pcb": {
                        "disposition": "bespoke",
                        "pipeline": {"ok": True, "drc": {"ran": True, "violations": 0}},
                        "architecture": {
                            "boards": [
                                {"boardId": "traction_gate_drive"},
                                {"boardId": "traction_control"},
                            ]
                        },
                        "NOT_FABRICATION_READY": True,
                    },
                }
            ),
            encoding="utf-8",
        )
        (twin / "pcb-stage.json").write_text(
            json.dumps(
                {
                    "NOT_FABRICATION_READY": True,
                    "forgeDraftOnly": True,
                    "boardPipelines": [
                        {"boardId": "traction_gate_drive"},
                        {"boardId": "traction_control"},
                    ],
                    "pipeline": {"ok": True, "drc": {"violations": 0}},
                }
            ),
            encoding="utf-8",
        )
        (twin / "_motor_stack" / "em_fia_front_kit_case.json").write_text(
            json.dumps(
                {
                    "works_in_kit_context": {
                        "duty_torque_screen_ok": False,
                        "loaded_torque_magnitude_nm": 78.43,
                        "torque_magnitude_mean_nm": 81.56,
                        "required_shaft_torque_nm": 125.22,
                        "torque_reliable": False,
                    }
                }
            ),
            encoding="utf-8",
        )
        (twin / "_motor_stack" / "analytical_fia_cooling_network_screen.json").write_text(
            json.dumps(
                {
                    "input_quantities": {
                        "coolant_flow_l_min": 12.0,
                        "coolant_inlet_c": 60.0,
                        "iron_loss_w": 6035.1,
                        "slot_to_iron_k_per_w": 0.006,
                        "iron_to_jacket_k_per_w": 0.0077,
                        "module_to_coolant_k_per_w": 0.01,
                    },
                    "screening_results": {
                        "coupled_screen_ok": False,
                        "total_delta_p_kpa": 45.1,
                        "maximum_module_temperature_c": 117.4,
                    },
                }
            ),
            encoding="utf-8",
        )
        (twin / "_motor_stack" / "calculix_fia_rotor_screen.json").write_text(
            json.dumps(
                {
                    "works_in_kit_context": {"minimum_factor_of_safety": 2.635},
                    "screening_results": {
                        "screening_fos_vs_yield": 2.635,
                        "operating_speed_rpm": 19500.0,
                    },
                }
            ),
            encoding="utf-8",
        )
        (twin / "_motor_stack" / "inverter_packaging_fia_front_kit_case.json").write_text(
            json.dumps(
                {
                    "screening_results": {
                        "bus_esl_nominal_nh": 6.39,
                        "inverter_dissipated_kw": 4.318,
                        "sic_module_count": 3,
                        "esl_target_band_nh": [3.0, 15.0],
                    }
                }
            ),
            encoding="utf-8",
        )

        live = build_bar_b(twin)
        write_register(twin, live)

        # ⭐ proveCatch 1 — freshly stamped register matches live rebuild + artefacts.
        r_ok = audit_twin(twin)
        ck(
            "proveCatch.fresh_register_passes",
            r_ok.get("ok") is True,
            f"fresh register flagged stale: {r_ok.get('findings')}",
        )
        # Always-writes contract: report path must be writable.
        out_path = write_report(twin, r_ok)
        ck("always_writes_findings", out_path.is_file(), f"missing {out_path}")

        # ⭐ proveCatch 2 — the EXACT historical stale values must FAIL.
        stale = json.loads((twin / OUTPUT_JSON).read_text(encoding="utf-8"))
        by_id = {r["id"]: r for r in stale["rows"]}
        # Historical lies from the handover (six of ten rows wrong):
        by_id["BARB-DUTY-CYCLE"]["result_under_assumption"] = (
            "EM duty screen ok=True; loaded FE torque≈194.0 N·m"
        )
        by_id["BARB-ROTOR-RETENTION"]["result_under_assumption"] = (
            "Rotor screening FoS≈3.442; pocket screen present=True"
        )
        by_id["BARB-FLOW-BENCH"]["result_under_assumption"] = (
            "Δp≈45.1 kPa; coupled_ok=True; T_module≈71.0 °C"
        )
        by_id["BARB-SIC-MODULE"]["result_under_assumption"] = (
            "Cooling network T_module≈71.0 °C at A-COOL; packaging screen present"
        )
        by_id["BARB-GERBERS"]["result_under_assumption"] = (
            "PCB disposition=None; boards=0; pipeline.ok=False; NOT_FAB for release"
        )
        by_id["BARB-HEATER-PLATE"]["result_under_assumption"] = (
            "T_module≈71.0 °C (screening); module_to_coolant_k_per_w=0.01"
        )
        (twin / OUTPUT_JSON).write_text(
            json.dumps(stale, indent=2) + "\n", encoding="utf-8"
        )
        r_stale = audit_twin(twin)
        kinds = {f.get("kind") for f in r_stale.get("findings") or []}
        rows_hit = {f.get("row") for f in r_stale.get("findings") or [] if f.get("row")}
        ck(
            "proveCatch.historical_stale_fails",
            r_stale.get("ok") is False,
            "historical stale values were not caught",
        )
        ck(
            "proveCatch.stale_kind_result",
            "result_stale" in kinds or "artefact_divergence" in kinds,
            f"expected result_stale/artefact_divergence, got {kinds}",
        )
        # Each of the six historically-wrong rows must be named.
        for need in (
            "BARB-DUTY-CYCLE",
            "BARB-ROTOR-RETENTION",
            "BARB-FLOW-BENCH",
            "BARB-SIC-MODULE",
            "BARB-GERBERS",
            "BARB-HEATER-PLATE",
        ):
            ck(
                f"proveCatch.row_{need}",
                need in rows_hit,
                f"{need} not in findings rows {rows_hit}",
            )
        # Specific historical numbers must be cited (detector not weakened).
        blob = json.dumps(r_stale.get("findings") or [])
        ck("proveCatch.cites_194_torque", "194" in blob, blob[:400])
        ck("proveCatch.cites_3.442_fos", "3.442" in blob, blob[:400])
        ck("proveCatch.cites_71_module", "71" in blob, blob[:400])

        # ⭐ proveCatch 3 — minting ship_ok must FAIL honesty.
        write_register(twin, live)  # reset file to fresh first
        stamped = json.loads((twin / OUTPUT_JSON).read_text(encoding="utf-8"))
        stamped["ship_ok"] = True
        (twin / OUTPUT_JSON).write_text(
            json.dumps(stamped, indent=2) + "\n", encoding="utf-8"
        )
        r_ship = audit_twin(twin)
        ck(
            "proveCatch.ship_ok_true_fails",
            any(f.get("kind") == "ship_ok_minted" for f in r_ship.get("findings") or []),
            f"ship_ok=true was not caught: {r_ship.get('findings')}",
        )

        # ⭐ proveCatch 4 — quietly CLOSING a hold must FAIL.
        write_register(twin, live)
        stamped = json.loads((twin / OUTPUT_JSON).read_text(encoding="utf-8"))
        stamped["rows"][0]["homologation_status"] = "CLOSED"
        (twin / OUTPUT_JSON).write_text(
            json.dumps(stamped, indent=2) + "\n", encoding="utf-8"
        )
        r_closed = audit_twin(twin)
        ck(
            "proveCatch.closed_hold_fails",
            any(
                f.get("kind") == "hold_closed_in_software"
                for f in r_closed.get("findings") or []
            ),
            f"CLOSED hold was not caught: {r_closed.get('findings')}",
        )

        # ⭐ proveCatch 5 — negative control after restamp is silent again.
        write_register(twin, build_bar_b(twin))
        r_again = audit_twin(twin)
        ck(
            "proveCatch.restamp_clears",
            r_again.get("ok") is True,
            f"restamp did not clear: {r_again.get('findings')}",
        )

        # ⭐ proveCatch 6 — direct artefact layer alone catches torque lie even if
        # the rebuild string is force-matched (simulates a poisoned builder).
        write_register(twin, live)
        poisoned = json.loads((twin / OUTPUT_JSON).read_text(encoding="utf-8"))
        # Keep every result string equal to a "live" rebuild that also lies —
        # compare_registers would stay silent; artefact layer must still fire.
        for r in poisoned["rows"]:
            if r["id"] == "BARB-DUTY-CYCLE":
                r["result_under_assumption"] = (
                    "EM duty screen ok=False; mean |T|≈194.0 N·m vs required≈125.22 N·m; "
                    "DEC-008 vignette 24s/100s"
                )
        (twin / OUTPUT_JSON).write_text(
            json.dumps(poisoned, indent=2) + "\n", encoding="utf-8"
        )
        # Manually compare only the artefact layer against the real screens.
        snap = live_artefact_snapshot(twin)
        art = compare_stamped_to_artefacts(poisoned, snap)
        ck(
            "proveCatch.artefact_layer_catches_poisoned_builder",
            any(
                f.get("kind") == "artefact_divergence" and f.get("row") == "BARB-DUTY-CYCLE"
                for f in art
            ),
            f"artefact layer missed poisoned torque: {art}",
        )

        # Marker extraction sanity on the FE-shaped strings.
        markers = extract_markers(
            "Δp≈45.1 kPa; coupled_ok=False; T_module≈117.4 °C; boards=2"
        )
        ck("markers.coupled_false", markers.get("coupled_ok") is False, str(markers))
        ck(
            "markers.module_temp",
            markers.get("T_module") is not None
            and abs(float(markers["T_module"]) - 117.4) < 0.1,
            str(markers),
        )
        ck("markers.boards", markers.get("boards") == 2.0, str(markers))
        hist = extract_markers("EM duty screen ok=True; loaded FE torque≈194.0 N·m")
        ck("markers.historical_194", hist.get("torque_nm") == 194.0, str(hist))
        ck("markers.historical_duty_ok", hist.get("duty_torque_screen_ok") is True, str(hist))

        # Snapshot must not invent numbers when screens are absent.
        empty = live_artefact_snapshot(Path(tempfile.mkdtemp()))
        ck(
            "artefacts.abstain_when_missing",
            empty.get("mean_tq") is None and empty.get("t_module") is None,
            str(empty),
        )

        # Enforce exit code contract (integration-level).
        write_register(twin, live)
        bad = json.loads((twin / OUTPUT_JSON).read_text(encoding="utf-8"))
        for r in bad["rows"]:
            if r["id"] == "BARB-SIC-MODULE":
                r["result_under_assumption"] = "Cooling network T_module≈71.0 °C at A-COOL"
        (twin / OUTPUT_JSON).write_text(json.dumps(bad, indent=2) + "\n", encoding="utf-8")
        r_enforce = audit_twin(twin)
        ck("enforce.would_fail", r_enforce.get("ok") is False, str(r_enforce.get("findings")))

    if fails:
        print("check_bar_b_register_freshness selftest FAIL:")
        for f in fails:
            print(" ", f)
        return 1
    print("check_bar_b_register_freshness selftest: OK")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path)
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument(
        "--enforce",
        action="store_true",
        help=f"exit {EXIT_STALE} when stale/unfresh",
    )
    ap.add_argument(
        "--json-out",
        type=Path,
        help="optional alternate report path (twin report always written too)",
    )
    args = ap.parse_args()
    if args.selftest:
        return _selftest()
    if not args.twin:
        ap.error("--twin required unless --selftest")
    twin = args.twin.resolve()
    report = audit_twin(twin)
    # Always write findings beside the twin (physics_plausibility pattern).
    report_path = write_report(twin, report)
    text = json.dumps(report, indent=2) + "\n"
    if args.json_out:
        args.json_out.write_text(text, encoding="utf-8")
    print(text)
    n = report.get("stale_count") or 0
    print(
        f"[bar_b_freshness] findings={n} ok={report.get('ok')} "
        f"report={report_path}"
    )
    if args.enforce and not report.get("ok"):
        return EXIT_STALE
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
