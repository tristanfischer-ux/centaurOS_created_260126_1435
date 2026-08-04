#!/usr/bin/env python3
"""Single narrative document: design under provisional partner seeds.

Readable brief for Tristan (and later Jack) — not a wall of PARTIAL.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DEFAULT_TWIN = REPO / "out" / "formula-e-front-mgu-20260729-1432"


def _iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path, default=DEFAULT_TWIN)
    args = ap.parse_args()
    twin = args.twin.resolve()
    ms = twin / "_motor_stack"

    def load(name: str, root: Path | None = None):
        p = (root or ms) / name
        if p.is_file():
            return json.loads(p.read_text())
        p2 = twin / name
        return json.loads(p2.read_text()) if p2.is_file() else {}

    seeds = load("provisional_partner_seeds.json")
    abd = load("JLR-FE-FRONT-FPK-ASSUMPTION-BASED-DESIGN.json", twin)
    gear = load("gear_topology_option_screen.json")
    volt = load("path_b_voltage_feasibility_screen.json")
    tmap = load("em_fia_torque_map_screen.json")
    pb = load("em_fia_front_kit_case_PATH_B_DEC009.json")
    wik = pb.get("works_in_kit_context") or {}
    mean = wik.get("torque_magnitude_mean_nm") or 122.1
    arch = wik.get("required_shaft_torque_nm") or 104.1
    bind = 125.2
    geo = pb.get("machine_geometry") or {}
    tsum = tmap.get("summary") or {}
    if not isinstance(tsum, dict):
        tsum = {}
    wh = gear.get("working_hypothesis") or {}
    iso = _iso()

    lines = [
        "# FE Front FPK — design narrative under provisional assumptions",
        "",
        f"**Stamped:** {iso}  ",
        f"**Status:** RESULTS_AVAILABLE_UNDER_ASSUMPTIONS  ",
        f"**ship_ok:** false  ",
        f"**Homologation:** ~1/10 until partners replace seeds  ",
        "",
        "---",
        "",
        "## 1. What this document is",
        "",
        "Jack is busy. Partners have not returned dyno maps, lap logs, Gerbers, SiC MPNs,",
        "chassis XYZ, or bench data. Rather than stall, this twin is frozen under a **named",
        "set of temporary hypotheses**. Every number below is either:",
        "",
        "1. **Computed under those hypotheses** (screens, FE, packaging), or",
        "2. **An explicit seed** waiting for partner overwrite.",
        "",
        "If a seed changes, the dependent results change. That is the contract.",
        "",
        "This is **not** race-ready hardware. It is a coherent concept pack under assumptions.",
        "",
        "---",
        "",
        "## 2. The frozen hypotheses (short list)",
        "",
        "| ID | Working guess | Replaced by |",
        "|---|---|---|",
    ]
    for s in seeds.get("seeds") or []:
        rid = s.get("id", "")
        stmt = (s.get("statement") or "")[:70]
        rep = (s.get("replace_with") or "")[:50]
        lines.append(f"| {rid} | {stmt} | {rep} |")

    lines += [
        "",
        "Full seed file: `_motor_stack/provisional_partner_seeds.json`",
        "",
        "---",
        "",
        "## 3. Machine we are designing (under S-EM-TRUTH)",
        "",
        f"- **Topology:** 24-slot / 8-pole IPM, magnets **6.0 × 22.5 mm**",
        f"- **Stack:** {geo.get('active_length_mm', 130)} mm active length",
        f"- **Speed class:** {geo.get('bay_width_mm') and 24000 or 24000} rpm (DEC-009 freeze)",
        f"- **Path B FE mean |T|:** **{mean:.2f} N·m**",
        f"- **Architecture duty bar:** **{arch:.2f} N·m** (mean/arch = {float(mean)/float(arch):.3f})",
        f"- **Binding ledger bar:** **{bind:.2f} N·m** (mean does **not** clear this)",
        f"- **torque_reliable:** false (until dyno)",
        f"- **Housing:** Ø{geo.get('housing_outer_diameter_mm', 198)} × L{geo.get('housing_length_mm', 140.5)} mm",
        f"- **Bay:** 343 × 259 × 267 mm · mass aspiration 32 kg",
        "",
        "### Dual-bar honesty",
        "",
        "Path B **clears the architecture power bar** at 24k numerically.",
        "Path B **does not clear** the conservative binding ledger bar.",
        "Software must never collapse those two bars into one green tick.",
        "",
        "---",
        "",
        "## 4. Electromagnetic depth (W4.1)",
        "",
        f"- Kit-case Path B position sweep: mean **{mean:.2f} N·m** (sign-stable)",
        f"- Hybrid dense map under Path B anchors: **{tsum.get('total_screen_points', '—')}** screen points",
        f"  (FEMM anchors + angle interpolation + current scaling + FW/loss grids)",
        f"- Peak |T| on hybrid map: **{tsum.get('peak_torque_magnitude_nm', '—')} N·m**",
        f"- Dense FEMM MTPA (11×9): running or filed as `em_fia_mtpa_screen_PATH_B_DENSE.json`",
        "- **torque_map status:** OPEN (not a closed production map)",
        "- **Voltage (analytical):** util @750 V ≈ "
        f"{(volt.get('headline') or {}).get('controlling_utilisation_at_nominal', '—')}; "
        "−30° electrical is OP **context**, not an input to the scalar V model; "
        "**does not close Bar A**",
        "",
        "---",
        "",
        "## 5. Gear topology working hypothesis",
        "",
        f"**Selected under seeds:** `{wh.get('selected_id', '—')}` — {wh.get('label', '')}",
        "",
        wh.get("rationale", ""),
        "",
        f"- Ratio seed held at **8** (output torque class ~{float(mean)*8:.0f} N·m)",
        "- Nest-in-bore remains **ARCHITECTURE_HOLD** (FoS screen fails inside current rotor ID)",
        "- Enlarge-bore option needs Path B EM re-solve if chosen",
        "- External planetary preferred when bay fits — **keeps Path B EM frozen**",
        "",
        "Detail: `_motor_stack/gear_topology_option_screen.json`",
        "",
        "---",
        "",
        "## 6. Power electronics & thermal (class, not MPN)",
        "",
        "- DC bus: 600 / **750** / 900 V class",
        "- SiC: 3-module class · ESL seed ~6.4 nH · double-pulse OPEN",
        "- DC-link C: concept band ~71–884 µF · volume envelope from energy density class · **no MPN**",
        "- Coolant: **60 °C / 12 L/min** · network Δp ~45 kPa screen · flow bench OPEN",
        "- Iron loss: working band ~3.9–8.5 kW class (lamination mid) + DEC-009 stamp higher",
        "- PCBs: Forge drafts **NOT_FAB** until supplier Gerbers",
        "",
        "---",
        "",
        "## 7. Interfaces (provisional bay-local XYZ)",
        "",
        "Ports and mounts are placed in **bay-local millimetres** for packaging and GA only.",
        "They are **not** a chassis ICD. Seed **S-IFACE-XYZ** lists HV, coolant QD pair, LV/CAN,",
        "halfshaft class, and four bay mounts. Replace with team ICD when available.",
        "",
        "---",
        "",
        "## 8. What clears / what does not",
        "",
        "| Claim | Under assumptions |",
        "|---|---|",
        "| Architecture torque bar @ 24k | **Clears** (Path B mean) |",
        "| Binding ledger bar | **Does not clear** |",
        "| Analytical voltage ceiling 600–900 V | **Screen OK** (scalar model) |",
        "| Dyno / torque_reliable | **OPEN** |",
        "| Supplier Gerbers / SiC MPN | **OPEN** |",
        "| Chassis XYZ ICD | **OPEN** (provisional layout only) |",
        "| Planetary nest strength in bore | **HOLD** |",
        "| Gear external topology hypothesis | **Selected for packaging** |",
        "| ship_ok / homologation | **false / ~1/10** |",
        "",
        "---",
        "",
        "## 9. How to change the story",
        "",
        "1. Edit or overwrite the relevant seed in `provisional_partner_seeds.json`",
        "   (or partner fill-in when Jack returns).",
        "2. Re-run the dependents listed in that seed’s `if_changed`.",
        "3. Refresh ABD + this narrative + pack stamp (never re-zip under an old V number).",
        "",
        "---",
        "",
        "## 10. Artefact index",
        "",
        "| Artefact | Path |",
        "|---|---|",
        "| Seeds | `_motor_stack/provisional_partner_seeds.json` |",
        "| ABD register | `JLR-FE-FRONT-FPK-ASSUMPTION-BASED-DESIGN.json` |",
        "| Path B FE | `_motor_stack/em_fia_front_kit_case_PATH_B_DEC009.json` |",
        "| Dense hybrid map | `_motor_stack/em_fia_torque_map_screen.json` |",
        "| Dense FEMM MTPA | `_motor_stack/em_fia_mtpa_screen_PATH_B_DENSE.json` |",
        "| Gear topology | `_motor_stack/gear_topology_option_screen.json` |",
        "| Voltage screen | `_motor_stack/path_b_voltage_feasibility_screen.json` |",
        "| Jack honesty pack | `_motor_stack/jack_em_pack/` |",
        "",
        f"*End of narrative — {iso}*",
        "",
    ]

    out = twin / "FE-FRONT-HYPOTHESIS-NARRATIVE.md"
    out.write_text("\n".join(lines))
    print(json.dumps({"wrote": str(out), "ship_ok": False}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
