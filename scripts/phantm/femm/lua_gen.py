"""PHANTM — parametric FEMM Lua generator for the actuator (one pole-piece).

2D planar, units mm, depth = 1.55 mm (translator transverse width — exact for
the working gaps and teeth, where the FE truth is needed).

UNROLLED-LOOP model: in the real device the bridge wraps the translator
TRANSVERSELY (the slot-sections are 1.708 mm long across the translator and the
bridge joins their transverse ends). No single 2D plane holds both the
horseshoe and the tooth modulation, so the loop is unrolled into the tooth
plane: bridge + PM + coil drawn as a straight vertical limb to the LEFT of the
pole, joined to the slot-sections by stubs. Steel path lengths ≈ preserved;
out-of-plane cross-sections preserved by thickness scaling:

    bridge drawn thickness  = 0.232·(1.162/1.55) = 0.174 mm
    slot-section back drawn = 0.310·(1.708/1.55) = 0.342 mm

Fidelity notes: bridge-region fringing/leakage geometry is approximate (the
lumped model's k_leak owns that); tooth/gap region is exact. The translator is
drawn asymmetrically (short on the bridge side) to keep clearance from the
unrolled limb.

Post-processing per case: WST axial force on the translator (group 1),
total co-energy, coil flux linkage (circuit "drv"), bridge + PM probe flux.
"""

from __future__ import annotations

import math

from params import BASELINE

P = BASELINE
PITCH = 0.464
TOOTH = 0.232
GAP = 0.0775
HT = 1.549 / 2.0          # translator half-height
SLOT_T = 0.465            # translator slot depth
SS_TIP_Y = HT + GAP       # stator tooth-tip face y (top side)
SS_SLOT_D = 0.155
SS_BACK_DRAWN = 0.310 * (1.708 / 1.55)
SS_BACK_Y0 = SS_TIP_Y + SS_SLOT_D              # back inner face
SS_BACK_Y1 = SS_BACK_Y0 + SS_BACK_DRAWN        # back outer face
POLE_HALF = 0.58                               # slot-section axial half-extent
BRIDGE_T = 0.232 * (1.162 / 1.55)
BRIDGE_X1 = -1.576                             # bridge right face
BRIDGE_X0 = BRIDGE_X1 - BRIDGE_T
TRANSL_XL, TRANSL_XR = -1.16, 1.508            # translator drawn span (pre-offset)
COND_W = 0.126                                 # coil conductor block width
AIR = 3.2, 2.6                                 # half-box
DEPTH = 1.55            # out-of-plane depth (mm) — the translator transverse width
GAP_STRIP_X = 0.75      # half-span of the fine-mesh air strip inside each gap
GAP_STRIP_INSET = 0.006 # clearance from the strip to each tooth face


def _toothed_outline_top(x0, x1, tip_y, slot_bottom_y, land_centres, side):
    """Trace a toothed face from x0 to x1. side=+1: teeth point down (stator top
    section, tips at tip_y below the back); side=-1: teeth point up (translator
    top face). Returns list of (x, y) tracing left→right along the face."""
    pts = [(x0, tip_y)]
    lands = sorted(land_centres)
    for c in lands:
        a, b = c - TOOTH / 2.0, c + TOOTH / 2.0
        if b <= x0 or a >= x1:
            continue
        a, b = max(a, x0), min(b, x1)
        # slot before this land (from previous position to a) is recessed
        pts.append((a, tip_y))
        pts.append((a, tip_y))
        pts.append((b, tip_y))
    pts.append((x1, tip_y))
    return pts


def _teeth_face_points(x0, x1, face_y, recess_y, land_centres):
    """Node path along a toothed face (lands at face_y, slots recessed to
    recess_y), left→right, starting and ending wherever x0/x1 land."""
    eps = 1e-9
    lands = [(c - TOOTH / 2.0, c + TOOTH / 2.0) for c in sorted(land_centres)]
    lands = [(max(a, x0), min(b, x1)) for a, b in lands if b > x0 + eps and a < x1 - eps]
    pts = []
    x = x0
    at_face = any(a <= x0 + eps < b for a, b in lands)
    cur_y = face_y if at_face else recess_y
    pts.append((x0, cur_y))
    for a, b in lands:
        if a > x + eps:
            # recessed span x..a
            if cur_y != recess_y:
                pts.append((x, recess_y))
                cur_y = recess_y
            pts.append((a, recess_y))
        if cur_y != face_y:
            pts.append((a, face_y))
            cur_y = face_y
        pts.append((b, face_y))
        x = b
    if x < x1 - eps:
        if cur_y != recess_y:
            pts.append((x, recess_y))
        pts.append((x1, recess_y))
    # dedupe consecutive duplicates
    out = [pts[0]]
    for p_ in pts[1:]:
        if abs(p_[0] - out[-1][0]) > eps or abs(p_[1] - out[-1][1]) > eps:
            out.append(p_)
    return out


