#!/usr/bin/env python3
"""render_vision_rot_test.py — the ROT-GUARD for the vision render critic (council 2026-06-27).

A non-deterministic vision model can silently DRIFT and stop catching the very defects it exists to
catch. This guard runs the critic against a FROZEN known-bad render (tests/fixtures/render-vision/
known-bad-red-beam.png — the v30 hero with the stray red power-cable beam) and FAILS if the model no
longer flags it. If the model stops catching the frozen defect, the vision wiring must be revisited
(prompt/model bump) before it is trusted.

OFFLINE-SAFE: with no OPENROUTER_API_KEY (a cron/headless run, an air-gapped pre-push), it prints SKIP
and exits 0 — it never blocks on the absence of a network, only on a model that genuinely rotted.

Usage:  python3 render_vision_rot_test.py    (exit 0 = pass/skip, 1 = the model rotted)
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_vision_critic as rv  # noqa: E402

_FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "..", "..", "tests", "fixtures", "render-vision", "known-bad-red-beam.png")


def main() -> int:
    if not rv._key():
        print("render-vision rot-test: SKIP (no OPENROUTER_API_KEY — offline)")
        return 0
    if not os.path.exists(_FIXTURE):
        print(f"render-vision rot-test: SKIP (frozen fixture missing: {_FIXTURE})")
        return 0
    res = rv.critique_render(_FIXTURE)
    if not res.get("ok"):
        print(f"render-vision rot-test: SKIP (vision call failed: {res.get('error')})")
        return 0  # a transient API error is not a rot — don't block
    if res.get("broken") is True:
        print(f"render-vision rot-test: OK (model still flags the frozen red-beam defect: {res.get('defects')})")
        return 0
    print(f"render-vision rot-test: FAIL — the vision model NO LONGER flags the known-bad red-beam render "
          f"(got broken={res.get('broken')}). The critic has ROTTED; revisit prompt/model before trusting it.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
