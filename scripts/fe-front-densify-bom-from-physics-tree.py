#!/usr/bin/env python3
"""INTENT: Close the bill-of-materials gap without inventing fake fasteners.

Reads the physics tree + concentric geometry + literature material claims and:
  1) Attaches dimension / material modifiers onto existing bill lines when missing
  2) Emits concept-complete lines for purchasable / makeable physics leaves
  3) Mirrors new lines into requirementsBom for Excel ledger pickup
  4) Stamps state.fpkBomDensify for Excel / council visibility

Never invents manufacturer part numbers. Never sets ship_ok.
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

try:
    from scripts.lib.fpk_physics_tree import MATERIALS
except ModuleNotFoundError:
    from fpk_physics_tree import MATERIALS  # type: ignore[no-redef]

TARGET_MIN_LINES = 120
TARGET_MAX_LINES = 200
DB_PATH_DEFAULT = Path.home() / ".forge-truth/forge-truth.db"

FASTENER_SKIP = re.compile(
    r"(bolt_set|bolt$|washer|nut_set|screw_set|fastener|dowel|clip_set|clamp_bolt|"
    r"retainer_bolt|bond_washer|spring_washer|sealing_washer|helicoil|keylocking_insert|"
    r"location_dowel|dowel_pin)",
    re.I,
)
GRANULAR_SKIP = re.compile(
    r"(^turn_[uvw]$|^conductor_strand_[uvw]$|gate_channel_|gate_ic_|desat_|isolator_|"
    r"isolated_dcdc_|sic_die_|sic_half_bridge_|dc_link_cap_\d|module_baseplate_\d)",
    re.I,
)
ROOT_SKIP = frozenset(
    {
        "front_fpk",
        "cassette_assembly",
        "traction_drive",
        "motor_generator_unit",
    }
)

ASSEMBLY_MODULE: dict[str, str] = {
    "cassette": "structure_containment",
    "mcu": "energy_conversion_transduction",
    "motor": "actuation_kinematics",
    "transmission": "actuation_kinematics",
}

CONTROL_ROUTE = re.compile(
    r"(control_mcu|can_fd|transceiver|isolation_barrier|buck_rail|resolver_excitation|"
    r"hv_lv_isolation)",
    re.I,
)
SENSING_ROUTE = re.compile(
    r"(ntc|pressure_sensor|voltage_sense|current_sense|tone_wheel|resolver_rotor|"
    r"motor_resolver|encoder)",
    re.I,
)
SAFETY_ROUTE = re.compile(r"(hvil|interlock)", re.I)
ENV_ROUTE = re.compile(r"(coolant_|oil_fluid|jacket_coolant|gear_oil)", re.I)


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def walk_words(obj: Any, out: list[dict[str, Any]]) -> None:
    if isinstance(obj, dict):
        if isinstance(obj.get("words"), list):
            for w in obj["words"]:
                if isinstance(w, dict):
                    out.append(w)
        for v in obj.values():
            walk_words(v, out)
    elif isinstance(obj, list):
        for i in obj:
            walk_words(i, out)


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (s or "").lower()).strip("_")


def covered_tokens_from_words(words: list[dict[str, Any]]) -> set[str]:
    covered: set[str] = set()
    for w in words:
        covered.add(norm(str(w.get("name_human") or w.get("name") or "")))
        cc = w.get("content_character") or {}
        covered.add(norm(str(cc.get("character_id") or "")))
        covered.add(norm(str(w.get("id") or "")))
    return {c for c in covered if c}


def is_covered(leaf_id: str, leaf_name: str, covered: set[str]) -> bool:
    for token in (norm(leaf_id), norm(leaf_name)):
        if not token:
            continue
        for c in covered:
            if token == c or token in c or c in token:
                return True
    return False


def has_kind(word: dict[str, Any], *kind_subs: str) -> bool:
    for m in word.get("modifier_characters") or []:
        if not isinstance(m, dict):
            continue
        kind = (m.get("kind") or "").lower()
        if any(sub in kind for sub in kind_subs):
            return True
    return False


def add_mod(word: dict[str, Any], kind: str, value: str, basis: str) -> None:
    mods = word.get("modifier_characters")
    if not isinstance(mods, list):
        mods = []
        word["modifier_characters"] = mods
    mods.append(
        {
            "kind": kind,
            "value": value,
            "basis": basis,
            "provenance": "fpk_bom_densify/v1",
        }
    )


def leaf_ids(tree_stamp: dict[str, Any]) -> list[dict[str, Any]]:
    idx = tree_stamp.get("part_index") or []
    if isinstance(idx, list) and idx:
        leaves = []
        for n in idx:
            if not isinstance(n, dict):
                continue
            if n.get("is_leaf") or n.get("leaf") or (n.get("children") in (None, [], {})):
                if n.get("id") or n.get("component_id") or n.get("name"):
                    leaves.append(n)
        if leaves:
            return leaves
    return []


def route_module(leaf: dict[str, Any]) -> str:
    lid = str(leaf.get("id") or "")
    assembly = str(leaf.get("assembly") or "cassette")
    if CONTROL_ROUTE.search(lid):
        return "control_compute_communication"
    if SENSING_ROUTE.search(lid):
        return "sensing_instrumentation"
    if SAFETY_ROUTE.search(lid):
        return "safety_protection"
    if ENV_ROUTE.search(lid):
        return "environmental_interface"
    return ASSEMBLY_MODULE.get(assembly, "structure_containment")


def should_add_leaf(leaf: dict[str, Any], covered: set[str]) -> bool:
    kind = str(leaf.get("kind") or "")
    if kind in ("assembly", "material", "process"):
        return False
    if kind not in ("part", "subpart", "fluid"):
        return False
    lid = str(leaf.get("id") or "")
    lname = str(leaf.get("name") or leaf.get("name_human") or "")
    if lid in ROOT_SKIP:
        return False
    if FASTENER_SKIP.search(lid) or FASTENER_SKIP.search(lname):
        return False
    if GRANULAR_SKIP.search(lid):
        return False
    if is_covered(lid, lname, covered):
        return False
    return True


def select_leaves_for_concept_lines(
    leaves: list[dict[str, Any]],
    covered: set[str],
    *,
    current_count: int,
    target_min: int = TARGET_MIN_LINES,
    target_max: int = TARGET_MAX_LINES,
) -> list[dict[str, Any]]:
    """Pick physics leaves to add until concept-complete band (120–200) is met."""
    candidates = [leaf for leaf in leaves if should_add_leaf(leaf, covered)]
    # Prefer top-level purchasable parts, then subparts / fluids.
    priority = {"part": 0, "subpart": 1, "fluid": 2}
    candidates.sort(
        key=lambda n: (
            priority.get(str(n.get("kind") or ""), 9),
            str(n.get("assembly") or ""),
            str(n.get("id") or ""),
        )
    )
    need = max(0, target_min - current_count)
    cap = max(0, target_max - current_count)
    if cap == 0:
        return []
    if need == 0 and current_count < target_max:
        # Already above floor — still allow up to cap for honest gaps.
        need = 0
    take = min(len(candidates), cap if need == 0 else max(need, min(cap, len(candidates))))
    return candidates[:take]


def load_literature_materials(db_path: Path) -> dict[str, str]:
    material_by_token: dict[str, str] = {}
    if not db_path.exists():
        return material_by_token
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        if "fpk_extracted_claims" in tables:
            cols = {r[1] for r in conn.execute("PRAGMA table_info(fpk_extracted_claims)").fetchall()}
            if "component_id" in cols:
                rows = conn.execute(
                    """
                    SELECT lower(component_id), COALESCE(material_grade, value_text)
                    FROM fpk_extracted_claims
                    WHERE (claim_kind LIKE '%material%' OR kind LIKE '%material%')
                      AND COALESCE(material_grade, value_text) IS NOT NULL
                      AND trim(COALESCE(material_grade, value_text)) != ''
                    LIMIT 800
                    """
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT lower(component_hint), value_text
                    FROM fpk_extracted_claims
                    WHERE kind LIKE '%material%'
                      AND value_text IS NOT NULL AND trim(value_text) != ''
                    LIMIT 500
                    """
                ).fetchall()
            for hint, val in rows:
                if hint and val:
                    material_by_token.setdefault(norm(hint), str(val)[:80])
        conn.close()
    except Exception:
        pass
    return material_by_token


