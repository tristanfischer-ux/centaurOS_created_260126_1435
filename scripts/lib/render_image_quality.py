#!/usr/bin/env python3
"""Deterministic blank/occupancy checks for Excel-bound Blender images."""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageFilter


@dataclass(frozen=True)
class ImageQualityResult:
    passed: bool
    edge_density: float
    width_occupancy: float
    height_occupancy: float
    reasons: tuple[str, ...]
    # WASH-OUT SIGHT (2026-07-23): per-render luminance mean + population contrast-std.
    # A product/hero render that is too BRIGHT and too FLAT (a washed-out ghost-material
    # leak, mean 156/std 43) reads as a defect a human instantly rejects, yet the
    # edge/occupancy floors PASS it (a pale full-frame box has plenty of edges + fills
    # the frame). Defaulted 0.0 for back-compat with old callers.
    lum_mean: float = 0.0
    lum_std: float = 0.0


def _below_floor(value: float, floor: float, *, ndigits: int) -> bool:
    """A value that DISPLAYS as meeting the floor must not fail on float dust
    (NinjaPCR 2302 / OpenFlexure 2026-07-18 rounding-dust class). Shared idiom."""
    return round(value, ndigits) < round(floor, ndigits)


def washed_out(lum_mean: float, lum_std: float,
               mean_ceiling: float = 152.0, std_floor: float = 48.0) -> bool:
    """A product render is WASHED-OUT / low-contrast when it is BOTH too bright
    (lum_mean >= mean_ceiling) AND too flat (lum_std <= std_floor). The AND is
    load-bearing: the legitimately-lighter translucent see-inside render (08,
    149.8/50.5) passes on its std (50.5 > 48) even though its mean 149.8 is over
    the ceiling; the good hero (147.1/50.3) passes on its mean (147.1 < 152). Bad
    heroes sit at mean 156 / std 43 (over on mean, under on std) → both conditions
    hold → washed-out. std <= floor uses the rounding-dust-safe _below_floor idiom
    (round(v,2) <= round(floor,2) ⟺ not _below_floor(v,floor) is False).

    CALIBRATION, MEASURED 2026-07-27 — do not loosen these numbers without repeating it.
    A 13-archetype sweep showed this rule failing 17 of ~20 product renders, which looks
    like a gate asserting the renderer's entire output is defective rather than one
    discriminating good from bad (the >80-90%-of-population smell test). It is not. Over
    the FULL population of 1,195 product renders in out/:

        flagged washed-out : 168  (14.1%)
        mean luminance     : min 40 - median 134 - max 240   (trigger >= 152)
        std  luminance     : min 14 - median 73  - max 103   (trigger <= 48)
        mean >= 152 : 380/1195 (32%)   std <= 48 : 233/1195 (19%)

    The median render sits comfortably inside both thresholds; the AND keeps the flag
    rate at one in seven. The sweep is a BIASED SAMPLE - those 13 archetypes genuinely
    have pale renders. So a wash-out failure means FIX THE LIGHTING/EXPOSURE for that
    product, never move the threshold. (Measured with PIL ImageStat, verified identical
    to the tobytes() maths to 1e-6 on mean and 1e-3 on std.)
    """

    if lum_mean < mean_ceiling:
        return False
    # std <= floor  (i.e. NOT std > floor). Rounding-dust-safe: a std that displays
    # as the floor is treated as AT the floor (fails), matching the 2dp message.
    return not (round(lum_std, 2) > round(std_floor, 2))


def clay_signature(lum_mean: float, lum_std: float, size) -> bool:
    """A CLAY / DIAGNOSTIC-PROXY render (inspect-*.png grey placeholder cylinders +
    a floating equipment tag, mean 222/std 24, rendered at the inspect 1600x1100 not
    the product 3600x2400): flat + very bright OR a non-product resolution. The
    resolution branch is keyed to the PRODUCT-RENDER role by the caller (never applied
    to a legitimately low-res line-drawing/module). All real product renders are
    3600x2400, so max(size) < 2000 is a clean clay tell."""
    try:
        _maxdim = max(size) if size else 0
    except TypeError:
        _maxdim = 0
    return (_maxdim < 2000) or (lum_mean > 210 and lum_std < 30)


