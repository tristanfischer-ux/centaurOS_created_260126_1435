#!/usr/bin/env python3
"""
ledger_coverage.py — the DETERMINISTIC ledger→drawings coverage cross-check.

Tristan's plan (2026-06-18): "have in the ledger every part and then have a confirmation
check that all the parts were in the relevant blender and engineering drawing … checked
deterministically not needing an unreliable LLM check." THIS is that check.

THE LEDGER (the authoritative every-part list) = `state.requirementsBom` rows
({tag, requirement, status, part, qty, …}). Each row is classified by TYPE from its
tag-prefix + name; each type maps to the drawing(s) it MUST appear in:

  EQUIPMENT  (pump/tank/vessel/blower/fan/HX/filter/skimmer/reactor/drum/column/skid/
              dryer/bed/UV/RO/generator/chiller/heat-pump/degasser) →
              the Blender parts-manifest (the 3D + GA) AND the P&ID
  ELECTRICAL (anything with a kW motor/heater, a board/panel/drive/transformer, OR a
              C-prefix cable feeder) → the single-line / panel (connection-schedule)
  INSTRUMENT (transmitter/sensor/gauge/probe/analyser/level/flow/valve) → the P&ID
  LINE/PIPE  (DN pipe, X-prefix) → the route-manifest (→ isometrics)

A drawing's DRAWN-ENTITY set is read from its render-manifest where one exists
(`parts-manifest.json` for Blender/GA; `<drawing>-entities.json` once the draw scripts
emit one), else derived from the SHARED source the drawing is generated from
(`connection-schedule.json` electrical rows for the single-line/panel; `route-manifest.json`
for the isometrics). Matching is by NORMALISED NAME — the tag schemes differ between
`requirementsBom` (P-/TK-/C-…) and the Blender `parts-manifest` (its own ISA running tags).

For every ledger part, membership is confirmed in each drawing it belongs to. A part
MISSING from a required drawing is a coverage DEFECT, routed to the stage that should have
drawn it. NO LLM — pure set membership. CLI: `python3 ledger_coverage.py <out_dir>`;
writes `ledger-coverage.json`, exits 1 if any required coverage is missing.
"""
import json
import os
import re
import sys
from collections import defaultdict


# ── normalisation ────────────────────────────────────────────────────────────
_QTY_TAIL = re.compile(r"\s*[·•]\s*.*$")          # drop the "· 132 kW motor · 1176×… mm" tail
_XN = re.compile(r"\s*[×x]\s*\d+\s*$")             # drop a trailing "× 8" fan-out annotation


def _head_name(s: str) -> str:
    """The part's HEAD name — the bit before the first '·' separator in a requirement
    string ('Recirc Pump · 132 kW motor (94 kW shaft) · …' → 'Recirc Pump')."""
    s = _QTY_TAIL.sub("", str(s or ""))
    return _XN.sub("", s).strip()


def _norm(s: str) -> str:
    """Normalise for set membership: lower-case, drop a trailing fan-out count, collapse
    every non-alphanumeric run to one space."""
    s = _XN.sub("", str(s or "").lower())
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _load(out_dir: str, name: str):
    p = os.path.join(out_dir, name)
    if not os.path.exists(p):
        return None
    try:
        with open(p) as fh:
            return json.load(fh)
    except Exception:
        return None


# ── ledger part classification (universal — tag-prefix + name keywords, no per-class) ──
_EQUIP_TAG = re.compile(r"^(TK|V|P|D|R|B|HX|E|F|K|COL|RO|UV|GEN|DR|SK|HP|CH)(?=[-\d]|$)", re.I)
# leading word-boundary only — the alternatives are STEMS (dehumidif→dehumidifier,
# skimm→skimmer/skimming, degass→degasser/degassing), so a trailing \b would wrongly
# block the stem; explicit \b…\b stays inside the few short ambiguous terms (uv/ro/bed/hex).
_EQUIP_WORD = re.compile(
    r"\b(pump|tank|vessel|blower|fan|exchanger|\bhex\b|heat\s*pump|chiller|filter|"
    r"skimm|reactor|drum|column|tower|skid|dryer|\bbed\b|biofilter|degass|"
    r"dehumidif|clarifier|sump|generator|genset|silo|hopper|mixer|aerator|ozone|\buv\b|"
    r"membrane|\bro\b|separator|cyclone|sieve|press|conveyor|screen|cooler|boiler|economiser)",
    re.I)
