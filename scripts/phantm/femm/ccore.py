"""PHANTM — gapped C-core validation gate for the FE loop (brief §6 mandate).

A U-core + armature with two 0.5 mm gaps, 500 A-turns, near-linear iron
(µr = 10 000). Closed-form check values:

    B_gap  = µ0·NI / (2g + l_fe/µr)             (series magnetic circuit)
    F      = B²/(2µ0) · 2·A_face                (Maxwell pull, two faces)

with a Carter-style fringing allowance (effective face width w + 2g) for the
force comparison band. The FE loop must land within the gate band before it
is allowed near the actuator geometry.

Run:  ~/.venvs/phantm/bin/python -m femm.ccore   (from scripts/phantm)
"""

from __future__ import annotations

import math
import os
import tempfile

from .runner import run_lua

MU0 = 4e-7 * math.pi

# geometry (mm)
LEG_W = 10.0        # leg + back-bar width
WIN = 20.0          # core window width/height
GAP = 0.5
ARM_T = 10.0        # armature thickness
DEPTH = 10.0        # 2D depth
MU_R = 10000.0
N_TURNS = 100
I_A = 5.0

LUA = f"""
show_console()
newdocument(0)
mi_probdef(0, "millimeters", "planar", 1e-8, {DEPTH}, 30)

mi_addmaterial("air", 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0)
mi_addmaterial("iron", {MU_R}, {MU_R}, 0, 0, 0, 0, 0, 1, 0, 0, 0)
mi_addmaterial("copper", 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0)
mi_addcircprop("coil", {I_A}, 1)

-- U-core: outer x[0,40] y[0,40], window x[10,30] y[10,40]
mi_addnode(0,0)   mi_addnode(40,0)  mi_addnode(40,40) mi_addnode(30,40)
mi_addnode(30,10) mi_addnode(10,10) mi_addnode(10,40) mi_addnode(0,40)
mi_addsegment(0,0,40,0)    mi_addsegment(40,0,40,40)  mi_addsegment(40,40,30,40)
mi_addsegment(30,40,30,10) mi_addsegment(30,10,10,10) mi_addsegment(10,10,10,40)
mi_addsegment(10,40,0,40)  mi_addsegment(0,40,0,0)
mi_addblocklabel(5,5)
mi_selectlabel(5,5)
mi_setblockprop("iron", 1, 0, "<None>", 0, 0, 0)
mi_clearselected()

-- gap probe block (femmcli lacks mo_getb — average By over a bounded air block)
mi_addnode(2,40.05) mi_addnode(8,40.05) mi_addnode(8,40.45) mi_addnode(2,40.45)
mi_addsegment(2,40.05,8,40.05) mi_addsegment(8,40.05,8,40.45)
mi_addsegment(8,40.45,2,40.45) mi_addsegment(2,40.45,2,40.05)
mi_addblocklabel(5,40.25)
mi_selectlabel(5,40.25)
mi_setblockprop("air", 1, 0, "<None>", 0, 7, 0)
mi_clearselected()

-- armature: x[-5,45], y[40.5,50.5], group 1
mi_addnode(-5,40.5) mi_addnode(45,40.5) mi_addnode(45,50.5) mi_addnode(-5,50.5)
mi_addsegment(-5,40.5,45,40.5) mi_addsegment(45,40.5,45,50.5)
mi_addsegment(45,50.5,-5,50.5) mi_addsegment(-5,50.5,-5,40.5)
mi_addblocklabel(20,45.5)
mi_selectlabel(20,45.5)
mi_setblockprop("iron", 1, 0, "<None>", 0, 1, 0)
mi_clearselected()

-- coil on the left leg: window-side and outside conductor bundles
mi_addnode(11,15) mi_addnode(16,15) mi_addnode(16,35) mi_addnode(11,35)
mi_addsegment(11,15,16,15) mi_addsegment(16,15,16,35)
mi_addsegment(16,35,11,35) mi_addsegment(11,35,11,15)
mi_addblocklabel(13.5,25)
mi_selectlabel(13.5,25)
mi_setblockprop("copper", 1, 0, "coil", 0, 0, {N_TURNS})
mi_clearselected()
mi_addnode(-6,15) mi_addnode(-1,15) mi_addnode(-1,35) mi_addnode(-6,35)
mi_addsegment(-6,15,-1,15) mi_addsegment(-1,15,-1,35)
mi_addsegment(-1,35,-6,35) mi_addsegment(-6,35,-6,15)
mi_addblocklabel(-3.5,25)
mi_selectlabel(-3.5,25)
mi_setblockprop("copper", 1, 0, "coil", 0, 0, {-N_TURNS})
mi_clearselected()

-- air box + A=0 boundary
mi_addboundprop("A0", 0, 0, 0, 0, 0, 0, 0, 0, 0)
mi_addnode(-40,-30) mi_addnode(80,-30) mi_addnode(80,80) mi_addnode(-40,80)
mi_addsegment(-40,-30,80,-30) mi_addsegment(80,-30,80,80)
mi_addsegment(80,80,-40,80)   mi_addsegment(-40,80,-40,-30)
mi_selectsegment(20,-30) mi_selectsegment(80,25)
mi_selectsegment(20,80)  mi_selectsegment(-40,25)
mi_setsegmentprop("A0", 0, 1, 0, 0)
mi_clearselected()
mi_addblocklabel(-20,-10)
mi_selectlabel(-20,-10)
mi_setblockprop("air", 1, 0, "<None>", 0, 0, 0)
mi_clearselected()

mi_saveas("ccore_case.fem")
mi_analyze(1)
mi_loadsolution()

mo_groupselectblock(1)
fy = mo_blockintegral(19)
print("PHANTM_RESULT fy=" .. fy)
mo_clearblock()
mo_groupselectblock(7)
by_int = mo_blockintegral(9)
vol = mo_blockintegral(10)
print("PHANTM_RESULT b_gap=" .. by_int / vol)
mo_clearblock()
quit()
"""


