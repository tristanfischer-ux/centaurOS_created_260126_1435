#!/usr/bin/env python3
"""Compatibility wrapper — delegates to universal draw_ga_detailed.py.

Kept so existing FE Front runbooks continue to work. New code should call:
  python3 scripts/blender-universal/draw_ga_detailed.py <outDir>
"""
from __future__ import annotations
import runpy
import sys
from pathlib import Path

sys.argv[0] = str(Path(__file__).resolve().parent / "blender-universal" / "draw_ga_detailed.py")
# default twin if bare invoke
if len(sys.argv) == 1:
    sys.argv.append("out/formula-e-front-mgu-20260729-1432")
runpy.run_path(str(Path(__file__).resolve().parent / "blender-universal" / "draw_ga_detailed.py"), run_name="__main__")