def load_material_prices(db_path: Path) -> dict[str, dict[str, Any]]:
    """Load forge-truth material prices for honest concept pricing.

    INTENT: FPK densify rows are make-to-print concepts, so the workbook needs
    non-zero cost evidence without pretending an MPN exists. Material prices give
    the best available floor; missing DB rows fall back to explicit RFQ language.
    """
    prices: dict[str, dict[str, Any]] = {}
    if not db_path.exists():
        return prices
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        rows = conn.execute(
            """
            SELECT material, raw_gbp_per_kg, mfg_mult_low, mfg_mult_high, source, updated, origin
            FROM material_prices
            """
        ).fetchall()
        conn.close()
    except Exception:
        return prices
    for material, raw, low, high, source, updated, origin in rows:
        key = norm(str(material or ""))
        if not key:
            continue
        prices[key] = {
            "raw_gbp_per_kg": float(raw),
            "mfg_mult_low": float(low),
            "mfg_mult_high": float(high),
            "source": str(source or ""),
            "updated": str(updated or ""),
            "origin": str(origin or ""),
        }
    return prices


def material_price_key(leaf: dict[str, Any], material: str) -> str:
    text = f"{leaf.get('material_id') or ''} {material or ''} {leaf.get('name') or ''}".lower()
    if "egw" in text or "coolant" in text:
        return "egw_coolant_50"
    if "gear_oil" in text or "oil" in text:
        return "polymer_thermoplastic"
    if "ndfeb" in text or "magnet" in text:
        return "ndfeb_magnet"
    if "copper" in text or "cu_" in text or "ofhc" in text or "etp" in text:
        return "copper"
    if "electrical steel" in text or "lamination" in text:
        return "electrical_steel"
    if "steel" in text or "4340" in text or "100cr6" in text or "51crv4" in text:
        return "gear_steel"
    if "stainless" in text or "a2" in text:
        return "stainless_steel"
    if "aluminium" in text or "aluminum" in text or "6061" in text or "adc12" in text:
        return "aluminium"
    if "fkm" in text or "epdm" in text or "rubber" in text or "seal" in text:
        return "rubber_elastomer"
    if "pa66" in text or "fr4" in text or "polymer" in text or "laminate" in text or "eptfe" in text:
        return "polymer_thermoplastic"
    return ""


