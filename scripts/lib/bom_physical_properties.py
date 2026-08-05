#!/usr/bin/env python3
"""Universal BoM ↔ Blender physical-property contract.

INTENT: Tristan 2026-07-31 — the bill must carry thickness / radius / OD-ID /
L×W×H / mass / material on every line that has them on the word, and Blender
must consume the SAME fields for mesh scale + PBR. Free-text `dimension` alone
is not enough; `material_grade` must project to `material`; word `mass` must
become row `mass_kg`.

FLOW:
  word.modifier_characters
    → extract_physical_props()
    → project_onto_bom_row()          (requirements_bom.assemble)
    → props_to_blender_dim()          (build_universal_scene.extract_parts)
    → material_to_pbr()               (build_universal_scene._mat_for)

Universal — noun/unit/provenance keyed, never a product-class table.
"""

from __future__ import annotations

import re
from typing import Any, Mapping, MutableMapping, Optional


# Structured modifier kinds (preferred) + free-text aliases.
_STRUCTURED_MM_KINDS = (
    "od_mm", "id_mm", "thickness_mm", "wall_mm", "length_mm", "width_mm",
    "height_mm", "depth_mm", "radius_mm", "dia_mm", "diameter_mm",
)

_MATERIAL_KINDS = ("material", "material_grade", "material_spec", "moc")
_MASS_KINDS = ("mass", "mass_kg", "weight", "weight_kg")
_DIM_KINDS = ("dimension", "dimensions")