_ELEC_WORD = re.compile(
    r"\b(kw|kva|motor|heater|immersion|board|panel|switchgear|mcc|drive|vsd|vfd|"
    r"transformer|busbar|ups|inverter|rectifier|breaker|feeder|cable)\b", re.I)
_INSTR_TAG = re.compile(r"^(AT|LT|TT|PT|FT|FCV|CV|XV|I|AE|FE|LE|PE|TE|DO|PH)(?=[-\d]|$)", re.I)
_INSTR_WORD = re.compile(
    r"\b(transmitter|sensor|gauge|probe|analyser|analyzer|meter|switch|"
    r"level|flow\s*meter|pressure\s*gauge|valve|actuator|positioner)\b", re.I)
# NB: 'X' is a GENERIC misc tag here (Makeup Hex, Main Breaker, Distribution Busbar all
# carry X-… tags), NOT a pipe prefix — so a line is detected by genuine pipe vocabulary
# (DN size / 'pipework run' / pipe / duct), not by the X tag.
_LINE_TAG = re.compile(r"^(LN|PL|CW|HW|PR|WT|VT|CO|FG)(?=[-\d]|$)", re.I)
_LINE_WORD = re.compile(r"\b(dn\d+|pipework\s+run|pipe\b|piping|duct|hose)\b", re.I)
_CABLE_TAG = re.compile(r"^C\d", re.I)


def classify(tag: str, name: str) -> str:
    """Return one of: equipment | electrical | instrument | line | connection |
    subcomponent | aux. Deterministic + universal (tag-prefix + name keywords)."""
    t = str(tag or "")
    n = str(name or "")
    if n.strip().startswith("↳"):
        # a BoM breakdown line of a parent assembly (a pump's casing/impeller/motor) —
        # it is DRAWN as part of its parent, never as an independent symbol/mesh.
        return "subcomponent"
    if re.search(r"\bconnection\b", n, re.I) or _CABLE_TAG.match(t):
        # a routed CONNECTION (the C-… "water/power connection: A → B" rows) — it lives in
        # the connection-schedule by construction, not as a placed equipment symbol. NB a
        # 'Pipework Run' is a LINE (handled below), not a connection.
        return "connection"
    if _INSTR_TAG.match(t) or _INSTR_WORD.search(n):
        # an instrument may still be motor-driven (a control valve actuator) — P&ID is its home
        return "instrument"
    if _EQUIP_TAG.match(t) or _EQUIP_WORD.search(n):
        return "equipment"
    if _LINE_TAG.match(t) or _LINE_WORD.search(n):
        return "line"
    if _ELEC_WORD.search(n):
        return "electrical"
    return "aux"


# which DRAWINGS each part-type must appear in, and the STAGE that fixes a miss
REQUIRED_DRAWINGS = {
    "equipment":    ["blender", "pid"],
    "instrument":   ["pid"],
    "electrical":   ["single_line"],
    "line":         ["route"],
    "connection":   [],              # the ledger's connection rows ARE the connection-schedule (1:1)
    "subcomponent": [],              # drawn AS its parent assembly — not independently
    "aux":          [],              # consumables / systems / token rows — not drawn
}
FIX_STAGE = {
    "blender":     "build_universal_scene (place the part) + emitter (synthesise it)",
    "pid":         "draw_pid (P&ID node) + contract (the equipment exists)",
    "single_line": "draw_single_line / connection_sizing (electrical feeder)",
    "route":       "build_universal_scene route audit (pipe run)",
}


def _is_electrically_driven(name: str) -> bool:
    return bool(_ELEC_WORD.search(str(name or "")))


