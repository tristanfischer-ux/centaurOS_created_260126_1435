#!/usr/bin/env python3
"""Run --selftest on every staged MGU/MCU pack module."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PY = ROOT / "python"
MODULES = [
    "inverter_sic_loss.py",
    "inverter_current_voltage_envelope.py",
    "field_weakening_mtpa.py",
    "ipmsm_analytical_sizing.py",
    "motor_loss_point.py",
    "rotor_centrifugal_stress.py",
    "mgu_thermal_lumped.py",
    "gear_ratio_traction.py",
    "duty_cycle_energy.py",
]


def main() -> int:
    failed = 0
    for name in MODULES:
        path = PY / name
        print(f"==> {name}")
        proc = subprocess.run(
            [sys.executable, str(path), "--selftest"],
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            failed += 1
            print(proc.stdout)
            print(proc.stderr, file=sys.stderr)
            print(f"FAIL {name} exit={proc.returncode}")
        else:
            print(proc.stdout.strip())
    print()
    if failed:
        print(f"{failed}/{len(MODULES)} FAILED")
        return 1
    print(f"ALL {len(MODULES)} staged MGU/MCU tools selftest OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
