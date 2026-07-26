"""PHANTM — femmcli runner: execute FEMM-dialect Lua natively (no Wine).

Backend: xfemm's `femmcli` (FEMM 4.2 solver core ported to portable C++),
built 2026-07-24 on this Mac with three portability patches (glibc sincos →
sin/cos; malloc.h → stdlib.h; std::ptr_fun → lambdas). Build recipe:

    git clone --depth 1 https://github.com/crobarcro/xfemm
    # apply the three patches above (see TRACKER.md)
    cd xfemm/cfemm && mkdir build && cd build
    cmake .. -DCMAKE_BUILD_TYPE=Release -DCMAKE_POLICY_VERSION_MINIMUM=3.5
    make -j8   # → bin/femmcli, copied to scripts/phantm/bin/femmcli

Scripts print machine-readable lines `PHANTM_RESULT <key>=<number>`; the
runner parses them from stdout. Timeout + one retry per case.
"""

from __future__ import annotations

import os
import re
import subprocess

BIN = os.path.join(os.path.dirname(__file__), "..", "bin", "femmcli")
_RESULT_RE = re.compile(r"PHANTM_RESULT\s+(\w+)\s*=\s*([-+eE0-9.naif]+)")
# A HARMONIC solve returns complex values as "<re>+I*<im>" / "<re>-I*<im>".
# The magnetostatic regex above would silently truncate one of those at the
# sign before the I and hand float() a trailing "+", so complex results need
# their own pattern rather than a looser one shared with the real case.
_CPLX_RE = re.compile(
    r"PHANTM_RESULT\s+(\w+)\s*=\s*"
    r"([-+]?[0-9.]+(?:[eE][-+]?\d+)?)\s*([-+])\s*I\s*\*\s*"
    r"([-+]?[0-9.]+(?:[eE][-+]?\d+)?)")


class FemmError(RuntimeError):
    pass


def run_lua(script_path: str, timeout_s: float = 120.0) -> dict:
    """Run a Lua script under femmcli; return {key: float} from PHANTM_RESULT lines."""
    cmd = [os.path.abspath(BIN), "-q", f"--lua-script={os.path.abspath(script_path)}"]
    for attempt in (1, 2):
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True,
                                  timeout=timeout_s,
                                  cwd=os.path.dirname(os.path.abspath(script_path)))
        except subprocess.TimeoutExpired:
            if attempt == 2:
                raise FemmError(f"femmcli timeout on {script_path}")
            continue
        results = {k: complex(float(re_), (1 if sgn == "+" else -1) * float(im))
                   for k, re_, sgn, im in _CPLX_RE.findall(proc.stdout)}
        # Real-valued keys fill in around the complex ones; a key already
        # captured as complex must not be overwritten by a truncated real read.
        for k, v in _RESULT_RE.findall(proc.stdout):
            if k not in results:
                results[k] = float(v)
        if results:
            return results
        if attempt == 2:
            raise FemmError(
                f"femmcli produced no PHANTM_RESULT lines (rc={proc.returncode})\n"
                f"stdout tail: {proc.stdout[-2000:]}\nstderr tail: {proc.stderr[-500:]}")
    raise FemmError("unreachable")
