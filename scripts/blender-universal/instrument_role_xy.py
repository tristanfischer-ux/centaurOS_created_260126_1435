"""Instrument plan (cx, cy) slots shared by Blender proxies, parts-manifest, and GA.

INTENT (colorimeter 2026-07-14): the hero uses stylized optical-bench story meshes
while the GA reads hidden BoM proxies. A centreline hash grid piled every tag at
(0,0) — FRONT/PLAN became a single square while Renders showed a real product.
Slot by the SAME nouns as `_instrument_form_rule_mm` (optical cube RIGHT, UI LEFT,
source front / cuvette mid / detector back) so drawings cannot disagree with the
product shot. Universal — keyed on part-name vocabulary, never a class table.
"""
from __future__ import annotations

import re
from typing import Iterable, Mapping, MutableMapping, Optional, Sequence, Tuple


def instrument_role_xy_mm(
    name: str,
    zone_key: str,
    index: int,
    n: int,
    iw_mm: float,
    idep_mm: float,
    W: float = 0.0,
    D: float = 0.0,
) -> Tuple[float, float]:
    """Return plan (cx, cy) in mm for an instrument BoM / proxy part.

    @description Form-rule-aligned lateral slot for sealed optical/electronic devices.
    @param name Human part name (BoM word).
    @param zone_key Soft zone hint (optical / electronics / …) — used only as fallback.
    @param index 0-based index within the same role band.
    @param n Count of parts in that band (spreads multi-part bands).
    @param iw_mm Interior width (mm).
    @param idep_mm Interior depth (mm).
    @param W Full envelope width when known (preferred for form-rule fractions).
    @param D Full envelope depth when known.
    @returns (cx, cy) in millimetres, product centre at origin.
    """
    nm = (name or "").lower()
    env_w = W if W > 1.0 else iw_mm
    env_d = D if D > 1.0 else idep_mm
    # Optical cube locus (RIGHT) — mirrors form-rule tower_loc ≈ (W·0.30, D·0.08)
    ox = env_w * 0.30
    oy = env_d * 0.08
    # UI deck (LEFT) — mirrors form-rule display_loc ≈ (−W·0.18, −D·0.04)
    ux = -env_w * 0.18
    uy = -env_d * 0.04

    if re.search(r"enclosure|housing|shell|lid|shroud|chassis|\bcase\b|\bcover\b", nm):
        return (0.0, 0.0)

    if re.search(r"\bled\b|emitter|light\s*source|source\s*module|collimat", nm):
        return (ox, oy - env_d * 0.22)
    if re.search(r"cuvette|sample\s*cell|sample\s*holder|\bwell\b", nm):
        return (ox, oy)
    if re.search(r"detector|photodiode|photo[\s_-]?sensor", nm) and not re.search(
        r"cable|wire|harness", nm
    ):
        return (ox, oy + env_d * 0.22)
    if re.search(r"wavelength|filter|baffle|optic|monochrom|grating|lens", nm):
        side = -1.0 if (index % 2 == 0) else 1.0
        return (ox + side * iw_mm * 0.05, oy + ((index % 3) - 1) * idep_mm * 0.08)

    if re.search(r"display|screen|lcd|oled|hmi|bezel", nm):
        return (ux, uy)
    if re.search(r"switch|button|keypad|dial|knob|control", nm):
        return (ux - iw_mm * 0.10, uy + ((index % 3) - 1) * idep_mm * 0.10)

    if re.search(
        r"\bpcb\b|board|mcu|microcontroller|processor|driver|regulator|dc[\s_-]?dc",
        nm,
    ):
        return (ux, uy + idep_mm * 0.08 + (index % 2) * idep_mm * 0.06)
    if re.search(r"battery|cell\b|pack\b", nm):
        return (ux - iw_mm * 0.08, uy + idep_mm * 0.15)
    if re.search(
        r"fuse|esd|protection|polyfuse|thermal\s*cutoff|ferrite|emc|\bbead\b", nm
    ):
        return (ux + iw_mm * 0.10, -idep_mm * 0.18 + (index % 3) * idep_mm * 0.08)
    if re.search(r"cable|wire|harness|interconnect", nm):
        return (ox - iw_mm * 0.22, oy - idep_mm * 0.12)

    if zone_key == "optical":
        t = (index / max(1, n - 1)) - 0.5 if n > 1 else 0.0
        return (ox + t * iw_mm * 0.20, oy)
    if n <= 1:
        hsh = sum(ord(c) for c in nm) % 7
        return ((hsh - 3) * iw_mm * 0.07, uy + idep_mm * 0.05)
    cols = max(1, min(n, 3))
    r_i, c_i = divmod(index, cols)
    slot_w = iw_mm / float(cols)
    cx = -iw_mm / 2.0 + slot_w / 2.0 + c_i * slot_w
    cy = uy + (r_i - 0.5) * idep_mm * 0.10
    return (cx, cy)


def count_unique_plan_xy(
    positions: Iterable[Tuple[float, float]],
    tol_mm: float = 5.0,
) -> int:
    """Count distinct plan cells at ``tol_mm`` resolution."""
    cells = {
        (round(float(x) / tol_mm), round(float(y) / tol_mm))
        for x, y in positions
    }
    return len(cells)