def evaluate_image(
    path: str | Path,
    min_edge_density: float = 0.002,
    min_width_occupancy: float = 0.35,
    min_height_occupancy: float = 0.45,
    enclosure_volume_m3: float | None = None,
    product_bbox_mm: tuple[float, float] | None = None,
    product_render: bool = True,
) -> ImageQualityResult:
    """Reject blank, tiny or edge-only renders before workbook embedding.

    A COMPACT benchtop/handheld product legitimately has a smooth, low-edge surface (a matte
    polymer box) — a service view of it can sit below the plant-tuned 0.002 edge-density floor
    while still FILLING the frame (high occupancy). The occupancy floors are what actually catch
    a blank/tiny render, so scale ONLY the edge-density floor down by device size. Keyed on the
    enclosure volume, never a product noun. (benchtop_bioreactor service view 0.0016 SIGHT, 2026-07-19)

    ASPECT-AWARE OCCUPANCY (organoid bioreactor 2026-07-22): a wide/landscape product (e.g.
    W=221 mm, H=96 mm) rendered correctly fills the frame on its dominant (width) axis —
    width_occupancy=0.96, height_occupancy=0.41. A HEIGHT-only floor of 0.45 false-fails it.
    Fix: when product_bbox_mm (width_mm, height_mm) shows the product is landscape (width ≥
    height × 1.25), measure the occupancy floor against the DOMINANT dimension
    (max(width_occ, height_occ)) rather than height alone. A genuinely tiny render still fails
    because BOTH dimensions would be low. product_bbox_mm = (bbox_width_mm, bbox_height_mm)
    from parts-manifest bbox_mm (length_mm is x-span, height_mm is z-span).
    """
    if enclosure_volume_m3 is not None and enclosure_volume_m3 > 0:
        if enclosure_volume_m3 < 0.02:        # handheld (< 20 L)
            min_edge_density = min(min_edge_density, 0.0010)
        elif enclosure_volume_m3 < 0.2:       # benchtop instrument (< 200 L)
            min_edge_density = min(min_edge_density, 0.0013)

    # Determine if the product is landscape (dominant dimension is width).
    # Threshold 1.25: only clearly wider-than-tall products switch to dominant-axis check.
    _is_landscape = False
    if product_bbox_mm is not None:
        _bbox_w, _bbox_h = product_bbox_mm
        if _bbox_w > 0 and _bbox_h > 0 and _bbox_w >= _bbox_h * 1.25:
            _is_landscape = True

    image = Image.open(path).convert("L")
    width, height = image.size
    # WASH-OUT SIGHT: luminance mean + POPULATION std over the single grayscale load
    # (getdata() is deprecated → tobytes()). Cheap, deterministic, no second decode.
    _lum_bytes = image.tobytes()
    _n = len(_lum_bytes)
    if _n:
        _lum_mean = sum(_lum_bytes) / _n
        _lum_std = (sum((v - _lum_mean) ** 2 for v in _lum_bytes) / _n) ** 0.5
    else:
        _lum_mean = 0.0
        _lum_std = 0.0
    edges = image.filter(ImageFilter.FIND_EDGES)
    pixels = edges.load()
    margin_x = max(2, int(width * 0.02))
    margin_y = max(2, int(height * 0.02))
    points = []
    for y in range(margin_y, height - margin_y):
        for x in range(margin_x, width - margin_x):
            if pixels[x, y] >= 20:
                points.append((x, y))

    area = max(1, width * height)
    edge_density = len(points) / area
    if points:
        xs = [point[0] for point in points]
        ys = [point[1] for point in points]
        width_occupancy = (max(xs) - min(xs) + 1) / width
        height_occupancy = (max(ys) - min(ys) + 1) / height
    else:
        width_occupancy = 0.0
        height_occupancy = 0.0

    # INTENT (NinjaPCR 2302): height_occupancy 0.445 printed as "0.45 below 0.45"
    # because the message rounded to 2dp while the compare used raw floats.
    # DECISION: gate on the same rounding the message shows — a value that
    # displays as meeting the floor must pass (float dust must not fail a ship).
    # GOTCHA (OpenFlexure 2026-07-18): edge density 0.00196 printed as
    # "0.0020 below 0.0020" with a raw `<` compare — same dust class at 4dp.
    def _below_floor(value: float, floor: float, *, ndigits: int) -> bool:
        return round(value, ndigits) < round(floor, ndigits)

    reasons = []
    if _below_floor(edge_density, min_edge_density, ndigits=4):
        reasons.append(
            f"edge density {edge_density:.4f} below {min_edge_density:.4f}")
    if _below_floor(width_occupancy, min_width_occupancy, ndigits=2):
        reasons.append(
            f"width occupancy {width_occupancy:.2f} below {min_width_occupancy:.2f}")
    if _is_landscape:
        # Landscape product: a correctly-framed wide render fills the dominant (width) axis.
        # Gate on max(width_occ, height_occ) so a well-framed wide product passes while a
        # genuinely tiny render (both dims low) still fails.
        dominant_occupancy = max(width_occupancy, height_occupancy)
        if _below_floor(dominant_occupancy, min_height_occupancy, ndigits=2):
            reasons.append(
                f"dominant occupancy {dominant_occupancy:.2f} below {min_height_occupancy:.2f} "
                f"(landscape product {product_bbox_mm[0]:.0f}×{product_bbox_mm[1]:.0f} mm, "
                f"width_occ={width_occupancy:.2f} height_occ={height_occupancy:.2f})")
    else:
        if _below_floor(height_occupancy, min_height_occupancy, ndigits=2):
            reasons.append(
                f"height occupancy {height_occupancy:.2f} below {min_height_occupancy:.2f}")
    # WASH-OUT / LOW-CONTRAST (2026-07-23): only fires for a PRODUCT/hero/exterior/ghost
    # render — a line drawing / module diagram is legitimately bright + flat and is exempt
    # (caller passes product_render=False). The AND rule (mean>=ceil AND std<=floor) is what
    # saves the translucent see-inside 08 (std 50.5 > 48) and the good hero (mean 147 < 152).
    if product_render and washed_out(_lum_mean, _lum_std):
        reasons.append(
            f"washed-out/low-contrast (mean {_lum_mean:.0f} >= 152, std {_lum_std:.0f} <= 48)")
    return ImageQualityResult(
        passed=not reasons,
        edge_density=edge_density,
        width_occupancy=width_occupancy,
        height_occupancy=height_occupancy,
        reasons=tuple(reasons),
        lum_mean=_lum_mean,
        lum_std=_lum_std,
    )


