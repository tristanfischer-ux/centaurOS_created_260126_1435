#!/usr/bin/env python3
"""Open-circuit airgap flux FFT — is the FUNDAMENTAL B1 healthy, or is 1.64 T local leakage?

INTENT (Grok 4.5, 2026-08-01 panel): "Peak airgap 1.64 T under load can be
tooth-tip leakage with weak fundamental B1; mean torque tracks B1·A, not local
Bpeak. Weak fundamental explains low mean + savage slot ripple with 46% openings.
TEST: OC airgap B_radial FFT at d-axis align; B1 should be ~0.7-1.0 T for
Br~=1.2 IPM. If B1 << 0.5 T, fix magnet vectors/material before any sizing
debate."

WHY THIS IS THE DECIDING TEST. Every torque route argues about the same machine:
  design flux (linear)      215.01 N.m
  measured back-EMF (linear) 131.11 N.m
  FE weighted-stress          57.84 N.m
  required                   125.21 N.m
Torque is proportional to the FUNDAMENTAL airgap flux density B1 times the
electric loading. A healthy B1 with low FE torque means the TORQUE PATH is wrong.
A weak B1 means the MAGNETIC CIRCUIT is wrong (magnet vectors, material, pocket
geometry, or slot openings shunting flux) and no amount of winding or integration
work will help. The two conclusions demand completely different fixes, which is
why this is worth one dedicated run.

Reads the open-circuit airgap probe the deck already samples (720 points) and
FFTs it, so it adds no new FE solve beyond one OC point.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "motor-stack"))


def analyse(b_radial: list[float], pole_pairs: int) -> dict:
    """FFT a full-circle airgap B_radial trace; report the working harmonics."""
    n = len(b_radial)
    if n < 16:
        raise ValueError("need a dense airgap trace")
    # Discrete Fourier coefficients at the harmonics that matter.
    def amp(order: int) -> float:
        re = sum(b * math.cos(2.0 * math.pi * order * i / n) for i, b in enumerate(b_radial))
        im = sum(b * math.sin(2.0 * math.pi * order * i / n) for i, b in enumerate(b_radial))
        return 2.0 * math.hypot(re, im) / n

    b1 = amp(pole_pairs)                 # the WORKING harmonic
    harmonics = {f"h{k}": round(amp(k * pole_pairs), 4) for k in (1, 3, 5, 7)}
    peak = max(abs(b) for b in b_radial)
    rms = math.sqrt(sum(b * b for b in b_radial) / n)
    thd = (math.sqrt(max(0.0, sum(amp(k * pole_pairs) ** 2 for k in (3, 5, 7))))
           / b1 * 100.0) if b1 > 1e-9 else float("inf")
    return {
        "B1_fundamental_T": round(b1, 4),
        "B_peak_local_T": round(peak, 4),
        "B_rms_T": round(rms, 4),
        "peak_to_fundamental_ratio": round(peak / b1, 3) if b1 > 1e-9 else None,
        "harmonics_T": harmonics,
        "thd_pct": round(thd, 1),
        "healthy_band_T": [0.70, 1.00],
        "verdict": (
            "B1_HEALTHY — the magnetic circuit is fine; a low FE torque means the "
            "TORQUE PATH (integration / winding excitation) is at fault"
            if b1 >= 0.70 else
            "B1_WEAK — the magnetic circuit is at fault (magnet vectors, material, "
            "pocket geometry, or slot openings shunting flux). Fix this BEFORE any "
            "winding, integration or sizing work; torque tracks B1, not local Bpeak."
        ),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path, required=True)
    ap.add_argument("--output", type=Path)
    args = ap.parse_args()

    import em_fia_front_kit_case as m

    twin = args.twin.resolve()
    state = json.loads((twin / "state.json").read_text())
    q = (state.get("orchestratorContract") or {}).get("quantities") or {}
    concentric = {}
    inputs = m.inputs_from_sections(q, concentric)
    geometry = m.derive_fia_geometry(inputs)
    solver = m._solver_path()
    machine = m.load(str(m.MATERIAL_MACHINE_PATH))
    remanence = float(machine.rotor.hole[0].magnet_0.mat_type.mag.Brm20)

    # OPEN CIRCUIT — magnets only, no stator current. This isolates the magnetic
    # circuit from the winding entirely.
    oc = m.run_magnetic_point(geometry, solver, remanence_t=remanence)
    trace = getattr(oc, "airgap_b_radial", None) or getattr(oc, "b_radial_samples", None)
    if not trace:
        # The deck reports aggregates rather than the trace; reconstruct the
        # fundamental from what it does expose and say so honestly.
        res = {
            "schema": "forgeos.motor_stack.airgap_fundamental_probe/v1",
            "trace_available": False,
            "note": ("the deck exposes only peak/rms/mean airgap B, not the 720-point "
                     "trace — reporting the aggregates and an rms-derived estimate"),
            "B_peak_local_T": round(float(oc.peak_airgap_flux_density_t), 4),
            "B_rms_T": round(float(oc.rms_airgap_flux_density_t), 4),
            "B1_estimate_from_rms_T": round(float(oc.rms_airgap_flux_density_t) * math.sqrt(2.0), 4),
            "remanence_T": round(remanence, 4),
            "healthy_band_T": [0.70, 1.00],
        }
        est = res["B1_estimate_from_rms_T"]
        res["verdict"] = (
            "B1_HEALTHY (rms-derived estimate)" if est >= 0.70
            else "B1_WEAK (rms-derived estimate) — magnetic circuit suspect")
    else:
        res = {"schema": "forgeos.motor_stack.airgap_fundamental_probe/v1",
               "trace_available": True, "remanence_T": round(remanence, 4),
               **analyse([float(x) for x in trace], geometry.rotor_poles // 2)}

    out = args.output or (twin / "_motor_stack" / "em_fia_airgap_fundamental_probe.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(res, indent=2))
    for k, v in res.items():
        if k not in ("schema",):
            print(f"  {k} = {v}")
    print(f"Artefact: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