def pricing_role(leaf: dict[str, Any]) -> tuple[float, float, str]:
    """Return (concept_mass_proxy_kg, labour_floor_gbp, role_label)."""
    lid = norm(str(leaf.get("id") or ""))
    name = norm(str(leaf.get("name") or leaf.get("name_human") or ""))
    text = f"{lid} {name}"
    if re.search(r"mcu|transceiver|isolation|buck|sense|ntc|resistor|divider|frontend", text, re.I):
        return 0.08, 18.0, "low-volume traction electronics / sensor allowance"
    if re.search(r"coil|winding", text, re.I):
        return 0.75, 120.0, "formed copper winding subassembly allowance"
    if re.search(r"cold_plate|baseplate|channels?|cover|baffle|gallery", text, re.I):
        return 0.9, 180.0, "CNC-machined thermal plate/gallery allowance"
    if re.search(r"gear|pinion|spline|differential|pin_set|cross_pin|tone_wheel|sleeve|ring", text, re.I):
        return 0.55, 220.0, "case-hardened precision geartrain make-to-print allowance"
    if re.search(r"bearing", text, re.I):
        return 0.18, 65.0, "bearing/seating hardware allowance"
    if re.search(r"seal|breather|plug|shim|spacer|screen|retainer", text, re.I):
        return 0.08, 28.0, "small drivetrain hardware allowance"
    if re.search(r"oil|coolant|fluid|additive", text, re.I):
        return 1.0, 0.0, "fluid charge allowance"
    if re.search(r"magnet|retention", text, re.I):
        return 0.35, 95.0, "magnet retention / high-speed rotor hardware allowance"
    return 0.25, 75.0, "concept make-to-print allowance"


