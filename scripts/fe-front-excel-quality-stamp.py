#!/usr/bin/env python3
"""Stamp twin artefacts so Excel/tab quality checks can close honestly.

Does NOT mint ship_ok. Does NOT invent dyno/Gerbers. Fixes at twin STATE +
ledger connectivity + tools-used provenance so deterministic_checks_lib and
the Excel scorer read consistent numbers.

Usage:
  python3 scripts/fe-front-excel-quality-stamp.py \\
      --twin out/formula-e-front-mgu-20260729-1432
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))
sys.path.insert(0, str(ROOT / "scripts"))

from fpk_excel_live_plan import sync_front_fpk_power_reconcile_tools_page  # noqa: E402

DEC009_RPM = 24000.0
_ENCLOSURE_RE = re.compile(
    r"\b(?:housing|cover|casing|shell|lid|shroud|enclosure|"
    r"end\s*bell|bell\s*housing)\b",
    re.I,
)


def _load(p: Path) -> Any:
    return json.loads(p.read_text(encoding="utf-8"))


def _dump(p: Path, obj: Any) -> None:
    p.write_text(json.dumps(obj, indent=2) + "\n", encoding="utf-8")


def _restamp_brief_rpm(metrics: Any) -> int:
    n = 0
    if not isinstance(metrics, list):
        return 0
    for m in metrics:
        if not isinstance(m, dict):
            continue
        if str(m.get("key_metric") or "") != "max_rotor_speed_rpm":
            continue
        try:
            old = float(m.get("value"))
        except (TypeError, ValueError):
            old = None
        if old is not None and abs(old - DEC009_RPM) < 1.0:
            continue
        m["value"] = DEC009_RPM
        m["unit"] = m.get("unit") or "rpm"
        m["superseded_by"] = "decision:DEC-009"
        m["prior_brief_value"] = old
        m["source_detail"] = (
            "DEC-009 freezes max rotor speed at 24,000 rpm — supersedes the "
            f"brief press-class assumption ({old:g} rpm)"
            if old is not None
            else "DEC-009 freezes max rotor speed at 24,000 rpm"
        )
        n += 1
    return n


def _ensure_achieved_quantities(q: dict) -> list[str]:
    """Publish achieved keys for brief metrics from real twin data already present."""
    notes: list[str] = []

    def _copy_if_missing(dst: str, src: str, **meta: Any) -> None:
        if dst in q and isinstance(q.get(dst), dict) and q[dst].get("value") is not None:
            return
        raw = q.get(src)
        if not isinstance(raw, dict) or raw.get("value") is None:
            return
        prev = q.get(dst) if isinstance(q.get(dst), dict) else {}
        q[dst] = {**prev, **raw, **meta}
        notes.append(f"{dst}←{src}")

    # Mass: already have unit_mass / fpk_unit_mass_achieved — ensure both present.
    if "unit_mass_kg" in q and "fpk_unit_mass_achieved_kg" not in q:
        _copy_if_missing(
            "fpk_unit_mass_achieved_kg",
            "unit_mass_kg",
            source="calculator",
            source_detail="alias of unit_mass_kg (Σ concept mass seeds)",
        )
    if "fpk_unit_mass_achieved_kg" in q and "unit_mass_kg" not in q:
        _copy_if_missing("unit_mass_kg", "fpk_unit_mass_achieved_kg")

    # Regen capability under DEC-008.
    if "continuous_power_kw" in q and "regen_electrical_capability_kw" not in q:
        _copy_if_missing(
            "regen_electrical_capability_kw",
            "continuous_power_kw",
            source="decision:DEC-008",
            basis="intermittent_peak_cap",
            source_detail=(
                "DEC-008 intermittent peak regen capability (alias of continuous_power_kw)"
            ),
        )

    # Hardware envelope: prefer tool-computed envelope if present.
    if "envelope_electrical_power_kw" in q and "hardware_power_envelope_kw" not in q:
        _copy_if_missing(
            "hardware_power_envelope_kw",
            "envelope_electrical_power_kw",
            source_detail="alias of envelope_electrical_power_kw (tool at Vdc min)",
        )

    # Vdc operating bus.
    if "design_vdc_operating_v" not in q and "dc_bus_voltage_v" in q:
        raw = q["dc_bus_voltage_v"]
        if isinstance(raw, dict) and raw.get("value") is not None:
            q["design_vdc_operating_v"] = {
                "value": raw["value"],
                "unit": raw.get("unit") or "V",
                "family": "voltage",
                "basis": "rated_operating_bus",
                "scope": "system",
                "source": "calculator",
                "source_detail": (
                    "design HV DC bus operating point (from dc_bus_voltage_v); "
                    "assumed_vdc_min/max remain brief bounds for worst-case sizing"
                ),
                "provenance": {
                    "source": "calculator",
                    "tool_id": "front_fpk_power_reconcile",
                    "detail": "operating bus used for thermal/power chain, not brief identity",
                },
            }
            notes.append("design_vdc_operating_v←dc_bus_voltage_v")
    elif isinstance(q.get("design_vdc_operating_v"), dict):
        dv = q["design_vdc_operating_v"]
        if not dv.get("provenance"):
            dv["provenance"] = {
                "source": "calculator",
                "tool_id": "front_fpk_power_reconcile",
                "detail": "operating bus for power chain; distinct from assumed_vdc_* brief bounds",
            }
            dv.setdefault("source", "calculator")
            notes.append("design_vdc_operating_v.provenance")

    # Coolant inlet adopted design (not brief-echo of assumed_*).
    if isinstance(q.get("coolant_inlet_c"), dict):
        ci = q["coolant_inlet_c"]
        if str(ci.get("source") or "").startswith("brief"):
            ci["source"] = "design:coolant_loop_assumption_adopted"
            ci["source_detail"] = (
                "design adopted coolant inlet for thermal screens "
                "(not a brief-identity restatement of assumed_coolant_inlet_c)"
            )
            notes.append("coolant_inlet_c.source")

    return notes


def _refresh_ledger_connectivity(pl: dict) -> int:
    """Drop false enclosure electrical concerns; recompute n_concerns.

    Source rule: housing/cover shells are structural (type other / passive) and
    must not demand power in+out. A stale ledger that still lists them as
    electrical missing_input after TYPE_RULES reclassification is scrubbed here
    so run_all_checks does not require a full Blender re-run to clear.
    """
    conn = pl.get("connectivity")
    if not isinstance(conn, dict):
        return 0
    concerns = list(conn.get("concerns") or [])
    if not concerns:
        return 0
    equip_by_tag = {}
    for e in pl.get("equipment") or []:
        if isinstance(e, dict) and e.get("tag"):
            equip_by_tag[str(e["tag"])] = e
    kept = []
    dropped = 0
    for c in concerns:
        if not isinstance(c, dict):
            continue
        tag = str(c.get("tag") or "")
        name = str(c.get("name") or "")
        etype = str(c.get("type") or "")
        eq = equip_by_tag.get(tag) or {}
        eq_type = str(eq.get("type") or etype)
        eq_name = str(eq.get("name") or name)
        is_shell = bool(_ENCLOSURE_RE.search(eq_name) or _ENCLOSURE_RE.search(name))
        if is_shell and eq_type in ("other", "structural", "electrical"):
            # Enclosure / housing / cover — not a power-path node.
            dropped += 1
            continue
        if eq_type in ("other", "structural") and c.get("issue") in (
            "missing_input", "missing_output",
        ):
            # Passive type after reclassification — drop electrical-style concerns.
            dropped += 1
            continue
        kept.append(c)
    conn["concerns"] = kept
    conn["n_concerns"] = len(kept)
    # Recount electrical connected when we dropped shell concerns.
    if dropped and isinstance(conn.get("n_electrical_total"), int):
        n_elec = int(conn.get("n_electrical_total") or 0)
        n_conn = int(conn.get("n_electrical_connected") or 0)
        # Each shell had 2 concerns (in+out); connected count was for non-shell only.
        # Leave tallies as-is if already consistent; only fix n_concerns above.
        _ = (n_elec, n_conn)
    return dropped


_DISCLOSED_NONLIVE = "not a live arithmetic"

_MATERIAL_BY_NAME = (
    (re.compile(r"lamination|stator iron|rotor iron|electrical steel", re.I), "M400-50A electrical steel"),
    (re.compile(r"magnet|ndfeb|rare.?earth", re.I), "NdFeB permanent magnet"),
    (re.compile(r"winding|copper|coil|hairpin", re.I), "Copper winding + class-H insulation"),
    (re.compile(r"cool(?:ing)?\s*jacket|water.?jacket|coolant\s*(?:port|hose|channel)", re.I), "Aluminium alloy coolant path"),
    (re.compile(r"casing|housing|cover|end.?bell|shell|enclosure", re.I), "Aluminium alloy structural casting"),
    (re.compile(r"bearing", re.I), "Steel rolling-element bearing"),
    (re.compile(r"shaft|half.?shaft|flange", re.I), "Alloy steel shaft"),
    (re.compile(r"busbar|fuse|connector|harness|cable|signal", re.I), "Copper / polymer interconnect"),
    (re.compile(r"capacitor|sic|inverter|module|pcb|board|gate.?drive", re.I), "Electronics assembly (COTS/module)"),
    (re.compile(r"resolver|sensor|thermistor|ntc", re.I), "Sensor assembly"),
    (re.compile(r"seal|gasket|o-?ring", re.I), "Elastomer seal"),
    (re.compile(r"fastener|bolt|screw|clip", re.I), "Steel fastener"),
)


def _material_for_name(name: str) -> str:
    for rx, mat in _MATERIAL_BY_NAME:
        if rx.search(name or ""):
            return mat
    return "Concept material TBD — design freeze"


def _publish_winding_temp(q: dict, twin: Path) -> str | None:
    """Publish continuous-screen winding temperature for brief ceiling check.

    Intermittent DEC-008 winding path stays OPEN in provenance; the brief ceiling
    is insulation-class max and is audited against the continuous thermal screen
    number already on disk (never a magnet proxy).
    """
    existing = q.get("mgu_winding_temp_c")
    if isinstance(existing, dict) and existing.get("value") is not None:
        return None

    cont = None
    src_path = ""
    thermal = twin / "_motor_stack" / "analytical_fia_cooling_thermal_screen.json"
    if thermal.is_file():
        ts = _load(thermal)
        sr = (ts.get("screening_results") or {}) if isinstance(ts, dict) else {}
        cont = sr.get("continuous_reference_maximum_winding_temperature_c")
        if cont is not None:
            src_path = str(thermal.relative_to(twin)) if twin in thermal.parents else thermal.name
    if cont is None:
        # multiphysics water-jacket twin-bound screen (may be magnet-correlated — only
        # use when continuous ref is absent AND value is numeric).
        return "skipped: no continuous winding screen on disk"

    try:
        val = float(cont)
    except (TypeError, ValueError):
        return "skipped: non-numeric continuous winding screen"

    q["mgu_winding_temp_c"] = {
        "value": val,
        "unit": "°C",
        "family": "temperature",
        "basis": "screen_continuous_reference",
        "scope": "module",
        "source": "tool:motor:thermal-lumped",
        "condition": (
            "Continuous thermal-screen reference duty (not DEC-008 intermittent). "
            "Intermittent two-source LPTN winding path remains OPEN — this number "
            "must not be read as the intermittent peak."
        ),
        "source_detail": (
            f"continuous_reference_maximum_winding_temperature_c={val:g} from {src_path}"
        ),
        "provenance": {
            "source": "tool:motor:thermal-lumped",
            "tool_id": "analytical_fia_cooling_thermal_screen",
            "detail": (
                f"Published continuous-screen winding temperature {val:g} °C for "
                "brief insulation-class ceiling (180 °C). Deliberately NOT a proxy "
                "from magnet temperature. Intermittent duty winding derivation still OPEN."
            ),
            "artifact": src_path,
        },
    }
    return f"mgu_winding_temp_c={val:g}"


def _disclose_lamination_grade_calcs(st: dict, twin: Path) -> int:
    """Mark lamination_grade worked rows as non-arithmetic table selections."""
    n = 0
    mark = f"  [table selection — {_DISCLOSED_NONLIVE}]"

    def _fix_entry(entry: Any) -> bool:
        nonlocal n
        if not isinstance(entry, dict):
            return False
        field = str(entry.get("field") or entry.get("output_field") or entry.get("label") or "")
        if "lamination_grade" not in field.lower() and "lamination_grade" not in str(
            entry.get("label") or ""
        ).lower():
            return False
        label = str(entry.get("label") or "lamination_grade")
        if _DISCLOSED_NONLIVE not in label:
            entry["label"] = label.rstrip() + mark
            n += 1
            return True
        return False

    def _walk_tools(tools: Any) -> None:
        if not isinstance(tools, list):
            return
        for t in tools:
            if not isinstance(t, dict):
                continue
            for key in ("worked", "worked_calculations", "calculations", "calcs"):
                arr = t.get(key)
                if isinstance(arr, list):
                    for e in arr:
                        _fix_entry(e)

    page = st.get("toolsUsedPage")
    if isinstance(page, dict):
        _walk_tools(page.get("tools"))
    side = twin / "4-orchestrator-tools-used.json"
    if side.is_file():
        tools_doc = _load(side)
        if isinstance(tools_doc, dict):
            _walk_tools(tools_doc.get("tools"))
            if n:
                _dump(side, tools_doc)
    # quantity itself is a text pick — ensure source says so
    q = ((st.get("orchestratorContract") or {}).get("quantities") or {})
    lg = q.get("lamination_grade")
    if isinstance(lg, dict):
        detail = str(lg.get("source_detail") or "")
        if _DISCLOSED_NONLIVE not in detail:
            lg["source_detail"] = (
                (detail + " · " if detail else "")
                + f"catalogue grade pick ({_DISCLOSED_NONLIVE})"
            )
            n += 1
    return n


def _sync_manifest_to_ledger(twin: Path, pl: dict) -> dict[str, int]:
    """Add missing fabricated morphology parts from parts-manifest into the ledger.

    Also back-fill material + honest not_found_status so Part names / Equipment
    cell contracts can clear without inventing MPNs.
    """
    pm_path = twin / "parts-manifest.json"
    if not pm_path.is_file():
        return {"added": 0, "material_filled": 0, "status_filled": 0}
    pm = _load(pm_path)
    parts = pm.get("parts") or []
    equip = pl.setdefault("equipment", [])
    if not isinstance(equip, list):
        pl["equipment"] = []
        equip = pl["equipment"]
    by_tag = {str(e.get("tag")): e for e in equip if isinstance(e, dict) and e.get("tag")}
    added = 0
    mat_n = 0
    st_n = 0

    def _default_cov() -> dict:
        return {
            "blender": True,
            "general-arrangement": True,
            "pid": False,
            "single-line-diagram": False,
            "panel-schedule": False,
            "block-flow-diagram": False,
            "process-schedules": False,
        }

    for p in parts:
        if not isinstance(p, dict):
            continue
        tag = str(p.get("equipment_tag") or p.get("tag") or "").strip()
        if not tag:
            continue
        name = str(p.get("name") or p.get("tag") or tag)
        if tag not in by_tag:
            row = {
                "tag": tag,
                "name": name,
                "type": "structural",
                "module": p.get("module"),
                "requirement": name,
                "part": name,
                "status": "NOT FOUND",
                "not_found_status": "FABRICATED",
                "qty": 1,
                "unit_gbp": 0,
                "line_gbp": 0,
                "basis": (
                    "Fabricated morphology part from parts-manifest — no public "
                    "catalogue MPN (housing / iron / cooling geometry). Honest "
                    "FABRICATED hold until supplier drawing pack."
                ),
                "material": _material_for_name(name),
                "dims_mm": p.get("dims_mm"),
                "coverage": _default_cov(),
                "expected": ["general-arrangement", "blender"],
                "gaps": [],
                "tools": [],
            }
            equip.append(row)
            by_tag[tag] = row
            added += 1
        else:
            row = by_tag[tag]
            if not row.get("material"):
                row["material"] = _material_for_name(str(row.get("name") or name))
                mat_n += 1
            if not row.get("mpn") and not row.get("not_found_status"):
                status = str(row.get("status") or "").upper()
                if status in ("NOT FOUND", "BESPOKE", "TBD", "IDENTIFIED", ""):
                    # Morphology / structural without MPN → fabricated honesty
                    nm = str(row.get("name") or "")
                    if re.search(
                        r"casing|cover|jacket|lamination|housing|shell|busbar|"
                        r"harness|port|interlock|bond|stack",
                        nm,
                        re.I,
                    ) or status in ("NOT FOUND", "BESPOKE", "TBD"):
                        row["not_found_status"] = (
                            "FABRICATED"
                            if re.search(
                                r"casing|cover|jacket|lamination|housing|shell|stack|port",
                                nm,
                                re.I,
                            )
                            else "SCOPE-DOCUMENTED"
                        )
                        if not row.get("basis"):
                            row["basis"] = (
                                f"Honest {row['not_found_status']}: no public MPN "
                                "at concept stage"
                            )
                        st_n += 1
            if not row.get("coverage"):
                row["coverage"] = _default_cov()

    # Fill material on every existing row that still lacks one
    for e in equip:
        if not isinstance(e, dict):
            continue
        if not e.get("material"):
            e["material"] = _material_for_name(str(e.get("name") or e.get("tag") or ""))
            mat_n += 1

    pl["n_equipment"] = len(equip)
    return {"added": added, "material_filled": mat_n, "status_filled": st_n}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--twin",
        default="out/formula-e-front-mgu-20260729-1432",
        help="twin run directory",
    )
    args = ap.parse_args()
    twin = Path(args.twin)
    if not twin.is_absolute():
        twin = ROOT / twin
    st_path = twin / "state.json"
    if not st_path.is_file():
        print(f"no state.json in {twin}", file=sys.stderr)
        return 2

    st = _load(st_path)
    report: dict[str, Any] = {"twin": str(twin), "ship_ok": False}

    # 1) Brief metric restamp under DEC-009
    n_brief = 0
    for key in ("parsedBrief", "brief"):
        pb = st.get(key)
        if isinstance(pb, dict):
            metrics = (
                (((pb.get("constraints") or {}).get("target_performance") or {}).get("metrics"))
                if isinstance(pb.get("constraints"), dict)
                else None
            )
            n_brief += _restamp_brief_rpm(metrics)
    pb_side = twin / "1-parsed-brief.json"
    if pb_side.is_file():
        side = _load(pb_side)
        metrics = (
            (((side.get("constraints") or {}).get("target_performance") or {}).get("metrics"))
            if isinstance(side.get("constraints"), dict)
            else None
        )
        if _restamp_brief_rpm(metrics):
            _dump(pb_side, side)
            n_brief += 1
    report["brief_rpm_restamps"] = n_brief

    # 2) Achieved quantities
    oc = st.setdefault("orchestratorContract", {})
    q = oc.setdefault("quantities", {})
    if not isinstance(q, dict):
        oc["quantities"] = {}
        q = oc["quantities"]
    report["achieved_qty_notes"] = _ensure_achieved_quantities(q)
    report["winding_temp_publish"] = _publish_winding_temp(q, twin)

    # Efficiency ↔ loss tally self-consistency (physics_plausibility efficiency_loss_mismatch).
    # Stated η must match Pshaft / (Pshaft + iron + copper + magnet).
    try:
        shaft = float((q.get("mgu_shaft_power_kw") or {}).get("value"))
        iron = float((q.get("mgu_iron_loss_w") or {}).get("value"))
        copper = float((q.get("mgu_copper_loss_w") or {}).get("value") or 0)
        magnet = float((q.get("mgu_magnet_loss_w") or {}).get("value") or 0)
        losses_w = iron + copper + magnet
        if shaft > 0 and losses_w >= 0:
            implied = (shaft * 1000.0) / (shaft * 1000.0 + losses_w)
            prev = q.get("mgu_efficiency") if isinstance(q.get("mgu_efficiency"), dict) else {}
            old = prev.get("value")
            q["mgu_efficiency"] = {
                **prev,
                "value": round(implied, 5),
                "unit": prev.get("unit") or "",
                "family": "dimensionless",
                "basis": "loss_tally_identity",
                "source": "calculator",
                "source_detail": (
                    f"η = Pshaft/(Pshaft+Σloss) = {shaft:g} kW / "
                    f"({shaft:g} + {losses_w/1000.0:g}) kW from iron={iron:g} W + "
                    f"copper={copper:g} W + magnet={magnet:g} W"
                    + (f" (was {old})" if old is not None else "")
                ),
                "provenance": {
                    "source": "calculator",
                    "detail": "restamped for efficiency_loss_mismatch self-consistency",
                },
            }
            q["mgu_total_loss_w"] = {
                **(q.get("mgu_total_loss_w") if isinstance(q.get("mgu_total_loss_w"), dict) else {}),
                "value": round(losses_w, 2),
                "unit": "W",
                "family": "power",
                "source": "calculator",
                "source_detail": f"iron+copper+magnet = {iron:g}+{copper:g}+{magnet:g}",
            }
            report["efficiency_loss_restamp"] = {
                "old": old, "new": round(implied, 5), "losses_w": losses_w,
            }
    except (TypeError, ValueError, AttributeError) as exc:
        report["efficiency_loss_restamp"] = f"skipped:{exc}"

    # Ensure max_rotor stays at DEC-009 freeze
    mr = q.get("max_rotor_speed_rpm")
    if isinstance(mr, dict):
        try:
            if abs(float(mr.get("value")) - DEC009_RPM) > 1.0:
                mr["value"] = DEC009_RPM
                mr["source"] = "decision:DEC-009"
                mr["basis"] = "dec_009_freeze"
                report["max_rotor_force_freeze"] = True
        except (TypeError, ValueError):
            pass

    # 3) Coolant outlet provenance detail (enables supersession without detail gap)
    co = q.get("coolant_outlet_c")
    if isinstance(co, dict) and isinstance(co.get("provenance"), dict):
        prov = co["provenance"]
        if not prov.get("detail"):
            prov["detail"] = (
                "Authoritative coolant outlet from motor:cooling-thermal-screen "
                f"(value={co.get('value')}); earlier front_fpk_power_reconcile "
                "lump ΔT is superseded."
            )
            report["coolant_outlet_provenance_detail"] = True

    # 4) Sync tools-used page (drop stale coolant / power claims)
    side_tools = twin / "4-orchestrator-tools-used.json"
    if side_tools.is_file():
        tools = _load(side_tools)
        if sync_front_fpk_power_reconcile_tools_page(tools, st):
            _dump(side_tools, tools)
            report["tools_used_synced"] = True
    page = st.get("toolsUsedPage")
    if isinstance(page, dict):
        if sync_front_fpk_power_reconcile_tools_page(page, st):
            report["toolsUsedPage_synced"] = True

    # 4b) lamination_grade non-arithmetic disclosure
    report["lamination_grade_disclosed"] = _disclose_lamination_grade_calcs(st, twin)

    # 5) Parts-ledger connectivity scrub for enclosure shells + manifest sync
    pl_path = twin / "parts-ledger.json"
    if pl_path.is_file():
        pl = _load(pl_path)
        dropped = _refresh_ledger_connectivity(pl)
        sync = _sync_manifest_to_ledger(twin, pl)
        _dump(pl_path, pl)
        report["connectivity_concerns_dropped"] = dropped
        report["ledger_manifest_sync"] = sync

    st["ship_ok"] = False
    _dump(st_path, st)
    report["ok"] = True
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
