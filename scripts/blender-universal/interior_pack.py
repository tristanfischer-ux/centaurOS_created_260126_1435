#!/usr/bin/env python3
"""interior_pack.py — deterministic, non-overlapping 3D pack of a sealed-instrument
interior (2026-07-23). The role->XY placement (instrument_role_xy_mm) co-locates parts
by role with NO collision avoidance, so 33 organoid interior parts had 108 pairwise
clashes (many 100% interpenetration). Building solid see-inside meshes on that = garbage.

This packs the interior parts into non-overlapping positions inside the enclosure floor,
largest-footprint-first shelf packing with row-wrap, tall parts kept upright. Pure +
deterministic (sorted by (-footprint, name) so identical inputs -> identical layout).
The clash check is the convergence oracle (no Blender needed). Universal: keyed on
dims + a coarse "base layer" flag (a board/plate becomes the floor other parts sit on),
never a product table.

pack_interior(parts, iw, idep, ih, base_z, gap=…) -> {tag: (cx,cy,cz)}  (mm, enclosure-centred)
"""
from __future__ import annotations
import re


def _footprint(p):
    d = p["dims"]
    return d[0] * d[1]


def _is_baselayer(name: str) -> bool:
    # a PCB / board / base plate is the floor other electronics mount ON (universal signal)
    return bool(re.search(r"\bpcb\b|board|base ?plate|motherboard|backplane", name, re.I))


def _is_fastener(name: str) -> bool:
    return bool(re.search(r"standoff|screw|washer|\bnut\b|\bclip\b|bracket|label|cable\b|wire\b", name, re.I))


def _is_chassis(name: str, dims, chassis_footprint_mm2=2500.0) -> bool:
    """A big FLOOR-STANDING functional part (the mechanical chassis of the instrument):
    keyed on the chassis-function vocabulary OR a large footprint. Everything else small is
    on-board (mounts on the PCB). Universal, no product table."""
    if _is_baselayer(name):
        return False  # the PCB is its own base plane, handled separately
    if re.search(r"vessel|culture|reactor|bioreactor|vial holder|"
                 r"pump|stirrer|\bmotor\b|drive|fan|blower|heatsink|"
                 r"tubing|manifold|peltier|\btec\b|heater|thermal|"
                 r"filter|vent|reservoir|\btank\b|holder|fixture|display|deck", name, re.I):
        return True
    return dims[0] * dims[1] > chassis_footprint_mm2 or max(dims) > 70.0


def _is_onboard(name: str, dims) -> bool:
    """Small board-level part (sensor / IC / protection / connector-chip) that MOUNTS ON THE
    PCB rather than the floor — everything that is neither a fastener, the PCB, nor chassis."""
    return not (_is_fastener(name) or _is_baselayer(name) or _is_chassis(name, dims))


def _shelf_pack(items, fw, fd, floor_z, gap_mm):
    """Largest-footprint-first shelf pack on ONE floor plane (+x rows, wrap +y). Returns
    {tag:(cx,cy,cz)} + the max z-top used. Raises no overflow — caller sizes the plane."""
    # ORIENT each part so its LONGER footprint side runs along +x (the shelf axis): shrinks
    # row DEPTH so rows pack tighter in y. Record the applied rotation so the caller/geometry
    # can match it. Then pack rows tallest-depth-first so a row's wasted depth is minimised.
    oriented = []
    for p in items:
        w, d, h = p["dims"]
        rot = d > w  # swap so w>=d (long side along x)
        ww, dd = (max(w, d), min(w, d))
        oriented.append((p, ww, dd, h, rot))
    oriented.sort(key=lambda t: (-t[2], -t[1], t[0]["tag"]))  # deepest first, then widest
    pos = {}; rot_of = {}
    x = -fw / 2.0; y = -fd / 2.0; row_depth = 0.0; ztop = floor_z
    for p, ww, dd, h, rot in oriented:
        if ww > fw:
            ww = fw
        if x + ww > fw / 2.0 + 1e-6:
            x = -fw / 2.0; y += row_depth + gap_mm; row_depth = 0.0
        pos[p["tag"]] = (round(x + ww / 2, 2), round(y + dd / 2, 2), round(floor_z + h / 2, 2))
        rot_of[p["tag"]] = rot
        x += ww + gap_mm; row_depth = max(row_depth, dd); ztop = max(ztop, floor_z + h)
    pos["__rot__"] = rot_of
    return pos, ztop, (y + row_depth)  # last y-edge used


