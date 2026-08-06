#!/usr/bin/env python3
"""Instrument-physics one-pagers for Anvil packs (P1 domain evidence).

Capability-conditional content under ``instrument-physics/`` — never invents EM
field plots. Built from twin quantities + brief facts; works for any instrument
with culture/thermal/optical/agitation metrics when present.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional


def _qval(q: dict, key: str) -> Any:
    v = q.get(key)
    if isinstance(v, dict):
        return v.get("value")
    return v


def _card_md(title: str, rows: list[tuple[str, str]], notes: list[str], next_ev: list[str]) -> str:
    lines = [f"# {title}", "", "## Claimed numbers", ""]
    lines.append("| Item | Value |")
    lines.append("|---|---|")
    for k, v in rows:
        lines.append(f"| {k} | {v} |")
    lines += ["", "## Assumptions / non-claims", ""]
    for n in notes:
        lines.append(f"- {n}")
    lines += ["", "## Next evidence", ""]
    for n in next_ev:
        lines.append(f"- {n}")
    lines.append("")
    return "\n".join(lines)


def build_instrument_physics_pack(
    twin: Path | str,
    pack: Path | str,
) -> dict[str, Any]:
    twin_p, pack_p = Path(twin), Path(pack)
    state_path = twin_p / "state.json"
    if not state_path.is_file():
        return {"written": [], "skipped": "no state.json"}
    state = json.loads(state_path.read_text(encoding="utf-8"))
    if not state.get("isInstrumentDevice"):
        return {"written": [], "skipped": "not isInstrumentDevice"}

    q = (state.get("orchestratorContract") or {}).get("quantities") or {}
    out_dir = pack_p / "instrument-physics"
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[str] = []

    # 1 Thermal
    rows = []
    for key, label, unit in (
        ("culture_temperature_c", "Culture set-point", "°C"),
        ("culture_thermal_setpoint_achieved_c", "Achieved thermal set-point", "°C"),
        ("temperature_stability_k", "Predicted closed-loop stability", "K"),
        ("peak_heater_power_w", "Peak heater authority", "W"),
        ("net_heating_required_w", "Net heat to hold set-point", "W"),
        ("electronics_junction_temp_c", "Electronics junction (screen)", "°C"),
    ):
        v = _qval(q, key)
        if v is not None:
            rows.append((label, f"{v} {unit}"))
    if rows:
        md = _card_md(
            "Instrument physics — thermal control",
            rows,
            [
                "Closed-loop culture temperature is a set-point band, not a meet-or-exceed race metric.",
                "Stability is a first-principles / PID prediction unless HIL-tagged measured.",
                "Electronics junction temperature is a screening estimate, not a release thermal map.",
            ],
            [
                "First-article soak at lab ambient 25–30 °C with lid closed.",
                "Thermocouple map: culture wall vs TEC cold side vs board.",
            ],
        )
        (out_dir / "01-thermal-control.md").write_text(md, encoding="utf-8")
        written.append("01-thermal-control.md")

    # 2 Agitation / shear
    rows = []
    for key, label, unit in (
        ("agitation_speed_rpm", "Agitation set-point", "rpm"),
        ("do_agitation_speed_rpm", "DO-tool agitation (must match)", "rpm"),
        ("power_volumetric_w_m3", "Power / volume (low-shear screen)", "W/m³"),
        ("agitation_power_w", "Stir power", "W"),
        ("stir_tip_speed_m_s", "Tip speed", "m/s"),
    ):
        v = _qval(q, key)
        if v is not None:
            rows.append((label, f"{v} {unit}"))
    if rows:
        md = _card_md(
            "Instrument physics — agitation / low shear",
            rows,
            [
                "Single vessel set-point; dual rpm between tools is a defect.",
                "Power/volume is a flea-bar class screen, not a Rushton fermenter correlation.",
                "Spheroid integrity needs first-article visual / size distribution checks.",
            ],
            [
                "Pin wet-lab magnetic drive MPN + stir-bar size.",
                "Measure rpm and confirm suspension without breakup.",
            ],
        )
        (out_dir / "02-agitation-low-shear.md").write_text(md, encoding="utf-8")
        written.append("02-agitation-low-shear.md")

    # 3 Gas / sterile barrier
    rows = []
    for key, label, unit in (
        ("bioreactor_airflow_lpm", "Sparge airflow", "L/min"),
        ("kla_per_hour", "kla (if sparged)", "1/h"),
        ("working_volume_ml", "Working volume", "ml"),
        ("working_volume_min_ml", "Minimum operable volume", "ml"),
    ):
        v = _qval(q, key)
        if v is not None:
            rows.append((label, f"{v} {unit}"))
    if rows:
        md = _card_md(
            "Instrument physics — headspace / sterile barrier",
            rows,
            [
                "CO₂-independent HEPES architectures claim no gas bottle — sparge airflow should be 0.",
                "kla without airflow is not a sparged mass-transfer claim.",
                "Vent grade (0.2 µm hydrophobic vs depth bacterial vent) must match the sterile story.",
            ],
            [
                "Confirm vent MPN and headspace port only.",
                "Draw sterile barrier map: sample, perfusion, vent.",
            ],
        )
        (out_dir / "03-headspace-sterile-barrier.md").write_text(md, encoding="utf-8")
        written.append("03-headspace-sterile-barrier.md")

    # 4 Optics
    rows = []
    for key, label, unit in (
        ("optical_path_length_mm", "Optical path length", "mm"),
        ("min_transmitted_intensity_mw", "Min transmitted intensity (screen)", "mW"),
    ):
        v = _qval(q, key)
        if v is not None:
            rows.append((label, f"{v} {unit}"))
    if rows:
        md = _card_md(
            "Instrument physics — optical growth sensing",
            rows,
            [
                "OD600 requires ~600 nm source + detector + fixed path fixture + temperature compensation.",
                "A bare SMD LED package is not an OD path.",
                "Settling spheroids scatter; bulk OD may need protocol limits.",
            ],
            [
                "Freeze LED/PD MPNs and fixture drawing with path length callout.",
                "Blank / single standard / temp-comp check SOP.",
            ],
        )
        (out_dir / "04-optical-growth-sensing.md").write_text(md, encoding="utf-8")
        written.append("04-optical-growth-sensing.md")

    # 5 Growth kinetics honesty
    rows = []
    for key, label, unit in (
        ("mu_max_per_hour", "μ_max (growth)", "1/h"),
        ("ks_g_l", "Ks", "g/L"),
        ("max_cell_concentration_g_l", "Max biomass screen", "g/L"),
    ):
        v = _qval(q, key)
        if v is not None:
            rows.append((label, f"{v} {unit}"))
    if rows:
        md = _card_md(
            "Instrument physics — growth kinetics honesty",
            rows,
            [
                "Mammalian spheroid μ_max is order 0.02–0.05 1/h — bacterial μ_max≈1 is wrong class.",
                "These numbers size media exchange thought-experiments, not clinical claims.",
            ],
            [
                "Cite literature or pilot growth curve before performance marketing.",
            ],
        )
        (out_dir / "05-growth-kinetics.md").write_text(md, encoding="utf-8")
        written.append("05-growth-kinetics.md")

    # Index
    index = [
        "# Instrument physics — index",
        "",
        "Capability-conditional evidence for sealed laboratory instruments.",
        "Not electromagnetics. Not plant P&ID.",
        "",
    ]
    for w in written:
        index.append(f"- `{w}`")
    index.append("")
    (out_dir / "00-INDEX.md").write_text("\n".join(index), encoding="utf-8")
    written.insert(0, "00-INDEX.md")

    (out_dir / "README.txt").write_text(
        "Instrument physics one-pagers (Anvil).\n"
        "Generated from twin quantities. Screening numbers unless marked measured.\n",
        encoding="utf-8",
    )
    return {"written": written, "dir": str(out_dir)}


if __name__ == "__main__":
    import tempfile

    with tempfile.TemporaryDirectory() as td:
        twin = Path(td) / "t"
        pack = Path(td) / "p"
        twin.mkdir()
        pack.mkdir()
        (twin / "state.json").write_text(
            json.dumps({
                "isInstrumentDevice": True,
                "orchestratorContract": {
                    "quantities": {
                        "culture_temperature_c": {"value": 37, "unit": "°C"},
                        "agitation_speed_rpm": {"value": 60, "unit": "RPM"},
                        "working_volume_ml": {"value": 20, "unit": "ml"},
                        "mu_max_per_hour": {"value": 0.035, "unit": "1/h"},
                        "optical_path_length_mm": {"value": 10, "unit": "mm"},
                        "bioreactor_airflow_lpm": {"value": 0, "unit": "L/min"},
                        "kla_per_hour": {"value": 0, "unit": "1/h"},
                    }
                },
            })
        )
        r = build_instrument_physics_pack(twin, pack)
        assert len(r["written"]) >= 4
        print("instrument_physics_pack selftest OK", r["written"])
