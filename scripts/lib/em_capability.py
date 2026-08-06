#!/usr/bin/env python3
"""Capability-driven electromagnetics pack interface (Anvil U2).

Motor/FE-front jack EM phases (Path B dual-bar, phase C–E kit screens) only
apply when the twin has electromagnetic evidence capability. Instruments and
non-motor plants must not invent field plots or run motor-only renderers.

Class-conditional *content*; paths remain ``electromagnetics/`` when content
exists (see pack_layout.ELECTROMAGNETICS_DIR).
"""
from __future__ import annotations

import os
from typing import Any, Final

# Subdir under twin root that holds motor EM artefacts.
MOTOR_STACK_DIR: Final[str] = "_motor_stack"
JACK_EM_PACK_DIR: Final[str] = "jack_em_pack"
PATH_B_DEFAULT: Final[str] = "em_fia_front_kit_case_PATH_B_DEC009.json"


def twin_has_motor_stack(run_dir: str) -> bool:
    return os.path.isdir(os.path.join(run_dir, MOTOR_STACK_DIR))


def twin_has_path_b_artefact(run_dir: str, filename: str = PATH_B_DEFAULT) -> bool:
    return os.path.isfile(os.path.join(run_dir, MOTOR_STACK_DIR, filename))


def twin_has_jack_em_pack(run_dir: str) -> bool:
    d = os.path.join(run_dir, MOTOR_STACK_DIR, JACK_EM_PACK_DIR)
    if not os.path.isdir(d):
        return False
    try:
        return any(
            name.endswith((".png", ".jpg", ".pdf", ".json", ".md"))
            for name in os.listdir(d)
        )
    except OSError:
        return False


def state_declares_em_capability(state: dict | None) -> bool:
    """True when state capability matrix / product class implies EM evidence."""
    if not isinstance(state, dict):
        return False
    if state.get("isInstrumentDevice") is True:
        return False
    cap = state.get("capability") or state.get("_capability") or {}
    if isinstance(cap, dict):
        for key in ("electromagnetics", "em", "motor_stack", "traction_em"):
            v = cap.get(key)
            if v is True:
                return True
            if isinstance(v, dict) and (
                v.get("applicable") is True or v.get("present") is True
            ):
                return True
    pc = str(
        state.get("product_class")
        or state.get("productClass")
        or ((state.get("headline") or {}).get("product_class") if isinstance(state.get("headline"), dict) else "")
        or ""
    ).lower()
    motorish = (
        "motor" in pc
        or "mgu" in pc
        or "traction" in pc
        or "inverter" in pc
        or pc.endswith("_em")
    )
    return motorish


def electromagnetics_pack_applicable(
    run_dir: str,
    state: dict | None = None,
) -> dict[str, Any]:
    """Decide whether to run motor jack EM phases and ship electromagnetics/.

    Returns a dict:
      applicable: bool — ship EM content path
      run_motor_phases: bool — invoke Path B / phase C–E renderers
      reason: short string for logs / README-not-applicable
    """
    if isinstance(state, dict) and state.get("isInstrumentDevice") is True:
        return {
            "applicable": False,
            "run_motor_phases": False,
            "reason": "instrument device — electromagnetics not applicable",
        }
    has_path_b = twin_has_path_b_artefact(run_dir)
    has_jack = twin_has_jack_em_pack(run_dir)
    has_stack = twin_has_motor_stack(run_dir)
    declared = state_declares_em_capability(state)

    if has_path_b or has_jack:
        return {
            "applicable": True,
            "run_motor_phases": has_path_b,
            "reason": "motor EM artefacts present (_motor_stack Path B and/or jack_em_pack)",
        }
    if has_stack and declared:
        return {
            "applicable": True,
            "run_motor_phases": True,
            "reason": "motor stack + declared EM capability — may render Path B pack",
        }
    if declared and not has_stack:
        return {
            "applicable": False,
            "run_motor_phases": False,
            "reason": "EM capability declared but no _motor_stack artefacts yet",
        }
    return {
        "applicable": False,
        "run_motor_phases": False,
        "reason": "no motor EM capability or artefacts — omit electromagnetics/",
    }


def not_applicable_readme(reason: str) -> str:
    return (
        "Electromagnetics — not applicable\n"
        "=================================\n\n"
        "This product class has no electromagnetic field / torque evidence pack.\n"
        f"Reason: {reason}\n\n"
        "Anvil ships electromagnetics/ only when motor-stack / Path B artefacts\n"
        "exist. Instruments and non-EM plants omit this folder rather than invent\n"
        "field plots.\n"
    )


if __name__ == "__main__":
    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as td:
        r = electromagnetics_pack_applicable(td, {"isInstrumentDevice": True})
        assert r["applicable"] is False and r["run_motor_phases"] is False
        r2 = electromagnetics_pack_applicable(td, {"product_class": "benchtop_bioreactor"})
        assert r2["applicable"] is False
        # motor twin shape
        ms = Path(td) / MOTOR_STACK_DIR
        ms.mkdir()
        (ms / PATH_B_DEFAULT).write_text("{}")
        r3 = electromagnetics_pack_applicable(td, {"product_class": "formula_e_front_mgu"})
        assert r3["applicable"] is True and r3["run_motor_phases"] is True
    print("em_capability selftest OK")
