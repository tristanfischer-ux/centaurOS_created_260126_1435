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


def _layer_shelf(items, fw, fd, z0, gap):
    """Shelf-pack `items` onto ONE plane at height z0. Returns (pos, rot, ztop, placed, leftover).
    Stops when the plane's depth (y) is exhausted; unплaced items are returned as leftover."""
    oriented = []
    for p in items:
        w, d, h = p["dims"]
        rot = d > w
        oriented.append((p, max(w, d), min(w, d), h, rot))
    oriented.sort(key=lambda t: (-t[2], -t[1], t[0]["tag"]))
    pos = {}; rot = {}; x = -fw/2; y = -fd/2; row_d = 0.0; ztop = z0; placed = []; leftover = []
    for p, ww, dd, h, r in oriented:
        ww = min(ww, fw)
        if x + ww > fw/2 + 1e-6:              # wrap to next row
            x = -fw/2; y += row_d + gap; row_d = 0.0
        if y + dd > fd/2 + 1e-6:               # plane full -> leftover to next layer
            leftover.append(p); continue
        pos[p["tag"]] = (round(x+ww/2, 2), round(y+dd/2, 2), round(z0+h/2, 2))
        rot[p["tag"]] = r; x += ww + gap; row_d = max(row_d, dd); ztop = max(ztop, z0+h)
        placed.append(p)
    return pos, rot, ztop, placed, leftover


def pack_interior_stacked(parts, base_z_mm, floor_w=None, floor_d=None, gap_mm=4.0,
                          standoff_mm=14.0, plate_t=3.0):
    """Multi-LAYER stacked pack + internal mounting FRAME. Mechanicals bolt to a base plate
    (layer 0); the PCB + electronics ride a raised deck on standoffs (layer 1); overflow
    stacks onto further decks. The enclosure resizes to contain the result. Returns
    (pos{tag:(x,y,z)}, rot{tag:bool}, frame[list of {tag,name,dims,pos}], layers, bbox)."""
    fasteners = [p for p in parts if _is_fastener(p["name"])]
    rest = [p for p in parts if not _is_fastener(p["name"])]
    mech = [p for p in rest if _is_chassis(p["name"], p["dims"]) or _is_baselayer(p["name"])]
    onboard = [p for p in rest if _is_onboard(p["name"], p["dims"])]

    # target floor: hold the two widest mechanicals side-by-side (keeps it compact -> stacks)
    if floor_w is None:
        ws = sorted((max(p["dims"][0], p["dims"][1]) for p in mech), reverse=True)
        floor_w = (ws[0] + ws[1] + 3*gap_mm) if len(ws) >= 2 else (ws[0] + 2*gap_mm if ws else 120)
    if floor_d is None:
        floor_d = floor_w * 0.72
    fw, fd = floor_w, floor_d

    pos = {}; rot = {}; frame = []; layers = []
    z = base_z_mm + plate_t                                   # layer-0 sits on the base plate
    todo = mech[:]
    layer_i = 0
    while todo:
        lp, lr, ztop, placed, todo = _layer_shelf(todo, fw, fd, z, gap_mm)
        pos.update(lp); rot.update(lr)
        layers.append({"z0": z, "ztop": ztop, "tags": [p["tag"] for p in placed]})
        z = ztop + standoff_mm + plate_t                     # next deck rides standoffs
        layer_i += 1
        if layer_i > 8:
            break
    mech_top = layers[-1]["ztop"] if layers else base_z_mm

    # PCB deck: a plate on standoffs above the mechanicals; electronics grid on it
    pcb_z0 = mech_top + standoff_mm + plate_t
    if onboard:
        # a PCB sized to host the electronics grid, centred on the floor
        ob_fp = sum(_footprint(p) for p in onboard)
        pw = min(fw - 2*gap_mm, max(80.0, (ob_fp*2.0)**0.5))
        pd = min(fd - 2*gap_mm, max(60.0, ob_fp*2.0/pw))
        pos["__PCB_BASE__"] = (0.0, 0.0, round(pcb_z0 + plate_t/2, 2))
        frame.append({"tag": "__PCB_BASE__", "name": "PCB (interior deck)",
                      "dims": (round(pw, 1), round(pd, 1), plate_t), "role": "pcb"})
        lp, lr, ztop, placed, leftover = _layer_shelf(onboard, pw, pd, pcb_z0 + plate_t, gap_mm)
        pos.update(lp); rot.update(lr)
        # any electronics that overflow the board grid: extra deck above
        zz = ztop + standoff_mm + plate_t
        while leftover:
            lp, lr, ztop, placed, leftover = _layer_shelf(leftover, pw, pd, zz, gap_mm)
            pos.update(lp); rot.update(lr); zz = ztop + standoff_mm + plate_t
        layers.append({"z0": pcb_z0, "ztop": ztop, "tags": [p["tag"] for p in onboard]})

    # frame: base plate + corner standoffs up to the top deck
    top_z = max((c[2] for c in pos.values()), default=base_z_mm)
    frame.append({"tag": "__BASE_PLATE__", "name": "Chassis base plate",
                  "dims": (round(fw, 1), round(fd, 1), plate_t),
                  "pos": (0.0, 0.0, round(base_z_mm + plate_t/2, 2)), "role": "plate"})
    so_h = top_z - base_z_mm
    for sx in (-1, 1):
        for sy in (-1, 1):
            frame.append({"tag": f"__STANDOFF_{sx}_{sy}__", "name": "Mounting standoff pillar",
                          "dims": (6.0, 6.0, round(so_h, 1)),
                          "pos": (round(sx*(fw/2-8), 2), round(sy*(fd/2-8), 2),
                                  round(base_z_mm + so_h/2, 2)), "role": "standoff"})
    # fasteners: on the base plate near a corner
    fx = -fw/2 + gap_mm
    for p in fasteners:
        w, d, h = p["dims"]
        pos[p["tag"]] = (round(fx+w/2, 2), round(fd/2-d, 2), round(base_z_mm+plate_t+h/2, 2))
        fx += w + gap_mm
    pos["__rot__"] = rot
    # bbox
    xs = []; ys = []; zs = []
    for p in rest + fasteners:
        c = pos[p["tag"]]; w, d, h = p["dims"]
        if rot.get(p["tag"]): w, d = max(w, d), min(w, d)
        xs += [c[0]-w/2, c[0]+w/2]; ys += [c[1]-d/2, c[1]+d/2]; zs += [c[2]-h/2, c[2]+h/2]
    bbox = (max(xs)-min(xs), max(ys)-min(ys), max(zs)-min(zs)) if xs else (0, 0, 0)
    return pos, rot, frame, layers, bbox


