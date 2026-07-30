#!/usr/bin/env python3
"""Stamp motorMultiphysics + cadAuthority into the Formula E front twin.

INTENT: Make solver/CAD evidence *visible* (state + sidecar + markdown) while
keeping every required check OPEN and ship_ok false until twin-bound solves exist.

Usage:
  python3 scripts/fe-front-stamp-motor-multiphysics.py \\
    --twin out/formula-e-front-mgu-20260729-1432

  python3 scripts/lib/motor_multiphysics_stamp.py --selftest
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.lib.motor_multiphysics_stamp import (  # noqa: E402
    apply_to_state,
    build_stamp_payload,
    prove_catch,
    write_markdown,
    write_sidecar,
    write_state_atomic,
)


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Stamp motor multiphysics + CAD authority stubs (OPEN / ship_ok false)"
    )
    ap.add_argument(
        "--twin",
        type=Path,
        default=ROOT / "out" / "formula-e-front-mgu-20260729-1432",
        help="Twin out directory containing state.json",
    )
    ap.add_argument(
        "--state-only-pointer",
        action="store_true",
        help="If state.json is unreadable/corrupt, write sidecar+md and a tiny pointer file only",
    )
    args = ap.parse_args()

    twin: Path = args.twin
    state_path = twin / "state.json"
    if not twin.is_dir():
        print(f"missing twin dir {twin}", file=sys.stderr)
        return 1

    state: dict | None = None
    state_error: str | None = None
    if state_path.is_file():
        try:
            state = json.loads(state_path.read_text(encoding="utf-8"))
            if not isinstance(state, dict):
                state_error = "state.json root is not an object"
                state = None
        except (OSError, json.JSONDecodeError) as exc:
            state_error = str(exc)
            state = None
    else:
        state_error = "state.json missing"

    payload = build_stamp_payload(state=state, twin_dir=twin)
    catch = prove_catch(payload)
    if not catch.get("ok"):
        print(f"proveCatch failed before write: {json.dumps(catch)}", file=sys.stderr)
        return 1

    side = write_sidecar(twin, payload)
    md = write_markdown(twin, payload)

    state_written = False
    pointer_only = False
    if state is not None:
        try:
            apply_to_state(state, payload)
            write_state_atomic(state_path, state)
            state_written = True
        except OSError as exc:
            print(f"state.json write failed ({exc}); sidecar remains authoritative", file=sys.stderr)
            pointer_only = True
    else:
        print(
            f"state.json not loaded ({state_error}); wrote sidecar+markdown only",
            file=sys.stderr,
        )
        pointer_only = True
        # Tiny pointer file so Overview / Excel can still discover the stamp.
        ptr = {
            "sidecar": "motor-multiphysics.json",
            "markdown": "JLR-FE-FRONT-FPK-MOTOR-MULTIPHYSICS.md",
            "assembly_revision": payload.get("assembly_revision"),
            "ship_ok": False,
            "all_required_solver_checks_pass": False,
            "stamped_at": payload.get("stamped_at"),
            "state_error": state_error,
        }
        (twin / "motor-multiphysics.pointer.json").write_text(
            json.dumps(ptr, indent=2) + "\n", encoding="utf-8"
        )

    summary = {
        "ok": True,
        "twin": str(twin),
        "sidecar": str(side),
        "markdown": str(md),
        "state_written": state_written,
        "pointer_only": pointer_only or args.state_only_pointer,
        "ship_ok": False,
        "all_required_solver_checks_pass": False,
        "open_checks": list(payload["motorMultiphysics"]["required_checks"].keys()),
        "principal_components": payload["cadAuthority"]["principal_components_total"],
        "release_authority_coverage": payload["cadAuthority"]["release_authority_coverage"],
        "proveCatch": catch,
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