def spread_instrument_manifest_rows(
    parts: Sequence[MutableMapping],
    envelope_w_mm: float,
    envelope_d_mm: float,
    min_unique: int = 3,
    tol_mm: float = 5.0,
) -> int:
    """Rewrite piled instrument ``pos_mm`` using role-XY when plan collapse is detected.

    INTENT: existing runs (written before role-XY) can redraw a meaningful GA
    without a full Blender re-render. Only mutates when unique XY < ``min_unique``.

    @returns Number of rows whose (x, y) were rewritten.
    """
    if not parts or envelope_w_mm < 1.0 or envelope_d_mm < 1.0:
        return 0

    def _xy(p: Mapping):
        pos = p.get("pos_mm")
        if isinstance(pos, (list, tuple)) and len(pos) >= 2:
            return (float(pos[0]), float(pos[1]))
        return None

    non_skin = []
    for p in parts:
        if not isinstance(p, MutableMapping):
            continue
        nm = str(p.get("name") or p.get("tag") or "")
        if re.search(r"enclosure|housing|shell|lid|shroud|chassis|\bcase\b|\bcover\b", nm, re.I):
            continue
        non_skin.append(p)

    xy_now = [_xy(p) for p in non_skin if _xy(p) is not None]
    if len(xy_now) < min_unique:
        return 0
    if count_unique_plan_xy(xy_now, tol_mm=tol_mm) >= min_unique:
        return 0

    margin = max(8.0, min(envelope_w_mm, envelope_d_mm) * 0.05)
    iw = max(20.0, envelope_w_mm - 2.0 * margin)
    idep = max(16.0, envelope_d_mm - 2.0 * margin)

    def _band(p: Mapping) -> str:
        nm = str(p.get("name") or p.get("tag") or "").lower()
        if re.search(r"led|cuvette|detector|optic|wavelength|filter|baffle|collimat", nm):
            return "optical"
        if re.search(r"display|switch|button|control|hmi", nm):
            return "interface"
        if re.search(r"battery|fuse|regulator|driver|ferrite|emc|pcb|board", nm):
            return "power"
        return "electronics"

    bands = {}
    for p in non_skin:
        bands.setdefault(_band(p), []).append(p)

    rewritten = 0
    for key, group in bands.items():
        n = len(group)
        for idx, p in enumerate(group):
            cx, cy = instrument_role_xy_mm(
                str(p.get("name") or p.get("tag") or ""),
                key, idx, n, iw, idep, envelope_w_mm, envelope_d_mm,
            )
            pos = p.get("pos_mm")
            if isinstance(pos, list) and len(pos) >= 3:
                z = float(pos[2])
                new_pos = [round(cx, 1), round(cy, 1), round(z, 1)]
                if new_pos[0] != pos[0] or new_pos[1] != pos[1]:
                    p["pos_mm"] = new_pos
                    rewritten += 1
            elif isinstance(pos, tuple) and len(pos) >= 3:
                z = float(pos[2])
                p["pos_mm"] = [round(cx, 1), round(cy, 1), round(z, 1)]
                rewritten += 1
    return rewritten


def _selftest() -> None:
    iw, idep, W, D = 150.0, 110.0, 183.0, 145.0
    led = instrument_role_xy_mm("LED Source", "optical", 0, 1, iw, idep, W, D)
    cuv = instrument_role_xy_mm("Cuvette Holder", "optical", 0, 1, iw, idep, W, D)
    det = instrument_role_xy_mm("Optical Detector Module", "optical", 0, 1, iw, idep, W, D)
    disp = instrument_role_xy_mm("Local Display", "interface", 0, 1, iw, idep, W, D)
    assert led[1] < cuv[1] < det[1], f"optic axis must run -Y->+Y, got {led} {cuv} {det}"
    assert disp[0] < 0 < cuv[0], f"UI left / optical right, got disp={disp} cuv={cuv}"
    xs = {round(p[0], 1) for p in (led, cuv, det, disp)}
    ys = {round(p[1], 1) for p in (led, cuv, det, disp)}
    assert len(xs) >= 2 and len(ys) >= 3, f"must spread plan, got xs={xs} ys={ys}"

    rows = [
        {"name": "LED Source", "pos_mm": [0.0, 0.0, 97.0]},
        {"name": "Cuvette Holder", "pos_mm": [0.0, 0.0, 97.0]},
        {"name": "Optical Detector Module", "pos_mm": [0.0, 0.0, 97.0]},
        {"name": "Local Display", "pos_mm": [0.0, 0.0, 97.0]},
        {"name": "DC DC Regulator", "pos_mm": [0.0, 0.0, 97.0]},
    ]
    n = spread_instrument_manifest_rows(rows, W, D, min_unique=3)
    assert n >= 3, f"expected collapse rewrite, got n={n} rows={rows}"
    uniq = count_unique_plan_xy((r["pos_mm"][0], r["pos_mm"][1]) for r in rows)
    assert uniq >= 3, f"post-spread unique XY={uniq}, rows={rows}"
    print("[instrument_role_xy] _selftest OK")


if __name__ == "__main__":
    _selftest()
