#!/usr/bin/env python3
"""form_render_glance.py — Layer-3 deterministic form twinship (PNG → pass/fail).

INTENT (2026-07-16 Tristan): mesh checklists can PASS while the hero still looks
like sealed crates / a fascia bar / no braid. That failure was rediscovered by
LLM SIGHT loops on Poseidon. This module encodes the glance as CODE so the next
syringe_pump / thermocycler / optical product inherits it without re-tuition.

DECISION: synthetic adversarial PNGs in --selftest proveCatch the catch without
Blender. Live heroes are scored the same functions. Never paste gold MPNs; never
key on product nouns — callers pass a form_id from instrument_form_grammar.

FLOW:
  form_converge_loop checklist PASS
    → score_form_glance(form_id, 00-hero.png | 04-product-exterior.png)
    → FAIL ⇒ not converged (fix SP_* / placer SOURCE)
    → PASS ⇒ framing loop / shaded final

@description Deterministic colour/region metrics for instrument form families.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw

# ── Thresholds (display-sRGB 0–255 on object pixels) ───────────────────────
# Royal / safety blue carriages (Poseidon/gold convergent accent).
# Gold ≈0.38; weak CGI sat ~0.09 — floor demands a real accent face, not a speck.
BLUE_ACCENT_MIN_FRAC = 0.080
# Mid-grey polymer walls that dominate when chassis rails become crates.
CRATE_GREY_MAX_FRAC = 0.40
# Saturated conductor families (red/green/blue wire). Gold photos often resolve
# only one family after demosaic — hard-fail only when ZERO chroma reads.
HARNESS_CHROMA_MIN_PAIR = 1
# Cool bright HMI face (UI panel) — not the blue stage plate alone.
# Gold ≈0.13; floating white/black shards sat ~0.016 — require a readable screen.
HMI_FACE_MIN_FRAC = 0.020
# Metallic / silver rail cue (high V, low chroma).
METAL_RAIL_MIN_FRAC = 0.006
# Product twinship images only — inspect overlays are not gold SIGHT.
_PRODUCT_GLANCE_NAME_RE = re.compile(
    r"(?:^|/)(?:00-hero|04-product-exterior|05-product-left|06-product-right|"
    r"07-product-service|blender-cover|hero-embed)\.(?:png|jpg|jpeg)$",
    re.I,
)
_INSPECT_NAME_RE = re.compile(r"(?:^|/)inspect-", re.I)


def _load_rgb(path: str | Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)


def _object_mask(rgb: np.ndarray) -> np.ndarray:
    """Foreground vs studio/inspect backdrop(s).

    INTENT (NinjaPCR 2026-07-17 SIGHT): product cams use a SPLIT studio
    (black upper void + white floor). A single median of all four corners
    lands mid-grey, so the black void scores as "object" and thermocycler
    ``dark_knob_frac`` false-passes at ~0.50. Exclude pixels near ANY corner
    colour so multi-backdrop studios drop both void and floor.
    """
    h, w, _ = rgb.shape
    cs = max(4, min(h, w) // 40)
    patches = (
        rgb[:cs, :cs],
        rgb[:cs, -cs:],
        rgb[-cs:, :cs],
        rgb[-cs:, -cs:],
    )
    near_bg = np.zeros((h, w), dtype=bool)
    for patch in patches:
        bg = np.median(patch.reshape(-1, 3), axis=0)
        dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
        near_bg |= dist < 28.0
    return ~near_bg


def _frac(mask: np.ndarray, obj: np.ndarray) -> float:
    n = int(obj.sum())
    if n <= 0:
        return 0.0
    return float((mask & obj).sum()) / float(n)


def _blue_accent_mask(rgb: np.ndarray) -> np.ndarray:
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    return (b > 90.0) & (b > r * 1.25) & (b > g * 1.10) & (b - r > 25.0)


def _crate_grey_mask(rgb: np.ndarray) -> np.ndarray:
    """Tall mid-grey polymer slabs (crate walls) — not silver rails."""
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    mean = (r + g + b) / 3.0
    chroma = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
    return (mean > 110.0) & (mean < 190.0) & (chroma < 22.0)


def _metal_rail_mask(rgb: np.ndarray) -> np.ndarray:
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    mean = (r + g + b) / 3.0
    chroma = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
    return (mean > 150.0) & (chroma < 28.0) & (mean < 230.0)


def _harness_chroma_hits(rgb: np.ndarray, obj: np.ndarray) -> int:
    """Count distinct saturated conductor families visible on the object."""
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    hits = 0
    # Red (photographic gold wires are darker — lower floor than CGI)
    if int(((r > 110) & (r > g * 1.25) & (r > b * 1.25) & obj).sum()) > 25:
        hits += 1
    # Green
    if int(((g > 95) & (g > r * 1.15) & (g > b * 1.05) & obj).sum()) > 25:
        hits += 1
    # Blue wire (distinct from large accent panels: small saturated blobs)
    blue_wire = (b > 120) & (b > r * 1.25) & (b > g * 1.15) & obj
    n_blue = int(blue_wire.sum())
    if 25 < n_blue < int(obj.sum() * 0.10):
        hits += 1
    return hits


def _hmi_face_mask(rgb: np.ndarray) -> np.ndarray:
    """Cool bright UI face (light panel) — gold tipped tablet screen cue."""
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    mean = (r + g + b) / 3.0
    return (mean > 160.0) & (b >= r) & (b >= g - 8.0) & ((b - r) > 8.0)


def score_syringe_pump_glance(png_path: str | Path) -> dict[str, Any]:
    """Deterministic OPEN-array twinship glance for syringe_pump form.

    @description Flags crate-wall dominance, missing blue carriages, missing
                 harness chroma, missing HMI face, missing metal rails.
    @param png_path Hero or product-exterior PNG
    @returns Dict with ok, score, metrics, findings (codes for converge loop)
    """
    path = Path(png_path)
    rgb = _load_rgb(path)
    obj = _object_mask(rgb)
    if int(obj.sum()) < 200:
        return {
            "schema": "form-render-glance/v1",
            "form": "syringe_pump",
            "image": str(path),
            "ok": False,
            "score": 0.0,
            "metrics": {},
            "findings": [{"code": "BLANK", "fix": "rebuild",
                          "message": "no object pixels for form glance"}],
        }

    # GOTCHA: studio ground planes are mid-grey and inflate CRATE_WALLS when the
    # corner-median bg is dark void (product softbox shots). Score CRATE on the
    # upper band only. DECISION (2026-07-16 final8): do NOT wipe the lower band
    # for HMI / blue / harness — OPEN-array tablets dock in the foreground and
    # a 0.72 crop was zeroing a real cool UI face (hero hmi≈0.013 while the
    # bottom-centre quadrant held ≫0.02 cool pixels). True ground is the bottom
    # ~12% only.
    h, _w, _ = rgb.shape
    obj_crate = obj.copy()
    obj_crate[int(h * 0.78) :, :] = False
    if int(obj_crate.sum()) < 150:
        obj_crate = obj
    obj_prod = obj.copy()
    obj_prod[int(h * 0.88) :, :] = False
    if int(obj_prod.sum()) < 150:
        obj_prod = obj

    blue_f = _frac(_blue_accent_mask(rgb), obj_prod)
    crate_f = _frac(_crate_grey_mask(rgb), obj_crate)
    metal_f = _frac(_metal_rail_mask(rgb), obj_prod)
    hmi_f = _frac(_hmi_face_mask(rgb), obj_prod)
    chroma_n = _harness_chroma_hits(rgb, obj_prod)

    findings: list[dict[str, str]] = []
    if blue_f < BLUE_ACCENT_MIN_FRAC:
        findings.append({
            "code": "NO_ACCENT_CARRIAGE",
            "fix": "raise_carriage_visibility",
            "message": (
                f"safety-blue carriage accent frac {blue_f:.4f} < {BLUE_ACCENT_MIN_FRAC} "
                "— mechanism face not reading (crate / occlusion / wrong cam)"
            ),
        })
    # Crate dominance: gold ≈0.22. Fail when grey dominates OR accent is weak.
    # Iso heroes retain some ground grey — require strong accent (blue≥0.14) to clear.
    if crate_f > 0.65:
        findings.append({
            "code": "CRATE_WALLS",
            "fix": "open_mid_bay_silk_frame",
            "message": (
                f"mid-grey crate frac {crate_f:.3f} > 0.65 — sealed-crate silhouette"
            ),
        })
    elif crate_f > 0.45 and blue_f < 0.140:
        findings.append({
            "code": "CRATE_WALLS",
            "fix": "raise_carriage_blue_open_bay",
            "message": (
                f"mid-grey crate frac {crate_f:.3f} with weak blue accent {blue_f:.4f} "
                f"— OPEN array must show silk U-bay + blue carriage (gold ~0.22 / ≥0.14)"
            ),
        })
    elif crate_f > CRATE_GREY_MAX_FRAC and blue_f < BLUE_ACCENT_MIN_FRAC * 1.5:
        findings.append({
            "code": "CRATE_WALLS",
            "fix": "open_mid_bay_silk_frame",
            "message": (
                f"mid-grey crate frac {crate_f:.3f} dominates without blue mechanism "
                f"— OPEN array side rails too tall or solid"
            ),
        })
    if metal_f < METAL_RAIL_MIN_FRAC:
        findings.append({
            "code": "NO_METAL_RAILS",
            "fix": "expose_rails_leadscrew",
            "message": f"metal/rail cue frac {metal_f:.4f} < {METAL_RAIL_MIN_FRAC}",
        })
    if chroma_n < HARNESS_CHROMA_MIN_PAIR:
        findings.append({
            "code": "NO_HARNESS_CHROMA",
            "fix": "thicken_SP_HARNESS_OD_add_wires",
            "message": (
                f"harness chroma families {chroma_n} < {HARNESS_CHROMA_MIN_PAIR} "
                "— braid not surviving product cam"
            ),
        })
    if hmi_f < HMI_FACE_MIN_FRAC:
        findings.append({
            "code": "NO_HMI_FACE",
            "fix": "tip_tablet_lower_SP_CAM_EXT_Z",
            "message": (
                f"cool HMI face frac {hmi_f:.4f} < {HMI_FACE_MIN_FRAC} "
                "— tablet reading as fascia bar or missing"
            ),
        })

    # Soft score: each finding knocks 0.2; floors at 0.
    score = max(0.0, 1.0 - 0.2 * len(findings))
    return {
        "schema": "form-render-glance/v1",
        "form": "syringe_pump",
        "image": str(path),
        "ok": len(findings) == 0,
        "score": round(score, 3),
        "metrics": {
            "blue_accent_frac": round(blue_f, 4),
            "crate_grey_frac": round(crate_f, 4),
            "metal_rail_frac": round(metal_f, 4),
            "hmi_face_frac": round(hmi_f, 4),
            "harness_chroma_families": chroma_n,
        },
        "findings": findings,
    }


def score_thermocycler_glance(png_path: str | Path) -> dict[str, Any]:
    """Tip-back PCR glance: dark knob / lid face must not be an empty crate.

    INTENT: NinjaPCR empty-box regression — exterior must show guts OR open lid
    with a dark star/knob cue and wood/polymer body (not blank grey).
    """
    path = Path(png_path)
    rgb = _load_rgb(path)
    obj = _object_mask(rgb)
    if int(obj.sum()) < 200:
        return {
            "schema": "form-render-glance/v1",
            "form": "thermocycler",
            "image": str(path),
            "ok": False,
            "score": 0.0,
            "metrics": {},
            "findings": [{"code": "BLANK", "fix": "rebuild",
                          "message": "no object pixels"}],
        }
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    mean = (r + g + b) / 3.0
    # Dark knob / bezel cue
    dark = (mean < 55.0) & obj
    dark_f = _frac(dark, obj)
    # Warm wood / mid polymer body (not pure studio grey void)
    warm = (r > g) & (r > 90) & (mean > 70) & (mean < 170) & obj
    warm_f = _frac(warm, obj)
    findings: list[dict[str, str]] = []
    # INTENT (NinjaPCR 2302): tipback hero_dist_scale 0.55 fills more warm body
    # pixels; charcoal hub must still clear this floor. 0.008 was calibrated at
    # 0.70 distance — keep a tight floor so empty crates still FAIL.
    if dark_f < 0.0055:
        findings.append({
            "code": "NO_LID_KNOB",
            "fix": "tipback_lid_cam_star",
            "message": f"dark knob/bezel frac {dark_f:.4f} — lid star not reading",
        })
    if warm_f < 0.04:
        findings.append({
            "code": "EMPTY_BOX_BODY",
            "fix": "keep_tc_exterior_story",
            "message": f"warm body frac {warm_f:.4f} — empty crate / wrong exterior keep",
        })
    score = max(0.0, 1.0 - 0.35 * len(findings))
    return {
        "schema": "form-render-glance/v1",
        "form": "thermocycler",
        "image": str(path),
        "ok": len(findings) == 0,
        "score": round(score, 3),
        "metrics": {
            "dark_knob_frac": round(dark_f, 4),
            "warm_body_frac": round(warm_f, 4),
        },
        "findings": findings,
    }


def score_optical_handheld_glance(png_path: str | Path) -> dict[str, Any]:
    """Optical handheld: charcoal body band + dark glass cue (colorimeter)."""
    path = Path(png_path)
    # Reuse body_luminance_ok from grammar when available.
    try:
        import instrument_form_grammar as ifg
        lum_ok = ifg.body_luminance_ok(str(path))
    except Exception:
        lum_ok = True
    rgb = _load_rgb(path)
    obj = _object_mask(rgb)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    # Dark cool glass / bezel patch on charcoal body.
    glass = ((r + g + b) / 3.0 < 45.0) & (b >= r) & obj
    glass_f = _frac(glass, obj)
    findings: list[dict[str, str]] = []
    if not lum_ok:
        findings.append({
            "code": "BODY_LUMINANCE",
            "fix": "softbox_or_MAT_BODY",
            "message": "charcoal body outside gold luminance band (clay or crushed)",
        })
    if glass_f < 0.003:
        findings.append({
            "code": "NO_DISPLAY_GLASS",
            "fix": "display_bezel_glass",
            "message": f"dark glass frac {glass_f:.4f} — HMI glass not reading",
        })
    score = max(0.0, 1.0 - 0.4 * len(findings))
    return {
        "schema": "form-render-glance/v1",
        "form": "optical_handheld",
        "image": str(path),
        "ok": len(findings) == 0,
        "score": round(score, 3),
        "metrics": {"glass_frac": round(glass_f, 4), "body_luminance_ok": lum_ok},
        "findings": findings,
    }


def score_lab_microscope_glance(png_path: str | Path) -> dict[str, Any]:
    """OPEN flexure microscope: cream body + dark actuators/optics (not charcoal handheld).

    INTENT: sealed optical_handheld glance PASSed on OpenFlexure 1310 because the
    render was a colorimeter twin. Microscope glance requires warm cream polymer
    AND dark motor/optics patches — fails charcoal sealed cubes.
    """
    path = Path(png_path)
    rgb = _load_rgb(path)
    obj = _object_mask(rgb)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    mean = (r.astype(float) + g.astype(float) + b.astype(float)) / 3.0
    # Warm cream / FDM polymer (gold printed body).
    cream = (mean >= 140.0) & (r >= g - 8) & (g >= b - 5) & (r >= b + 5) & obj
    cream_f = _frac(cream, obj)
    # Dark geared steppers / optics tube / condenser.
    dark = (mean < 55.0) & obj
    dark_f = _frac(dark, obj)
    # Charcoal sealed handheld cue — cool mid-dark body without cream.
    charcoal = (mean < 110.0) & (mean > 40.0) & (b >= r - 5) & obj
    charcoal_f = _frac(charcoal, obj)
    findings: list[dict[str, str]] = []
    # GOTCHA: product hero foreshortens the cream pedestal vs 04-exterior
    # (OF form-loop hero 0.030 vs exterior 0.057). Floor 0.025 clears honest
    # OPEN flexure shots; charcoal handheld synthetics stay ~0.
    if cream_f < 0.025:
        findings.append({
            "code": "NO_CREAM_BODY",
            "fix": "LM_MAT_BODY_CREAM",
            "message": (
                f"cream FDM frac {cream_f:.4f} — printable body not reading "
                "(sealed charcoal handheld leak?)"
            ),
        })
    if dark_f < 0.008:
        findings.append({
            "code": "NO_ACTUATOR_OPTICS",
            "fix": "act_*_stepper_optics_tube",
            "message": f"dark mech/optics frac {dark_f:.4f} — steppers/tube not reading",
        })
    if charcoal_f > 0.35 and cream_f < 0.08:
        findings.append({
            "code": "SEALED_CHARCOAL_HANDHELD",
            "fix": "is_lab_microscope_form_placer",
            "message": (
                f"charcoal frac {charcoal_f:.4f} with cream {cream_f:.4f} — "
                "looks like optical_handheld, not OPEN flexure microscope"
            ),
        })
    score = max(0.0, 1.0 - 0.35 * len(findings))
    return {
        "schema": "form-render-glance/v1",
        "form": "lab_microscope",
        "image": str(path),
        "ok": len(findings) == 0,
        "score": round(score, 3),
        "metrics": {
            "cream_frac": round(cream_f, 4),
            "dark_mech_frac": round(dark_f, 4),
            "charcoal_frac": round(charcoal_f, 4),
        },
        "findings": findings,
    }


GLANCE_BY_FORM = {
    "syringe_pump": score_syringe_pump_glance,
    "thermocycler": score_thermocycler_glance,
    "optical_handheld": score_optical_handheld_glance,
    "lab_microscope": score_lab_microscope_glance,
}


def iso_crate_residual_ok(glance: dict[str, Any]) -> bool:
    """True when the only finding is CRATE_WALLS but mechanism/HMI/harness read.

    INTENT: iso heroes show more ground grey than exteriors; if blue carriages,
    metal rails, HMI face, and harness chroma all clear, do not fail twinship
    solely on residual ground grey (encode §3.4 product cams still apply).
    """
    findings = glance.get("findings") or []
    codes = {f.get("code") for f in findings}
    if codes != {"CRATE_WALLS"}:
        return False
    m = glance.get("metrics") or {}
    return (
        float(m.get("blue_accent_frac") or 0) >= 0.14
        and float(m.get("hmi_face_frac") or 0) >= HMI_FACE_MIN_FRAC
        and float(m.get("metal_rail_frac") or 0) >= 0.18
        and int(m.get("harness_chroma_families") or 0) >= 2
    )


def assert_product_glance_image(png_path: str | Path) -> None:
    """Raise if path is an inspect overlay — encode checklist §3.4.

    @throws ValueError when the filename is an inspect-* cam
    """
    name = Path(png_path).name
    if _INSPECT_NAME_RE.search(name) or name.startswith("inspect-"):
        raise ValueError(
            f"form glance refuses inspect cam {name!r} — score 00-hero / "
            "04-product-exterior (product twinship), never inspect overlays"
        )


def score_form_glance(form_id: str, png_path: str | Path) -> dict[str, Any]:
    """Dispatch glance by form family id."""
    path = Path(png_path)
    try:
        assert_product_glance_image(path)
    except ValueError as exc:
        return {
            "schema": "form-render-glance/v1",
            "form": form_id,
            "image": str(path),
            "ok": False,
            "score": 0.0,
            "metrics": {},
            "findings": [{
                "code": "INSPECT_CAM",
                "fix": "use_product_hero",
                "message": str(exc),
            }],
        }
    fn = GLANCE_BY_FORM.get(form_id)
    if fn is None:
        return {
            "schema": "form-render-glance/v1",
            "form": form_id,
            "image": str(path),
            "ok": True,
            "score": 1.0,
            "metrics": {},
            "findings": [],
            "skipped": True,
            "message": f"no glance registered for form {form_id}",
        }
    return fn(path)


def _synth(path: Path, kind: str, size: tuple[int, int] = (640, 400)) -> Path:
    """Write adversarial / happy synthetic PNGs for proveCatch (no Blender)."""
    w, h = size
    im = Image.new("RGB", (w, h), (180, 182, 185))  # studio floor-ish
    d = ImageDraw.Draw(im)
    if kind == "syringe_good":
        # Blue carriages + bright silver rails + red/green harness + cool HMI
        # Sized to clear tightened twinship floors (blue≥0.080, hmi≥0.020).
        for i in range(4):
            x0 = 40 + i * 90
            d.rectangle([x0, 140, x0 + 70, 230], fill=(25, 90, 200))  # carriage
            d.rectangle([x0 + 8, 115, x0 + 20, 245], fill=(210, 212, 215))  # rail
            d.rectangle([x0 + 32, 115, x0 + 44, 245], fill=(210, 212, 215))
            d.ellipse([x0 + 8, 100, x0 + 28, 118], fill=(200, 30, 25))  # red wire
            d.ellipse([x0 + 32, 100, x0 + 52, 118], fill=(30, 160, 50))  # green
        d.rectangle([380, 160, 620, 340], fill=(210, 220, 235))  # HMI face
        d.rectangle([375, 155, 625, 345], outline=(20, 20, 22), width=4)
    elif kind == "syringe_crate":
        for i in range(4):
            x0 = 40 + i * 100
            d.rectangle([x0, 80, x0 + 85, 300], fill=(150, 152, 155))  # crate
    elif kind == "syringe_no_hmi":
        for i in range(4):
            x0 = 40 + i * 90
            d.rectangle([x0, 160, x0 + 50, 210], fill=(25, 90, 200))
            d.rectangle([x0 + 10, 120, x0 + 18, 240], fill=(190, 192, 195))
            d.ellipse([x0 + 8, 100, x0 + 28, 118], fill=(200, 30, 25))
            d.ellipse([x0 + 32, 100, x0 + 52, 118], fill=(30, 160, 50))
        # blue stage only — no cool HMI face
        d.rectangle([420, 140, 580, 180], fill=(20, 80, 190))
    elif kind == "thermocycler_good":
        d.rectangle([120, 100, 520, 320], fill=(160, 120, 70))  # warm body
        d.ellipse([300, 90, 340, 130], fill=(25, 25, 28))  # star knob
    elif kind == "thermocycler_empty":
        d.rectangle([140, 110, 500, 300], fill=(140, 142, 145))
    elif kind == "thermocycler_split_studio_good":
        # proveCatch: live Blender product cams (black void + white floor).
        d.rectangle([0, 0, w, h // 2], fill=(0, 0, 0))
        d.rectangle([0, h // 2, w, h], fill=(245, 245, 245))
        d.rectangle([120, 100, 520, 320], fill=(160, 120, 70))
        d.ellipse([300, 90, 340, 130], fill=(25, 25, 28))
    elif kind == "thermocycler_split_studio_noknob":
        d.rectangle([0, 0, w, h // 2], fill=(0, 0, 0))
        d.rectangle([0, h // 2, w, h], fill=(245, 245, 245))
        d.rectangle([120, 100, 520, 320], fill=(160, 120, 70))
    elif kind == "microscope_good":
        # Cream FDM body + dark steppers + dark optics tube
        d.rectangle([220, 140, 420, 300], fill=(230, 220, 200))
        d.rectangle([250, 120, 390, 145], fill=(200, 190, 170))  # stage
        d.rectangle([160, 180, 210, 250], fill=(20, 20, 22))  # stepper
        d.rectangle([430, 180, 480, 250], fill=(20, 20, 22))
        d.ellipse([290, 200, 350, 290], fill=(15, 15, 18))  # optics tube
        d.rectangle([300, 80, 340, 130], fill=(25, 25, 28))  # condenser
    elif kind == "microscope_charcoal":
        # Sealed charcoal handheld (adversarial — OpenFlexure 1310 failure mode)
        d.rectangle([140, 150, 500, 280], fill=(55, 58, 65))
        d.rectangle([360, 120, 420, 200], fill=(40, 42, 48))
    else:
        raise ValueError(kind)
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path)
    return path


def _selftest() -> None:
    """proveCatch: glance FIRES on known-bad synthetics; silent on known-good."""
    tmp = Path("/tmp/form_render_glance_selftest")
    good = _synth(tmp / "syringe_good.png", "syringe_good")
    crate = _synth(tmp / "syringe_crate.png", "syringe_crate")
    no_hmi = _synth(tmp / "syringe_no_hmi.png", "syringe_no_hmi")

    g = score_syringe_pump_glance(good)
    assert g["ok"], f"good synthetic must PASS glance, got {g}"

    c = score_syringe_pump_glance(crate)
    codes = {f["code"] for f in c["findings"]}
    assert not c["ok"], "crate synthetic must FAIL"
    assert "NO_ACCENT_CARRIAGE" in codes or "CRATE_WALLS" in codes, codes

    h = score_syringe_pump_glance(no_hmi)
    hcodes = {f["code"] for f in h["findings"]}
    assert not h["ok"] and "NO_HMI_FACE" in hcodes, h

    tg = score_thermocycler_glance(_synth(tmp / "tc_good.png", "thermocycler_good"))
    assert tg["ok"], tg
    te = score_thermocycler_glance(_synth(tmp / "tc_empty.png", "thermocycler_empty"))
    assert not te["ok"], te
    assert any(f["code"] in ("NO_LID_KNOB", "EMPTY_BOX_BODY") for f in te["findings"])

    # proveCatch (2026-07-17): split black/white studio must NOT inflate dark_knob.
    tsg = score_thermocycler_glance(
        _synth(tmp / "tc_split_good.png", "thermocycler_split_studio_good"))
    assert tsg["ok"], tsg
    assert float(tsg["metrics"]["dark_knob_frac"]) < 0.20, tsg["metrics"]
    tsn = score_thermocycler_glance(
        _synth(tmp / "tc_split_noknob.png", "thermocycler_split_studio_noknob"))
    assert not tsn["ok"], tsn
    assert any(f["code"] == "NO_LID_KNOB" for f in tsn["findings"]), tsn

    mg = score_lab_microscope_glance(_synth(tmp / "lm_good.png", "microscope_good"))
    assert mg["ok"], f"microscope good synthetic must PASS: {mg}"
    mb = score_lab_microscope_glance(_synth(tmp / "lm_charcoal.png", "microscope_charcoal"))
    assert not mb["ok"], "charcoal handheld synthetic must FAIL microscope glance"
    assert any(
        f["code"] in ("NO_CREAM_BODY", "SEALED_CHARCOAL_HANDHELD")
        for f in mb["findings"]
    ), mb

    # Dispatch
    d = score_form_glance("syringe_pump", good)
    assert d["ok"] and d.get("skipped") is not True
    # proveCatch §3.4: inspect cams must FAIL glance (never twinship).
    insp = _synth(tmp / "inspect-iso.png", "syringe_good")
    bad_insp = score_form_glance("syringe_pump", insp)
    assert not bad_insp["ok"] and any(
        f["code"] == "INSPECT_CAM" for f in bad_insp["findings"]
    ), bad_insp
    print("form_render_glance _selftest: OK (adversarial synthetics proveCatch)")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("png", nargs="?", default="")
    ap.add_argument("--form", default="syringe_pump")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        _selftest()
        return 0
    if not args.png:
        ap.error("png required unless --selftest")
    res = score_form_glance(args.form, args.png)
    if args.json:
        print(json.dumps(res, indent=2))
    else:
        print(f"ok={res['ok']} score={res['score']} findings={[f['code'] for f in res['findings']]}")
        print(res.get("metrics"))
    return 0 if res["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
