#!/usr/bin/env python3
"""proveCatch for F1e — device-scale interconnect (organoid-bioreactor DN25 leak).

A benchtop instrument's fluid edges carry no flow demand, so size_connection's
HONEST-UNKNOWN branch defaulted to a NOMINAL DN25 (33.4 mm OD carbon-steel/HDPE
process pipe with flanged ends) "for CAD continuity" — plant plumbing on a 20 mL
device (the frozen 2150 schedule carried ~15 DN25 runs of 2–5 m). On a device-scale
product the CAD-continuity default must be lab MICRO-TUBING (~6 mm OD, push-fit).

This imports the REAL connection_sizing module (no bpy) and asserts: device-scale
flag ON → micro-tubing on both the no-flow and material-compatibility paths; flag
OFF (plant) → DN25 unchanged; a REAL flow demand is still sized normally in both
modes (the fix only touches the no-flow/compat defaults). Run standalone:
python3 interconnect_device_scale_selftest.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import connection_sizing as cs  # noqa: E402


def _label(spec) -> str:
    return str(spec.get("size_label") or "")


def main() -> int:
    fails = []
    ok = lambda c, m: fails.append(m) if not c else None

    noflow = {"constraint_kind": "flow_capacity", "mechanism": "fluid_loop", "required_value": 0}
    compat = {"constraint_kind": "material_compatibility", "mechanism": "fluid_loop"}

    # PLANT (flag off, the default): a no-flow edge stays a nominal DN25 process pipe.
    cs.set_device_scale_interconnect(False)
    p = cs.size_connection(noflow, 3.3)
    ok("DN25" in _label(p) and p["outer_dia_mm"] > 25,
       f"plant no-flow edge must stay DN25 process pipe, got {_label(p)!r} OD={p['outer_dia_mm']}")
    pc = cs.size_connection(compat, 2.0)
    ok("DN25" in _label(pc),
       f"plant compatibility edge must stay DN25, got {_label(pc)!r}")

    # DEVICE (flag on): a no-flow edge is lab micro-tubing (~6 mm OD), never DN25.
    cs.set_device_scale_interconnect(True)
    d = cs.size_connection(noflow, 3.3)
    ok("micro-tubing" in _label(d) and "DN25" not in _label(d),
       f"device no-flow edge must be micro-tubing, got {_label(d)!r}")
    ok(d["outer_dia_mm"] <= 10.0,
       f"device micro-tubing OD must be device-scale (<=10 mm), got {d['outer_dia_mm']}")
    ok(d.get("within_spec") is None,
       "device no-flow edge must stay HONEST-UNKNOWN (within_spec None), not fabricate in-spec")
    dc = cs.size_connection(compat, 2.0)
    ok("micro-tubing" in _label(dc) and "DN25" not in _label(dc),
       f"device compatibility edge must be micro-tubing, got {_label(dc)!r}")

    # NO OVER-REACH: a PLANT-scale flow (12 m³/h) is still sized by the fluid physics as a
    # DN pipe in BOTH modes — the device-scale tube branch only fires below the smallest DN.
    realflow = {"constraint_kind": "flow_capacity", "mechanism": "fluid_loop",
                "required_value": 12.0, "required_unit": "m3/h"}
    cs.set_device_scale_interconnect(True)
    rf = cs.size_connection(realflow, 3.0)
    ok("micro-tubing" not in _label(rf),
       f"a PLANT-scale flow (12 m³/h) must be sized as a DN pipe, not micro-tubing, got {_label(rf)!r}")

    # F1e small-authored-lab-flow (Cursor afternoon audit): a device flow authored in mL/min
    # or L/h must (a) parse correctly (NOT fall to the unknown→m³/s→DN300 bug) and (b) size as
    # lab micro-tubing, not a DN process pipe.
    cs.set_device_scale_interconnect(True)
    # the unit parser: 10 mL/min = 10e-6/60 m³/s ≈ 1.67e-7, NOT 10 m³/s.
    q_ml = cs.flow_to_m3s(10.0, "mL/min", 1000.0)
    ok(abs(q_ml - 10e-6 / 60.0) < 1e-12,
       f"10 mL/min must parse to {10e-6/60.0:.3e} m³/s, not the unknown→m³/s DN300 bug (got {q_ml:.3e})")
    for val, unit in [(10.0, "mL/min"), (10.0, "L/h"), (250.0, "uL/min")]:
        e = {"constraint_kind": "flow_capacity", "mechanism": "fluid_loop",
             "required_value": val, "required_unit": unit}
        sp = cs.size_connection(e, 1.0)
        ok("micro-tubing" in _label(sp) and "DN" not in _label(sp),
           f"a device lab flow {val} {unit} must size as micro-tubing, not a DN pipe (got {_label(sp)!r})")

    # Reset the module flag so a later import in the same process is not polluted.
    cs.set_device_scale_interconnect(False)

    if fails:
        print("[interconnect-device-scale][selftest] FAIL:")
        for f in fails:
            print("  ✗ " + f)
        return 1
    print("[interconnect-device-scale] _selftest passed — F1e device-scale interconnect "
          "proveCatch (device micro-tubing, plant DN25, real flow still sized)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
