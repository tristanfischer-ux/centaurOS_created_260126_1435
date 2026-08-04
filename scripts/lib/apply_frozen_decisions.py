#!/usr/bin/env python3
"""Apply every FROZEN_UNDER_ASSUMPTION decision that has a registered restamp handler.

⭐ UNIVERSAL (2026-08-03). Recording a decision in 10-decision-register.json without
restamping the twin is how F1 happened: DEC-008 said intermittent, the twin still
screened continuous. This module is the single choke point:

  - discover frozen decisions on a twin
  - run the handler for each (idempotent)
  - refuse to invent handlers: unknown freezes are reported, not silently skipped
    when --strict

Handlers live beside this file and must expose:
  OUTPUT: relative path of audit artefact written when applied
  apply_<name>(twin_dir) -> dict   OR we call a known apply function
  is_applied(twin_dir) -> bool

Usage:
  apply_frozen_decisions.py --twin <dir> [--strict] [--dry-run]
  apply_frozen_decisions.py --selftest
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any, Callable

_LIB = Path(__file__).resolve().parent
if str(_LIB) not in sys.path:
    sys.path.insert(0, str(_LIB))

from apply_dec_008_duty_restamp import (  # noqa: E402
    OUTPUT as DEC008_OUTPUT,
    apply_dec_008,
)
from apply_dec_009_em_restamp import (  # noqa: E402
    apply_dec_009,
    is_applied as _dec009_applied_fn,
)

FROZEN_STATUSES = frozenset({
    "FROZEN_UNDER_ASSUMPTION",
    "FROZEN",
    "DECIDED_UNDER_ASSUMPTION",
})


def _load_decisions(twin: Path) -> list[dict[str, Any]]:
    path = twin / "10-decision-register.json"
    if not path.is_file():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, list):
        return [d for d in data if isinstance(d, dict)]
    if isinstance(data, dict):
        items = data.get("decisions") or data.get("items") or []
        return [d for d in items if isinstance(d, dict)]
    return []


def _dec008_applied(twin: Path) -> bool:
    """True when twin carries intermittent_peak basis + restamp artefact."""
    marker = twin / DEC008_OUTPUT
    if not marker.is_file():
        return False
    state_path = twin / "state.json"
    if not state_path.is_file():
        return False
    st = json.loads(state_path.read_text(encoding="utf-8"))
    q = ((st.get("orchestratorContract") or {}).get("quantities") or {})
    cp = q.get("continuous_power_kw") if isinstance(q, dict) else None
    basis = str((cp or {}).get("basis") or "").lower() if isinstance(cp, dict) else ""
    mag = q.get("mgu_magnet_temp_c") if isinstance(q, dict) else None
    mag_v = None
    if isinstance(mag, dict):
        try:
            mag_v = float(mag.get("value"))
        except (TypeError, ValueError):
            mag_v = None
    # Adopted DEC-008 mid vignette is ~83.8; continuous was ~159.
    return basis in ("intermittent_peak", "intermittent", "peak") and (
        mag_v is not None and mag_v < 120.0
    )


def _dec009_applied(twin: Path) -> bool:
    """True when max_rotor_speed reflects DEC-009 freeze (24000)."""
    state_path = twin / "state.json"
    if not state_path.is_file():
        return False
    st = json.loads(state_path.read_text(encoding="utf-8"))
    q = ((st.get("orchestratorContract") or {}).get("quantities") or {})
    raw = q.get("max_rotor_speed_rpm") if isinstance(q, dict) else None
    try:
        rpm = float(raw.get("value") if isinstance(raw, dict) else raw)
    except (TypeError, ValueError, AttributeError):
        return False
    # DEC-009 freezes 24000; allow small float noise
    return abs(rpm - 24000.0) < 1.0


# Registry: decision id → handler
# apply: twin -> report dict (or None if dry)
# is_applied: twin -> bool
# apply may be None if only detection is wired (strict will fail until implemented)
Handler = dict[str, Any]

HANDLERS: dict[str, Handler] = {
    "DEC-008": {
        "description": "A-DUTY intermittent peak freeze → thermal + basis restamp",
        "is_applied": _dec008_applied,
        "apply": apply_dec_008,
        "freezes_expected": ["continuous_power_kw basis", "duty_regen_time_s", "duty_motoring_time_s"],
    },
    "DEC-009": {
        "description": "DEC-EM-1 24000 rpm / 130 mm stack restamp",
        "is_applied": _dec009_applied_fn,
        "apply": apply_dec_009,
        "freezes_expected": ["max_rotor_speed_rpm", "stack_length_mm"],
    },
}


def plan(twin: Path) -> list[dict[str, Any]]:
    """Return status rows for every frozen decision."""
    rows = []
    for d in _load_decisions(twin):
        status = str(d.get("status") or "")
        if status not in FROZEN_STATUSES:
            continue
        did = str(d.get("id") or "")
        h = HANDLERS.get(did)
        if h is None:
            rows.append({
                "id": did,
                "status": status,
                "handler": None,
                "applied": None,
                "action": "no_handler",
                "decision": str(d.get("decision") or "")[:120],
            })
            continue
        applied = bool(h["is_applied"](twin))
        rows.append({
            "id": did,
            "status": status,
            "handler": h["description"],
            "applied": applied,
            "action": "noop" if applied else ("apply" if h.get("apply") else "handler_missing"),
            "decision": str(d.get("decision") or "")[:120],
        })
    return rows


def _canonical_register(items: list[dict[str, Any]]) -> str:
    """Stable JSON for register equality (order by id, drop None-only noise)."""
    cleaned: list[dict[str, Any]] = []
    for d in items:
        if not isinstance(d, dict):
            continue
        cleaned.append({k: v for k, v in d.items() if v is not None})
    cleaned.sort(key=lambda d: str(d.get("id") or ""))
    return json.dumps(cleaned, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def decision_register_parity(twin: Path) -> dict[str, Any]:
    """Compare 10-decision-register.json to state.decisionRegister.

    Excel Decision Register tab renders state.decisionRegister only. Writing
    freezes to the file without syncing state drops DEC-008/009 from the
    customer workbook (observed on FE Front after V1.282).
    """
    twin = twin.resolve()
    file_items = _load_decisions(twin)
    state_path = twin / "state.json"
    state_items: list[dict[str, Any]] = []
    if state_path.is_file():
        st = json.loads(state_path.read_text(encoding="utf-8"))
        raw = st.get("decisionRegister") or []
        if isinstance(raw, list):
            state_items = [d for d in raw if isinstance(d, dict)]
    file_ids = {str(d.get("id") or "") for d in file_items if d.get("id")}
    state_ids = {str(d.get("id") or "") for d in state_items if d.get("id")}
    return {
        "in_file_not_state": sorted(file_ids - state_ids),
        "in_state_not_file": sorted(state_ids - file_ids),
        "file_count": len(file_items),
        "state_count": len(state_items),
        "content_equal": _canonical_register(file_items) == _canonical_register(state_items),
        "ok": file_ids == state_ids and (
            # id set match is the customer-visible bar; content may still drift
            True
        ) and not (file_ids - state_ids),
    }


def sync_decision_register(twin: Path, *, dry_run: bool = False) -> dict[str, Any]:
    """Copy 10-decision-register.json → state.decisionRegister when they diverge.

    Universal choke point: freezes recorded on disk always surface on the twin
    the Excel exporter reads. Idempotent.
    """
    twin = twin.resolve()
    parity = decision_register_parity(twin)
    file_items = _load_decisions(twin)
    state_path = twin / "state.json"
    if not state_path.is_file():
        return {
            "action": "skipped_no_state",
            "parity": parity,
            "synced": False,
        }
    if parity.get("content_equal") and not parity.get("in_file_not_state"):
        return {
            "action": "noop",
            "parity": parity,
            "synced": False,
        }
    if dry_run:
        return {
            "action": "would_sync",
            "parity": parity,
            "synced": False,
            "would_write_count": len(file_items),
        }
    from twin_write_guard import assert_stage_open  # noqa: PLC0415
    assert_stage_open(twin, "apply_frozen_decisions.sync_decision_register")
    st = json.loads(state_path.read_text(encoding="utf-8"))
    st["decisionRegister"] = file_items
    text = json.dumps(st, indent=2, ensure_ascii=False) + "\n"
    tmp = state_path.with_name(f".state.json.{os.getpid()}.tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, state_path)
    return {
        "action": "synced",
        "parity_before": parity,
        "synced": True,
        "wrote_count": len(file_items),
        "ids": [str(d.get("id") or "") for d in file_items],
    }


def apply_all(twin: Path, *, dry_run: bool = False) -> dict[str, Any]:
    twin = twin.resolve()
    # Guard once up front when any write may happen (handlers + register sync).
    if not dry_run:
        from twin_write_guard import assert_stage_open  # noqa: PLC0415
        assert_stage_open(twin, "apply_frozen_decisions")
    rows = plan(twin)
    applied: list[str] = []
    skipped: list[str] = []
    missing_handlers: list[str] = []
    errors: list[str] = []

    for row in rows:
        if row["action"] == "noop":
            skipped.append(row["id"])
            continue
        if row["action"] == "no_handler":
            missing_handlers.append(row["id"])
            continue
        if row["action"] == "handler_missing":
            missing_handlers.append(row["id"])
            continue
        if row["action"] == "apply":
            if dry_run:
                applied.append(row["id"] + "(dry-run)")
                continue
            h = HANDLERS[row["id"]]
            fn: Callable = h["apply"]
            try:
                fn(twin)
                if not h["is_applied"](twin):
                    errors.append(f"{row['id']}: handler ran but is_applied still false")
                else:
                    applied.append(row["id"])
            except Exception as e:  # noqa: BLE001
                errors.append(f"{row['id']}: {e}")

    # Always keep state.decisionRegister aligned with the durable file so the
    # Excel Decision Register tab cannot drop frozen rows after a restamp.
    reg_sync = sync_decision_register(twin, dry_run=dry_run)

    return {
        "schema": "forgeos.fpk.apply_frozen_decisions/v1",
        "twin": str(twin),
        "dry_run": dry_run,
        "plan": rows,
        "applied": applied,
        "already_applied": skipped,
        "missing_handlers": missing_handlers,
        "errors": errors,
        "decision_register_sync": reg_sync,
        "ok": not errors and (
            # ok if every frozen decision either applied or has no handler only when not strict
            True
        ),
    }


def _selftest() -> int:
    # Selftests write scratch twins with no discipline stage.
    import os as _os
    _os.environ.setdefault("TWIN_WRITE_GUARD", "off")
    _os.environ.setdefault("TWIN_WRITE_GUARD_REASON", "selftest")
    fails: list[str] = []

    def ck(name: str, ok: bool, detail: str = "") -> None:
        if not ok:
            fails.append(f"{name}: {detail}")

    with tempfile.TemporaryDirectory(prefix="frozen-dec-") as raw:
        twin = Path(raw)
        (twin / "_motor_stack").mkdir()
        # Minimal twin for DEC-008 handler
        state = {
            "ship_ok": False,
            "orchestratorContract": {
                "quantities": {
                    "continuous_power_kw": {"value": 250, "basis": "continuous"},
                    "duty_regen_time_s": {"value": 24},
                    "duty_motoring_time_s": {"value": 76},
                    "mgu_iron_loss_w": {"value": 6035.1},
                    "mgu_copper_loss_w": {"value": 2180.49},
                    "magnet_temp_limit_c": {"value": 150},
                    "coolant_inlet_c": {"value": 60},
                    "coolant_flow_l_min": {"value": 12},
                    "coolant_cp_j_kgk": {"value": 3503},
                    "coolant_density_kg_m3": {"value": 1040.49},
                    "inverter_dissipated_kw": {"value": 4.318},
                    "mgu_magnet_temp_c": {"value": 159.35},
                    "mgu_winding_temp_c": {"value": 159.35},
                    "max_rotor_speed_rpm": {"value": 19500},
                    "stack_length_mm": {"value": 98.33},
                    "stator_iron_mass_kg": {"value": 6.6218},
                    "stator_tooth_flux_t": {"value": 1.7994},
                    "stator_yoke_flux_t": {"value": 2.1036},
                    "lamination_grade": {"value": "M400-50A"},
                    "mgu_fe_shaft_torque_nm": {"value": 81.558},
                }
            },
        }
        (twin / "state.json").write_text(json.dumps(state, indent=2) + "\n")
        (twin / "10-decision-register.json").write_text(json.dumps([
            {
                "id": "DEC-008",
                "status": "FROZEN_UNDER_ASSUMPTION",
                "decision": "A-DUTY intermittent",
                "freezes": ["continuous_power_kw basis"],
            },
            {
                "id": "DEC-009",
                "status": "FROZEN_UNDER_ASSUMPTION",
                "decision": "24k rpm",
                "freezes": ["max_rotor_speed_rpm"],
            },
            {
                "id": "DEC-999",
                "status": "FROZEN_UNDER_ASSUMPTION",
                "decision": "unknown freeze",
            },
            {
                "id": "DEC-001",
                "status": "OPEN",
                "decision": "should be ignored",
            },
        ], indent=2) + "\n")
        (twin / "_motor_stack" / "analytical_fia_cooling_thermal_screen.json").write_text(
            json.dumps({"screening_results": {
                "maximum_magnet_temperature_c": 159.35,
                "maximum_winding_temperature_c": 159.35,
            }}) + "\n"
        )
        (twin / "_motor_stack" / "analytical_fia_cooling_network_screen.json").write_text(
            json.dumps({"screening_results": {
                "maximum_magnet_temperature_c": 159.35,
                "maximum_winding_temperature_c": 159.35,
            }}) + "\n"
        )

        pl = plan(twin)
        by = {r["id"]: r for r in pl}
        ck("plans_dec008", by["DEC-008"]["action"] == "apply", str(by.get("DEC-008")))
        ck("plans_dec009_apply", by["DEC-009"]["action"] == "apply", str(by.get("DEC-009")))
        ck("plans_unknown", by["DEC-999"]["action"] == "no_handler", str(by.get("DEC-999")))
        ck("ignores_open", "DEC-001" not in by, str(pl))

        r = apply_all(twin, dry_run=False)
        ck("applied_008", "DEC-008" in r["applied"], str(r))
        ck("dec008_now_applied", _dec008_applied(twin), "not applied")
        ck("dec009_applied", "DEC-009" in r["applied"] or _dec009_applied_fn(twin), str(r))
        ck("missing_includes_999",
           "DEC-999" in r["missing_handlers"],
           str(r["missing_handlers"]))

        # idempotent second run
        r2 = apply_all(twin, dry_run=False)
        ck("idempotent", "DEC-008" in r2["already_applied"], str(r2))

        # decision register file → state sync (customer Decision Register tab)
        st_after = json.loads((twin / "state.json").read_text(encoding="utf-8"))
        reg = st_after.get("decisionRegister") or []
        reg_ids = {str(d.get("id")) for d in reg if isinstance(d, dict)}
        ck("register_synced_008", "DEC-008" in reg_ids, str(sorted(reg_ids)))
        ck("register_synced_009", "DEC-009" in reg_ids, str(sorted(reg_ids)))
        ck("register_synced_open", "DEC-001" in reg_ids, str(sorted(reg_ids)))
        parity = decision_register_parity(twin)
        ck("register_parity_ok", parity.get("ok") is True, str(parity))
        r3 = apply_all(twin, dry_run=False)
        ck(
            "register_sync_idempotent",
            (r3.get("decision_register_sync") or {}).get("action") == "noop",
            str(r3.get("decision_register_sync")),
        )

    if fails:
        print("apply_frozen_decisions selftest FAIL:")
        for f in fails:
            print(" ", f)
        return 1
    print("apply_frozen_decisions selftest: OK")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--strict",
        action="store_true",
        help="exit 48 if any frozen decision lacks an applied handler",
    )
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return _selftest()
    if not args.twin:
        ap.error("--twin required")
    rep = apply_all(args.twin, dry_run=args.dry_run)
    print(json.dumps(rep, indent=2))
    if rep.get("errors"):
        return 1
    if args.strict and rep.get("missing_handlers"):
        print(
            f"[apply_frozen_decisions] STRICT: unhandled frozen decisions: "
            f"{rep['missing_handlers']}",
            file=sys.stderr,
        )
        return 48
    # Also strict if a handleable decision failed to apply
    pending = [
        r["id"] for r in rep.get("plan") or []
        if r.get("action") == "apply"
    ]
    if args.strict and pending and not args.dry_run:
        # should have been applied
        still = [r["id"] for r in plan(args.twin) if r.get("action") == "apply"]
        if still:
            print(f"[apply_frozen_decisions] STRICT: still need apply: {still}", file=sys.stderr)
            return 48
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