def price_for_leaf(
    leaf: dict[str, Any],
    material: str,
    material_prices: dict[str, dict[str, Any]],
) -> tuple[float, str, int, str]:
    """Return a low-confidence unit estimate plus an auditable basis string."""
    material_key = material_price_key(leaf, material)
    mass_proxy_kg, labour_floor_gbp, role_label = pricing_role(leaf)
    price_row = material_prices.get(material_key) if material_key else None
    if price_row:
        raw = float(price_row["raw_gbp_per_kg"])
        mult = (float(price_row["mfg_mult_low"]) + float(price_row["mfg_mult_high"])) / 2.0
        material_allowance = raw * mult * mass_proxy_kg
        unit = round(max(material_allowance + labour_floor_gbp, labour_floor_gbp or material_allowance), 2)
        basis = (
            f"forge-truth material_prices[{material_key}] raw £{raw:g}/kg × mfg mult {mult:.2g} "
            f"× concept mass proxy {mass_proxy_kg:g} kg + £{labour_floor_gbp:g} role floor "
            f"({role_label}); source={price_row.get('source')}; updated={price_row.get('updated')}"
        )
        return unit, basis, 5, "low — concept make-to-print estimate; replace with CAD mass + supplier RFQ"
    unit = round(max(labour_floor_gbp, 1.0), 2)
    basis = (
        f"concept role floor only ({role_label}); material='{material or 'OPEN TBD'}' has no "
        "forge-truth material_prices key — keep MPN TBD and refresh from supplier/RFQ"
    )
    return unit, basis, 5, "low — no material-price key; procurement/RFQ required"


def concentric_dim_hints(cg: dict[str, Any]) -> dict[str, str]:
    return {
        "motor_outer_casing": f"Ø{cg.get('housing_od_mm')} × L{cg.get('housing_len_mm')} mm",
        "traction_drive_housing": f"Ø{cg.get('housing_od_mm')} × L{cg.get('housing_len_mm')} mm",
        "stator_laminations": f"OD {cg.get('stator_od_mm')} / ID {cg.get('stator_id_mm')} mm",
        "hollow_rotor_barrel": f"OD {cg.get('rotor_od_mm')} / ID {cg.get('rotor_id_mm')} mm",
        "sun_gear": f"OD {cg.get('sun_od_mm')} mm",
        "planet_gears": f"{cg.get('planet_count')} × OD {cg.get('planet_od_mm')} mm",
        "ring_gear": f"ID {cg.get('ring_id_mm')} mm",
        "mini_diff_in_rotor": f"OD {cg.get('diff_od_mm')} mm",
        "mini_differential": f"OD {cg.get('diff_od_mm')} mm",
        "sic_traction_inverter": f"{cg.get('mcu_w_mm')} × {cg.get('mcu_d_mm')} × {cg.get('mcu_h_mm')} mm",
        "oem_inverter_control_board": f"{cg.get('mcu_w_mm')} × {cg.get('mcu_d_mm')} × {cg.get('mcu_h_mm')} mm",
        "mcu_cold_plate": f"{cg.get('mcu_w_mm')} × {cg.get('mcu_d_mm')} mm envelope",
        "mgu_cold_plate": f"{cg.get('mcu_w_mm')} × {cg.get('mcu_d_mm')} mm envelope",
    }


def role_materials() -> dict[str, tuple[str, str]]:
    return {
        "stator_laminations": ("electrical steel laminate (grade TBD)", "ESTIMATE_UNVALIDATED"),
        "permanent_magnet_set": ("NdFeB rare-earth magnet (grade TBD)", "ESTIMATE_UNVALIDATED"),
        "motor_outer_casing": ("aluminium alloy housing (grade TBD)", "ESTIMATE_UNVALIDATED"),
        "traction_drive_housing": ("aluminium alloy housing (grade TBD)", "ESTIMATE_UNVALIDATED"),
        "sun_gear": ("case-hardened gear steel (grade TBD)", "ESTIMATE_UNVALIDATED"),
        "planet_gears": ("case-hardened gear steel (grade TBD)", "ESTIMATE_UNVALIDATED"),
        "ring_gear": ("case-hardened gear steel (grade TBD)", "ESTIMATE_UNVALIDATED"),
        "gear_oil_charge": ("PAO gear oil (viscosity grade TBD)", "ESTIMATE_UNVALIDATED"),
        "mgu_cold_plate": ("aluminium cold plate (alloy TBD)", "ESTIMATE_UNVALIDATED"),
        "mcu_cold_plate": ("aluminium cold plate (alloy TBD)", "ESTIMATE_UNVALIDATED"),
        "oil_fluid": ("synthetic gear oil 75W-90 class (grade TBD)", "ESTIMATE_UNVALIDATED"),
        "coolant_fluid": ("EGW 50/50 coolant (spec TBD)", "ESTIMATE_UNVALIDATED"),
        "jacket_coolant": ("EGW 50/50 coolant (spec TBD)", "ESTIMATE_UNVALIDATED"),
    }