# Real fixtures re-measured 2026-07-23 (PIL convert('L'), population std). Used as
# proveCatch drivers when present on disk; the pure numeric asserts run unconditionally.
_REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_BAD_HEROES = (  # (relpath, mean, std, size) — wash-out gate MUST FIRE
    ("out/ghost/00-hero.png", 156.1, 43.2, (3600, 2400)),
    ("out/organoid-bioreactor-20260723-0442/00-hero.png", 156.0, 43.2, (3600, 2400)),
)
_CLAY = ("out/organoid-for-simon/inspect-top.png", 222.7, 23.8, (1600, 1100))  # clay proxy
_GOOD = (  # (relpath, mean, std) — wash-out gate MUST NOT FIRE
    ("out/organoid-for-simon/04-product-exterior.png", 102.5, 62.1),
    ("out/organoid-for-simon/05-product-left.png", 95.7, 59.2),
    ("out/organoid-for-simon/06-product-right.png", 102.2, 60.4),
    ("out/organoid-for-simon/07-product-service.png", 138.2, 60.1),
    ("out/organoid-for-simon/08-product-ghost-shell.png", 149.8, 50.5),  # translucent see-inside
    ("out/organoid-for-simon/00-hero.png", 147.1, 50.3),                  # good hero
)


def _selftest() -> int:
    """proveCatch (GATE INTENT RULE) for the wash-out + clay gates — the guard is not real
    until it FIRES on the actual bad artefacts and does NOT false-fire on the crisp goods.
    Pure numeric asserts always run; the REAL on-disk fixtures drive the same via evaluate_image
    when present."""
    fails: list[str] = []

    # ── PURE: wash-out AND-rule (bad heroes fire; goods + translucent 08 pass) ──
    if not (washed_out(156.1, 43.2) and washed_out(156.0, 43.2) and washed_out(222.7, 23.8)):
        fails.append("washed_out MUST fire on the pale heroes (156/43) and clay (222/24)")
    if washed_out(149.8, 50.5) or washed_out(147.1, 50.3) or washed_out(102.5, 62.1):
        fails.append("washed_out MUST NOT fire on 08 (149.8/50.5), good hero (147.1/50.3), "
                     "or crisp exterior (102.5/62.1)")
    # boundary: mean exactly at ceiling + std exactly at floor → washed-out (<= / >=)
    if not washed_out(152.0, 48.0):
        fails.append("washed_out boundary mean=152 std=48 must fire (>=/<= inclusive)")
    if washed_out(151.9, 48.0) or washed_out(152.0, 48.1):
        fails.append("washed_out just-inside boundary must NOT fire")

    # ── PURE: clay signature (clay fires; good crisp does not) ──
    if not clay_signature(222.7, 23.8, (1600, 1100)):
        fails.append("clay_signature MUST fire on the inspect clay (222/24, 1600x1100)")
    if clay_signature(149.8, 50.5, (3600, 2400)):
        fails.append("clay_signature MUST NOT fire on translucent 08 (149.8/50.5, 3600x2400)")

    # ── REAL FIXTURES: evaluate_image over the on-disk goods/bads (product_render=True) ──
    for rel, m, s, size in _BAD_HEROES + (_CLAY,):
        p = os.path.join(_REPO, rel)
        if not os.path.exists(p):
            continue
        r = evaluate_image(p, product_render=True)
        _wash = washed_out(r.lum_mean, r.lum_std)
        _clay = clay_signature(r.lum_mean, r.lum_std, size)
        if not (_wash or _clay):
            fails.append(f"REAL bad {rel}: measured {r.lum_mean:.1f}/{r.lum_std:.1f} — "
                         f"neither wash-out nor clay fired (expected ~{m}/{s})")
    for rel, m, s in _GOOD:
        p = os.path.join(_REPO, rel)
        if not os.path.exists(p):
            continue
        r = evaluate_image(p, product_render=True)
        if washed_out(r.lum_mean, r.lum_std):
            fails.append(f"REAL good {rel}: measured {r.lum_mean:.1f}/{r.lum_std:.1f} — "
                         f"washed_out FALSE-FIRED (expected ~{m}/{s})")

    if fails:
        print("render_image_quality _selftest: FAIL")
        for f in fails:
            print("  " + f)
        return 1
    print("render_image_quality _selftest passed (wash-out + clay proveCatch, "
          "pure + real fixtures where present)")
    return 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        raise SystemExit(_selftest())
    for _a in sys.argv[1:]:
        if _a.startswith("--"):
            continue
        _res = evaluate_image(_a)
        print(_a, "→ passed" if _res.passed else "→ FAIL",
              f"mean={_res.lum_mean:.1f} std={_res.lum_std:.1f}", _res.reasons)