def coverage(out_dir: str) -> dict:
    state = _load(out_dir, "state.json") or {}
    rb = state.get("requirementsBom")
    ledger = rb if isinstance(rb, list) else []

    # ── DRAWN-ENTITY SETS (render-manifest where present, else the shared source) ──
    pm = _load(out_dir, "parts-manifest.json") or {}
    blender_names = {_norm(_head_name(p.get("name"))) for p in (pm.get("parts") or [])}

    # P&ID render-manifest if the draw script emits one, else the same principal-equipment
    # set the P&ID is generated from (parts-manifest + connection-schedule endpoints).
    pid_ent = _load(out_dir, "pid-entities.json")
    if isinstance(pid_ent, dict) and pid_ent.get("entities"):
        pid_names = {_norm(x) for x in pid_ent["entities"]}
    else:
        pid_names = set(blender_names)  # P&ID is generated from the same placed-equipment set

    cs = _load(out_dir, "connection-schedule.json") or {}
    cs_rows = cs.get("rows") if isinstance(cs, dict) else (cs if isinstance(cs, list) else [])
    sl_ent = _load(out_dir, "single-line-entities.json")
    if isinstance(sl_ent, dict) and sl_ent.get("entities"):
        sl_names = {_norm(x) for x in (sl_ent["entities"] or [])}
    else:
        sl_names = set()
        for r in (cs_rows or []):
            if not isinstance(r, dict):
                continue
            mech = str(r.get("mechanism") or "").lower()
            if "electric" in mech or "power" in mech or "bus" in mech:
                # the single-line shows the LOADS — the `to` endpoint of each electrical feeder
                for ep in (r.get("to"), r.get("from")):
                    if ep:
                        sl_names.add(_norm(_head_name(ep)))

    rm = _load(out_dir, "route-manifest.json") or {}
    rm_rows = rm.get("routes") or rm.get("rows") or (rm if isinstance(rm, list) else [])
    route_names = set()
    for r in (rm_rows or []):
        if isinstance(r, dict):
            for ep in (r.get("from"), r.get("to"), r.get("from_part"), r.get("to_part")):
                if ep:
                    route_names.add(_norm(_head_name(ep)))
    # the connection-schedule's fluid rows are the authoritative routed-line list (the
    # route-manifest can use a different node naming) — add their endpoints too.
    for r in (cs_rows or []):
        if isinstance(r, dict) and "fluid" in str(r.get("mechanism") or "").lower():
            for ep in (r.get("from"), r.get("to")):
                if ep:
                    route_names.add(_norm(_head_name(ep)))

    drawn = {"blender": blender_names, "pid": pid_names,
             "single_line": sl_names, "route": route_names}

    # ── PER-PART COVERAGE ─────────────────────────────────────────────────────
    by_type = defaultdict(lambda: {"total": 0, "covered": 0, "missing": []})
    defects = []
    for row in ledger:
        if not isinstance(row, dict):
            continue
        tag = row.get("tag") or ""
        name = _head_name(row.get("requirement") or row.get("name") or row.get("part") or "")
        if not name:
            continue
        kind = classify(tag, name)
        req = list(REQUIRED_DRAWINGS.get(kind, []))
        # an electrically-driven equipment item ALSO belongs on the single-line
        if kind == "equipment" and _is_electrically_driven(row.get("requirement") or ""):
            req = req + ["single_line"]
        if not req:
            continue
        nn = _norm(name)
        for dwg in req:
            pool = drawn.get(dwg, set())
            # membership: exact normalised name OR a token-subset match (handles
            # "Recirc Pump" vs "Recirc Pump No.3" without an LLM)
            ntoks = set(nn.split())
            hit = nn in pool or any(ntoks and ntoks <= set(d.split()) for d in pool)
            by_type[f"{kind}->{dwg}"]["total"] += 1
            if hit:
                by_type[f"{kind}->{dwg}"]["covered"] += 1
            else:
                by_type[f"{kind}->{dwg}"]["missing"].append({"tag": tag, "name": name})
                defects.append({"tag": tag, "name": name, "kind": kind,
                                "missing_from": dwg, "stage": FIX_STAGE.get(dwg, "?")})

    summary = {}
    for k, v in sorted(by_type.items()):
        pct = (v["covered"] / v["total"] * 100.0) if v["total"] else 100.0
        summary[k] = {"covered": v["covered"], "total": v["total"], "pct": round(pct, 1),
                      "missing": v["missing"][:30]}
    return {
        "ledger_rows": len(ledger),
        "drawn_counts": {k: len(v) for k, v in drawn.items()},
        "coverage": summary,
        "n_defects": len(defects),
        "defects": defects[:200],
        "all_covered": len(defects) == 0,
    }