def material_for_leaf(
    leaf: dict[str, Any],
    literature: dict[str, str],
    roles: dict[str, tuple[str, str]],
) -> tuple[str, str]:
    lid = norm(str(leaf.get("id") or ""))
    for tok, val in literature.items():
        if tok and (tok in lid or lid in tok):
            return val, "literature_claim"
    mid = str(leaf.get("material_id") or "")
    if mid and mid in MATERIALS:
        return str(MATERIALS[mid].get("name") or mid), "fpk_physics_tree MATERIALS seed"
    for key, (mat, basis) in roles.items():
        if key in lid:
            return mat, basis
    return "grade TBD — OPEN", "OPEN TBD"


def dimension_for_leaf(
    leaf: dict[str, Any],
    dim_hints: dict[str, str],
) -> tuple[str, str]:
    lid = norm(str(leaf.get("id") or ""))
    for key, dim in dim_hints.items():
        if key in lid or lid in key:
            if dim and "None" not in dim:
                return dim, "fpkConcentricGeometry analytical nest"
    physics = leaf.get("physics") or {}
    if isinstance(physics, dict):
        parts: list[str] = []
        for pk in ("od_mm", "id_mm", "length_mm", "width_mm", "height_mm", "thickness_mm"):
            val = physics.get(pk)
            if val is not None:
                parts.append(f"{pk}={val}")
        if parts:
            return ", ".join(parts), "physics_tree leaf"
    return "dimensions OPEN TBD", "OPEN TBD"


def title_case_words(s: str) -> str:
    return " ".join(w[:1].upper() + w[1:] for w in s.split())


def build_concept_word(
    leaf: dict[str, Any],
    dim: str,
    dim_basis: str,
    mat: str,
    mat_basis: str,
) -> dict[str, Any]:
    lid = str(leaf.get("id") or "fpk_leaf")
    lname = str(leaf.get("name") or leaf.get("name_human") or title_case_words(lid.replace("_", " ")))
    assembly = str(leaf.get("assembly") or "cassette")
    mods: list[dict[str, Any]] = [
        {"kind": "quantity", "value": "×1"},
        {
            "kind": "form",
            "value": f"{lname} — physics-tree concept ({assembly} assembly)",
        },
        {"kind": "part_number", "value": "TBD (detailed design)"},
        {
            "kind": "lifecycle",
            "value": "Concept design — catalogue part + exact MPN confirmed at detailed design",
        },
        {
            "kind": "installation",
            "value": f"FPK concentric cassette / {assembly}",
        },
    ]
    if dim and dim != "dimensions OPEN TBD":
        mods.append(
            {
                "kind": "dimension",
                "value": dim,
                "basis": dim_basis,
                "provenance": "fpk_bom_densify/v1",
            }
        )
    mods.append(
        {
            "kind": "material_grade",
            "value": mat,
            "basis": mat_basis,
            "provenance": "fpk_bom_densify/v1",
        }
    )
    return {
        "id": f"{lid}_word",
        "name_human": lname,
        "content_character": {
            "character_id": lid,
            "name_human": lname,
            "function_radical_primary": None,
            "function_radical_secondary": None,
            "material_radical_primary": None,
            "material_radical_secondary": None,
        },
        "modifier_characters": mods,
        "provenance": "fpk_bom_densify/v1",
    }


