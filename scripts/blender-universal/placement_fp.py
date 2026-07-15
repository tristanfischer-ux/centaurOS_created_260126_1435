#!/usr/bin/env python3
"""placement_fp.py — shared GA ↔ Blender placement fingerprint.

INTENT: Codema (plant plan ≠ Blender plan) and Powerwall (GA plant-style top ≠
cutaway hero) both shipped because drawings and renders were not proven to share
the same parts-manifest generation. A SHA of sorted (tag, x, y, z) cells is the
universal QC token — GA SVG embeds it; the gate compares it to the manifest.
"""
from __future__ import annotations

import hashlib
import re
from typing import Any, Iterable, Optional


_SKIN_RE = re.compile(
    r"enclosure|cabinet|housing|\bdoor\b|panel|insulation|liner|"
    r"gasket|\bseal\b|bracket|mount|cover|lid|skin|chassis|frame|"
    r"warning\s+label|signage|label",
    re.I,
)


def _row_tag_pos_name(row: Any) -> Optional[tuple[str, float, float, float, str]]:
    """Normalise a parts-manifest dict OR a GAPart-like object → (tag,x,y,z,name)."""
    if isinstance(row, dict):
        tag = str(row.get("equipment_tag") or row.get("tag") or "").strip()
        name = str(row.get("name") or "")
        pos = row.get("pos_mm")
        if not (tag and isinstance(pos, (list, tuple)) and len(pos) >= 3):
            return None
        try:
            x, y, z = float(pos[0]), float(pos[1]), float(pos[2])
        except (TypeError, ValueError):
            return None
        return tag, x, y, z, name
    # GAPart dataclass / duck type
    tag = str(getattr(row, "tag", "") or "").strip()
    name = str(getattr(row, "name", "") or "")
    if not tag:
        return None
    try:
        x = float(getattr(row, "cx"))
        y = float(getattr(row, "cy"))
        z = (float(getattr(row, "z0")) + float(getattr(row, "z1"))) / 2.0
    except (TypeError, ValueError, AttributeError):
        return None
    return tag, x, y, z, name


def placement_fingerprint(parts: Iterable[Any], cell_mm: float = 5.0) -> str:
    """SHA1[:16] of sorted non-skin (tag, qx, qy, qz) cells from a parts list.

    cell_mm quantises so sub-millimetre float jitter never breaks the match.
    Skin/enclosure rows are skipped (they are the boundary, not the layout).
    """
    cells: list[str] = []
    for row in parts or []:
        parsed = _row_tag_pos_name(row)
        if parsed is None:
            continue
        tag, x, y, z, name = parsed
        if _SKIN_RE.search(name):
            continue
        qx = int(round(x / cell_mm))
        qy = int(round(y / cell_mm))
        qz = int(round(z / cell_mm))
        cells.append(f"{tag}:{qx}:{qy}:{qz}")
    cells.sort()
    raw = "|".join(cells).encode("utf-8")
    return hashlib.sha1(raw).hexdigest()[:16]


def extract_svg_placement_fp(svg_text: str) -> Optional[str]:
    """Read data-placement-fp from a drawing SVG root, or None when absent."""
    m = re.search(r'<svg\b[^>]*\bdata-placement-fp="([0-9a-f]{16})"', svg_text, re.I)
    return m.group(1).lower() if m else None


def embed_svg_placement_fp(svg_text: str, fp: str) -> str:
    """Stamp data-placement-fp onto the root <svg> (idempotent replace/insert)."""
    if not fp or not svg_text:
        return svg_text
    fp = str(fp).lower()
    if re.search(r'\bdata-placement-fp="[0-9a-f]{16}"', svg_text, re.I):
        return re.sub(
            r'\bdata-placement-fp="[0-9a-f]{16}"',
            f'data-placement-fp="{fp}"',
            svg_text,
            count=1,
            flags=re.I,
        )
    return svg_text.replace("<svg ", f'<svg data-placement-fp="{fp}" ', 1)


def is_na_by_design(svg_text: str) -> bool:
    """True when the sheet honestly declares NOT APPLICABLE (dry/electrical product)."""
    return bool(svg_text) and ("NA-BY-DESIGN" in svg_text or "NOT APPLICABLE" in svg_text)


def load_manifest_placement_fp(out_dir: str) -> Optional[str]:
    """Read placement_fp from parts-manifest.json, computing it if the field is absent."""
    import json
    import os
    path = os.path.join(out_dir, "parts-manifest.json")
    if not os.path.exists(path):
        return None
    try:
        doc = json.load(open(path))
    except Exception:  # noqa: BLE001
        return None
    if doc.get("placement_fp"):
        return str(doc["placement_fp"]).lower()
    parts = [p for p in (doc.get("parts") or []) if isinstance(p, dict)]
    if len(parts) < 3:
        return None
    return placement_fingerprint(parts)


# Equipment-tag token used for cross-drawing content coherence (G16).
# Matches GA/P&ID labels like TK-001, X-118, BMS-101 — not IP-54 / NEMA codes.
_EQUIP_TAG_RE = re.compile(r"\b([A-Z]{1,4}-\d{2,4}[A-Za-z]?)\b")


def extract_equipment_tags(svg_text: str) -> set[str]:
    """All equipment-tag-shaped tokens in an SVG (for phantom / cross-sheet checks)."""
    if not svg_text:
        return set()
    return set(_EQUIP_TAG_RE.findall(svg_text))


def manifest_equipment_tags(parts: Iterable[Any]) -> set[str]:
    """Equipment tags declared on the settled parts-manifest."""
    out: set[str] = set()
    for row in parts or []:
        if isinstance(row, dict):
            tag = str(row.get("equipment_tag") or row.get("tag") or "").strip()
        else:
            tag = str(getattr(row, "tag", "") or "").strip()
        if tag and _EQUIP_TAG_RE.fullmatch(tag):
            out.add(tag)
    return out


def phantom_equipment_tags(svg_text: str, manifest_tags: set[str]) -> set[str]:
    """Tags on a drawing that share a manifest letter-prefix but are not in the manifest.

    INTENT: a stamped fingerprint can be backfilled onto a STALE SVG; phantom tags
    prove the sheet's content is from a different generation than the settled BoM.
    Prefix-gated so ratings like IP-54 never false-fire.
    """
    if not manifest_tags:
        return set()
    prefixes = {t.split("-", 1)[0] for t in manifest_tags}
    found = extract_equipment_tags(svg_text)
    return {
        t for t in found
        if t.split("-", 1)[0] in prefixes and t not in manifest_tags
    }

