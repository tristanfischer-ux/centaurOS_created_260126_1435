#!/usr/bin/env python3
"""interconnect_census.py — design-loop Increment 6: FULL-DENSITY interconnect take-off.

The routed connection-schedule lists only the MAJOR equipment-to-equipment PROCESS streams
(8 runs for CO2/e-fuel) — 2-3 orders below a real plant's total field interconnect. A real
plant ALSO has, per equipment item, the standard UTILITY / ELECTRICAL / INSTRUMENT tie-ins:
a power feed to every motor, instrument air to every actuated item, a drain + vent + inert
purge on every vessel, cooling-water supply+return on every heat item, and a signal wire to
every field instrument. This module enumerates that census from the parts-manifest by a
UNIVERSAL rule set keyed on equipment SHAPE (not per-class), prices each line with the SAME
documented supply+install model as the routed lines (connection_cost), and returns the rows so
the dossier's distribution bill of materials is COMPLETE — "full density down to the nail"
(Tristan 2026-06-12), with screws/bolts the only thing collapsed to an allowance.

Completeness is FINITE: the floor is the procurement-meaningful tie-in. Census LENGTHS are
estimated standard drops (disclosed as a model, ±range), distinct from the routed lengths.

Usage:  python3 interconnect_census.py <out_dir>   # reads parts-manifest.json + connection-schedule.json
Writes <out_dir>/interconnect-census.json (the census rows + totals).
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

_THIS = Path(__file__).resolve().parent
sys.path.insert(0, str(_THIS))
import connection_sizing as cs  # noqa: E402  (connection_cost + COST_SOURCE_MODEL)

# Equipment-shape families (universal — the same shapes build_universal_scene emits).
ROTATING = {"compressor", "pump", "blower", "fan"}
VESSELS = {"vertical_vessel", "horizontal_vessel", "tall_vessel", "tall_column",
           "tank", "stack", "column", "tower", "silo"}
INSTRUMENTS = {"instrument"}
# Only MAIN control/distribution cabinets take a dedicated power feed — NOT passive enclosures
# (junction boxes, barrier banks, skid sub-boxes), which are fed from a parent distribution that
# the routed electrical bus already carries. Over-counting these was the first-cut bug (313 feeds).
MAIN_CABINET = {"cabinet"}
PASSIVE_BOX_NAME_HINTS = ("junction", "terminal", "marshalling", "barrier", "pull box")
HEAT_NAME_HINTS = ("exchanger", "cooler", "condenser", "chiller", "reboiler", "heater",
                   "evaporator", "economiser", "economizer")


def _tieins(shape: str, name: str, *, is_instrument_device: bool = False) -> list[dict]:
    """The standard procurement-meaningful tie-ins a single unit of this equipment needs.
    Each is a connection spec connection_cost can price. UNIVERSAL — keyed on shape + name."""
    nm = (name or "").lower()
    out: list[dict] = []
    passive = any(h in nm for h in PASSIVE_BOX_NAME_HINTS)
    # power feed — every motor + every MAIN control cabinet (not passive junction/barrier boxes)
    if (shape in ROTATING or shape in MAIN_CABINET) and not passive:
        out.append(dict(role="power feed", mechanism="electrical_bus", kind="cable",
                        size_label="16 mm²", csa_mm2=16.0, n_parallel=1, length_m=35.0,
                        material_context="415 V 3-phase power feed"))
    # instrument air — every actuated rotating/valve item
    if shape in ROTATING:
        out.append(dict(role="instrument air", mechanism="fluid_loop", kind="pipe",
                        size_label="DN15", length_m=10.0, material_context="instrument air 7 barg"))
    # vessels: drain + vent/relief + inert purge (the always-present nozzle tie-ins)
    if shape in VESSELS:
        out.append(dict(role="drain", mechanism="fluid_loop", kind="pipe",
                        size_label="DN25", length_m=8.0, material_context="carbon-steel gravity drain"))
        out.append(dict(role="vent/relief", mechanism="fluid_loop", kind="pipe",
                        size_label="DN25", length_m=14.0, material_context="relief header tie-in"))
        out.append(dict(role="inert purge", mechanism="fluid_loop", kind="pipe",
                        size_label="DN15", length_m=15.0, material_context="N2 blanket/purge"))
    # cooling-water supply + return — heat-transfer items (by name)
    if any(w in nm for w in HEAT_NAME_HINTS):
        for r in ("CW supply", "CW return"):
            out.append(dict(role=r, mechanism="thermal", kind="pipe",
                            size_label="DN50", length_m=20.0, material_context="cooling water"))
    # field instrument — a signal wire each (full density: every transmitter/gauge/probe)
    if shape in INSTRUMENTS:
        if is_instrument_device:
            # INTENT: a handheld/benchtop instrument uses internal device harnesses,
            # not plant field runs. Keep this keyed on state.isInstrumentDevice so a
            # refinery transmitter still gets the long screened field cable model.
            out.append(dict(role="signal", mechanism="signal", kind="cable",
                            size_label="device harness", csa_mm2=0.22, n_parallel=1, length_m=0.12,
                            material_context="instrument internal signal harness"))
        else:
            out.append(dict(role="signal", mechanism="electrical_bus", kind="cable",
                            size_label="1.5 mm²", csa_mm2=1.5, n_parallel=1, length_m=50.0,
                            material_context="instrument signal 2-core screened"))
    return out


def build_census(parts: list[dict], *, is_instrument_device: bool = False) -> dict:
    """Enumerate + price the full census from the parts-manifest. qty-expanded (each physical
    unit gets its own tie-ins → e.g. 38 transmitters = 38 signal wires)."""
    rows: list[dict] = []
    for p in parts:
        shape = str(p.get("shape", ""))
        name = p.get("name", p.get("equipment_tag", "?"))
        qty = max(1, int(p.get("qty", 1) or 1))
        for t in _tieins(shape, name, is_instrument_device=is_instrument_device):
            spec = {k: t[k] for k in t if k != "role"}
            cost = cs.connection_cost(spec)
            rows.append({
                "role": t["role"], "to_part": name, "mechanism": t["mechanism"],
                "kind": t["kind"], "size": t["size_label"], "length_m": t["length_m"],
                "qty_units": qty,
                "line_total_gbp": round(cost["line_total_gbp"] * qty, 2),
                "cost_source": cost["cost_source"], "estimated": True,
            })
    # BULK infrastructure — the big categories the per-run lines don't carry: cable tray/ladder
    # (shared by the cables) + pipe supports. Estimated from the census run metres (conservative
    # model). These are what take the interconnect from "enumerated runs" to a realistic take-off.
    cable_m = sum(r["length_m"] * r["qty_units"] for r in rows if r["kind"] == "cable")
    pipe_m = sum(r["length_m"] * r["qty_units"] for r in rows if r["kind"] == "pipe")
    if cable_m > 0 and not is_instrument_device:
        rows.append({"role": "cable tray/ladder", "to_part": "(plant-wide)", "mechanism": "electrical_bus",
                     "kind": "tray", "size": "ladder", "length_m": round(cable_m * 0.45, 1), "qty_units": 1,
                     "line_total_gbp": round(cable_m * 0.45 * 42.0, 2),  # ~45% sharing, £42/m supply+install
                     "cost_source": cs.COST_SOURCE_MODEL, "estimated": True})
    if pipe_m > 0:
        rows.append({"role": "pipe supports", "to_part": "(plant-wide)", "mechanism": "fluid_loop",
                     "kind": "support", "size": "per 4 m", "length_m": round(pipe_m, 1), "qty_units": int(pipe_m // 4),
                     "line_total_gbp": round((pipe_m / 4.0) * 38.0, 2),  # 1 support / 4 m, £38/support
                     "cost_source": cs.COST_SOURCE_MODEL, "estimated": True})
    cable = sum(r["line_total_gbp"] for r in rows if r["kind"] in ("cable", "tray"))
    pipe = sum(r["line_total_gbp"] for r in rows if r["kind"] in ("pipe", "support"))
    return {
        "schema": "interconnect-census/v1",
        "basis": ("DEVICE-SCALE instrument harness census; no plant cable tray; priced " + cs.COST_SOURCE_MODEL)
                 if is_instrument_device else
                 "FULL-DENSITY per-equipment utility/electrical/instrument tie-in census + bulk "
                 "(cable tray, pipe supports); estimated standard runs (model, ±range); priced " + cs.COST_SOURCE_MODEL,
        "census_runs": len(rows),
        "total_units": sum(r["qty_units"] for r in rows),
        "cable_gbp": round(cable, 2), "pipe_gbp": round(pipe, 2),
        "grand_total_gbp": round(sum(r["line_total_gbp"] for r in rows), 2),
        "rows": rows,
    }


def _is_instrument_device_run(out_dir: Path) -> bool:
    state_path = out_dir / "state.json"
    if not state_path.exists():
        return False
    try:
        state = json.loads(state_path.read_text())
    except Exception as exc:
        print(f"[census] warning: could not read state.json instrument flag: {exc}", file=sys.stderr)
        return False
    return bool(isinstance(state, dict) and state.get("isInstrumentDevice"))


def selftest() -> None:
    """proveCatch: handheld instruments use centimetre device harnesses, not plant drops."""
    census = build_census(
        [{"shape": "instrument", "name": "Optical Detector Module", "qty": 1}],
        is_instrument_device=True,
    )
    signal_rows = [r for r in census["rows"] if r["role"] == "signal"]
    assert signal_rows, "instrument fixture must emit a signal/device harness row"
    assert max(r["length_m"] for r in signal_rows) <= 0.3, (
        f"instrument signal harness must be <=0.3 m, got {signal_rows}")
    assert all(r["mechanism"] == "signal" for r in signal_rows), (
        "instrument harness rows must use the signal mechanism so pricing stays bundle-scale")
    assert not any(r["kind"] == "tray" for r in census["rows"]), (
        "handheld device harnesses must not add plant-wide cable tray/ladder bulk rows")


def main(argv: list[str]) -> int:
    if argv and argv[0] == "--selftest":
        selftest()
        print("interconnect_census selftest: OK")
        return 0
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__); return 0
    out_dir = Path(argv[0]).resolve()
    pm_path = out_dir / "parts-manifest.json"
    if not pm_path.exists():
        print(f"[census] no parts-manifest.json in {out_dir}", file=sys.stderr); return 1
    parts = json.loads(pm_path.read_text()).get("parts", [])
    is_instrument_device = _is_instrument_device_run(out_dir)
    census = build_census(parts, is_instrument_device=is_instrument_device)
    (out_dir / "interconnect-census.json").write_text(json.dumps(census, indent=1))
    # report against the routed schedule for context
    routed = 0.0
    sched = out_dir / "connection-schedule.json"
    if sched.exists():
        routed = (json.loads(sched.read_text()).get("totals") or {}).get("grand_total_gbp", 0.0)
    print(f"[census] {census['census_runs']} tie-in runs ({census['total_units']} units) "
          f"= £{census['grand_total_gbp']:,.0f} (cable £{census['cable_gbp']:,.0f} + pipe £{census['pipe_gbp']:,.0f})")
    print(f"[census] routed major streams = £{routed:,.0f}  →  full interconnect ≈ £{routed + census['grand_total_gbp']:,.0f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