def _poly_lua(pts, close=True):
    """Emit mi_addnode + mi_addsegment for a polyline/polygon."""
    lines = []
    for x, y in pts:
        lines.append(f"mi_addnode({x:.6f},{y:.6f})")
    seq = pts + [pts[0]] if close else pts
    for (xa, ya), (xb, yb) in zip(seq[:-1], seq[1:]):
        if abs(xa - xb) > 1e-9 or abs(ya - yb) > 1e-9:
            lines.append(f"mi_addsegment({xa:.6f},{ya:.6f},{xb:.6f},{yb:.6f})")
    return lines


def translator_polygon(xoff):
    """Translator outline: bar ends FIXED in space, tooth pattern shifted by
    xoff. The FE bar is a window into the real 12.5 mm translator; fixing the
    ends keeps the (unphysical, unrolled-bridge) end-attraction bias constant
    in x so it cancels in force differences and subtracts at alignment."""
    xl, xr = TRANSL_XL, TRANSL_XR
    n_min = math.floor((xl - xoff) / PITCH) - 1
    n_max = math.ceil((xr - xoff) / PITCH) + 1
    centres = [xoff + k * PITCH for k in range(n_min, n_max + 1)]
    top = _teeth_face_points(xl, xr, HT, HT - SLOT_T, centres)
    bot = [(x, -y) for x, y in reversed(top)]
    return top + bot


def slot_section_polygon(top: bool):
    """One slot-section (teeth + back, incl. the stub toward the bridge)."""
    s = 1.0 if top else -1.0
    centres = [-PITCH, 0.0, PITCH]
    face = _teeth_face_points(-POLE_HALF, POLE_HALF, s * SS_TIP_Y, s * SS_BACK_Y0, centres)
    if not top:
        face = [(x, y) for x, y in face]
    # outline: toothed face left→right, up right end, back along the top,
    # stub out to the bridge, down/into the bridge junction, return
    pts = face + [
        (POLE_HALF, s * SS_BACK_Y1),
        (BRIDGE_X1, s * SS_BACK_Y1),
        (BRIDGE_X1, s * SS_BACK_Y0),
        (-POLE_HALF, s * SS_BACK_Y0),
    ]
    # remove the duplicate corner if face already ends at (-POLE_HALF, back0)
    return pts


