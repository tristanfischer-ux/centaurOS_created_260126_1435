#!/usr/bin/env python3
"""pipe_flange_selftest.py — proveCatch for the free-end T flange guard.

Adversarial inputs that used to emit a free-end T-bar:
  1. flanges=True with connect partners (double disc on a nozzle stub)
  2. flanges=True with NO connect (fat disc on an unterminated riser)

Both MUST refuse. The nozzle stub owns the single joint face.
"""
from __future__ import annotations

import sys
from pathlib import Path

_LIB = Path(__file__).resolve().parent.parent / "blender-templates"
sys.path.insert(0, str(_LIB))
from pipe_flange_rules import (  # noqa: E402
    PIPE_END_FLANGES_ENABLED,
    should_emit_pipe_end_flanges,
)


def _selftest() -> None:
    # proveCatch: the kill switch is ON (pipe-end flanges disabled).
    assert PIPE_END_FLANGES_ENABLED is False
    # Explicit off.
    assert should_emit_pipe_end_flanges(False, ()) is False
    assert should_emit_pipe_end_flanges(False, ("asm",)) is False
    # Adversarial: flanges=True MUST still refuse (free-end T residual).
    assert should_emit_pipe_end_flanges(True, ()) is False
    assert should_emit_pipe_end_flanges(True, (None, None)) is False
    assert should_emit_pipe_end_flanges(True, ("nozzle_asm",)) is False
    assert should_emit_pipe_end_flanges(True, (None, "b_conn")) is False
    assert should_emit_pipe_end_flanges(True, ("a", "b")) is False
    print("pipe-flange selftest OK (8 cases: pipe-end flanges permanently suppressed)")


if __name__ == "__main__":
    _selftest()
