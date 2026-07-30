#!/usr/bin/env python3
"""Prove that ROSS can calculate a simple rotor's critical speed."""

from __future__ import annotations

import argparse
import math
import os
import warnings
from importlib.metadata import version

# GOTCHA: ROSS imports a compressor package that probes for the optional,
# proprietary REFPROP library. Rotor dynamics does not use it. This sentinel
# makes that package select its open-source fallback without noisy loader logs.
os.environ.setdefault("RPPREFIX", "/tmp/forgeos-no-refprop-é")
warnings.filterwarnings("ignore", message="Unable to set REFPROP path.*")
warnings.filterwarnings("ignore", category=UserWarning, module=r"ccp(\..*)?")

import ross as rs


def run_selftest() -> None:
    """Build a supported shaft and verify its first damped critical speed."""
    # INTENT: This is a small physical solve, not an import-only check. A steel
    # shaft, central disk, and two bearings exercise ROSS's eigensolver.
    steel = rs.Material(
        name="SelftestSteel",
        rho=7_810.0,
        E=211.0e9,
        G_s=81.2e9,
    )
    shaft_elements = [
        rs.ShaftElement(
            L=0.25,
            idl=0.0,
            odl=0.05,
            material=steel,
        )
        for _ in range(4)
    ]
    disk = rs.DiskElement.from_geometry(
        n=2,
        material=steel,
        width=0.05,
        i_d=0.05,
        o_d=0.20,
    )
    bearings = [
        rs.BearingElement(n=node, kxx=1.0e6, cxx=1.0e3)
        for node in (0, 4)
    ]
    rotor = rs.Rotor(shaft_elements, [disk], bearings)

    critical_speeds = rotor.run_critical_speed(num_modes=8)
    first_rad_s = float(critical_speeds.wd()[0])
    first_hz = first_rad_s / (2.0 * math.pi)
    first_rpm = first_hz * 60.0

    if not all(math.isfinite(value) for value in (first_rad_s, first_hz, first_rpm)):
        raise RuntimeError("ROSS returned a non-finite critical speed")
    if not 100.0 < first_rpm < 10_000.0:
        raise RuntimeError(
            f"ROSS first critical speed is outside the selftest range: {first_rpm:.3f} rpm"
        )

    print(f"ROSS_VERSION={version('ross-rotordynamics')}")
    print("ROSS_SHAFT_LENGTH_M=1.000")
    print(f"ROSS_FIRST_CRITICAL_SPEED_RAD_S={first_rad_s:.6f}")
    print(f"ROSS_FIRST_CRITICAL_SPEED_HZ={first_hz:.6f}")
    print(f"ROSS_FIRST_CRITICAL_SPEED_RPM={first_rpm:.3f}")
    print("ROSS_ROTOR_SELFTEST_PASS: finite critical speed verified")


def main() -> None:
    """Parse the explicit selftest command and run it."""
    parser = argparse.ArgumentParser(
        description="Run the ForgeOS ROSS rotor-dynamics proof."
    )
    parser.add_argument(
        "--selftest",
        action="store_true",
        help="build a simple rotor and calculate its first critical speed",
    )
    args = parser.parse_args()
    if not args.selftest:
        parser.error("--selftest is required")
    run_selftest()


if __name__ == "__main__":
    main()