def pack_interior(parts, iw_mm, idep_mm, ih_mm, base_z_mm, gap_mm=3.0, wall_mm=6.0):
    """Hosting-aware pack: CHASSIS parts (vessel/pump/stirrer/fan/Peltier/vial/tubing +
    footprint>1500mm²) + a PCB base plane sit on the FLOOR; small ON-BOARD electronics
    mount ON the PCB surface (matches reality + frees the floor). Returns {tag:(cx,cy,cz)}
    enclosure-centred. Deterministic (sorted). Universal (function/footprint signal)."""
    fw = iw_mm - 2 * wall_mm
    fd = idep_mm - 2 * wall_mm
    floor_z = base_z_mm + wall_mm
    fasteners = [p for p in parts if _is_fastener(p["name"])]
    rest = [p for p in parts if not _is_fastener(p["name"])]
    onboard = [p for p in rest if _is_onboard(p["name"], p["dims"])]
    chassis = [p for p in rest if p not in onboard]

    # PCB base plane: use a real PCB part if present, else SYNTHESISE one sized to host the
    # on-board electronics (the manifest lacks a real board — council PCB-coherence gap).
    pcb = next((p for p in chassis if _is_baselayer(p["name"])), None)
    if pcb is None and onboard:
        ob_fp = sum(_footprint(p) for p in onboard)
        side = max(80.0, (ob_fp * 1.8) ** 0.5)  # 1.8× for spacing on the board
        pcb = {"tag": "__PCB_BASE__", "name": "PCB (interior base plane)",
               "dims": (round(min(side, fw), 1), round(min(side, fd), 1), 2.0), "_synth": True}
        chassis = chassis + [pcb]

    pos, ztop, _ = _shelf_pack(chassis, fw, fd, floor_z, gap_mm)

    # mount on-board electronics ON the PCB surface, grid-distributed across its footprint
    if pcb is not None and onboard:
        pc = pos[pcb["tag"]]; pw, pd, ph = pcb["dims"]
        pcb_top = pc[2] + ph / 2
        obs = sorted(onboard, key=lambda p: (-_footprint(p), p["tag"]))
        ox = pc[0] - pw / 2 + gap_mm; oy = pc[1] - pd / 2 + gap_mm; row_d = 0.0
        for p in obs:
            w, d, h = p["dims"]
            if ox + w > pc[0] + pw / 2 - gap_mm:
                ox = pc[0] - pw / 2 + gap_mm; oy += row_d + gap_mm; row_d = 0.0
            pos[p["tag"]] = (round(ox + w / 2, 2), round(oy + d / 2, 2), round(pcb_top + h / 2, 2))
            ox += w + gap_mm; row_d = max(row_d, d)

    fx = -fw / 2.0
    for p in fasteners:
        w, d, h = p["dims"]
        pos[p["tag"]] = (round(fx + w / 2, 2), round(fd / 2 - d, 2), round(floor_z + h / 2, 2))
        fx += w + gap_mm
    return pos


# ── clash oracle (the convergence check) ─────────────────────────────────────
def _aabb(cx, cy, cz, w, d, h):
    return (cx - w / 2, cx + w / 2, cy - d / 2, cy + d / 2, cz - h / 2, cz + h / 2)


def count_clashes(parts, pos, iw_mm, idep_mm, ih_mm, base_z_mm, wall_mm=6.0):
    """Returns (n_clash, n_out_of_bounds, worst_examples)."""
    import itertools
    def fast(n): return _is_fastener(n)
    rot = pos.get("__rot__", {})
    boxes = {}
    for p in parts:
        c = pos[p["tag"]]; w, d, h = p["dims"]
        if rot.get(p["tag"]):  # packer swapped w/d to run the long side along x
            w, d = max(w, d), min(w, d)
        boxes[p["tag"]] = (_aabb(c[0], c[1], c[2], w, d, h), p["name"])
    lo = (-(iw_mm/2)+wall_mm, -(idep_mm/2)+wall_mm, base_z_mm)
    hi = ((iw_mm/2)-wall_mm, (idep_mm/2)-wall_mm, base_z_mm+ih_mm)
    oob = 0
    for tag, (b, nm) in boxes.items():
        if b[0] < lo[0]-1 or b[1] > hi[0]+1 or b[2] < lo[1]-1 or b[3] > hi[1]+1 or b[4] < lo[2]-1 or b[5] > hi[2]+1:
            oob += 1
    clash = 0; worst = []
    tags = list(boxes)
    for a, bb in itertools.combinations(tags, 2):
        (ba, na), (bx, nb) = boxes[a], boxes[bb]
        if fast(na) or fast(nb):
            continue
        ox = max(0, min(ba[1], bx[1]) - max(ba[0], bx[0]))
        oy = max(0, min(ba[3], bx[3]) - max(ba[2], bx[2]))
        oz = max(0, min(ba[5], bx[5]) - max(ba[4], bx[4]))
        if ox*oy*oz > 1:
            clash += 1
            if len(worst) < 6:
                worst.append(f"{na[:16]}~{nb[:16]} {ox:.0f}x{oy:.0f}x{oz:.0f}")
    return clash, oob, worst


if __name__ == "__main__":
    import sys, json
    mf = sys.argv[1] if len(sys.argv) > 1 else "out/organoid-for-simon/parts-manifest.json"
    pm = json.load(open(mf))
    allp = pm.get("parts", [])
    shell = next((p for p in allp if "shell" in str(p.get("name", "")).lower()), None)
    sd = shell["dims_mm"]; W, D, H = sd["w"], sd["d"], sd["h"]
    iw, idep, ih = W - 12, D - 12, H - 12
    base_z = 0.0
    parts = []
    for p in allp:
        if p is shell or "shell" in str(p.get("name", "")).lower():
            continue
        d = p.get("dims_mm") or {}
        parts.append({"tag": p.get("equipment_tag", p.get("name")), "name": str(p.get("name", "")),
                      "dims": (d.get("w", 5), d.get("d", 5), d.get("h", 5))})
    pos = pack_interior(parts, iw, idep, ih, base_z)
    nclash, oob, worst = count_clashes(parts, pos, iw, idep, ih, base_z)
    print(f"packed {len(parts)} interior parts into {iw:.0f}x{idep:.0f}x{ih:.0f} mm interior")
    print(f"  clashes: {nclash}  |  out-of-bounds: {oob}")
    if worst:
        print("  residual:", " | ".join(worst))
    print("  RESULT:", "CONVERGED (0 clash, 0 oob)" if (nclash == 0 and oob == 0) else "NOT YET — refine")
