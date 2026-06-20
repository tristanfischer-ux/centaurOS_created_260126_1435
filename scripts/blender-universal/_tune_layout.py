"""Fast EQUIPMENT-ONLY layout tuning harness (no Blender). Mirrors the build_universal_scene
integration: exclude the building envelope, take equipment dims from the parts-manifest, edges
from the connection-ledger, and report CURRENT (bank-stack manifest positions) vs OPTIMISED
weighted-run + EQUIPMENT footprint. Lets COMPACT_W / area-term be tuned in seconds instead of a
2-minute render. Usage: python3 _tune_layout.py <run_dir> [COMPACT_W ...]"""
import json
import os
import re
import sys

import layout_optimiser as lo

# the building-shell test from build_universal_scene._layout_is_envelope (footprint-keyed)
def _is_envelope(w, d, shape):
    if shape in ("tall_column", "tall_vessel", "vertical_vessel", "tank", "stack",
                 "horizontal_vessel", "inline_spool"):
        return False
    return (w * d >= 200e6) or (max(w, d) >= 25000 and min(w, d) >= 6000)


def _wd(p):
    dm = p.get("dims_mm") or {}
    if "dia" in dm:
        return float(dm["dia"]), float(dm["dia"])
    return float(dm.get("w") or 1500), float(dm.get("d") or 1500)


def _load(run_dir):
    pm = json.load(open(os.path.join(run_dir, "parts-manifest.json")))
    led = json.load(open(os.path.join(run_dir, "connection-ledger.json")))
    parts = pm.get("parts") if isinstance(pm, dict) else pm
    edges = led.get("rows") or []
    # equipment only; CLAMP any absurd dim (the pre-fix 32 m phantom blower) so it can't
    # pollute tuning — the post-fix render won't carry it.
    equip = []
    for p in parts:
        if not p.get("name") or not isinstance(p.get("pos_mm"), list):
            continue
        w, d = _wd(p)
        if _is_envelope(w, d, p.get("shape")):
            continue
        w, d = min(w, 15000.0), min(d, 15000.0)
        equip.append({"name": p["name"], "dims_mm": [w, d],
                      "pos_mm": p["pos_mm"]})
    return equip, edges


def _footprint(pos, fp):
    if not pos:
        return 0.0
    xs0 = [x - fp[n][0] / 2 for n, (x, y) in pos.items()]
    xs1 = [x + fp[n][0] / 2 for n, (x, y) in pos.items()]
    ys0 = [y - fp[n][1] / 2 for n, (x, y) in pos.items()]
    ys1 = [y + fp[n][1] / 2 for n, (x, y) in pos.items()]
    return (max(xs1) - min(xs0)) / 1000.0 * (max(ys1) - min(ys0)) / 1000.0


def run(run_dir, compact_w=None):
    equip, edges = _load(run_dir)
    nameset = {e["name"] for e in equip}

    def _resolve(s):
        s = str(s or "")
        if s in nameset:
            return s
        st = set(re.split(r"[^a-z0-9]+", s.lower()))
        best, bov = None, 0
        for nm in nameset:
            ov = len(st & set(re.split(r"[^a-z0-9]+", nm.lower())))
            if ov > bov:
                best, bov = nm, ov
        return best if bov >= 1 else s

    fp = {e["name"]: lo._footprint_mm(e) for e in equip}
    cur_pos = {e["name"]: (e["pos_mm"][0], e["pos_mm"][1]) for e in equip}
    cur_len = lo.total_weighted_length(cur_pos, edges, _resolve)
    cur_area = _footprint(cur_pos, fp)

    if compact_w is not None:
        lo.COMPACT_W = compact_w
    opt, ofp = lo.optimise(equip, edges, name_resolve=_resolve, log=lambda *a: None)
    new_len = lo.total_weighted_length(opt, edges, _resolve)
    new_area = _footprint(opt, ofp)

    dl = (1 - new_len / cur_len) * 100 if cur_len else 0
    da = (1 - new_area / cur_area) * 100 if cur_area else 0
    tag = f"COMPACT_W={compact_w}" if compact_w is not None else f"COMPACT_W={lo.COMPACT_W}"
    print(f"  {tag:<16} run {cur_len/1e6:6.2f}M→{new_len/1e6:6.2f}M ({dl:+4.0f}%)   "
          f"equip-footprint {cur_area:6.0f}→{new_area:6.0f} m² ({da:+4.0f}%)")
    return dl, da


if __name__ == "__main__":
    rd = sys.argv[1]
    ws = [float(x) for x in sys.argv[2:]] or [None]
    print(f"[tune] {rd}")
    for w in ws:
        run(rd, w)