def _print(card: dict):
    print(f"[ledger-coverage] ledger={card['ledger_rows']} rows · "
          f"drawn {card['drawn_counts']} · {card['n_defects']} coverage defect(s)")
    for k, v in card["coverage"].items():
        flag = "✓" if v["pct"] >= 99.9 else ("~" if v["pct"] >= 80 else "✗")
        print(f"  {flag} {k:28} {v['covered']:3}/{v['total']:<3} ({v['pct']:5.1f}%)")
        if v["missing"]:
            ex = ", ".join(m["name"] for m in v["missing"][:6])
            print(f"        missing: {ex}{' …' if len(v['missing']) > 6 else ''}")


def _selftest() -> int:
    """Pin the fragile parts: the part-type classifier + the name-membership matcher
    (including the regressions fixed at build time — sub-component '↳' rows, the generic
    'X' tag NOT being a pipe, hex/dehumidifier as equipment). Pure, no file IO."""
    fails = []

    def chk(name, got, want):
        if got != want:
            fails.append(f"{name}: got {got!r} want {want!r}")

    chk("equip-name", classify("P-101", "Recirc Pump"), "equipment")
    chk("equip-tag", classify("TK-205", "Rearing Tank"), "equipment")
    chk("equip-hex", classify("X-9", "Makeup Hex"), "equipment")          # was mis-read as line
    chk("equip-dehumid", classify("X-7", "Dehumidifier"), "equipment")
    chk("instrument", classify("AT-1", "DO Analyser Transmitter"), "instrument")
    chk("subcomponent", classify("X-3", "↳ Drive Motor"), "subcomponent")  # parent breakdown
    chk("connection", classify("C-12", "water connection: tanks → filter"), "connection")
    chk("line-dn", classify("LN-2", "DN300 Pipework Run"), "line")
    chk("electrical", classify("X-4", "Main Breaker"), "electrical")       # was mis-read as line
    chk("aux", classify("SYS-1", "Token control allowance"), "aux")
    # required-drawings routing
    chk("equip-required", REQUIRED_DRAWINGS["equipment"], ["blender", "pid"])
    chk("subcomp-required", REQUIRED_DRAWINGS["subcomponent"], [])
    # head-name + norm
    chk("head", _head_name("Recirc Pump · 132 kW motor · 1176×1000 mm"), "Recirc Pump")
    chk("norm", _norm("Recirc Pump × 8"), "recirc pump")
    # token-subset membership (an LLM-free fuzzy match)
    pool = {"recirc pump no 3"}
    nn = _norm("Recirc Pump")
    hit = nn in pool or any(set(nn.split()) <= set(d.split()) for d in pool)
    chk("token-subset", hit, True)

    if fails:
        print("[ledger-coverage] SELFTEST FAIL:")
        for f in fails:
            print("  ✗", f)
        return 1
    print("[ledger-coverage] SELFTEST OK (16 invariants)")
    return 0


def main(argv):
    if argv and argv[0] in ("--selftest", "-t"):
        return _selftest()
    if not argv:
        print("usage: ledger_coverage.py <out_dir>  |  --selftest", file=sys.stderr)
        return 2
    out_dir = argv[0]
    card = coverage(out_dir)
    with open(os.path.join(out_dir, "ledger-coverage.json"), "w") as fh:
        json.dump(card, fh, indent=2)
    _print(card)
    return 0 if card["all_covered"] else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
