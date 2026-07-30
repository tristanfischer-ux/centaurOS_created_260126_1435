#!/usr/bin/env python3
"""Stamp FPK assembly explosion + first-principles physics into the live twin.

INTENT: Tristan HoT bar — every MCU/motor/TX cover, winding, magnet, gear, bearing
gets a BoM line with engineering basis (turns, C_dc, teeth, …). Seeds only;
FEA/dyno/supplier replace. Does NOT claim homologated.

Usage: python3 scripts/fe-front-stamp-fpk-parts-physics.py [outDir]
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from fpk_first_principles import (  # noqa: E402
    all_fpk_parts,
    bom_word,
    completeness_report,
    derive_physics,
    physics_quantity_writeback,
)

FRONT = ROOT / "out/formula-e-front-mgu-20260729-1432"
NOW = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")

MODULE_FOR_ASSEMBLY = {
    "mcu": "energy_conversion_transduction",
    "motor": "actuation_kinematics",
    "transmission": "actuation_kinematics",
    "cassette": "structure_containment",
}


def _load(p: Path) -> dict:
    return json.loads(p.read_text())


def _save(p: Path, data: object) -> None:
    p.write_text(json.dumps(data, indent=2) + "\n")


def _qty_nums(cq: dict) -> dict[str, float]:
    out: dict[str, float] = {}
    for k, v in (cq or {}).items():
        raw = v.get("value") if isinstance(v, dict) else v
        try:
            n = float(raw)
        except (TypeError, ValueError):
            continue
        if n == n and n > 0:
            out[k] = n
    return out


def _existing_ids(state: dict) -> set[str]:
    ids: set[str] = set()
    for m in ((state.get("moduleDecomposition") or {}).get("modules") or []):
        for sm in m.get("sub_modules") or []:
            for w in sm.get("words") or []:
                cid = str((w.get("content_character") or {}).get("character_id") or w.get("id") or "")
                if cid:
                    ids.add(cid)
    return ids


def _ensure_module_words(state: dict, module_key: str, words: list[dict]) -> int:
    modules = ((state.get("moduleDecomposition") or {}).get("modules")) or []
    target = None
    for m in modules:
        mid = str(m.get("module") or m.get("id") or "")
        if module_key in mid:
            target = m
            break
    if target is None and modules:
        target = modules[0]
    if target is None:
        return 0
    sms = target.get("sub_modules") or []
    if not sms:
        target["sub_modules"] = [{"sub_module": "fpk_assembly", "words": []}]
        sms = target["sub_modules"]
    sm = sms[0]
    have = {
        str((w.get("content_character") or {}).get("character_id") or w.get("id") or "")
        for w in (sm.get("words") or [])
    }
    added = 0
    for w in words:
        cid = str((w.get("content_character") or {}).get("character_id") or "")
        if cid in have:
            # Refresh sizing_basis if present
            for ew in sm["words"]:
                ecid = str((ew.get("content_character") or {}).get("character_id") or "")
                if ecid != cid:
                    continue
                mods = list(ew.get("modifier_characters") or [])
                kept = [m for m in mods if (m or {}).get("kind") not in ("sizing_basis", "form")]
                for m in w.get("modifier_characters") or []:
                    if (m or {}).get("kind") in ("sizing_basis", "form"):
                        kept.append(m)
                ew["modifier_characters"] = kept
                break
            continue
        sm.setdefault("words", []).append(w)
        have.add(cid)
        added += 1
    return added


def main() -> int:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else FRONT
    state_path = out / "state.json"
    state = _load(state_path)
    cq = _qty_nums(
        ((state.get("orchestratorContract") or {}).get("quantities"))
        or ((state.get("engineeringContract") or {}).get("quantities"))
        or {}
    )
    before = completeness_report(_existing_ids(state))
    phys = derive_physics(cq)
    wb = physics_quantity_writeback(phys)

    # Stamp quantities
    for key in ("orchestratorContract", "engineeringContract"):
        c = state.get(key)
        if not isinstance(c, dict):
            continue
        q = dict(c.get("quantities") or {})
        q.update(wb)
        c["quantities"] = q
        state[key] = c

    # Explode parts into modules
    by_asm: dict[str, list[dict]] = {"mcu": [], "motor": [], "transmission": [], "cassette": []}
    for asm, pid, name in all_fpk_parts():
        by_asm[asm].append(bom_word(pid, name, asm, phys))

    added = 0
    for asm, words in by_asm.items():
        added += _ensure_module_words(state, MODULE_FOR_ASSEMBLY[asm], words)

    # Also keep principal aliases refreshed
    for pid, name, asm in (
        ("sic_traction_inverter", "SiC Traction Inverter", "mcu"),
        ("traction_ipmsm_motor_generator", "Traction Ipmsm Motor Generator", "motor"),
        ("planetary_reduction_in_rotor", "Planetary Reduction In Rotor", "transmission"),
        ("mini_diff_in_rotor", "Mini Diff In Rotor", "transmission"),
        ("mgu_cold_plate", "Mgu Cold Plate", "mcu"),
    ):
        _ensure_module_words(
            state,
            MODULE_FOR_ASSEMBLY[asm],
            [bom_word(pid, name, asm, phys)],
        )

    after = completeness_report(_existing_ids(state))
    state["fpkFirstPrinciples"] = {
        "stamped_at": NOW,
        "physics": {
            "pole_pairs": phys.pole_pairs,
            "stator_slots": phys.stator_slots,
            "turns_per_phase": phys.turns_per_phase,
            "magnet_segments": phys.magnet_segments,
            "magnet_grade": phys.magnet_grade,
            "dc_link_capacitance_uf": phys.dc_link_capacitance_uf,
            "sun_teeth": phys.sun_teeth,
            "planet_teeth": phys.planet_teeth,
            "ring_teeth": phys.ring_teeth,
            "notes": list(phys.notes),
            "open_until": list(phys.open_until),
        },
        "completeness_before": before,
        "completeness_after": after,
        "parts_added": added,
        "source": "scripts/lib/fpk_first_principles.py",
    }

    # Markdown gap report for HoT review
    md = [
        "# FPK part completeness + first-principles seeds",
        "",
        f"**Stamped:** {NOW}",
        f"**Coverage:** {after['present']}/{after['total']} ({after['coverage_pct']}%)",
        "",
        "## Physics seeds (analytical — FEA/dyno replace)",
        "",
        f"- Stator: {phys.stator_slots} slots, {phys.pole_pairs} pole-pairs, "
        f"**{phys.turns_per_phase} turns/phase**, conductor Ø{phys.conductor_od_mm} mm, "
        f"Cu≈{phys.winding_copper_mass_kg} kg",
        f"- Magnets: {phys.magnet_segments} segments, {phys.magnet_grade}, "
        f"Br≈{phys.magnet_br_t} T, m≈{phys.magnet_mass_kg} kg — retention OPEN",
        f"- DC link: **{phys.dc_link_capacitance_uf} µF** "
        f"({phys.dc_link_cap_count}×{phys.dc_link_cap_each_uf} µF) @ f_sw={phys.switching_freq_hz:.0f} Hz",
        f"- Planetary: S/P/R = {phys.sun_teeth}/{phys.planet_teeth}/{phys.ring_teeth}, "
        f"m={phys.gear_module_mm} mm, oil≈{phys.oil_volume_ml} ml",
        f"- f_elec≈{phys.electrical_frequency_hz} Hz at {cq.get('mgu_base_speed_rpm', 19500)} rpm",
        "",
        "## Still OPEN by design",
        "",
    ]
    for o in phys.open_until:
        md.append(f"- {o}")
    if after["missing_parts"]:
        md += ["", "## Missing parts (should be zero after stamp)", ""]
        for m in after["missing_parts"]:
            md.append(f"- `{m['assembly']}` / {m['id']} — {m['name']}")
    (out / "JLR-FE-FRONT-FPK-PARTS-PHYSICS.md").write_text("\n".join(md) + "\n")

    _save(state_path, state)
    print(json.dumps({
        "ok": True,
        "added": added,
        "coverage_before_pct": before["coverage_pct"],
        "coverage_after_pct": after["coverage_pct"],
        "present": after["present"],
        "total": after["total"],
        "physics": state["fpkFirstPrinciples"]["physics"],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
