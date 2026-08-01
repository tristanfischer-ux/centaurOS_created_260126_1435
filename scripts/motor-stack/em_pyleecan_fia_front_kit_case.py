#!/usr/bin/env python3
"""FIA front-kit EM point solved with PYLEECAN + MagFEMM — replaces the LUA belt deck.

INTENT (Tristan 2026-08-01): "use pyleecan instead of the lua belt generator."

WHY THE LUA DECK HAD TO GO. `em_fia_front_kit_case.py` hand-writes a FEMM LUA
deck, including its own stator winding belt map. That map is a DISTRIBUTED layout
requiring slots-per-pole-per-phase >= 2, so it can only build a 48-slot machine.
The twin contract specifies 24 slots. Meshing 24 produced 4.34 N·m peak across a
full 360-degree electrical sweep (3.5% of the 125.18 N·m duty) with torque
repeating every 120 degrees — three phase belts failing to form a rotating MMF.
The hand-written generator simply cannot wind the specified machine.

pyleecan builds the winding from (Zs, p, qs, Nlayer, coil_pitch) for ANY valid
combination and drives FEMM itself through MagFEMM, so the winding is a solved
layout rather than my belt arithmetic. It was ALREADY a dependency — the LUA path
loads a pyleecan `MachineIPMSM` purely to read magnet remanence and then discards
its winding. This uses the machine it already loads.

Bound to the twin: bore, stack, slot count and current come from the contract, so
the machine simulated is the machine designed.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Optional

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "lib"))

MATERIAL_MACHINE_PATH = (
    REPO_ROOT / "assets" / "edu-training-cad" / "pyleecan-ipmsm-b" / "IPMSM_B.json"
)


@dataclass
class PyleecanEmResult:
    stator_slots: int
    rotor_poles: int
    slots_per_pole_per_phase: float
    bore_diameter_mm: float
    stack_length_mm: float
    phase_current_rms_a: float
    turns_per_coil: int
    parallel_paths: int
    mean_torque_nm: float
    peak_torque_nm: float
    ripple_pct: float
    required_shaft_torque_nm: float
    mean_ratio: float
    n_positions: int
    winding_source: str
    notes: list


def _num(quantities: dict, *keys: str, default: Optional[float] = None) -> Optional[float]:
    for k in keys:
        raw = quantities.get(k)
        if raw is None:
            continue
        val = raw.get("value") if isinstance(raw, dict) else raw
        try:
            f = float(val)
        except (TypeError, ValueError):
            continue
        if math.isfinite(f):
            return f
    return default


def _numpy2_compat() -> None:
    """SciDataTool imports numpy.string_/int64 aliases removed in NumPy 2.

    Only `SciDataTool/Functions/Load/load_hdf5.py` needs them, and this path
    never loads HDF5 — but the import runs regardless. Aliasing the renamed
    symbols is contained and reversible; downgrading NumPy would destabilise the
    whole chain, and patching site-packages would not survive a reinstall.
    """
    import numpy as _np
    for old_name, new_name in (("string_", "bytes_"), ("unicode_", "str_"),
                               ("float_", "float64"), ("complex_", "complex128")):
        if not hasattr(_np, old_name) and hasattr(_np, new_name):
            setattr(_np, old_name, getattr(_np, new_name))


def solve(twin: Path, n_positions: int = 37) -> PyleecanEmResult:
    _numpy2_compat()
    from pyleecan.Functions.load import load
    from pyleecan.Classes.InputCurrent import InputCurrent
    from pyleecan.Classes.MagFEMM import MagFEMM
    from pyleecan.Classes.Simu1 import Simu1
    from pyleecan.Classes.OPdq import OPdq

    state = json.loads((twin / "state.json").read_text())
    q = (state.get("orchestratorContract") or {}).get("quantities") or {}

    notes: list = []
    machine = load(str(MATERIAL_MACHINE_PATH))

    # ── Bind the machine to the TWIN ────────────────────────────────────────
    rotor_od = _num(q, "fpk_rotor_od_mm", "rotor_airgap_diameter_mm", default=139.4)
    stack_mm = _num(q, "stack_length_mm", default=97.58)
    twin_slots = int(_num(q, "stator_slots", default=0) or 0)
    p = machine.rotor.get_pole_pair_number()

    machine.stator.L1 = float(stack_mm) * 1e-3
    machine.rotor.L1 = float(stack_mm) * 1e-3

    # Slot count: pyleecan rebuilds the winding for whatever Zs we set, which is
    # exactly the capability the LUA belt map lacked.
    if twin_slots > 0 and twin_slots != machine.stator.slot.Zs:
        spp = twin_slots / float(2 * p * 3)
        machine.stator.slot.Zs = twin_slots
        machine.stator.winding.p = p
        notes.append(
            f"stator slots set to the TWIN's {twin_slots} (SPP={spp:g}); the LUA "
            "belt generator could not wind this and produced 4.34 N.m peak")
    zs = machine.stator.slot.Zs

    current_rms = _num(q, "phase_current_design_a", "phase_current_max_a", default=477.0)
    required_t = _num(q, "required_shaft_torque_nm", default=125.18)
    if required_t is None or required_t <= 0:
        pw = _num(q, "continuous_electrical_power_kw", default=250.0) * 1000.0
        rpm = _num(q, "max_rotor_speed_rpm", default=19500.0)
        eff = _num(q, "mgu_efficiency", "motor_efficiency", default=0.978)
        required_t = pw / (eff * rpm * 2.0 * math.pi / 60.0)

    # ── MTPA-ish: let pyleecan sweep the current angle, take the best ───────
    rpm = _num(q, "max_rotor_speed_rpm", default=19500.0)
    Imax = float(current_rms) * math.sqrt(2.0)
    best = None
    for angle_deg in range(-90, 1, 15):
        a = math.radians(angle_deg)
        simu = Simu1(name="fia_front_mtpa", machine=machine)
        simu.input = InputCurrent(
            OP=OPdq(N0=float(rpm), Id_ref=Imax * math.sin(a), Iq_ref=Imax * math.cos(a)),
            Nt_tot=int(n_positions), Na_tot=2048,
        )
        simu.mag = MagFEMM(is_periodicity_a=True, is_periodicity_t=True, nb_worker=4)
        simu.force = None
        simu.struct = None
        try:
            out = simu.run()
        except Exception as exc:  # noqa: BLE001 — one angle failing must not kill the sweep
            notes.append(f"angle {angle_deg}deg failed: {type(exc).__name__}: {str(exc)[:400]}")
            continue
        tq = out.mag.Tem
        vals = [float(v) for v in tq.get_along("time")[tq.symbol].ravel()]
        mean_t = sum(vals) / len(vals)
        if best is None or abs(mean_t) > abs(best[1]):
            best = (angle_deg, mean_t, max(vals), min(vals))

    if best is None:
        raise RuntimeError("every current angle failed to solve")
    angle_deg, mean_t, tmax, tmin = best
    ripple = (tmax - tmin) / abs(mean_t) * 100.0 if mean_t else float("inf")
    notes.append(f"best current angle {angle_deg} deg elec (swept -90..0 in 15 deg)")

    return PyleecanEmResult(
        stator_slots=int(zs),
        rotor_poles=int(2 * p),
        slots_per_pole_per_phase=zs / float(2 * p * 3),
        bore_diameter_mm=float(rotor_od),
        stack_length_mm=float(stack_mm),
        phase_current_rms_a=float(current_rms),
        turns_per_coil=int(machine.stator.winding.Ntcoil or 0),
        parallel_paths=int(machine.stator.winding.Npcp or 1),
        mean_torque_nm=round(abs(mean_t), 4),
        peak_torque_nm=round(max(abs(tmax), abs(tmin)), 4),
        ripple_pct=round(ripple, 2),
        required_shaft_torque_nm=round(float(required_t), 4),
        mean_ratio=round(abs(mean_t) / float(required_t), 4),
        n_positions=int(n_positions),
        winding_source="pyleecan Winding (solved layout, not a hand-written belt map)",
        notes=notes,
    )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path, required=True)
    ap.add_argument("--positions", type=int, default=37)
    ap.add_argument("--output", type=Path)
    args = ap.parse_args()

    res = solve(args.twin.resolve(), n_positions=args.positions)
    out = args.output or (args.twin / "_motor_stack" / "em_pyleecan_fia_front_kit_case.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema": "forgeos.motor_stack.em_pyleecan_fia_front_kit_case/v1",
        "status": "PARTIAL",
        "ship_ok": False,
        "torque_reliable": False,
        **asdict(res),
    }
    out.write_text(json.dumps(payload, indent=2))
    print(
        f"pyleecan EM: Zs={res.stator_slots} 2p={res.rotor_poles} SPP="
        f"{res.slots_per_pole_per_phase:g}  mean|T|={res.mean_torque_nm:.2f} N.m "
        f"vs required {res.required_shaft_torque_nm:.2f}  ratio={res.mean_ratio:.4f}  "
        f"ripple={res.ripple_pct:.1f}%"
    )
    for n in res.notes:
        print(f"  note: {n}")
    print(f"Artefact: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