def pack_interior(parts, iw_mm, idep_mm, ih_mm, base_z_mm, gap_mm=3.0, wall_mm=6.0,
                  hosting=True):
    """Hosting-aware pack: CHASSIS parts (vessel/pump/stirrer/fan/Peltier/vial/tubing +
    footprint>1500mm²) + a PCB base plane sit on the FLOOR; small ON-BOARD electronics
    mount ON the PCB surface (matches reality + frees the floor). Returns {tag:(cx,cy,cz)}
    enclosure-centred. Deterministic (sorted). Universal (function/footprint signal).

    `hosting=False` (2026-07-24): pack EVERY non-fastener part single-layer on the floor —
    no PCB-mounting. Guarantees 0 pairwise clash (one z-plane, pure 2D shelf pack), at the
    cost of the small electronics taking floor area rather than riding the board. Use when
    3D-clash-free is the hard requirement (Tristan: 'are parts not clashing on a 3D basis?')."""
    fw = iw_mm - 2 * wall_mm
    fd = idep_mm - 2 * wall_mm
    floor_z = base_z_mm + wall_mm
    fasteners = [p for p in parts if _is_fastener(p["name"])]
    rest = [p for p in parts if not _is_fastener(p["name"])]
    if not hosting:
        onboard = []
        chassis = rest[:]          # everything on the floor → one plane → 0 clash by construction
    else:
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