def build_requirements_bom_row(
    leaf: dict[str, Any],
    word: dict[str, Any],
    tag: str,
    material_prices: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    lname = str(word.get("name_human") or "")
    dim = ""
    mat = ""
    for m in word.get("modifier_characters") or []:
        if not isinstance(m, dict):
            continue
        kind = (m.get("kind") or "").lower()
        if "dimension" in kind:
            dim = str(m.get("value") or "")
        if "material" in kind:
            mat = str(m.get("value") or "")
    unit_gbp, price_basis, estimate_class, confidence = price_for_leaf(leaf, mat, material_prices)
    return {
        "tag": tag,
        "equipment_tag": tag,
        "requirement": lname,
        "name": lname,
        "name_human": lname,
        "character_id": str(leaf.get("id") or ""),
        "part": "TBD (detailed design)",
        "status": "NOT FOUND",
        "not_found_status": "FABRICATED",
        "qty": 1,
        "unit_gbp": unit_gbp,
        "line_gbp": unit_gbp,
        "mass_kg": None,
        "material": mat,
        "module": route_module(leaf),
        "estimate_class": estimate_class,
        "confidence": confidence,
        "basis": (
            "fpk physics-tree densify · concept line · no fake MPN · "
            f"material={mat or 'OPEN TBD'} · price={price_basis}"
        ),
        "dims_mm": dim or None,
        "provenance": "fpk_bom_densify/v1",
    }


def next_densify_tag(existing: list[dict[str, Any]]) -> str:
    max_n = 0
    for row in existing:
        if not isinstance(row, dict):
            continue
        tag = str(row.get("tag") or "")
        m = re.match(r"FPK-D-(\d+)$", tag)
        if m:
            max_n = max(max_n, int(m.group(1)))
    return f"FPK-D-{max_n + 1:03d}"


def append_word_to_module(state: dict[str, Any], module_id: str, word: dict[str, Any]) -> None:
    md = state.setdefault("moduleDecomposition", {})
    modules = md.setdefault("modules", [])
    target = None
    for m in modules:
        if isinstance(m, dict) and m.get("module") == module_id:
            target = m
            break
    if target is None:
        target = {"module": module_id, "module_brief": title_case_words(module_id.replace("_", " ")), "sub_modules": []}
        modules.append(target)
    sub_modules = target.setdefault("sub_modules", [])
    if not sub_modules:
        sub_modules.append(
            {
                "id": f"{module_id}__fpk_densify",
                "name_human": target.get("module_brief") or module_id,
                "words": [],
            }
        )
    bucket = sub_modules[0]
    words = bucket.setdefault("words", [])
    words.append(word)


def repair_existing_densify_rows(
    rb_rows: list[dict[str, Any]],
    leaves: list[dict[str, Any]],
    material_prices: dict[str, dict[str, Any]],
    literature: dict[str, str],
    roles: dict[str, tuple[str, str]],
) -> int:
    """Reprice already-emitted FPK-D rows so old twins meet the same contract."""
    leaves_by_id = {str(leaf.get("id") or leaf.get("component_id") or ""): leaf for leaf in leaves}
    repaired = 0
    for row in rb_rows:
        if not isinstance(row, dict):
            continue
        if row.get("provenance") != "fpk_bom_densify/v1" and not str(row.get("tag") or "").startswith("FPK-D-"):
            continue
        leaf = leaves_by_id.get(str(row.get("character_id") or ""))
        if not leaf:
            continue
        material, mat_basis = material_for_leaf(leaf, literature, roles)
        unit_gbp, price_basis, estimate_class, confidence = price_for_leaf(leaf, material, material_prices)
        qty = float(row.get("qty") or 1) or 1.0
        before = (row.get("unit_gbp"), row.get("line_gbp"), row.get("material"))
        row["part"] = "TBD (detailed design)"
        row["status"] = "NOT FOUND"
        row["not_found_status"] = "FABRICATED"
        row["qty"] = qty
        row["unit_gbp"] = unit_gbp
        row["line_gbp"] = round(unit_gbp * qty, 2)
        row["material"] = material
        row["estimate_class"] = estimate_class
        row["confidence"] = confidence
        row["basis"] = (
            "fpk physics-tree densify · concept line · no fake MPN · "
            f"material={material or 'OPEN TBD'} ({mat_basis}) · price={price_basis}"
        )
        row["provenance"] = "fpk_bom_densify/v1"
        after = (row.get("unit_gbp"), row.get("line_gbp"), row.get("material"))
        if before != after:
            repaired += 1
    return repaired


def attach_modifiers_to_existing(
    words: list[dict[str, Any]],
    dim_hints: dict[str, str],
    literature: dict[str, str],
    roles: dict[str, tuple[str, str]],
) -> tuple[int, int]:
    dims_added = 0
    mats_added = 0
    name_index = {norm(str(w.get("name_human") or w.get("name") or "")): w for w in words}
    for key, word in name_index.items():
        if not key:
            continue
        for hint_key, dim in dim_hints.items():
            if hint_key in key or key in hint_key:
                if dim and not has_kind(word, "dimension", "dimensions"):
                    add_mod(word, "dimension", dim, "fpkConcentricGeometry analytical nest")
                    dims_added += 1
                break
        for mat_key, (mat, basis) in roles.items():
            if mat_key in key or key in mat_key:
                if not has_kind(word, "material", "material_grade"):
                    lit = None
                    for tok, val in literature.items():
                        if tok and (tok in key or key in tok):
                            lit = val
                            break
                    add_mod(
                        word,
                        "material_grade",
                        lit or mat,
                        "literature_claim" if lit else basis,
                    )
                    mats_added += 1
                break
    return dims_added, mats_added


def densify_state(state: dict[str, Any], db_path: Path) -> dict[str, Any]:
    words: list[dict[str, Any]] = []
    walk_words(state.get("moduleDecomposition") or {}, words)
    bill_before = len(words)

    cg = state.get("fpkConcentricGeometry") or {}
    dim_hints = concentric_dim_hints(cg)
    literature = load_literature_materials(db_path)
    material_prices = load_material_prices(db_path)
    roles = role_materials()
    dims_added, mats_added = attach_modifiers_to_existing(words, dim_hints, literature, roles)

    covered = covered_tokens_from_words(words)
    tree = state.get("fpkPhysicsTree") or {}
    leaves = leaf_ids(tree)
    to_add = select_leaves_for_concept_lines(
        leaves,
        covered,
        current_count=bill_before,
    )

    rb = state.get("requirementsBom")
    rb_rows: list[dict[str, Any]]
    if isinstance(rb, list):
        rb_rows = rb
        rb_before = len(rb_rows)
    elif isinstance(rb, dict):
        rb_rows = list(rb.get("rows") or [])
        rb_before = len(rb_rows)
    else:
        rb_rows = []
        rb_before = 0
        state["requirementsBom"] = rb_rows

    added_schedule: list[dict[str, str]] = []
    for leaf in to_add:
        dim, dim_basis = dimension_for_leaf(leaf, dim_hints)
        mat, mat_basis = material_for_leaf(leaf, literature, roles)
        word = build_concept_word(leaf, dim, dim_basis, mat, mat_basis)
        module_id = route_module(leaf)
        append_word_to_module(state, module_id, word)
        tag = next_densify_tag(rb_rows)
        rb_rows.append(build_requirements_bom_row(leaf, word, tag, material_prices))
        lid = str(leaf.get("id") or "")
        covered.add(norm(lid))
        covered.add(norm(str(word.get("name_human") or "")))
        added_schedule.append(
            {
                "id": lid,
                "name": str(word.get("name_human") or ""),
                "module": module_id,
                "tag": tag,
            }
        )

    priced_repaired = repair_existing_densify_rows(
        rb_rows,
        leaves,
        material_prices,
        literature,
        roles,
    )

    words.clear()
    walk_words(state.get("moduleDecomposition") or {}, words)
    bill_after = len(words)

    missing: list[dict[str, str]] = []
    for leaf in leaves:
        lid = str(leaf.get("id") or leaf.get("component_id") or leaf.get("name") or "")
        lname = str(leaf.get("name") or leaf.get("name_human") or lid)
        if should_add_leaf(leaf, covered):
            missing.append({"id": lid, "name": lname})

    return {
        "schema": "fpk-bom-densify/v1",
        "stamped_at": utc_now(),
        "source": "scripts/fe-front-densify-bom-from-physics-tree.py",
        "bill_lines_before": bill_before,
        "bill_lines_after": bill_after,
        "concept_lines_added": len(added_schedule),
        "priced_rows_repaired": priced_repaired,
        "requirements_bom_before": rb_before,
        "requirements_bom_after": len(rb_rows),
        "dimension_modifiers_added": dims_added,
        "material_modifiers_added": mats_added,
        "physics_leaves_seen": len(leaves),
        "physics_leaves_without_bill_line": len(missing),
        "concept_schedule": added_schedule,
        "gap_sample": missing[:80],
        "target_concept_lines": f"{TARGET_MIN_LINES}-{TARGET_MAX_LINES}",
        "excel_pickup": (
            "New lines are written to moduleDecomposition.words AND state.requirementsBom; "
            "build-excel-export.py tab_bom() reads requirementsBom directly."
        ),
        "note": (
            "Densify attaches honest dimensions/materials, emits physics-tree concept lines, "
            "and mirrors them into requirementsBom. No fake fastener inflation or manufacturer MPNs."
        ),
        "ship_ok": False,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--twin", type=Path, default=ROOT / "out/formula-e-front-mgu-20260729-1432")
    ap.add_argument("--db", type=Path, default=DB_PATH_DEFAULT)
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()

    if args.selftest:
        return run_selftest()

    twin: Path = args.twin
    state_path = twin / "state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    stamp = densify_state(state, args.db)
    state["fpkBomDensify"] = stamp
    state_path.write_text(json.dumps(state, indent=2, default=str) + "\n", encoding="utf-8")

    report = twin / "_autonomous" / "bom-densify-report.json"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(stamp, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(stamp, indent=2))
    return 0


def run_selftest() -> int:
    state: dict[str, Any] = {
        "moduleDecomposition": {
            "modules": [
                {
                    "module": "actuation_kinematics",
                    "sub_modules": [
                        {
                            "id": "actuation_kinematics__motor",
                            "words": [
                                {
                                    "id": "motor_bearings_word",
                                    "name_human": "Motor Bearings",
                                    "content_character": {"character_id": "motor_bearings"},
                                    "modifier_characters": [],
                                }
                            ],
                        }
                    ],
                }
            ]
        },
        "requirementsBom": [
            {
                "tag": "X-1",
                "requirement": "Motor Bearings",
                "qty": 1,
                "line_gbp": 1,
            }
        ],
        "fpkConcentricGeometry": {"housing_od_mm": 200, "housing_len_mm": 300},
        "fpkPhysicsTree": {
            "part_index": [
                {"id": "motor_bearings", "name": "Motor Bearings", "kind": "part", "assembly": "motor"},
                {"id": "housing_bolt_set", "name": "Housing bolt set", "kind": "part", "assembly": "cassette"},
                {
                    "id": "input_seal",
                    "name": "Transmission input seal",
                    "kind": "subpart",
                    "assembly": "transmission",
                    "material_id": "FKM_seal",
                },
                {
                    "id": "oil_fluid",
                    "name": "Gear oil fluid",
                    "kind": "fluid",
                    "assembly": "transmission",
                    "material_id": "gear_oil_75W90",
                },
            ]
        },
    }
    stamp = densify_state(state, Path("/nonexistent/db"))
    assert stamp["bill_lines_before"] == 1, stamp
    assert stamp["bill_lines_after"] >= 3, stamp
    assert stamp["concept_lines_added"] >= 2, stamp
    assert stamp["concept_lines_added"] < 20, stamp
    for row in state["requirementsBom"]:
        part = str(row.get("part") or "")
        assert "Mouser" not in part and "fake" not in part.lower()
        if str(row.get("tag") or "").startswith("FPK-D-"):
            assert float(row.get("unit_gbp") or 0) > 0, row
            assert float(row.get("line_gbp") or 0) > 0, row
            assert row.get("material"), row
            assert row.get("estimate_class") == 5, row
            assert str(row.get("confidence") or "").lower().startswith("low"), row
            assert row.get("not_found_status") == "FABRICATED", row
    added_ids = {x["id"] for x in stamp["concept_schedule"]}
    assert "housing_bolt_set" not in added_ids
    assert "input_seal" in added_ids
    words: list[dict[str, Any]] = []
    walk_words(state["moduleDecomposition"], words)
    assert any(w.get("name_human") == "Transmission input seal" for w in words)
    for w in words:
        for m in w.get("modifier_characters") or []:
            if m.get("kind") == "part_number":
                assert "TBD" in str(m.get("value") or "")
    print("fe-front-densify-bom-from-physics-tree selftest OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
