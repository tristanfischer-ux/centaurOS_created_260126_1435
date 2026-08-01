#!/usr/bin/env python3
"""Seat traction-pack BoM principals into the parts-manifest from u_se_td_* meshes.

INTENT (2026-07-29 FE MGU / 0811 SIGHT): `_place_traction_drive_pack_layout` draws
motor/shaft/gear/SiC story meshes but skips BoM zone placement — so parts-manifest
kept only shell skin (3 rows) and drawing_set_coherence floored GA to ~11%. Mirror
instrument_spine_manifest: join story meshes → BoM principals by noun RE so GA/SLD
coverage can clear ≥80% without flipping isInstrumentDevice.

FLOW: build_universal_scene.write_parts_manifest
   → seat_traction_principals_in_manifest(rows, state, mesh_bbox_by_prefix)
   → parts-ledger GA/blender credit on seated principals

Usage:
  from traction_spine_manifest import seat_traction_principals_in_manifest
  python3 scripts/lib/traction_spine_manifest.py --selftest
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any, Optional

# (mesh-prefix, part-noun RE, preferred name when several BoM twins match)
_TRACTION_SEATS: list[tuple[str, str, str]] = [
    # INTENT (2026-07-29 GA≠Blender): pack base + low housing rail are the
    # structural hull the axial train sits on — seat them so GA can outline the
    # same pack boundary Blender draws (not a brief envelope with floating boxes).
    (
        "u_se_td_pack_base",
        r"pack\s*base|base\s*plate|mounting\s*plate|skid\s*base",
        "Traction Pack Base",
    ),
    (
        "u_se_td_pack_housing",
        r"traction\s*drive\s*housing|drive\s*housing|pack\s*housing|"
        r"mgu\s*housing",
        "Traction Drive Housing",
    ),
    (
        "u_se_td_motor_housing",
        r"traction\s*ipmsm|ipmsm\s*motor|motor[-\s]?generator|"
        r"traction\s*motor(?!\s*generator)",
        "Traction Ipmsm Motor Generator",
    ),
    (
        "u_se_td_sic_inverter",
        r"sic\s*traction\s*inverter|traction\s*inverter|"
        r"(?<!desat\s)(?<!gate\s)\binverter\b",
        "SiC Traction Inverter",
    ),
    (
        "u_se_td_mcu_shelf",
        r"mcu\s*shelf|inverter\s*shelf|upper\s*shelf",
        "Mcu Shelf",
    ),
    (
        "u_se_td_gearbox",
        r"planetary\s*reduction|reduction\s*gear|gearbox|gear\s*stage|planetary",
        "Planetary Reduction In Rotor",
    ),
    (
        "u_se_td_hollow_rotor",
        r"hollow\s*rotor|rotor\s*barrel|pm\s*rotor",
        "Hollow Rotor",
    ),
    (
        "u_se_td_hv_connector",
        r"hv\s*(?:dc\s*)?connector|hv\s*dc\s*connector",
        "Hv DC Connector",
    ),
    (
        "u_se_td_coolant",
        r"mgu\s*cold\s*plate|cold\s*plate|coolant\s*manifold",
        "Mgu Cold Plate",
    ),
    # INTENT (2026-07-29 JLR front FPK): master tags X-133/X-138/X-139 were on
    # the ledger but never seated — GA/Renders coverage floored at 6/9.
    (
        "u_se_td_diff_bulge",
        r"mini[_\s-]?diff|open\s*bevel\s*differential|bevel\s*differential|\bdifferential\b",
        "Mini Diff In Rotor",
    ),
    (
        "u_se_td_post_diff_",
        r"post[_\s-]?diff|final[_\s-]?drive|helical\s*(?:pair|stage|reduction)|"
        r"ratio[_\s-]?after[_\s-]?diff",
        "Post Diff Final Drive Helical",
    ),
    (
        "u_se_td_diff_nest",
        r"mini[_\s-]?diff|diff\s*nest|\bdifferential\b",
        "Mini Diff In Rotor",
    ),
    (
        "u_se_td_phase_bus",
        r"ac\s*phase\s*busbar|phase\s*busbar|busbar\s*pierce|phase\s*cable",
        "Ac Phase Busbar Pierce",
    ),
    (
        "u_se_td_mount_ear",
        r"mounting\s*ear|mount\s*ear|ear\s*set",
        "Mounting Ear Set",
    ),
    (
        "u_se_td_hv_shield",
        r"hv\s*shield\s*cover|shield\s*cover|emi\s*shield",
        "Hv Shield Cover",
    ),
    # INTENT (2026-07-29 FFF ontology): seat physics-forced sub-components so
    # GA/drawings credit ring/magnets/covers/flanges — not only assembly blobs.
    (
        "u_se_td_ring_gear",
        r"ring\s*gear|annulus\s*gear|fixed\s*ring",
        "Ring Gear",
    ),
    (
        "u_se_td_magnet",
        r"permanent\s*magnet|magnet\s*set|pm\s*segment",
        "Permanent Magnet Set",
    ),
    (
        "u_se_td_halfshaft_flange",
        r"halfshaft|output\s*flange|flange\s*pair",
        "Halfshaft Output Flange Pair",
    ),
    (
        "u_se_td_cassette_cover",
        r"cassette\s*cover|pack\s*cover|drive\s*cover",
        "Cassette Cover",
    ),
    (
        "u_se_td_gate_drive_pcb",
        r"gate\s*driv|gate.?drive\s*board",
        "Gate Driver Board",
    ),
    (
        "u_se_td_control_pcb",
        r"oem\s*inverter\s*control|control\s*board|inverter\s*control",
        "Oem Inverter Control Board",
    ),
    (
        "u_se_td_sun_gear",
        r"\bsun\s*gear\b",
        "Sun Gear",
    ),
    (
        "u_se_td_planet_",
        r"planet\s*gear|pinion\s*set",
        "Planet Gears",
    ),
]


# INTENT (2026-07-31 Tristan): GA was drawing every traction seat as a box because
# the seater always emitted shape="box" from the world AABB. Motor / rotor / ring /
# sun / planet / diff are cylinders about the pack X-axis in Blender — stamp
# horizontal_cylinder + dia/len so draw_ga can show END-VIEW circles (SIDE elev).
_TRACTION_CYLINDER_PREFIXES: tuple[str, ...] = (
    "u_se_td_motor_housing",
    "u_se_td_hollow_rotor",
    "u_se_td_stator_ring",
    "u_se_td_stator_hint",
    "u_se_td_ring_gear",
    "u_se_td_sun_gear",
    "u_se_td_planet_",
    "u_se_td_gearbox",
    "u_se_td_diff_bulge",
    "u_se_td_diff_nest",
    "u_se_td_post_diff_",
    "u_se_td_halfshaft_flange",
    "u_se_td_magnet",
)


def _is_traction_cylinder_prefix(mesh_pref: str) -> bool:
    nm = mesh_pref or ""
    return any(nm == p or nm.startswith(p) for p in _TRACTION_CYLINDER_PREFIXES)


def _dims_for_traction_seat(
    mesh_pref: str, bb: tuple[float, float, float, float, float, float]
) -> tuple[str, dict[str, Any]]:
    """Return (shape, dims_mm) for a seated traction principal.

    DECISION: Keep w/d/h as the faithful world AABB so GA plan/front projections
    stay identity-locked to Blender. For axial cylinders also emit dia + len +
    axis=x so the SIDE elevation can draw an end-view circle (Y×Z ≈ dia×dia).
    """
    x0, x1, y0, y1, z0, z1 = bb
    w = round(max(x1 - x0, 1.0), 1)
    d = round(max(y1 - y0, 1.0), 1)
    h = round(max(z1 - z0, 1.0), 1)
    if not _is_traction_cylinder_prefix(mesh_pref):
        return "box", {"w": w, "d": d, "h": h}
    # Pack axis is +X (axial motor|gear|inverter train). Diameter = radial extent.
    dia = round(max(d, h, 1.0), 1)
    axial = round(max(w, 1.0), 1)
    return "horizontal_cylinder", {
        "w": w,
        "d": d,
        "h": h,
        "dia": dia,
        "len": axial,
        "axis": "x",
    }


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(name or "").lower()).strip()


def _slug(name: str) -> str:
    return "u_" + re.sub(r"[^a-z0-9]+", "_", str(name).lower()).strip("_")[:40]


def _bom_rows(state: Optional[dict]) -> list[dict]:
    if not isinstance(state, dict):
        return []
    raw = state.get("requirementsBom")
    if isinstance(raw, list):
        return [r for r in raw if isinstance(r, dict)]
    if isinstance(raw, dict):
        rows = raw.get("rows") or []
        return [r for r in rows if isinstance(r, dict)]
    rows = state.get("requirements_bom_rows") or []
    return [r for r in rows if isinstance(r, dict)]


def _parts_as_bom_rows(parts: Optional[list]) -> list[dict]:
    """INTENT (2026-07-29 0846 SIGHT): blender-bg spawns BEFORE requirementsBom
    lands on state.json — seating then saw meshes but zero BoM rows. Physical
    Part objects ARE available at write_parts_manifest time; project them into
    the same shape _bom_rows returns so noun joins still fire.
    """
    out: list[dict] = []
    if not parts:
        return out
    for p in parts:
        if isinstance(p, dict):
            nm = str(p.get("requirement") or p.get("name") or "").strip()
            if not nm:
                continue
            out.append({
                "tag": str(p.get("tag") or p.get("equipment_tag") or ""),
                "requirement": nm,
                "name": nm,
                "module": str(p.get("module") or p.get("module_id") or ""),
                "qty": int(p.get("qty") or 1),
                "status": str(p.get("status") or ""),
            })
            continue
        nm = str(getattr(p, "name", "") or "").strip()
        if not nm:
            continue
        out.append({
            "tag": str(getattr(p, "tag", "") or ""),
            "requirement": nm,
            "name": nm,
            "module": str(getattr(p, "module_id", "") or getattr(p, "region_key", "") or ""),
            "qty": int(getattr(p, "qty", 1) or 1),
            "status": "",
        })
    return out


def _pick_bom_match(cands: list[dict], preferred: str) -> Optional[dict]:
    if not cands:
        return None
    pref_n = _norm(preferred)
    for c in cands:
        nm = _norm(str(c.get("requirement") or c.get("name") or ""))
        if nm == pref_n or pref_n in nm or nm in pref_n:
            return c
    # Prefer the longer/richer name among twins (Ipmsm Motor Generator > Traction Motor).
    return sorted(
        cands,
        key=lambda c: len(str(c.get("requirement") or c.get("name") or "")),
        reverse=True,
    )[0]


def _tag_map_from_ledger(state: Optional[dict]) -> dict[str, str]:
    """name_norm → real ISA tag from parts-ledger.json when BoM is absent on state.

    INTENT (2026-07-29 0846): blender-bg races ahead of requirementsBom, so seats
    used slug tags (`u_sic_traction_inverter`) while the ledger kept INV-1 / X-116
    — GA/SLD coverage join failed. Ledger equipment tags are the authoritative
    identity once the BoM assembler has run.
    """
    out: dict[str, str] = {}
    if not isinstance(state, dict):
        return out
    # Prefer an explicit out_dir hint; else walk common chain artefact locations.
    candidates: list[Path] = []
    for key in ("_out_dir", "out_dir", "run_dir"):
        raw = state.get(key)
        if raw:
            candidates.append(Path(str(raw)) / "parts-ledger.json")
    # Also try cwd-relative out/… if the caller passed nothing.
    try:
        here = Path.cwd()
        for p in here.glob("out/*/parts-ledger.json"):
            candidates.append(p)
    except Exception:
        pass
    for path in candidates:
        if not path.is_file():
            continue
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        for e in doc.get("equipment") or []:
            if not isinstance(e, dict):
                continue
            tag = str(e.get("tag") or "").strip()
            nm = _norm(str(e.get("name") or e.get("requirement") or "").split("·")[0])
            if tag and not tag.startswith("u_") and tag != "—" and nm:
                out.setdefault(nm, tag)
        if out:
            break
    return out


# INTENT (2026-07-29): when BoM/ledger tags are absent, preferred seat names still
# mint stable ISA-shaped tags so GA/SLD join never lands on `u_*` slugs.
_PREFERRED_ISA_TAGS: dict[str, str] = {
    _norm("Traction Ipmsm Motor Generator"): "X-116",
    _norm("SiC Traction Inverter"): "INV-1",
    _norm("Reduction Gear Stage"): "X-117",
    _norm("Planetary Reduction In Rotor"): "X-117",
    _norm("Mgu Cold Plate"): "X-121",
    _norm("Hv DC Connector"): "X-110",
    _norm("Traction Drive Housing"): "X-103",
    _norm("Traction Pack Base"): "X-104",
    _norm("Open Bevel Differential"): "X-133",
    _norm("Mini Diff In Rotor"): "X-133",
    _norm("Hv Shield Cover"): "X-138",
    _norm("Mounting Ear Set"): "X-139",
    _norm("Ac Phase Busbar Pierce"): "X-105",
}


def _is_slug_tag(tag: str) -> bool:
    """True for generated u_* / bare equipment-id tags — not ISA (INV-1, X-116)."""
    t = (tag or "").strip()
    if not t or t == "—":
        return True
    if t.startswith("u_"):
        return True
    if re.fullmatch(r"[A-Z]+-\d{1,4}", t):
        return False
    return bool(re.fullmatch(r"[a-z0-9_]{6,}", t))


def _resolve_equipment_tag(
    pick: dict,
    name: str,
    catalog: list[dict],
    ledger_tags: dict[str, str],
) -> str:
    """Prefer ISA preferred tags, then non-slug BoM/ledger tags, else slug.

    INTENT: A prior seat that wrote u_* into the ledger must not poison the next
    seat — GA/SLD coverage joins on INV-1 / X-116 from requirementsBom.
    """
    nm = _norm(name)
    preferred = _PREFERRED_ISA_TAGS.get(nm)
    tag = str(pick.get("tag") or pick.get("equipment_tag") or "").strip()
    if tag and not _is_slug_tag(tag):
        return tag
    ledger = ledger_tags.get(nm, "")
    if ledger and not _is_slug_tag(ledger):
        return ledger
    for r in catalog:
        rnm = _norm(str(r.get("requirement") or r.get("name") or "").split("·")[0])
        if rnm == nm or nm in rnm or rnm in nm:
            rt = str(r.get("tag") or "").strip()
            if rt and not _is_slug_tag(rt):
                return rt
    if preferred:
        return preferred
    if tag and tag != "—":
        return tag
    if ledger:
        return ledger
    return _slug(name)


def _bbox_from_prefix(
    mesh_bbox_by_prefix: Optional[dict[str, tuple]],
    prefix: str,
) -> Optional[tuple[float, float, float, float, float, float]]:
    if not mesh_bbox_by_prefix:
        return None
    # Exact, then any key starting with prefix (coolant_in / coolant_out).
    if prefix in mesh_bbox_by_prefix:
        return mesh_bbox_by_prefix[prefix]  # type: ignore[return-value]
    for k, bb in mesh_bbox_by_prefix.items():
        if str(k).startswith(prefix) and bb and len(bb) == 6:
            return bb  # type: ignore[return-value]
    return None


def seat_traction_principals_in_manifest(
    rows: list[dict],
    state: Optional[dict],
    mesh_bbox_by_prefix: Optional[dict[str, Any]] = None,
    parts: Optional[list] = None,
) -> int:
    """Seat missing traction principals from u_se_td_* mesh bboxes. Returns seat count.

    No-op when state is not a traction pack (noun signal on product_class / part blob)
    AND no u_se_td_* meshes are present. Never invents geometry — refuses a seat when
    no mesh bbox resolves. When requirementsBom is absent (blender-bg race), falls
    back to physical `parts` and finally to the preferred display name.
    """
    if not isinstance(rows, list):
        return 0
    try:
        _lib = Path(__file__).resolve().parent
        if str(_lib) not in sys.path:
            sys.path.insert(0, str(_lib))
        import instrument_form_grammar as ifg  # type: ignore
    except Exception:
        ifg = None  # type: ignore
    pc = ""
    blob = ""
    bom = _bom_rows(state)
    part_rows = _parts_as_bom_rows(parts)
    if isinstance(state, dict):
        pc = str(
            (state.get("parsedBrief") or {}).get("product_class")
            or (state.get("orchestratorContract") or {}).get("product_class")
            or (state.get("moduleDecomposition") or {}).get("product_class")
            or "",
        )
        blob = " ".join(
            str(r.get("requirement") or r.get("name") or "")
            for r in (bom or part_rows)[:80]
        )
    n_mesh = 0
    if mesh_bbox_by_prefix:
        n_mesh = sum(
            1 for k in mesh_bbox_by_prefix
            if str(k).startswith("u_se_td_")
        )
    is_traction = False
    if ifg is not None and hasattr(ifg, "is_traction_drive_pack_form"):
        is_traction = bool(
            ifg.is_traction_drive_pack_form(product_class=pc, part_blob=blob)
        )
    elif re.search(r"\bmgu\b|traction|ipmsm|powertrain", pc, re.I):
        is_traction = True
    # GOTCHA (0846): blender-bg can run with empty BoM + thin class signal; story
    # meshes are the authoritative "this is a traction pack" proof at seat time.
    if not is_traction and n_mesh >= 3:
        is_traction = True
    if not is_traction:
        print(
            f"[traction-spine] skip seat: not traction (pc={pc!r} meshes={n_mesh} "
            f"bom={len(bom)} parts={len(part_rows)})",
            flush=True,
        )
        return 0

    have_names = {_norm(str(r.get("name") or "")) for r in rows}
    have_tags = {str(r.get("tag") or "") for r in rows}
    # Prefer full BoM; fall back to physical parts when blender raced ahead of BoM.
    catalog = bom if bom else part_rows
    # Merge ledger tags so empty-BoM seats still get INV-1 / X-116 identities.
    ledger_tags = _tag_map_from_ledger(state)
    for r in catalog:
        nm = _norm(str(r.get("requirement") or r.get("name") or "").split("·")[0])
        tg = str(r.get("tag") or "").strip()
        if nm and tg and not tg.startswith("u_") and tg != "—":
            ledger_tags.setdefault(nm, tg)
    seated = 0
    skipped_no_mesh = 0
    for mesh_pref, part_rx, preferred in _TRACTION_SEATS:
        bb = _bbox_from_prefix(mesh_bbox_by_prefix, mesh_pref)
        if bb is None:
            skipped_no_mesh += 1
            continue
        rx = re.compile(part_rx, re.I)
        cands = [
            r for r in catalog
            if r.get("status") != "SUB-COMPONENT"
            and rx.search(str(r.get("requirement") or r.get("name") or ""))
        ]
        pick = _pick_bom_match(cands, preferred)
        if pick is None:
            # Mesh is real — emit under the preferred engineering name so GA/SLD
            # coverage is not floored by a BoM race (geometry_source stamps honesty).
            # Prefer ISA tags (INV-1 / X-116) over u_* slugs when ledger is empty.
            pref_tag = (
                ledger_tags.get(_norm(preferred))
                or _PREFERRED_ISA_TAGS.get(_norm(preferred))
                or _slug(preferred)
            )
            pick = {
                "requirement": preferred,
                "name": preferred,
                "tag": pref_tag,
                "module": "energy_conversion_transduction",
                "qty": 1,
            }
        name = str(pick.get("requirement") or pick.get("name") or "").strip()
        tag = _resolve_equipment_tag(pick, name, catalog, ledger_tags)
        if _norm(name) in have_names or (tag and tag in have_tags):
            continue
        x0, x1, y0, y1, z0, z1 = bb
        shape, dims_mm = _dims_for_traction_seat(mesh_pref, bb)
        row = {
            "tag": tag,
            "equipment_tag": tag,
            "name": name,
            "module": str(pick.get("module") or "energy_conversion_transduction"),
            "shape": shape,
            "qty": int(pick.get("qty") or 1),
            "region_rank": 50,
            "pos_mm": [
                round((x0 + x1) / 2.0, 1),
                round((y0 + y1) / 2.0, 1),
                round((z0 + z1) / 2.0, 1),
            ],
            "dims_mm": dims_mm,
            "geometry_source": "traction_drive_story_mesh",
            "signature_family": "traction_pack",
            "entity_type": "bom_component",
        }
        rows.append(row)
        have_names.add(_norm(name))
        if tag:
            have_tags.add(tag)
        seated += 1
    print(
        f"[traction-spine] seated={seated} meshes={n_mesh} bom={len(bom)} "
        f"parts_fallback={len(part_rows) if not bom else 0} "
        f"no_mesh_skips={skipped_no_mesh}",
        flush=True,
    )
    return seated


def collect_traction_mesh_bboxes_mm() -> dict[str, tuple[float, float, float, float, float, float]]:
    """Read live Blender u_se_td_* mesh world bboxes in mm (empty outside Blender)."""
    out: dict[str, tuple[float, float, float, float, float, float]] = {}
    try:
        import bpy  # type: ignore
        import mathutils as mu  # type: ignore
    except Exception:
        return out
    for obj in bpy.data.objects:
        if getattr(obj, "type", None) != "MESH":
            continue
        nm = obj.name or ""
        if not nm.startswith("u_se_td_"):
            continue
        bb = [obj.matrix_world @ mu.Vector(c) for c in obj.bound_box]
        xs = [v.x * 1000.0 for v in bb]
        ys = [v.y * 1000.0 for v in bb]
        zs = [v.z * 1000.0 for v in bb]
        out[nm] = (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))
        # Also index by stem without _mesh suffix for prefix joins.
        stem = nm
        if stem.endswith("_mesh"):
            stem = stem[: -len("_mesh")]
        out.setdefault(stem, out[nm])
    return out


def _selftest() -> None:
    bad = 0
    state = {
        "parsedBrief": {"product_class": "formula_e_rear_mgu"},
        "requirementsBom": [
            {"tag": "X-116", "requirement": "Traction Ipmsm Motor Generator"},
            {"tag": "X-124", "requirement": "Traction Motor"},
            {"tag": "INV-1", "requirement": "SiC Traction Inverter"},
            {"tag": "X-117", "requirement": "Reduction Gear Stage"},
            {"tag": "X-121", "requirement": "Mgu Cold Plate"},
            {"tag": "X-105", "requirement": "Phase Cable Set"},
        ],
    }
    meshes = {
        "u_se_td_pack_base": (-120.0, 180.0, -60.0, 60.0, 0.0, 18.0),
        "u_se_td_pack_housing": (-100.0, 160.0, -25.0, 25.0, 16.0, 50.0),
        "u_se_td_motor_housing": (-100.0, 20.0, -40.0, 40.0, 20.0, 160.0),
        "u_se_td_sic_inverter": (40.0, 160.0, -50.0, 50.0, 30.0, 110.0),
        "u_se_td_gearbox": (-20.0, 60.0, -30.0, 30.0, 40.0, 140.0),
        "u_se_td_coolant_in": (80.0, 100.0, 40.0, 60.0, 100.0, 120.0),
    }
    rows: list[dict] = []
    n = seat_traction_principals_in_manifest(rows, state, mesh_bbox_by_prefix=meshes)
    names = {str(r.get("name")) for r in rows}
    if n < 5:
        print(f"  FAIL seat count {n} < 5 (base+housing+motor+inverter+gear)")
        bad += 1
    for need in ("Traction Pack Base", "Traction Drive Housing",
                 "Traction Ipmsm Motor Generator", "SiC Traction Inverter",
                 "Mgu Cold Plate"):
        if need not in names:
            print(f"  FAIL missing seated principal {need!r}")
            bad += 1
    if "Planetary Reduction In Rotor" not in names and "Reduction Gear Stage" not in names:
        print(f"  FAIL missing seated planetary/reduction gear (got {sorted(names)})")
        bad += 1
    tags = {str(r.get("tag")) for r in rows}
    if "X-103" not in tags:
        print(f"  FAIL Traction Drive Housing must seat as X-103 (got {sorted(tags)})")
        bad += 1
    # Twin Traction Motor must NOT also seat (prefer richer IPMSM name).
    if "Traction Motor" in names:
        print("  FAIL Traction Motor twin should not seat alongside IPMSM principal")
        bad += 1
    # Non-traction class must be a no-op (and no traction meshes).
    n2 = seat_traction_principals_in_manifest(
        [],
        {"parsedBrief": {"product_class": "colorimeter"}},
        mesh_bbox_by_prefix={},
    )
    if n2 != 0:
        print(f"  FAIL colorimeter must not seat traction principals (got {n2})")
        bad += 1
    # Phase cable has no mesh → never invent.
    if any("Phase Cable" in str(r.get("name")) for r in rows):
        print("  FAIL must not invent Phase Cable Set without a mesh bbox")
        bad += 1
    # GOTCHA (0846): empty requirementsBom + physical parts fallback must still seat.
    rows_fb: list[dict] = [{"tag": "X-103", "name": "Traction Drive Housing"}]
    n_fb = seat_traction_principals_in_manifest(
        rows_fb,
        {"orchestratorContract": {"product_class": "formula_e_rear_mgu"}},
        mesh_bbox_by_prefix=meshes,
        parts=[
            {"name": "Traction Ipmsm Motor Generator", "tag": "X-116"},
            {"name": "SiC Traction Inverter", "tag": "INV-1"},
            {"name": "Reduction Gear Stage", "tag": "X-117"},
        ],
    )
    if n_fb < 3:
        print(f"  FAIL parts-fallback seat count {n_fb} < 3")
        bad += 1
    # Empty BoM + empty parts + meshes → preferred-name seats (blender race).
    rows_pref: list[dict] = []
    n_pref = seat_traction_principals_in_manifest(
        rows_pref,
        {"orchestratorContract": {"product_class": "formula_e_rear_mgu"}},
        mesh_bbox_by_prefix=meshes,
        parts=[],
    )
    if n_pref < 3:
        print(f"  FAIL preferred-name seat count {n_pref} < 3 with meshes only")
        bad += 1
    tags_pref = {str(r.get("tag")) for r in rows_pref}
    for need_tag in ("X-116", "INV-1", "X-117"):
        if need_tag not in tags_pref:
            print(
                f"  FAIL preferred-name seat missing ISA tag {need_tag} "
                f"(got {sorted(tags_pref)}) — must not mint u_* slugs"
            )
            bad += 1
    # Tag identity: parts-fallback must keep real ISA tags (not u_ slugs).
    tags_fb = {str(r.get("tag")) for r in rows_fb}
    for need_tag in ("X-116", "INV-1", "X-117"):
        if need_tag not in tags_fb:
            print(f"  FAIL parts-fallback missing real tag {need_tag} (got {sorted(tags_fb)})")
            bad += 1
    # Slug ledger must not poison preferred ISA tags.
    rows_poison: list[dict] = []
    n_poison = seat_traction_principals_in_manifest(
        rows_poison,
        {
            "orchestratorContract": {"product_class": "formula_e_rear_mgu"},
            "_out_dir": "/tmp/nonexistent-traction-ledger",
        },
        mesh_bbox_by_prefix=meshes,
        parts=[
            {"name": "Traction Ipmsm Motor Generator", "tag": "u_mgu_rear_ipmsm"},
            {"name": "SiC Traction Inverter", "tag": "u_sic_inverter"},
            {"name": "Reduction Gear Stage", "tag": "u_gear"},
        ],
    )
    tags_poison = {str(r.get("tag")) for r in rows_poison}
    if n_poison < 3:
        print(f"  FAIL slug-poison seat count {n_poison} < 3")
        bad += 1
    for need_tag in ("X-116", "INV-1", "X-117"):
        if need_tag not in tags_poison:
            print(
                f"  FAIL slug parts must yield preferred ISA {need_tag} "
                f"(got {sorted(tags_poison)})"
            )
            bad += 1
    # proveCatch (2026-07-31): motor/gear seats must carry dia so GA can draw circles.
    by_name = {str(r.get("name")): r for r in rows}
    motor = by_name.get("Traction Ipmsm Motor Generator") or {}
    md = motor.get("dims_mm") or {}
    if motor.get("shape") != "horizontal_cylinder" or "dia" not in md:
        print(
            f"  FAIL motor must be horizontal_cylinder with dia "
            f"(shape={motor.get('shape')!r} dims={md})"
        )
        bad += 1
    else:
        # motor bbox Y=80 Z=140 → dia=140; axial X=120
        if float(md.get("dia") or 0) < 100:
            print(f"  FAIL motor dia too small: {md}")
            bad += 1
        if str(md.get("axis") or "") != "x":
            print(f"  FAIL motor axis must be x (got {md.get('axis')!r})")
            bad += 1
    inv = by_name.get("SiC Traction Inverter") or {}
    if inv.get("shape") != "box" or "dia" in (inv.get("dims_mm") or {}):
        print(f"  FAIL inverter must stay a box without dia (got {inv})")
        bad += 1
    if bad:
        print(f"traction_spine_manifest selftest: {bad} FAIL(s)")
        sys.exit(1)
    print("traction_spine_manifest selftest: OK")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
    else:
        print("usage: python3 scripts/lib/traction_spine_manifest.py --selftest")
        sys.exit(2)
