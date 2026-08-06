#!/usr/bin/env python3
"""Stamp residual manufacturer-adversarial fixes on the benchtop bioreactor twin.

Universal patterns where possible; product numbers stay twin data.
Does NOT set ship_ok=true. Does NOT invent MPNs for open holds.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TWIN = ROOT / "out/organoid-9drive-r11-allfixes"


def main() -> int:
    twin = Path(sys.argv[1]) if len(sys.argv) > 1 else TWIN
    st_path = twin / "state.json"
    st = json.loads(st_path.read_text(encoding="utf-8"))
    q = st.setdefault("orchestratorContract", {}).setdefault("quantities", {})
    notes: list[str] = []

    # P4 — achieved culture temp as band-held set-point (not "≥" success)
    for dst, src in (
        ("culture_thermal_setpoint_achieved_c", "culture_temperature_c"),
        ("culture_temperature_setpoint_achieved_c", "culture_temperature_c"),
        ("closed_loop_culture_temp_c", "culture_temperature_c"),
    ):
        raw = q.get(src) if isinstance(q.get(src), dict) else None
        if raw and raw.get("value") is not None:
            q[dst] = {
                **(q.get(dst) if isinstance(q.get(dst), dict) else {}),
                "value": raw["value"],
                "unit": raw.get("unit") or "°C",
                "family": "temperature",
                "basis": "band_setpoint",
                "scope": "system",
                "source": "tool:control-systems:pid-tuning",
                "source_detail": (
                    f"Closed-loop culture set-point held at {raw['value']} °C "
                    f"(±{q.get('temperature_stability_k', {}).get('value', 0.2)} K "
                    "predicted stability) — over-temperature is a FAIL mode, not "
                    "a 'meet or exceed' success"
                ),
                "condition": "band around set-point; not a lower-bound performance metric",
            }
            notes.append(f"temp_band:{dst}")

    # P6 — electronics junction derating narrative
    ej = q.get("electronics_junction_temp_c")
    if isinstance(ej, dict) and ej.get("value") is not None:
        ej["source_detail"] = (
            f"Screened junction ~{ej['value']} °C under thermal-envelope ladder. "
            "Derate for lab ambient 25–30 °C and sealed enclosure; not a continuous "
            "rating proof. Concept thermal hold — measure on first articles."
        )
        ej["condition"] = "screening; ambient derating open"
        notes.append("junction_derating_note")

    # P8 — instrument utilisation (not plant 8000 h/yr) if present
    for key in list(q.keys()):
        if "util" in key.lower() or "hours_per_year" in key.lower() or key.endswith("_h_yr"):
            raw = q.get(key)
            if isinstance(raw, dict):
                try:
                    v = float(raw.get("value"))
                except (TypeError, ValueError):
                    continue
                if v >= 4000:
                    raw["value"] = 2000
                    raw["source"] = "decision:MFR-ADV-2026-08-06"
                    raw["source_detail"] = (
                        "Instrument utilisation restamped to 2000 h/yr concept "
                        f"(was {v:g}) — not a plant 8000 h/yr year-round duty"
                    )
                    notes.append(f"util:{key}={v}->2000")

    # Drivers dict if present
    for dkey in ("drivers", "inputs"):
        drivers = st.get(dkey)
        if not isinstance(drivers, dict):
            continue
        for k, v in list(drivers.items()):
            if "8000" in str(v) or (
                isinstance(v, (int, float)) and float(v) >= 4000 and "hour" in k.lower()
            ):
                drivers[k] = 2000 if isinstance(v, (int, float)) else "2000 h/yr instrument concept"
                notes.append(f"driver:{k}")

    # B10 — power tree honesty note
    st["powerTreeHonesty"] = {
        "schema": "anvil.power_tree_honesty/1",
        "peak_instrument_w": 35,
        "external_adapter_w": 60,
        "dc_dc_board_label_w": 60,
        "note": (
            "External 60 W adapter feeds the instrument; DC-DC board is rated for "
            "the same class as headroom, not a second 60 W continuous load. One "
            "power tree: wall adapter → EMC → DC-DC → rails. Peak instrument load "
            "≈ 35 W concept."
        ),
    }
    notes.append("power_tree_honesty")

    # F2 — MCU hold explicit
    bom = st.get("requirementsBom") or []
    mcu_pinned = False
    for row in bom:
        if not isinstance(row, dict):
            continue
        name = str(row.get("requirement") or row.get("name") or "")
        if re_search_mcu(name):
            part = str(row.get("part") or row.get("mpn") or "")
            if "TBD" in part.upper() or not part.strip():
                row["part"] = (
                    "TBD — MCU family freeze (candidate class: STM32G0/G4 or equal "
                    "lab instrument MCU); not pinned pending board spin"
                )
                row["status"] = row.get("status") or "TBD"
                row["not_found_status"] = "SCOPE-DOCUMENTED"
                notes.append(f"mcu_hold:{row.get('tag')}")
            else:
                mcu_pinned = True
    if not mcu_pinned:
        notes.append("mcu_hold:checked")

    # Open holds register for cover / verification next actions
    st["manufacturerAdversarialHolds"] = [
        {
            "id": "MFR-H1",
            "title": "Freeze magnetic stir drive MPN",
            "impact": "Wet-lab mag-drive + bar procurement",
            "next_action": "Select catalogue mag-stir drive; withdraw fan-class parts",
            "status": "OPEN",
        },
        {
            "id": "MFR-H2",
            "title": "OD600 optical path system + GA callouts",
            "impact": "Growth sensing not fab-defined",
            "next_action": "Dimension path length on GA; fixture + cal SOP",
            "status": "OPEN",
        },
        {
            "id": "MFR-H3",
            "title": "MCU family + HIL",
            "impact": "Firmware not hardware-proven",
            "next_action": "Pin MCU; supplier Gerbers; populated-board HIL",
            "status": "OPEN",
        },
        {
            "id": "MFR-H4",
            "title": "STEP shell + service access drawing",
            "impact": "No CM handoff geometry",
            "next_action": "Export STEP; tubing change / vessel removal diagram",
            "status": "OPEN",
        },
        {
            "id": "MFR-H5",
            "title": "Sterile barrier / sampling map",
            "impact": "Aseptic ops unclear on interconnect",
            "next_action": "Publish barrier map on interconnect + physics pack",
            "status": "OPEN",
        },
    ]
    notes.append("adversarial_holds_register")

    # Cost stack note — materials vs mark-up (E1 honesty)
    cs = st.setdefault("costStack", {})
    if isinstance(cs, dict):
        cs["adversarial_cost_note"] = (
            "Brief materials band is the self-build ceiling. OEM transfer and list "
            "prices include labour and channel mark-up — commercial layers, not proof "
            "the brief retail/unit ceiling was met as materials."
        )
        notes.append("cost_note")

    st["ship_ok"] = False
    st_path.write_text(json.dumps(st, indent=2) + "\n", encoding="utf-8")

    # instrument-physics shear card already; add sterile barrier + power tree notes
    phys = twin / "instrument-physics"
    if not phys.is_dir():
        # may only exist in pack — write under twin for next pack copy
        phys.mkdir(exist_ok=True)
    (phys / "06-sterile-barrier-and-sampling.md").write_text(
        "# Sterile barrier & sampling map (concept)\n\n"
        "**Architecture:** HEPES / no CO₂ bottle · 0.2 µm hydrophobic vent · "
        "no sparge.\n\n"
        "| Barrier | Function | Status |\n|---|---|---|\n"
        "| 0.2 µm hydrophobic vent | Headspace sterile exchange | IDENTIFIED (Pall-class) |\n"
        "| Culture vessel closure | Containment | Concept geometry |\n"
        "| Media tubing set | Perfusion / exchange | Consumable hold |\n"
        "| Sampling | Aseptic sample draw | **OPEN** — no dedicated sample port on GA |\n\n"
        "Next evidence: interconnect callout for sample path; SOP for vessel open "
        "events; do not claim sterile validation.\n",
        encoding="utf-8",
    )
    (phys / "07-power-tree-honesty.md").write_text(
        "# Power tree honesty (concept)\n\n"
        + st["powerTreeHonesty"]["note"]
        + "\n",
        encoding="utf-8",
    )
    (phys / "08-low-shear-tip-speed.md").write_text(
        "# Low-shear agitation (concept)\n\n"
        f"Tip speed ≈ {q.get('stir_tip_speed_m_s', {}).get('value', '—')} m/s at "
        f"{q.get('agitation_speed_rpm', {}).get('value', 60)} rpm "
        f"(15 mm effective radius). Power ≈ "
        f"{q.get('agitation_power_w', {}).get('value', '—')} W — gentle regime for "
        "spheroids. Full Re / shear-rate table still open for wet-lab confirm.\n",
        encoding="utf-8",
    )

    print(json.dumps({"ok": True, "notes": notes, "twin": str(twin)}, indent=2))
    return 0


def re_search_mcu(name: str) -> bool:
    import re
    return bool(re.search(r"\bmcu\b|microcontroller|compute", name, re.I))


if __name__ == "__main__":
    raise SystemExit(main())