def analytic():
    g = GAP * 1e-3
    l_fe = 150e-3                       # approximate steel path length
    ni = N_TURNS * I_A
    b = MU0 * ni / (2 * g + l_fe / MU_R)
    a_face = (LEG_W * 1e-3) * (DEPTH * 1e-3)
    a_fringe = ((LEG_W + 2 * GAP) * 1e-3) * (DEPTH * 1e-3)
    f_lo = b**2 / (2 * MU0) * 2 * a_face
    f_hi = b**2 / (2 * MU0) * 2 * a_fringe
    return b, f_lo, f_hi


def main() -> int:
    with tempfile.TemporaryDirectory() as td:
        path = os.path.join(td, "ccore.lua")
        with open(path, "w") as f:
            f.write(LUA)
        res = run_lua(path)
    b_ref, f_lo, f_hi = analytic()
    b_fe = abs(res["b_gap"])
    f_fe = abs(res["fy"])
    b_err = abs(b_fe - b_ref) / b_ref
    # force gate: within [0.95·f_lo, 1.08·f_hi] (fringing band + 5%)
    ok_b = b_err <= 0.05
    ok_f = 0.95 * f_lo <= f_fe <= 1.08 * f_hi
    print(f"C-core gate: B_gap FE {b_fe:.4f} T vs analytic {b_ref:.4f} T "
          f"({b_err:+.1%})  -> {'PASS' if ok_b else 'FAIL'}")
    print(f"C-core gate: |F| FE {f_fe:.2f} N vs analytic band [{f_lo:.2f}, {f_hi:.2f}] N "
          f"-> {'PASS' if ok_f else 'FAIL'}")
    return 0 if (ok_b and ok_f) else 1


if __name__ == "__main__":
    raise SystemExit(main())