def _is_board(name: str) -> bool:
    """A flat circuit board that can stand VERTICALLY against a wall (Tristan 2026-07-24:
    'no reason PCBs + other components can't be vertically aligned')."""
    return bool(re.search(r"\bpcb\b|\bboard\b|motherboard|backplane|daughterboard|"
                          r"\bmcu\b|microcontroller|regulation board|controller card", name, re.I))


def pack_interior_3d(parts, iw_mm, idep_mm, ih_mm, base_z_mm, gap_mm=4.0, wall_mm=0.0):
    """MULTI-PLANE pack (2026-07-24): flat circuit BOARDS stand VERTICALLY against the back
    wall (reads like a real instrument + frees the floor); mechanical/chassis + the rest pack
    single-layer on the floor in the FRONT region; the two planes never overlap (the floor pack
    is depth-reduced + shifted forward to clear the thin back strip the boards occupy). Returns a
    pos dict carrying `__rot__`, `__orient__` (flat|vertical_back), and `__world_dims__` (the
    world AABB per part) so the clash oracle + the mesh builder agree on every oriented part.
    Deterministic; 3D-clash-free by construction (verify with count_clashes)."""
    floor_z = base_z_mm + wall_mm
    fw = iw_mm - 2 * wall_mm
    fd = idep_mm - 2 * wall_mm
    fasteners = [p for p in parts if _is_fastener(p["name"])]
    rest = [p for p in parts if not _is_fastener(p["name"])]
    boards = [p for p in rest if _is_board(p["name"])]
    floor = [p for p in rest if p not in boards]
    pos = {}; world = {}; orient = {}; rot = {}

    # 1. VERTICAL boards along the back wall. A board (w×d×h, h thin) stands so its w×d face is
    #    vertical → world extents (w, h, d): w along x, thin h into the room (y), d up (z).
    strip_y = 0.0
    x = -fw / 2 + gap_mm
    for p in list(boards):
        w, d, h = p["dims"]
        vh = min(d, ih_mm - gap_mm)                 # the board's deep dim becomes vertical height
        vy = max(2.0, min(h, w, d))                 # thinnest dim = thickness into the room
        if x + w > fw / 2 - gap_mm:                 # no lateral room for another board → floor it
            floor.append(p)
            continue
        cx = x + w / 2
        cy = fd / 2 - vy / 2 - gap_mm               # flush against the back wall
        cz = floor_z + vh / 2
        pos[p["tag"]] = (round(cx, 2), round(cy, 2), round(cz, 2))
        world[p["tag"]] = (round(w, 1), round(vy, 1), round(vh, 1))
        orient[p["tag"]] = "vertical_back"
        x += w + gap_mm
        strip_y = max(strip_y, vy)

    # 2. FLOOR parts in the front region (depth reduced + shifted forward to clear the back strip)
    front_fd = fd - strip_y - gap_mm if strip_y else fd
    fpos, _ztop, _ = _shelf_pack(floor, fw, front_fd, floor_z, gap_mm)
    frot = fpos.pop("__rot__", {})
    y_shift = -(strip_y + gap_mm) / 2.0 if strip_y else 0.0
    for p in floor:
        if p["tag"] in fpos:
            cx, cy, cz = fpos[p["tag"]]
            pos[p["tag"]] = (cx, round(cy + y_shift, 2), cz)
            rot[p["tag"]] = frot.get(p["tag"], False)
            orient[p["tag"]] = "flat"

    # 3. fasteners near the front-left corner
    fx = -fw / 2 + gap_mm
    for p in fasteners:
        w, d, h = p["dims"]
        pos[p["tag"]] = (round(fx + w / 2, 2), round(-fd / 2 + d, 2), round(floor_z + h / 2, 2))
        fx += w + gap_mm

    pos["__rot__"] = rot
    pos["__orient__"] = orient
    pos["__world_dims__"] = world
    return pos


# ── clash oracle (the convergence check) ─────────────────────────────────────
def _aabb(cx, cy, cz, w, d, h):
    return (cx - w / 2, cx + w / 2, cy - d / 2, cy + d / 2, cz - h / 2, cz + h / 2)