def actuator_lua(x_mm: float, i_a: float, pm_mm: float, fem_name: str,
                 smc_bh_points=None, probe_pts=None, harmonic=None) -> str:
    """Generate the full Lua script for one (position, current, Pm) case.

    probe_pts: optional [(x_mm, y_mm), ...] at which to emit POINT field values
    as PHANTM_RESULT probe<i>_{bx,by,hx,hy}. Block integrals give AVERAGES over
    a region, which is the wrong statistic for a demagnetisation check — the
    magnet demagnetises where the reverse field is WORST, not where it is
    typical. These probes are how demag_gate.py gets that worst value.

    harmonic: optional dict(freq_hz, mu_r, sigma_ms) turning this into an
    AC/eddy-current solve on the SAME geometry — used by eddy.py to measure how
    fast flux actually diffuses into the solid steel. The solver linearises B-H
    for a harmonic solve, so mu_r replaces the nonlinear curve; eddy.py brackets
    that by sweeping mu_r rather than trusting a single value.
    """
    from materials import SmcMaterial
    bh = smc_bh_points or SmcMaterial().femm_bh_points()
    nc = P.coil.n_turns
    hc = P.materials.ndfeb_br_t / (4e-7 * math.pi * P.materials.ndfeb_mu_r)
    freq = float(harmonic["freq_hz"]) if harmonic else 0.0

    L = ["show_console()", "newdocument(0)",
         f'mi_probdef({freq:g}, "millimeters", "planar", 1e-8, {DEPTH:g}, 30)']

    # materials
    L.append('mi_addmaterial("air", 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0)')
    if harmonic:
        # Linear + CONDUCTIVE steel: conductivity is what makes eddy currents
        # exist at all, and it is deliberately zero in every other study here
        # (a magnetostatic solve with sigma is meaningless).
        mur = float(harmonic["mu_r"])
        L.append(f'mi_addmaterial("smc", {mur:g}, {mur:g}, 0, 0, '
                 f'{float(harmonic["sigma_ms"]):g}, 0, 0, 1, 0, 0, 0)')
    else:
        L.append('mi_addmaterial("smc", 500, 500, 0, 0, 0, 0, 0, 1, 0, 0, 0)')
        for b, h in bh:
            L.append(f'mi_addbhpoint("smc", {b:.6f}, {h:.3f})')
    L.append(f'mi_addmaterial("ndfeb", {P.materials.ndfeb_mu_r}, '
             f'{P.materials.ndfeb_mu_r}, {hc:.1f}, 0, 0, 0, 0, 1, 0, 0, 0)')
    L.append('mi_addmaterial("copper", 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0)')
    L.append(f'mi_addcircprop("drv", {i_a:.6f}, 1)')

    # translator (group 1)
    tp = translator_polygon(x_mm)
    L += _poly_lua(tp)
    L.append("mi_addblocklabel(0.05,0)")
    L.append("mi_selectlabel(0.05,0)")
    L.append('mi_setblockprop("smc", 0, 0.05, "<None>", 0, 1, 0)')
    L.append("mi_clearselected()")

    # slot-sections (top/bottom) with stubs
    for top in (True, False):
        s = 1.0 if top else -1.0
        L += _poly_lua(slot_section_polygon(top))
        ly = s * (SS_BACK_Y0 + SS_BACK_DRAWN / 2.0)
        L.append(f"mi_addblocklabel(0,{ly:.6f})")
        L.append(f"mi_selectlabel(0,{ly:.6f})")
        L.append('mi_setblockprop("smc", 0, 0.04, "<None>", 0, 2, 0)')
        L.append("mi_clearselected()")

    # bridge limb: vertical bar spanning between the two stub inner faces,
    # containing the PM (length pm_mm, centred at y=0)
    ph = pm_mm / 2.0
    x0, x1 = BRIDGE_X0, BRIDGE_X1
    for ya, yb in ((-SS_BACK_Y1, -ph), (ph, SS_BACK_Y1)):
        # split the right edge at ±SS_BACK_Y0 so the stub's left edge is an
        # exact shared segment (avoids partially-overlapping segments)
        y_split = SS_BACK_Y0 if yb > 0 else -SS_BACK_Y0
        if ya < y_split < yb:
            pts = [(x0, ya), (x1, ya), (x1, y_split), (x1, yb), (x0, yb)]
        else:
            pts = [(x0, ya), (x1, ya), (x1, yb), (x0, yb)]
        L += _poly_lua(pts)
        ly = (ya + yb) / 2.0
        L.append(f"mi_addblocklabel({(x0+x1)/2:.6f},{ly:.6f})")
        L.append(f"mi_selectlabel({(x0+x1)/2:.6f},{ly:.6f})")
        L.append('mi_setblockprop("smc", 0, 0.05, "<None>", 0, 3, 0)')
        L.append("mi_clearselected()")
    # PM block (magnetised +y → drives flux up the bridge)
    L += _poly_lua([(x0, -ph), (x1, -ph), (x1, ph), (x0, ph)])
    L.append(f"mi_addblocklabel({(x0+x1)/2:.6f},0)")
    L.append(f"mi_selectlabel({(x0+x1)/2:.6f},0)")
    L.append('mi_setblockprop("ndfeb", 0, 0.03, "<None>", 90, 4, 0)')
    L.append("mi_clearselected()")

    # coil conductors flanking the bridge. Sign convention: POSITIVE circuit
    # current AIDS the PM (boosts the pole's flux) — verified 2026-07-24 after
    # the first fixed-design solve drove the coil in opposition and "more
    # current" made the step force WORSE.
    for sgn, (cx0, cx1) in ((-1, (BRIDGE_X1, BRIDGE_X1 + COND_W)),
                            (+1, (BRIDGE_X0 - COND_W, BRIDGE_X0))):
        L += _poly_lua([(cx0, -0.5), (cx1, -0.5), (cx1, 0.5), (cx0, 0.5)])
        L.append(f"mi_addblocklabel({(cx0+cx1)/2:.6f},0)")
        L.append(f"mi_selectlabel({(cx0+cx1)/2:.6f},0)")
        L.append(f'mi_setblockprop("copper", 1, 0, "drv", 0, 5, {sgn * nc})')
        L.append("mi_clearselected()")

    # fine-mesh air strips inside the two working gaps (floating segments in air)
    for s in (1.0, -1.0):
        ins = min(GAP_STRIP_INSET, 0.25 * GAP)
        ya, yb = s * (HT + ins), s * (SS_TIP_Y - ins)
        y0_, y1_ = min(ya, yb), max(ya, yb)
        gx = GAP_STRIP_X
        L += _poly_lua([(-gx, y0_), (gx, y0_), (gx, y1_), (-gx, y1_)])
        lx_ = 0.93 * gx
        L.append(f"mi_addblocklabel({lx_:.6f},{ (y0_+y1_)/2 :.6f})")
        L.append(f"mi_selectlabel({lx_:.6f},{ (y0_+y1_)/2 :.6f})")
        L.append('mi_setblockprop("air", 0, 0.015, "<None>", 0, 6, 0)')
        L.append("mi_clearselected()")

    # outer air box + A=0
    ax, ay = AIR
    L.append('mi_addboundprop("A0", 0, 0, 0, 0, 0, 0, 0, 0, 0)')
    L += _poly_lua([(-ax, -ay), (ax, -ay), (ax, ay), (-ax, ay)])
    for px, py in ((0, -ay), (ax, 0), (0, ay), (-ax, 0)):
        L.append(f"mi_selectsegment({px},{py})")
    L.append('mi_setsegmentprop("A0", 0, 1, 0, 0)')
    L.append("mi_clearselected()")
    L.append(f"mi_addblocklabel({ax-0.3:.3f},{ay-0.3:.3f})")
    L.append(f"mi_selectlabel({ax-0.3:.3f},{ay-0.3:.3f})")
    L.append('mi_setblockprop("air", 1, 0, "<None>", 0, 0, 0)')
    L.append("mi_clearselected()")

    # solve + post
    L.append(f'mi_saveas("{fem_name}")')
    L.append("mi_analyze(1)")
    L.append("mi_loadsolution()")
    L.append("mo_groupselectblock(1)")
    L.append('print("PHANTM_RESULT fx=" .. mo_blockintegral(18))')
    L.append('print("PHANTM_RESULT fy=" .. mo_blockintegral(19))')
    L.append("mo_clearblock()")
    L.append("mo_groupselectblock()")
    L.append('print("PHANTM_RESULT coenergy=" .. mo_blockintegral(17))')
    L.append("mo_clearblock()")
    L.append("mo_groupselectblock(3)")
    L.append("mo_groupselectblock(4)")
    L.append('print("PHANTM_RESULT bridge_by_int=" .. mo_blockintegral(9))')
    L.append('print("PHANTM_RESULT bridge_vol=" .. mo_blockintegral(10))')
    L.append("mo_clearblock()")
    L.append("mo_groupselectblock(6)")
    L.append('print("PHANTM_RESULT gap_by_int=" .. mo_blockintegral(9))')
    L.append('print("PHANTM_RESULT gap_vol=" .. mo_blockintegral(10))')
    L.append("mo_clearblock()")
    L.append('i_, v_, flux_ = mo_getcircuitproperties("drv")')
    L.append('print("PHANTM_RESULT flux_linkage=" .. flux_)')
    if harmonic:
        # Ohmic (eddy) loss in the STEEL only — groups 1/2/3 are translator,
        # slot-sections and bridge. This is the number that says what skipping
        # laminations actually costs per pulse.
        for grp in (1, 2, 3):
            L.append(f"mo_groupselectblock({grp})")
        L.append('print("PHANTM_RESULT steel_loss_w=" .. mo_blockintegral(6))')
        L.append("mo_clearblock()")
    for k, (px, py) in enumerate(probe_pts or []):
        L.append(f"pA,pB1,pB2,pSig,pE,pH1,pH2,pJe,pJs,pMu1,pMu2,pPe,pPh "
                 f"= mo_getpointvalues({px:.6f},{py:.6f})")
        L.append(f'print("PHANTM_RESULT probe{k}_bx=" .. pB1)')
        L.append(f'print("PHANTM_RESULT probe{k}_by=" .. pB2)')
        L.append(f'print("PHANTM_RESULT probe{k}_hx=" .. pH1)')
        L.append(f'print("PHANTM_RESULT probe{k}_hy=" .. pH2)')
    L.append("quit()")
    return "\n".join(L) + "\n"
