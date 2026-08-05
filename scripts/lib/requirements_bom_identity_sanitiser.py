#!/usr/bin/env python3
"""requirements_bom_identity_sanitiser.py — UNIVERSAL buy-list identity hygiene.

Prevents false catalogue identities and interconnect-language spam from surviving
into state.requirementsBom on ANY product class. Pure function + optional CLI.

Rules (product-agnostic):
  1. Film-capacitor MPN must not sit on a busbar/fuse/cable line.
  2. Data-centre rack cooling brands (CoolIT, etc.) must not label motorsport /
     sealed-drive coolant manifolds.
  3. part == 'requirement stated' is rewritten from requirement head noun.
  4. DN8 / 2×6 mm² Cu boilerplate is stripped from non-interconnect lines.
  5. Duplicate blank tags get unique IDs.
  6. Optional motor/inverter package double-count: children matching known
     structural sub-tags of a principal rotating machine get SUB-COMPONENT £0
     when a principal motor line exists (morphology signal, not FE-only).

Usage:
  from scripts.lib.requirements_bom_identity_sanitiser import sanitise_requirements_bom
  n = sanitise_requirements_bom(state)  # mutates state in place

  python3 scripts/lib/requirements_bom_identity_sanitiser.py out/<run>
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

INTERCONNECT_RE = re.compile(r"\s*[·•]\s*2\s*[×x]\s*6\s*mm[²2]\s*Cu[^·]*", re.I)
DN8_RE = re.compile(r"\s*[·•,]?\s*DN8\b[^·]*", re.I)
SHIELDED_RE = re.compile(r"\s*[·•,]?\s*shielded pair[^·]*", re.I)
FILM_CAP_RE = re.compile(r"MKP1848|film\s*cap|polypropylene\s*cap", re.I)
RACK_COOL_RE = re.compile(r"CoolIT|Rack\s*Manifold|CDU\b|rack\s*cool", re.I)

MOTOR_SUB_HINTS = re.compile(
    r"casing|jacket|end\s*bell|laminat|winding|shaft|bearing|cover",
    re.I,
)


def _clean_requirement(text: str, keep_interconnect: bool) -> str:
    t = str(text or "").strip()
    if not keep_interconnect:
        t = INTERCONNECT_RE.sub("", t)
        t = DN8_RE.sub("", t)
        t = SHIELDED_RE.sub("", t)
    t = re.sub(r"\s{2,}", " ", t)
    t = re.sub(r"\s*[·•]\s*$", "", t)
    return t.strip(" ·,")


def _is_interconnect(req: str, part: str, tag: str) -> bool:
    blob = f"{req} {part} {tag}".lower()
    if "fuse" in blob:
        return False
    keys = (
        "cable", "harness", "busbar", "wire", "hose", "coolant port",
        "connector", "interlock pin", "shield drain", "phase bus",
    )
    mechanical = (
        "motor", "inverter", "housing", "casing", "stator", "rotor",
        "shaft", "bearing", "gear", "laminat", "winding", "sensor",
        "manifold", "jacket", "end bell", "pcb", "module stack",
    )
    return any(k in blob for k in keys) and not any(k in blob for k in mechanical)


def _head_noun(req: str) -> str:
    t = req.split("·")[0].strip()
    t = re.sub(r"\s+\d+.*$", "", t)
    return t.strip() or req[:60]


def sanitise_requirements_bom(state: dict[str, Any]) -> dict[str, Any]:
    """Mutate state['requirementsBom']; return stats."""
    req = state.get("requirementsBom")
    if not isinstance(req, list) or not req:
        return {"changed": 0, "n": 0}
    stats = {
        "changed": 0,
        "n": len(req),
        "cleared_false_mpn": 0,
        "cleared_rack_cool": 0,
        "fixed_part_name": 0,
        "stripped_spam": 0,
        "subcomponent_zero": 0,
        "tags_fixed": 0,
    }
    seen_tags: dict[str, bool] = {}
    has_principal_motor = any(
        isinstance(r, dict)
        and float(r.get("line_gbp") or 0) > 1000
        and re.search(r"ipmsm|motor.?generator|traction\s+motor", json.dumps(r), re.I)
        and r.get("status") != "SUB-COMPONENT"
        for r in req
    )

    for i, r in enumerate(req):
        if not isinstance(r, dict):
            continue
        changed = False
        tag = str(r.get("tag") or "").strip()
        part = str(r.get("part") or "").strip()
        requirement = str(r.get("requirement") or "").strip()

        if not tag or tag in ("—", "-", "–"):
            tag = f"AUTO-{i+1}"
            r["tag"] = tag
            stats["tags_fixed"] += 1
            changed = True
        if tag in seen_tags:
            tag = f"{tag}-d{i}"
            r["tag"] = tag
            stats["tags_fixed"] += 1
            changed = True
        seen_tags[tag] = True

        keep_ic = _is_interconnect(requirement, part, tag)
        cleaned = _clean_requirement(requirement, keep_interconnect=keep_ic)
        if cleaned != requirement:
            r["requirement"] = cleaned
            requirement = cleaned
            stats["stripped_spam"] += 1
            changed = True

        if part.lower() in ("requirement stated", "requirement", "") or part.lower().startswith(
            "requirement"
        ):
            r["part"] = _head_noun(requirement)
            part = r["part"]
            stats["fixed_part_name"] += 1
            changed = True

        # Film cap MPN on non-capacitor line
        if FILM_CAP_RE.search(part) and not re.search(r"capacitor|dc.?link|film", requirement, re.I):
            if re.search(r"busbar|fuse|cable|link", requirement, re.I) or re.search(
                r"busbar|fuse", part, re.I
            ):
                r["part"] = "Bespoke copper busbar / conductor — to drawing"
                r["status"] = "BESPOKE"
                r["basis"] = (
                    str(r.get("basis") or "")
                    + " · cleared false film-capacitor MPN on non-cap line (identity sanitiser)"
                ).strip(" ·")
                stats["cleared_false_mpn"] += 1
                changed = True

        # Rack cooling brand on cassette manifold
        if RACK_COOL_RE.search(part) or RACK_COOL_RE.search(requirement):
            if re.search(r"manifold|coolant", requirement + " " + part, re.I):
                r["part"] = "Bespoke coolant manifold (QD pair) — vendor TBD"
                r["status"] = "TBD"
                r["basis"] = (
                    "sealed-pack coolant manifold class — removed rack-CDU false identity (identity sanitiser)"
                )
                try:
                    r["unit_gbp"] = max(float(r.get("unit_gbp") or 0), 100.0)
                    r["line_gbp"] = float(r["unit_gbp"]) * float(r.get("qty") or 1)
                except (TypeError, ValueError):
                    pass
                stats["cleared_rack_cool"] += 1
                changed = True

        # Structural double-count under principal motor
        if (
            has_principal_motor
            and MOTOR_SUB_HINTS.search(requirement + " " + part)
            and float(r.get("line_gbp") or 0) > 500
            and not re.search(r"ipmsm|motor.?generator", requirement + " " + part, re.I)
        ):
            # only zero if looks like motor structure not inverter
            if not re.search(r"inverter|sic|pcb|controller", requirement + " " + part, re.I):
                r["status"] = "SUB-COMPONENT"
                r["unit_gbp"] = 0.0
                r["line_gbp"] = 0.0
                r["basis"] = (
                    "SUB-COMPONENT of principal motor package — cost rolled into principal (identity sanitiser)"
                )
                stats["subcomponent_zero"] += 1
                changed = True

        try:
            r["line_gbp"] = round(float(r.get("unit_gbp") or 0) * float(r.get("qty") or 1), 2)
        except (TypeError, ValueError):
            pass

        if changed:
            stats["changed"] += 1

    # Re-cascade costStack materials if present
    mat = sum(float(r.get("line_gbp") or 0) for r in req if isinstance(r, dict))
    cs = state.get("costStack")
    if isinstance(cs, dict) and mat > 0:
        ratios = cs.get("ratios_applied") or {}
        lab_f = float(ratios.get("assembly_labour_factor") or 0.18)
        oh_f = float(ratios.get("factory_overhead_factor") or 0.12)
        mar_f = float(ratios.get("manufacturer_margin_factor") or 0.28)
        ch_f = float(ratios.get("channel_markup_factor") or 0.08)
        lab = mat * lab_f
        oh = mat * oh_f
        cogs = mat + lab + oh
        margin = cogs * mar_f
        oem = cogs + margin
        chan = oem * ch_f
        cs.update(
            {
                "raw_materials_bom_gbp": round(mat, 2),
                "assembly_labour_gbp": round(lab, 2),
                "factory_overhead_gbp": round(oh, 2),
                "factory_cogs_gbp": round(cogs, 2),
                "manufacturer_margin_gbp": round(margin, 2),
                "oem_transfer_price_gbp": round(oem, 2),
                "channel_markup_gbp": round(chan, 2),
                "channel_list_price_gbp": round(oem + chan, 2),
                "installed_asp_gbp": round(oem + chan, 2),
            }
        )
        stats["materials_gbp"] = round(mat, 2)

    return stats


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: requirements_bom_identity_sanitiser.py <runDir>", file=sys.stderr)
        return 2
    twin = Path(sys.argv[1])
    sp = twin / "state.json"
    state = json.loads(sp.read_text())
    stats = sanitise_requirements_bom(state)
    sp.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(stats, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