def count_clashes(parts, pos, iw_mm, idep_mm, ih_mm, base_z_mm, wall_mm=6.0):
    """Returns (n_clash, n_out_of_bounds, worst_examples)."""
    import itertools
    def fast(n): return _is_fastener(n)
    rot = pos.get("__rot__", {})
    wdims = pos.get("__world_dims__", {})   # explicit world AABB (mm) for oriented parts
    boxes = {}
    for p in parts:
        c = pos[p["tag"]]
        wd = wdims.get(p["tag"])
        if wd:                              # a placed WORLD extent (vertical boards etc.) — use it verbatim
            w, d, h = wd
        else:
            w, d, h = p["dims"]
            if rot.get(p["tag"]):           # packer swapped w/d to run the long side along x
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


def _selftest():
    """proveCatch: the stacked pack places EVERY part with 0 pairwise clash + a mounting frame."""
    demo = [
        {"tag": "A", "name": "Magnetic Stirrer Drive", "dims": (120, 100, 60)},
        {"tag": "B", "name": "Heatsink Fan", "dims": (95, 92, 114)},
        {"tag": "C", "name": "Culture Vessel", "dims": (38, 100, 19)},
        {"tag": "D", "name": "Peltier Tec Module", "dims": (40, 40, 20)},
        {"tag": "E", "name": "Power Indicator LED", "dims": (8, 8, 5)},
        {"tag": "F", "name": "Esd Protection Network", "dims": (9, 5, 3)},
        {"tag": "G", "name": "Microcontroller Mcu", "dims": (18, 18, 4)},
        {"tag": "H", "name": "Pcb Mounting Standoff", "dims": (8, 8, 12)},
    ]
    pos, rot, frame, layers, bbox = pack_interior_stacked(demo, 0.0)
    placed = [p for p in demo if p["tag"] in pos]
    assert len(placed) == len(demo), f"pack dropped parts: {len(placed)}/{len(demo)}"
    nclash, _, worst = count_clashes(demo, pos, 10000, 10000, 10000, 0.0)
    assert nclash == 0, f"pack produced {nclash} clash(es): {worst}"
    assert any(f["role"] == "plate" for f in frame), "no base plate in the mounting frame"
    assert any(f["role"] == "standoff" for f in frame), "no standoffs in the mounting frame"
    assert len(layers) >= 2, "expected the demo to stack into >=2 layers"
    # proveCatch: the OLD co-located layout (all at origin) MUST be caught as clashing
    bad = {p["tag"]: (0, 0, 10) for p in demo}
    bad["__rot__"] = {}
    nbad, _, _ = count_clashes(demo, bad, 10000, 10000, 10000, 0.0)
    assert nbad > 0, "clash oracle failed to catch a fully co-located layout"
    # MULTI-PLANE proveCatch: boards stand VERTICAL on the back wall, 0 clash, world-dims oriented
    demo3d = demo + [
        {"tag": "P", "name": "Controller PCB", "dims": (90, 70, 2)},
        {"tag": "Q", "name": "Power Regulation Board", "dims": (60, 45, 2)},
    ]
    p3 = pack_interior_3d(demo3d, 320, 460, 130, 0.0)
    o3 = p3["__orient__"]
    assert o3.get("P") == "vertical_back" and o3.get("Q") == "vertical_back", \
        f"boards must stand vertical: {[(t, o3.get(t)) for t in ('P', 'Q')]}"
    wd = p3["__world_dims__"]
    # a vertical board's world AABB is (w, thin, d) — thin (2mm) is the y-extent, d(70) is the height
    assert wd["P"][1] <= 3 and abs(wd["P"][2] - 70) < 1, f"vertical world dims wrong: {wd['P']}"
    n3, oob3, w3 = count_clashes(demo3d, p3, 320, 460, 130, 0.0, wall_mm=0.0)
    assert n3 == 0 and oob3 == 0, f"3D multi-plane pack must be clash-free: clash={n3} oob={oob3} {w3}"
    print(f"interior_pack _selftest: OK (stacked {len(placed)} parts, {len(layers)} layers, 0 clash, "
          f"frame=base-plate+standoffs; oracle catches co-location)")


if __name__ == "__main__":
    import sys, json
    if len(sys.argv) > 1 and sys.argv[1] in ("--selftest", "selftest"):
        _selftest(); sys.exit(0)
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