def _num(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    m = re.search(r"-?\d+(?:\.\d+)?", str(value).replace(",", ""))
    return float(m.group(0)) if m else None


def flatten_modifiers(mods: Any) -> dict[str, Any]:
    """Flatten modifier_characters list OR dict → {kind: value, kind_unit: …}."""
    if isinstance(mods, dict):
        return dict(mods)
    out: dict[str, Any] = {}
    for m in mods or []:
        if not isinstance(m, dict):
            continue
        kind = m.get("kind")
        if not kind:
            continue
        out[str(kind)] = m.get("value")
        unit = m.get("unit")
        if unit not in (None, ""):
            out[f"{kind}_unit"] = unit
    return out


def _parse_kv_dimension_blob(text: str) -> dict[str, float]:
    """Parse densify-style `od_mm=130.5, id_mm=100, thickness_mm=12` blobs."""
    out: dict[str, float] = {}
    if not text:
        return out
    for m in re.finditer(
        r"\b(od|id|thickness|wall|length|width|height|depth|radius|dia|diameter)"
        r"(?:_mm)?\s*[=:]\s*(-?\d+(?:\.\d+)?)",
        str(text),
        re.I,
    ):
        key = m.group(1).lower()
        if key == "dia":
            key = "diameter"
        if key == "diameter":
            out["od_mm"] = float(m.group(2))
        elif key == "wall":
            out["thickness_mm"] = float(m.group(2))
        else:
            out[f"{key}_mm"] = float(m.group(2))
    return out


def _parse_human_dimension(text: str) -> dict[str, float]:
    """Parse common human dim strings into mm atoms (best-effort, additive)."""
    out: dict[str, float] = {}
    if not text:
        return out
    s = str(text).strip().lower().replace("×", "x").replace("Ø", "od ").replace("ø", "od ")

    # Box FIRST — "115x140x28 mm" must never be read as Ø140 × L28.
    m = re.search(
        r"(-?\d+(?:\.\d+)?)\s*x\s*(-?\d+(?:\.\d+)?)\s*x\s*(-?\d+(?:\.\d+)?)\s*mm",
        s, re.I,
    )
    if m:
        out["width_mm"] = float(m.group(1))
        out["depth_mm"] = float(m.group(2))
        out["height_mm"] = float(m.group(3))
        return out

    # OD / ID pair: "OD 197.1 / ID 130.5 mm"
    m = re.search(
        r"od\s*(-?\d+(?:\.\d+)?)\s*/\s*id\s*(-?\d+(?:\.\d+)?)\s*mm",
        s, re.I,
    )
    if m:
        out["od_mm"] = float(m.group(1))
        out["id_mm"] = float(m.group(2))

    # Explicit OD/Ø × L — require the OD token (never bare NxM mm).
    m = re.search(
        r"(?:od|⌀)\s*(-?\d+(?:\.\d+)?)\s*(?:mm)?\s*x\s*l?\s*(-?\d+(?:\.\d+)?)\s*mm",
        s, re.I,
    )
    if m and "od_mm" not in out:
        out["od_mm"] = float(m.group(1))
        out["length_mm"] = float(m.group(2))

    m = re.search(r"(?:od|⌀)\s*(-?\d+(?:\.\d+)?)\s*mm", s, re.I)
    if m and "od_mm" not in out:
        out["od_mm"] = float(m.group(1))

    m = re.search(r"\bid\s*(-?\d+(?:\.\d+)?)\s*mm", s, re.I)
    if m and "id_mm" not in out:
        out["id_mm"] = float(m.group(1))

    m = re.search(r"(?:t|thk|thickness|wall)\s*[=:]?\s*(-?\d+(?:\.\d+)?)\s*mm", s, re.I)
    if m and "thickness_mm" not in out:
        out["thickness_mm"] = float(m.group(1))

    m = re.search(r"radius\s*(-?\d+(?:\.\d+)?)\s*mm|\br\s*(-?\d+(?:\.\d+)?)\b", s, re.I)
    if m and "radius_mm" not in out:
        out["radius_mm"] = float(m.group(1) or m.group(2))

    # Footprint: 115 x 140 mm (only when not already a cylinder)
    if "od_mm" not in out:
        m = re.search(r"(-?\d+(?:\.\d+)?)\s*x\s*(-?\d+(?:\.\d+)?)\s*mm", s, re.I)
        if m and "width_mm" not in out:
            out["width_mm"] = float(m.group(1))
            out["depth_mm"] = float(m.group(2))

    # mm OD x mm H cylinder
    m = re.search(
        r"(-?\d+(?:\.\d+)?)\s*mm\s*(?:od|dia(?:meter)?)\s*x\s*(-?\d+(?:\.\d+)?)\s*mm",
        s, re.I,
    )
    if m:
        out.setdefault("od_mm", float(m.group(1)))
        out.setdefault("length_mm", float(m.group(2)))

    return out


def _parse_mass_kg(value: Any, unit: Any = None) -> Optional[float]:
    if value is None or value == "":
        return None
    blob = f"{value} {unit or ''}".lower()
    n = _num(value)
    if n is None:
        return None
    if re.search(r"\bg\b|gram", blob) and not re.search(r"\bkg\b", blob):
        return n / 1000.0
    if re.search(r"\bt\b|tonne", blob):
        return n * 1000.0
    return n  # default kg


def extract_physical_props(mods: Any) -> dict[str, Any]:
    """Extract structured physical properties from word modifiers.

    Returns a dict with optional keys:
      od_mm, id_mm, thickness_mm, length_mm, width_mm, height_mm, depth_mm,
      radius_mm, mass_kg, material, dimension_summary, provenance_bits
    """
    md = flatten_modifiers(mods)
    props: dict[str, Any] = {"provenance_bits": []}

    for kind in _STRUCTURED_MM_KINDS:
        if kind not in md:
            continue
        n = _num(md.get(kind))
        if n is None:
            continue
        if kind in ("wall_mm",):
            props["thickness_mm"] = n
        elif kind in ("dia_mm", "diameter_mm"):
            props["od_mm"] = n
        elif kind == "depth_mm":
            props["depth_mm"] = n
        else:
            props[kind] = n
        props["provenance_bits"].append(f"modifier:{kind}")

    # Free-text dimension / dimensions (strip any accidental mass tail first)
    dim_text = _strip_mass_tail(md.get("dimension") or md.get("dimensions") or "")
    if dim_text:
        props["dimension_summary"] = dim_text
        for src in (_parse_kv_dimension_blob(dim_text),
                    _parse_human_dimension(dim_text)):
            for k, v in src.items():
                if k not in props:
                    props[k] = v
                    props["provenance_bits"].append(f"parsed:{k}")

    # Material aliases
    for kind in _MATERIAL_KINDS:
        if md.get(kind):
            props["material"] = str(md.get(kind)).strip()
            props["provenance_bits"].append(f"modifier:{kind}")
            break

    # Mass aliases
    for kind in _MASS_KINDS:
        if kind in md:
            mass = _parse_mass_kg(md.get(kind), md.get(f"{kind}_unit"))
            if mass is not None:
                props["mass_kg"] = mass
                props["provenance_bits"].append(f"modifier:{kind}")
                break

    # Derive radius from OD when only OD present
    if props.get("od_mm") and not props.get("radius_mm"):
        props["radius_mm"] = float(props["od_mm"]) / 2.0
        props["provenance_bits"].append("derived:radius_from_od")

    # Wall from OD-ID when thickness absent
    if (props.get("od_mm") and props.get("id_mm")
            and not props.get("thickness_mm")
            and float(props["od_mm"]) > float(props["id_mm"])):
        props["thickness_mm"] = (float(props["od_mm"]) - float(props["id_mm"])) / 2.0
        props["provenance_bits"].append("derived:thickness_from_od_id")

    return props


def _strip_mass_tail(text: str) -> str:
    """Remove accidental `· m=N kg` tails from geometry strings (never re-bake mass)."""
    return re.sub(
        r"\s*[·•]\s*m\s*=\s*-?\d+(?:\.\d+)?\s*kg\b",
        "",
        str(text or ""),
        flags=re.I,
    ).strip(" ·•")


def geometry_summary(props: Mapping[str, Any]) -> str:
    """Human one-liner for Excel geometry cells.

    DECISION: mass stays in `mass_kg` only — never append `· m=N kg` into
    `dimensions_mm` (that polluted strings and risked re-parse leftovers).
    """
    if not props:
        return ""
    if props.get("dimension_summary"):
        base = _strip_mass_tail(str(props["dimension_summary"]))
    elif props.get("od_mm") and props.get("length_mm"):
        base = f"Ø{props['od_mm']:g} × L{props['length_mm']:g} mm"
    elif props.get("od_mm") and props.get("id_mm"):
        base = f"OD {props['od_mm']:g} / ID {props['id_mm']:g} mm"
    elif props.get("od_mm"):
        base = f"OD {props['od_mm']:g} mm"
    elif props.get("width_mm") and props.get("depth_mm") and props.get("height_mm"):
        base = (f"{props['width_mm']:g}×{props['depth_mm']:g}×"
                f"{props['height_mm']:g} mm")
    elif props.get("width_mm") and props.get("depth_mm"):
        base = f"{props['width_mm']:g}×{props['depth_mm']:g} mm"
    else:
        base = ""
    extras = []
    if props.get("thickness_mm") is not None and "thk" not in base.lower() and "t=" not in base.lower():
        extras.append(f"t={props['thickness_mm']:g} mm")
    if props.get("radius_mm") is not None and "radius" not in base.lower() and not props.get("od_mm"):
        extras.append(f"R={props['radius_mm']:g} mm")
    if extras:
        base = (base + " · " if base else "") + " · ".join(extras)
    return base


def project_onto_bom_row(
    row: MutableMapping[str, Any],
    props: Mapping[str, Any],
    *,
    overwrite: bool = False,
) -> dict[str, Any]:
    """Project extracted props onto a requirementsBom row (universal).

    Never clobbers take-off-derived wall_mm / mass_kg / diameter_m unless
    overwrite=True. Always fills structured atoms when absent.
    """
    if not props:
        return dict(row)

    # Material — accept material_grade path
    if props.get("material") and (overwrite or not row.get("material")):
        row["material"] = props["material"]

    # Mass from word modifier (take-off mass wins when already present)
    if props.get("mass_kg") is not None and (overwrite or not row.get("mass_kg")):
        row["mass_kg"] = round(float(props["mass_kg"]), 4)

    # Thickness / wall
    if props.get("thickness_mm") is not None:
        if overwrite or not row.get("wall_mm"):
            row["wall_mm"] = round(float(props["thickness_mm"]), 3)
        if overwrite or not row.get("thickness_mm"):
            row["thickness_mm"] = round(float(props["thickness_mm"]), 3)

    # Structured mm atoms
    for key in ("od_mm", "id_mm", "radius_mm", "length_mm", "width_mm",
                "height_mm", "depth_mm"):
        if props.get(key) is not None and (overwrite or not row.get(key)):
            row[key] = round(float(props[key]), 3)

    # Take-off compatible metres (only when absent — don't fight hoop-stress)
    if props.get("od_mm") is not None and (overwrite or not row.get("diameter_m")):
        row["diameter_m"] = round(float(props["od_mm"]) / 1000.0, 5)
    if props.get("length_mm") is not None and (overwrite or not row.get("height_m")):
        # Axial length maps to height_m for vertical cylinders in take-off idiom
        row["height_m"] = round(float(props["length_mm"]) / 1000.0, 5)
    elif props.get("height_mm") is not None and (overwrite or not row.get("height_m")):
        row["height_m"] = round(float(props["height_mm"]) / 1000.0, 5)

    summary = geometry_summary(props)
    if summary:
        # Always scrub mass tails from an existing dimensions_mm (leftover cleanup).
        existing = row.get("dimensions_mm")
        if isinstance(existing, str) and "m=" in existing.lower():
            row["dimensions_mm"] = _strip_mass_tail(existing)
        if overwrite or not row.get("dimensions_mm"):
            row["dimensions_mm"] = summary
        elif isinstance(row.get("dimensions_mm"), str):
            row["dimensions_mm"] = _strip_mass_tail(str(row["dimensions_mm"]))
        # Machine-readable dims_mm dict for Equipment Register / Blender join
        dims: dict[str, float] = {}
        if props.get("width_mm") is not None:
            dims["w"] = float(props["width_mm"])
        if props.get("depth_mm") is not None:
            dims["d"] = float(props["depth_mm"])
        elif props.get("length_mm") is not None and props.get("od_mm") is None:
            dims["d"] = float(props["length_mm"])
        if props.get("height_mm") is not None:
            dims["h"] = float(props["height_mm"])
        elif props.get("length_mm") is not None and props.get("od_mm") is not None:
            dims["h"] = float(props["length_mm"])
        if props.get("od_mm") is not None:
            dims["od"] = float(props["od_mm"])
            dims["dia"] = float(props["od_mm"])
        if props.get("id_mm") is not None:
            dims["id"] = float(props["id_mm"])
        if props.get("thickness_mm") is not None:
            dims["t"] = float(props["thickness_mm"])
        if props.get("radius_mm") is not None:
            dims["r"] = float(props["radius_mm"])
        if dims and (overwrite or not isinstance(row.get("dims_mm"), dict)):
            row["dims_mm"] = dims

    row["physical"] = {
        k: props[k] for k in (
            "od_mm", "id_mm", "thickness_mm", "radius_mm", "length_mm",
            "width_mm", "height_mm", "depth_mm", "mass_kg", "material",
            "dimension_summary",
        ) if props.get(k) is not None
    }
    return dict(row)


def props_from_word(word: Mapping[str, Any]) -> dict[str, Any]:
    """Convenience: extract props from a moduleDecomposition word."""
    return extract_physical_props(word.get("modifier_characters") or [])


def props_to_blender_dim(props: Mapping[str, Any]) -> Optional[dict[str, Any]]:
    """Convert props → parse_dimension-compatible dict for resolved_dims_mm."""
    if not props:
        return None
    # Prefer box when LWH present — densify/box dims must not lose to a false OD.
    if props.get("width_mm") is not None and props.get("depth_mm") is not None:
        h = props.get("height_mm")
        if h is None:
            h = props.get("thickness_mm") or max(
                8.0, min(float(props["width_mm"]), float(props["depth_mm"])) * 0.5
            )
        out = {
            "kind": "box",
            "w_mm": float(props["width_mm"]),
            "d_mm": float(props["depth_mm"]),
            "h_mm": float(h),
        }
        if props.get("thickness_mm") is not None:
            out["thickness_mm"] = float(props["thickness_mm"])
        return out
    if props.get("od_mm"):
        out = {
            "kind": "cyl",
            "dia_mm": float(props["od_mm"]),
        }
        if props.get("length_mm") is not None:
            out["len_mm"] = float(props["length_mm"])
        elif props.get("height_mm") is not None:
            out["len_mm"] = float(props["height_mm"])
        if props.get("id_mm") is not None:
            out["id_mm"] = float(props["id_mm"])
        if props.get("thickness_mm") is not None:
            out["thickness_mm"] = float(props["thickness_mm"])
        return out
    # Fallback: re-parse dimension_summary through human parser → structured
    if props.get("dimension_summary"):
        nested = extract_physical_props(
            [{"kind": "dimension", "value": props["dimension_summary"]}]
        )
        nested.pop("dimension_summary", None)
        # Avoid infinite recursion — only use structured atoms, not summary again.
        nested.pop("provenance_bits", None)
        if nested.get("od_mm") or (nested.get("width_mm") and nested.get("depth_mm")):
            return props_to_blender_dim({**nested, "dimension_summary": None})
    return None


# PBR roles from material text — universal keyword map (not product-named).
# Order matters: more-specific patterns first (SiC before steel; carbon fibre
# before carbon steel; anodised Al before plain aluminium).
_MATERIAL_PBR: tuple[tuple[re.Pattern[str], tuple[float, float, float], float, float], ...] = (
    (re.compile(r"ndfeb|rare.?earth|permanent\s*magnet|\bmagnet\b", re.I),
     (0.15, 0.16, 0.18), 0.55, 0.35),
    (re.compile(r"electrical\s*steel|laminat|m400|silicon\s*steel", re.I),
     (0.55, 0.52, 0.42), 0.35, 0.45),
    # SiC power modules / die / MOSFET packages (dark polymer body).
    (re.compile(r"\bsic\b|silicon\s*carbide|power\s*module|mosfet\s*module", re.I),
     (0.06, 0.065, 0.075), 0.10, 0.42),
    # Ceramic DBC / AlN / Al2O3 substrate under PE die.
    (re.compile(r"\bdbc\b|aln\b|al2o3|ceramic\s*substrate|direct\s*bond", re.I),
     (0.82, 0.80, 0.74), 0.0, 0.22),
    (re.compile(r"copper|ofhc|etp\b|cu\b|busbar", re.I),
     (0.72, 0.45, 0.18), 0.85, 0.28),
    # Carbon fibre structure (must beat carbon steel).
    (re.compile(r"carbon\s*fibre|carbon\s*fiber|cfrp|cf\s*composite", re.I),
     (0.04, 0.042, 0.048), 0.22, 0.38),
    # Hard-anodised / black Al before generic aluminium.
    (re.compile(r"anodis|hard.?coat|black\s*alum|cast\s*alum", re.I),
     (0.12, 0.125, 0.135), 0.58, 0.42),
    (re.compile(r"aluminium|aluminum|6061|adc12|al\b", re.I),
     (0.72, 0.74, 0.76), 0.70, 0.32),
    (re.compile(r"316|stainless|\bss\b|duplex|cres", re.I),
     (0.62, 0.64, 0.66), 0.82, 0.30),
    (re.compile(r"carbon\s*steel|4340|gear\s*steel|100cr6|steel", re.I),
     (0.40, 0.42, 0.46), 0.80, 0.40),
    (re.compile(r"fr4|pcb|laminate", re.I),
     (0.12, 0.38, 0.18), 0.05, 0.55),
    (re.compile(r"frp|grp|hdpe|polymer|abs|polycarb|pa66|plastic|thermoplastic", re.I),
     (0.18, 0.18, 0.20), 0.05, 0.55),
    (re.compile(r"rubber|elastomer|fkm|epdm|seal", re.I),
     (0.08, 0.08, 0.09), 0.02, 0.70),
    (re.compile(r"glass|borosilicate|optic", re.I),
     (0.75, 0.82, 0.88), 0.05, 0.08),
)


def material_to_pbr(material: str) -> Optional[tuple[tuple[float, float, float], float, float]]:
    """Return (rgb, metallic, roughness) for a BoM material string, else None."""
    blob = str(material or "").strip()
    if not blob:
        return None
    for rx, rgb, met, rough in _MATERIAL_PBR:
        if rx.search(blob):
            return rgb, met, rough
    return None


def structured_modifiers_from_props(props: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Emit canonical structured modifiers for densify / emitter writeback."""
    out: list[dict[str, Any]] = []
    for key in ("od_mm", "id_mm", "thickness_mm", "length_mm", "width_mm",
                "height_mm", "depth_mm", "radius_mm"):
        if props.get(key) is not None:
            out.append({
                "kind": key,
                "value": str(round(float(props[key]), 3)),
                "unit": "mm",
                "provenance": "bom_physical_properties/v1",
            })
    if props.get("mass_kg") is not None:
        out.append({
            "kind": "mass",
            "value": f"{float(props['mass_kg']):g} kg",
            "unit": "kg",
            "provenance": "bom_physical_properties/v1",
        })
    if props.get("material"):
        out.append({
            "kind": "material",
            "value": str(props["material"]),
            "provenance": "bom_physical_properties/v1",
        })
    summary = geometry_summary(props)
    if summary:
        out.append({
            "kind": "dimension",
            "value": summary,
            "provenance": "bom_physical_properties/v1",
        })
    return out


def _selftest() -> None:
    # Structured modifiers
    props = extract_physical_props([
        {"kind": "od_mm", "value": "197.1"},
        {"kind": "id_mm", "value": "130.5"},
        {"kind": "length_mm", "value": "97.58"},
        {"kind": "material_grade", "value": "NdFeB rare-earth magnet"},
        {"kind": "mass", "value": "4.5 kg"},
    ])
    assert abs(props["od_mm"] - 197.1) < 1e-6
    assert abs(props["thickness_mm"] - (197.1 - 130.5) / 2) < 1e-3
    assert abs(props["radius_mm"] - 197.1 / 2) < 1e-6
    assert abs(props["mass_kg"] - 4.5) < 1e-6
    assert "NdFeB" in props["material"]

    # densify kv blob
    props2 = extract_physical_props([
        {"kind": "dimension", "value": "od_mm=54, thickness_mm=8, length_mm=58"},
    ])
    assert props2["od_mm"] == 54
    assert props2["thickness_mm"] == 8

    # Human OD/ID
    props3 = extract_physical_props([
        {"kind": "dimension", "value": "OD 197.1 / ID 130.5 mm"},
    ])
    assert props3["od_mm"] == 197.1 and props3["id_mm"] == 130.5

    # Project onto row — mass + material_grade path
    row: dict[str, Any] = {"tag": "T1", "requirement": "Rotor", "basis": "test"}
    project_onto_bom_row(row, props)
    assert row["mass_kg"] == 4.5
    assert "NdFeB" in row["material"]
    assert row["wall_mm"] > 0
    assert row["od_mm"] == 197.1
    assert isinstance(row.get("dims_mm"), dict)

    # Do not clobber take-off mass
    row2 = {"mass_kg": 99.0, "material": "carbon steel"}
    project_onto_bom_row(row2, props)
    assert row2["mass_kg"] == 99.0
    assert row2["material"] == "carbon steel"

    # Blender dim
    dim = props_to_blender_dim(props)
    assert dim and dim["kind"] == "cyl" and dim["dia_mm"] == 197.1

    box = props_to_blender_dim(extract_physical_props([
        {"kind": "dimension", "value": "115x140x28 mm"},
        {"kind": "material", "value": "FR4 PCB"},
    ]))
    assert box and box["kind"] == "box" and box["w_mm"] == 115

    pbr = material_to_pbr("aluminium alloy housing")
    assert pbr is not None and pbr[1] >= 0.5  # metallic

    # proveCatch (2026-08-05): race-kit materials must resolve distinctly.
    sic = material_to_pbr("SiC MOSFET power module")
    assert sic is not None and sic[0][0] < 0.15, sic  # dark package, not steel
    cf = material_to_pbr("carbon fibre structural spine")
    assert cf is not None and cf[0][0] < 0.10, cf
    dbc = material_to_pbr("AlN ceramic DBC substrate")
    assert dbc is not None and dbc[0][0] > 0.6, dbc  # light ceramic

    # proveCatch: mass modifier alone reaches the row
    w = {"modifier_characters": [{"kind": "mass", "value": "11.5 kg"},
                                 {"kind": "material_grade", "value": "electrical steel"}]}
    r = {}
    project_onto_bom_row(r, props_from_word(w))
    assert r["mass_kg"] == 11.5
    assert "electrical steel" in r["material"]

    # proveCatch: mass must NOT pollute dimensions_mm (Blender re-parse leftover)
    dirty = {
        "dimensions_mm": "140x119x18 mm · m=0.55 kg",
        "mass_kg": 0.55,
    }
    project_onto_bom_row(dirty, extract_physical_props([
        {"kind": "dimension", "value": "140x119x18 mm"},
        {"kind": "mass", "value": "0.55 kg"},
    ]))
    assert "m=" not in str(dirty["dimensions_mm"]).lower(), dirty["dimensions_mm"]
    assert dirty["mass_kg"] == 0.55
    assert "m=" not in geometry_summary(extract_physical_props([
        {"kind": "dimension", "value": "140x119x18 mm"},
        {"kind": "mass", "value": "0.55 kg"},
    ])).lower()

    print("bom_physical_properties._selftest OK")


if __name__ == "__main__":
    _selftest()
