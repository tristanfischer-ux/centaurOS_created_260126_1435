#!/usr/bin/env python3
"""
parts_ledger.py — THE LEDGER: one canonical object holding everything about the
design except the pixels. The images (Blender + the 8 drawings) are VIEWS of it:
generated from it and checked against it.

Tristan's design (2026-06-16, across four messages):
  1. "a table/database of parts that is the bom but also has all the inputs and
     outputs and transformations plus whether the information is in the relevant
     blender image or the 8 engineering documents — explicitly check things off."
  2. "the ledger is also the bom with everything about the costings in it."
  3. "the ledger should have everything in it except the images and they should
     inform the ledger and be changed by the ledger."
  4. "inputs and outputs should also determine what part it inputs from and outputs
     to including all of the pipes wires sensors etc. that information can be cross
     referenced with the 8 engineering drawings and the blender images."

So the ledger has two row kinds, both cross-referenced against every view:
  PARTS (equipment) — identity, BoM/cost (catalogue part, qty, unit/line £, basis,
    status, sub-component breakdown), inputs/outputs that NAME the connected part +
    the connecting element (pipe/cable/sensor) + mechanism, transformation, and a
    ✓/✗ coverage cell per representation (blender + 8 drawings) with EXPECTED
    coverage per type so a GAP = expected ✓ ∧ absent.
  CONNECTIONS (the pipes / wires / sensor ties) — from-part → to-part, mechanism,
    kind, size, rating, length, cost, AND their OWN coverage (P&ID line, line-list,
    isometric spool, Blender route) so every connection is checked off too.

SPINE = state.requirementsBom (the BoM, tag-keyed; sub-components line_gbp=0 so
Σ line_gbp reconciles). Flows = connection-schedule rows. Enriched by parts-
manifest (Blender placement) + route-manifest (routed pipes). DERIVED every run —
never hand-maintained — and meant to become the single source the draw_*.py
generators read (one tag → one name → one cost → one role → one connection).

USAGE: python3 parts_ledger.py <out_dir> [state.json]
OUTPUT: <out_dir>/parts-ledger.json + a printed ledger + coverage check-off.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPS = ["blender", "general-arrangement", "pid", "single-line-diagram", "panel-schedule",
        "block-flow-diagram", "process-schedules", "isometric-index"]
SHORT = {"blender": "BLE", "general-arrangement": "GA", "pid": "P&ID",
         "single-line-diagram": "SLD", "panel-schedule": "PNL", "block-flow-diagram": "BFD",
         "process-schedules": "SCH", "isometric-index": "ISO"}

TYPE_EXPECTED = {
    "vessel":     {"blender", "general-arrangement", "pid", "block-flow-diagram", "isometric-index"},
    "rotating":   {"blender", "general-arrangement", "pid", "single-line-diagram", "panel-schedule", "block-flow-diagram"},
    "exchanger":  {"blender", "general-arrangement", "pid", "block-flow-diagram"},
    "separator":  {"blender", "general-arrangement", "pid", "block-flow-diagram", "isometric-index"},
    "instrument": {"pid", "process-schedules"},
    "valve":      {"pid", "process-schedules"},
    "electrical": {"single-line-diagram", "panel-schedule"},
    "control":    {"single-line-diagram", "panel-schedule"},
    "other":      {"blender", "general-arrangement"},
}
TYPE_RULES = [
    ("instrument", r"transmitter|analy[sz]er|\bprobe\b|sensor|\bgauge\b|level switch|"
                   r"flow meter|flowmeter|\bmeter\b|densit|turbidit|viscosit|coriolis|"
                   r"mass flow|detector|monitor"),
    ("valve",      r"\bvalve\b|solenoid|actuator|damper"),
    ("control",    r"controller|gateway|\bI/O\b|network switch|power supply|scada|\bUPS\b|\bPLC\b"),
    ("electrical", r"transformer|switchgear|\bMCC\b|\bpanel\b|busbar|generator|genset|breaker|relay|\bATS\b|fuse|surge"),
    ("rotating",   r"\bpump\b|blower|\bfan\b|compressor|skimmer|aerat"),
    ("exchanger",  r"heat exchanger|heat pump|\bHEX\b|chiller|\bUV\b|ozone|steril|oxygenat|degas|makeup hex"),
    ("separator",  r"drum filter|screen|filter|clarifi|settl|cyclone|membrane|biofilter|\bMBBR\b"),
    ("vessel",     r"\btank\b|vessel|reservoir|\bsump\b|\bcone\b|column|reactor|silo|hopper|\bLOX\b|storage"),
]
TRANSFORM = {"vessel": "holds / contains working fluid", "rotating": "adds head / moves fluid",
             "exchanger": "transfers heat / treats stream", "separator": "separates a phase",
             "instrument": "measures a process variable", "valve": "regulates / isolates a flow",
             "electrical": "distributes electrical power", "control": "computes / commands",
             "other": "—"}
# mechanism → the physical connecting element kind (pipes / wires / sensors)
MECH_KIND = {"fluid_loop": "pipe", "fluid": "pipe", "process": "pipe", "thermal": "pipe (thermal)",
             "electrical": "cable", "power": "cable", "signal": "signal/sensor tie",
             "control": "signal/sensor tie", "gas": "gas pipe", "oxygen": "gas pipe"}

# A manifest instrument/valve part is REPRESENTED on a P&ID by its ISA LETTER (TT/PT/LT/AT/FCV/
# XV/PSV), NOT by its manifest tag ("u_temperature_sensor") — so the coverage matcher's tag/name
# text-match FALSE-NEGATIVES every such part (the part IS drawn, just as an ISA bubble). Credit
# coverage when the function's ISA symbol is present in the drawing. Mirrors draw_pid.py's
# _INSTR_WORD_FUNC. Universal — corrects the manifest-tag↔ISA-tag mismatch for every class. A
# genuinely-missing valve (no PCV/XV symbol drawn) is still NOT credited → the % stays honest.
_ISA_FUNC = [
    # valves FIRST (a "flow control valve" is a valve, not a flow transmitter — match before \bflow\b)
    (re.compile(r"relief|\bpsv\b|safety.?valve|pressure.?relief", re.I), ("PSV",)),
    (re.compile(r"solenoid|\besd\b|shut.?off|emergency.*valve|on.?off.?valve", re.I), ("XV",)),
    (re.compile(r"flow.?control.?valve|\bfcv\b|control.?valve|dosing.?valve|modulat", re.I), ("FCV", "PCV")),
    # instruments
    (re.compile(r"dissolved.?oxygen|_do_|\bdo\b|do[_ ]?anal", re.I), ("AT",)),
    (re.compile(r"\bph\b|_ph_|ph[_ ]?anal", re.I), ("AT",)),
    (re.compile(r"conductiv|salin", re.I), ("AT",)),
    (re.compile(r"ammonia|nitrate|nitrite|\btan\b|analy[sz]", re.I), ("AT",)),
    (re.compile(r"\blevel\b|_level_|level.?transmit|level.?switch", re.I), ("LT", "LSL")),
    (re.compile(r"temperatur|_temp_|\btemp\b", re.I), ("TT",)),
    (re.compile(r"\bflow\b|_flow_|flow.?transmit|flow.?meter", re.I), ("FT",)),
    (re.compile(r"pressure|_press_", re.I), ("PT",)),
]


def _isa_letters(tag: str, name: str):
    s = f"{tag or ''} {name or ''}"
    for rx, letters in _ISA_FUNC:
        if rx.search(s):
            return letters
    return ()


def _norm(s: str) -> str:
    s = re.sub(r"^u_", "", (s or "").strip().lower())
    s = re.sub(r"[_\-]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return re.sub(r"s\b", "", s)


# ── CABINET GROUPING (universal, role-keyed — no per-class table) ─────────────────
# Tristan 2026-06-24: "all sub systems that are small should be put into a cabinet" +
# "create a deterministic check for all things going into the cabinets so we can see the
# inputs and outputs and the connectors and that it all works". A real plant houses every
# small electrical / control device inside an ENCLOSURE: a power board / MCC houses the
# breakers / fuses / relays / drives; a control / marshalling cabinet houses the I/O cards
# / PLC / network switch / gateway. We classify the enclosures by ROLE, then assign each
# small device to the right enclosure (matching domain, same module preferred). Field
# INSTRUMENTS (probes / transmitters / analysers / detectors) are NOT housed — they are
# field-mounted and wire TO a cabinet, so they are never cabinet contents.
_CABINET_POWER_RE = re.compile(
    r"busbar|distribution\s*board|switchboard|motor\s*control\s*cent|\bMCC\b|switch[- ]?gear|"
    r"\bLV\s*board\b|\bMV\s*board\b|panelboard|consumer\s*unit|\bPDU\b|distribution\s*panel|"
    r"power\s*distribution\s*panel|drive\s*cabinet|\bVSD\b\s*cabinet", re.I)
_CABINET_CTRL_RE = re.compile(
    r"marshalling|control\s*cabinet|control\s*panel|\bDCS\b|\bPLC\b|\bHMI\b|junction\s*box|"
    r"control\s*system|control\s*enclosure|instrument\s*panel|i/?o\s*rack|remote\s*i/?o|"
    r"control[- ]?network", re.I)
_HOUSED_POWER_RE = re.compile(
    r"\bbreaker\b|\bfuse\b|surge|\bSPD\b|\brelay\b|\bMCB\b|\bMCCB\b|\bMPCB\b|\bRCD\b|\bRCBO\b|"
    r"contactor|isolator|motor[- ]?protection|earth[- ]?leakage|\bVFD\b|variable[- ]?frequency|"
    r"frequency\s*drive|soft[- ]?start|blower/centrifuge\s*VSD", re.I)
_HOUSED_CTRL_RE = re.compile(
    r"i/?o\s*card|i/?o\s*module|plc\s*module|gateway|network\s*switch|signal\s*conditioner|"
    r"\bbarrier\b|marshalling\s*terminal|power\s*supply|\bPSU\b|interface\s*station", re.I)
# a "remote I/O rack" / "remote I/O" is itself a small ENCLOSURE (it houses I/O cards) →
# treat as a cabinet, not a housed device, so cabinet-match takes precedence below.


def _build_cabinets(equipment: list, concern_tags: set) -> dict:
    """Group small electrical/control devices into the enclosure that houses them and
    return a deterministic cabinet schedule: for each cabinet, its housed CONTENTS with
    each device's IN/OUT connectors + a connected verdict, and a cabinet-level all_connected
    flag. `connected` reuses the SAME connectivity verdict the ledger computed (a device is
    connected iff it is not in concern_tags), so the cabinet deck cannot disagree with the
    connector audit. Universal — role vocabulary only."""
    def _is_cab(e):
        return (e.get("type") in ("electrical", "control")
                and (_CABINET_POWER_RE.search(e["name"]) or _CABINET_CTRL_RE.search(e["name"])))

    cabinets_eq = [e for e in equipment if _is_cab(e)]
    cab_tags = {e["tag"] for e in cabinets_eq}

    def _domain(e):
        return "power" if _CABINET_POWER_RE.search(e["name"]) else "control"

    # housed = a small power/control device that is NOT itself a cabinet/enclosure
    housed = []
    for e in equipment:
        if e["tag"] in cab_tags or e.get("type") not in ("electrical", "control"):
            continue
        if _HOUSED_POWER_RE.search(e["name"]):
            housed.append((e, "power"))
        elif _HOUSED_CTRL_RE.search(e["name"]):
            housed.append((e, "control"))

    def _pick_cabinet(dev, dom):
        same_dom = [c for c in cabinets_eq if _domain(c) == dom]
        same_mod = [c for c in same_dom if c.get("module") and c.get("module") == dev.get("module")]
        for pool in (same_mod, same_dom, cabinets_eq):
            if pool:
                return sorted(pool, key=lambda c: str(c["tag"]))[0]
        return None

    by_cab: dict = {e["tag"]: [] for e in cabinets_eq}
    n_unassigned = 0
    for dev, dom in housed:
        cab = _pick_cabinet(dev, dom)
        if cab is None:
            n_unassigned += 1
            continue
        by_cab[cab["tag"]].append({
            "tag": dev["tag"], "name": dev["name"], "type": dev["type"],
            "function": dev.get("transformation", "—"),
            "n_in": len(dev.get("inputs") or []), "n_out": len(dev.get("outputs") or []),
            "inputs": (dev.get("inputs") or [])[:6], "outputs": (dev.get("outputs") or [])[:6],
            "connected": dev["tag"] not in concern_tags})

    cabinets = []
    for cab in sorted(cabinets_eq, key=lambda c: str(c["tag"])):
        contents = by_cab[cab["tag"]]
        cab_connected = cab["tag"] not in concern_tags
        all_conn = cab_connected and all(c["connected"] for c in contents)
        cabinets.append({
            "tag": cab["tag"], "name": cab["name"], "domain": _domain(cab),
            "module": cab.get("module"), "connected": cab_connected,
            "n_in": len(cab.get("inputs") or []), "n_out": len(cab.get("outputs") or []),
            "inputs": (cab.get("inputs") or [])[:6], "outputs": (cab.get("outputs") or [])[:6],
            "n_contents": len(contents), "contents": contents,
            "all_connected": all_conn})
    n_all_conn = sum(1 for c in cabinets if c["all_connected"])
    return {
        "n_cabinets": len(cabinets),
        "n_housed": len(housed) - n_unassigned,
        "n_unassigned": n_unassigned,
        "n_cabinets_all_connected": n_all_conn,
        "all_cabinets_proven": n_all_conn == len(cabinets) and n_unassigned == 0,
        "cabinets": cabinets}


def _classify(name: str, tag: str) -> str:
    blob = f"{name} {tag}".lower()
    for typ, rx in TYPE_RULES:
        if re.search(rx, blob, re.I):
            return typ
    return "other"


def _load(p: Path):
    try:
        return json.loads(p.read_text())
    except Exception:
        return None


def _is_connection(r: dict) -> bool:
    return (r.get("status") == "ROUTED" or bool(re.fullmatch(r"C\d+", str(r.get("tag", ""))))
            or str(r.get("basis", "")).startswith(("pipe ", "cable ", "gas ")))


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: parts_ledger.py <out_dir> [state.json]", file=sys.stderr)
        return 2
    out_dir = Path(sys.argv[1]).resolve()
    state_path = Path(sys.argv[2]) if len(sys.argv) > 2 else out_dir / "state.json"
    ddir = out_dir / "drawings"
    state = _load(state_path) or {}
    manifest = _load(out_dir / "parts-manifest.json") or {}
    conn = _load(out_dir / "connection-schedule.json") or {}
    # connection-ledger.json is the AUTHORITATIVE connection graph (every part→part tie:
    # fluid, electrical, SIGNAL, air, oxygen, assembly) — the SAME graph Blender renders
    # and the BoM costs. connection-schedule.json is only the SIZED cable/pipe runs (no
    # signal ties, only a subset of electrical), so building connectivity from it alone
    # manufactures false orphans for every instrument/controller (whose tie is a signal
    # wire, never a sized power cable) and for distribution gear wired in the ledger but
    # not the sizing schedule. We attach inputs/outputs from BOTH: the schedule gives the
    # sized via + cost + drawing coverage; the ledger closes the connectivity graph.
    # Universal — no per-class logic. (Tristan 2026-06-24: audit the graph that is real.)
    cledger = _load(out_dir / "connection-ledger.json") or {}
    route = _load(out_dir / "route-manifest.json") or {}
    rb = state.get("requirementsBom") or []

    # ── tool invocations + calculations (Tristan 2026-06-18) ──────────────────────
    # The ledger shows which tools were invoked for each part and the calculations
    # resulting from the tools. Tools live in 4-orchestrator-tools-used.json; each
    # tool has claims[] (output fields → values) and worked[] (label, formula,
    # substitution, inputs, result, assumptions). We join tools → equipment by
    # three strategies: (1) contract-quantity key in the part's basis text,
    # (2) equipment name/tag in the tool's worked-calculation text, (3) tool-name
    # type-match (pump-sizing → Recirc Pump). Universal — no per-class logic.
    tools_used = _load(out_dir / "4-orchestrator-tools-used.json") or {}
    tools_list = tools_used.get("tools", []) if isinstance(tools_used, dict) else []
    contract = state.get("engineeringContract") or {}
    contract_qty = contract.get("quantities", {}) if isinstance(contract, dict) else {}

    # Build: contract_quantity_key → tool_id (from claims[].output_field)
    qty_to_tool: dict[str, str] = {}
    for tool in tools_list:
        tid = str(tool.get("tool_id", ""))
        for c in (tool.get("claims") or []):
            for fld in (c.get("output_field"), c.get("field")):
                if fld:
                    qty_to_tool[str(fld)] = tid

    # Build: normalised equipment name tokens → set of tool_ids (type-match)
    TYPE_KW = {
        "pump": ["pump"], "vessel": ["vessel", "tank", "reactor", "silo"],
        "exchanger": ["heat exchanger", "hex", "chiller", "oxygenat", "degas"],
        "separator": ["filter", "screen", "clarifi", "cyclone", "membrane", "biofilter", "mbbr"],
        "rotating": ["blower", "fan", "compressor", "skimmer", "aerat"],
        "electrical": ["cable", "transformer", "switchgear", "panel", "breaker", "mcc"],
        "instrument": ["sensor", "gauge", "meter", "transmitter", "analy", "probe"],
        "valve": ["valve", "solenoid", "actuator"],
        "control": ["controller", "plc", "scada", "ups", "gateway", "switch"],
    }

    def _find_tools_for_equipment(eq_tag: str, eq_name: str, eq_basis: str) -> list:
        relevant: dict[str, dict] = {}
        nm_l = (eq_name or "").lower()
        tag_l = (eq_tag or "").lower()
        basis_l = (eq_basis or "").lower()

        for tool in tools_list:
            tid = str(tool.get("tool_id", ""))
            tname = str(tool.get("tool_name", ""))
            worked = tool.get("worked") or []
            claims = tool.get("claims") or []
            matched_calcs = []
            matched_claims = []

            # Strategy 1: equipment name/tag appears in worked-calc text
            for w in worked:
                txt = f"{w.get('label','')} {w.get('formula','')} {w.get('substitution','')}".lower()
                if nm_l and len(nm_l) >= 4 and nm_l in txt:
                    matched_calcs.append(w)
                elif tag_l and len(tag_l) >= 2 and tag_l in txt:
                    matched_calcs.append(w)

            # Strategy 2: claim output_field appears in the part's basis text.
            # Tightened: require the field to be ≥6 chars (avoids false matches
            # like 'ki' in 'rating-based' or 'pi' in 'pipe') AND require a
            # word-boundary match (not a substring).
            import re as _re
            for c in claims:
                for fld in (c.get("output_field"), c.get("field")):
                    if not fld: continue
                    fld_s = str(fld)
                    if len(fld_s) < 6: continue  # skip short fields (ki, pi, etc.)
                    if _re.search(r'\b' + _re.escape(fld_s.lower()) + r'\b', basis_l):
                        matched_claims.append(c)
                        break

            # Strategy 3: tool-name type-match (pump-sizing → Recirc Pump).
            # Tightened: require the keyword to be the PRIMARY noun in the equipment
            # name (first word or immediately after a qualifier like 'recirc').
            # This prevents 'control-systems:pid-tuning' matching every part with
            # 'control' anywhere in the name.
            type_match = False
            tid_l = tid.lower()
            for _, keywords in TYPE_KW.items():
                if any(kw in tid_l for kw in keywords):
                    # Check if the keyword appears as a significant word in the name
                    # (not just a substring). Split the name into words and check.
                    nm_words = nm_l.split()
                    for kw in keywords:
                        for nw in nm_words:
                            if kw in nw and len(nw) >= 3:
                                type_match = True
                                break
                        if type_match: break
                    if type_match: break

            if matched_calcs or matched_claims or type_match:
                # When type-matching (e.g. pump-sizing → Recirc Pump), include ALL
                # the tool's calculations — the tool was invoked FOR this type of
                # equipment, so its worked calcs are relevant even if the label
                # doesn't name the specific part.
                calcs_to_include = matched_calcs if matched_calcs else worked[:5]
                claims_to_include = matched_claims if matched_claims else claims[:5]
                relevant[tid] = dict(
                    tool_id=tid, tool_name=tname,
                    calculations=[
                        dict(label=w.get("label"), formula=w.get("formula"),
                             substitution=w.get("substitution"),
                             result=w.get("result"),
                             assumptions=w.get("assumptions", []))
                        for w in calcs_to_include[:5]],
                    claims=[
                        dict(field=c.get("output_field") or c.get("field"),
                             value=c.get("value"), unit=c.get("unit"))
                        for c in claims_to_include[:5]],
                    type_match=type_match and not matched_calcs and not matched_claims)

        return list(relevant.values())

    placed = {str(p.get("equipment_tag") or p.get("tag")): p
              for p in (manifest.get("parts", []) if isinstance(manifest, dict) else [])}
    subs: dict[str, list] = {}
    for r in rb:
        if r.get("status") == "SUB-COMPONENT" and r.get("sub_of"):
            subs.setdefault(str(r["sub_of"]), []).append(r)

    # ── tag-collision detection (universal identity resolution) ──────────────────
    # A tag is AMBIGUOUS when the same tag maps to >1 distinct normalised equipment
    # name in the BoM (e.g. tag 'B' → 'aeration blower' AND 'degassing blower'; tag
    # 'AT' → 7 different analysers). For ambiguous tags, tag-only matching would
    # credit coverage for equipment that isn't drawn — a different unit shares the
    # tag. The covered() function requires NAME corroboration for ambiguous tags.
    _tag_names: dict[str, set] = {}
    for r in rb:
        if r.get("status") == "SUB-COMPONENT" or _is_connection(r):
            continue
        tag = str(r.get("tag", "")).strip()
        if not tag or tag == "—":
            continue
        req = str(r.get("requirement", ""))
        nm = _norm(req.split("·")[0].strip() or str(r.get("part", "")) or tag)
        _tag_names.setdefault(tag, set()).add(nm)
    ambiguous_tags = {t for t, names in _tag_names.items() if len(names) > 1}

    # rendered text per view (deterministic, no OCR)
    def _svg_text(f: Path) -> str:
        return " " + " ".join(re.findall(r">([^<>]+)<", f.read_text(errors="ignore"))) + " " \
            if f.exists() else ""

    rep_text = {"blender": ""}
    for key in REPS:
        if key == "blender":
            continue
        if key == "isometric-index":
            # the isometrics are PER-LINE spool files (isometric-201-PR-DN300.svg …), NOT a
            # single index sheet — `isometric-index.svg` never exists, so the old single-file
            # read gave EVERY part ISO=absent (false 0/N). A part is on the ISO set if it is
            # named on ANY spool, so AGGREGATE every spool's text. (Connection ISO coverage
            # already keys on the per-line spool file; this fixes the PART side.)
            rep_text[key] = " ".join(_svg_text(f) for f in sorted(ddir.glob("isometric-*.svg")))
            continue
        rep_text[key] = _svg_text(ddir / f"{key}.svg")
    placed_norms = {_norm(str(p.get("name", ""))) for p in placed.values()}

    def covered(tag: str, name: str, key: str) -> bool:
        if key == "blender":
            return tag in placed or _norm(name) in placed_norms
        txt = rep_text.get(key, "")
        if not txt:
            return False
        nm = (name or "").strip()
        name_present = bool(nm and len(nm) >= 4 and nm.lower() in txt.lower())
        if tag and (f" {tag} " in txt or f">{tag}<" in txt):
            # Tag is present in the drawing. If the tag is UNAMBIGUOUS (unique
            # identity — one equipment per tag), credit on tag alone. If the tag
            # is AMBIGUOUS (collision: same tag → different equipment), require
            # the NAME to also be present — otherwise we'd credit coverage for a
            # different unit that happens to share the tag.
            if tag not in ambiguous_tags:
                return True
            return name_present
        if name_present:
            return True
        # ISA-bubble credit: an instrument/valve is drawn on a P&ID (or single-line) by its ISA
        # LETTER (TT/PT/LT/AT/FCV/XV/PSV), not its manifest tag — credit when the function's symbol
        # is present in the drawing text. Corrects a matcher false-negative (the part IS drawn).
        if key in ("pid", "single-line-diagram"):
            for L in _isa_letters(tag, name):
                if re.search(rf"\b{re.escape(L)}\b", txt):
                    return True
        return name_present

    # ── 1. PARTS (equipment) — identity + BoM/cost + coverage (I/O attached below) ──
    equipment = []
    grand = sum(r.get("line_gbp", 0) or 0 for r in rb)
    for r in rb:
        if r.get("status") == "SUB-COMPONENT" or _is_connection(r):
            continue
        tag = str(r.get("tag", ""))
        req = str(r.get("requirement", ""))
        name = (req.split("·")[0].strip() or str(placed.get(tag, {}).get("name", "")) or tag)
        typ = _classify(name, tag)
        pm = placed.get(tag, {})
        sublist = subs.get(tag, [])
        cov = {key: covered(tag, name, key) for key in REPS}
        expected = TYPE_EXPECTED.get(typ, set())
        basis_full = str(r.get("basis", ""))
        eq_tools = _find_tools_for_equipment(tag, name, basis_full)
        equipment.append(dict(
            tag=tag, name=name, type=typ, module=pm.get("module"), ikey=_norm(name),
            requirement=req, part=r.get("part"), status=r.get("status"),
            qty=r.get("qty"), unit_gbp=r.get("unit_gbp"), line_gbp=r.get("line_gbp"),
            basis=basis_full[:90], subcomponents=len(sublist),
            subcomponent_gbp=round(sum(s.get("breakdown_gbp", 0) or 0 for s in sublist)),
            modelled_qty=(pm.get("qty") if pm else 0), dims_mm=pm.get("dims_mm"),
            transformation=TRANSFORM.get(typ, "—"),
            coverage=cov, expected=sorted(expected),
            gaps=sorted(k for k in expected if not cov.get(k)),
            tools=eq_tools,
            inputs=[], outputs=[]))

    # resolver: a connection-schedule internal key → the equipment row (by norm name)
    eq_by_key: dict[str, dict] = {}
    for e in equipment:
        eq_by_key.setdefault(e["ikey"], e)
    def resolve(ikey: str):
        if ikey in eq_by_key:
            return eq_by_key[ikey]
        for k, e in eq_by_key.items():          # loose contains-match (rotary_drum_filter↔drum filter)
            if k and (k in ikey or ikey in k):
                return e
        return None

    # ── 2. CONNECTIONS (pipes / wires / sensor ties) — endpoints + via + coverage ──
    rows = conn.get("rows", []) if isinstance(conn, dict) else []
    specs = conn.get("specs", []) if isinstance(conn, dict) else []
    route_lines = (route.get("lines") if isinstance(route, dict) else None) or []
    runname_to_lineno = {l.get("run_name"): l.get("line_number")
                         for l in route_lines if isinstance(l, dict)}
    tagpair_to_lineno = {(_norm(str(l.get("from_tag", ""))), _norm(str(l.get("to_tag", "")))):
                         l.get("line_number") for l in route_lines if isinstance(l, dict)}
    connections = []
    # ties already attached from the SIZED schedule, keyed (from_norm, to_norm, mech) so
    # the authoritative-ledger pass below never double-lists the same physical run.
    attached_pairs: set = set()
    for i, r in enumerate(rows):
        fr_key, to_key = _norm(str(r.get("from", ""))), _norm(str(r.get("to", "")))
        mech = r.get("mechanism", "")
        spec = specs[i] if i < len(specs) and isinstance(specs[i], dict) else {}
        kind = spec.get("kind") or MECH_KIND.get(mech, "pipe")
        size = r.get("size") or spec.get("size_label") or ""
        lineno = runname_to_lineno.get(spec.get("run_name")) or tagpair_to_lineno.get((fr_key, to_key))
        fe, te = resolve(fr_key), resolve(to_key)
        fn = fe["name"] if fe else fr_key.title()
        tn = te["name"] if te else to_key.title()
        # coverage by the AUTHORITATIVE line number (exact join via route-manifest): the
        # P&ID + line-list label the line number, the isometric spool file is named for
        # it, the Blender route-manifest carries the run. P&ID falls back to "both
        # endpoint symbols present" when the line number itself is not labelled.
        ln = str(lineno or "")
        both_pid = (covered((fe or {}).get("tag", ""), fn, "pid")
                    and covered((te or {}).get("tag", ""), tn, "pid"))
        cov = dict(
            pid=bool(ln and ln in rep_text.get("pid", "")) or both_pid,
            process_schedules=bool(ln and ln in rep_text.get("process-schedules", "")),
            isometric=bool(lineno and (ddir / f"isometric-{lineno}.svg").exists()),
            route=bool(lineno),
        )
        via = f"{kind} {size}".strip()
        connections.append(dict(
            idx=i, line_number=lineno, from_part=fn, from_tag=(fe or {}).get("tag"), to_part=tn,
            to_tag=(te or {}).get("tag"), mechanism=mech, kind=kind, via=via,
            size=size, rating=r.get("rating"), length_m=r.get("length_m"),
            line_gbp=r.get("line_total_gbp") or r.get("line_gbp"),
            within_spec=r.get("within_spec"), coverage=cov))
        # attach to the endpoint parts' inputs/outputs (NAME the part + via-element)
        if te:
            te["inputs"].append(f"{fn} ({(fe or {}).get('tag') or '?'}) via {via} [{mech}]")
        if fe:
            fe["outputs"].append(f"{tn} ({(te or {}).get('tag') or '?'}) via {via} [{mech}]")
        if fe or te:
            attached_pairs.add((fr_key, to_key, mech))

    # ── 2b. AUTHORITATIVE LEDGER TIES — close the connectivity graph ──────────────────
    # The sized schedule above carries only cables + pipes; the connection-ledger holds
    # EVERY tie Blender drew (signal wires to the DCS, the full electrical spine, air /
    # oxygen / assembly). Attach each ledger tie not already represented by a sized run so
    # an instrument/controller shows its signal connector and distribution gear shows its
    # power in+out. Same `via [mech]` idiom; coverage/cost stay schedule-driven. Universal.
    cledger_rows = cledger.get("rows", []) if isinstance(cledger, dict) else []
    n_ledger_attached = 0
    for r in cledger_rows:
        fr_key, to_key = _norm(str(r.get("from_part", ""))), _norm(str(r.get("to_part", "")))
        mech = r.get("mechanism", "") or r.get("service", "")
        if (fr_key, to_key, mech) in attached_pairs:
            continue
        fe, te = resolve(fr_key), resolve(to_key)
        if not (fe or te):
            continue
        attached_pairs.add((fr_key, to_key, mech))
        kind = MECH_KIND.get(mech, MECH_KIND.get(r.get("service", ""), "tie"))
        fn = fe["name"] if fe else fr_key.title()
        tn = te["name"] if te else to_key.title()
        if te:
            te["inputs"].append(f"{fn} ({(fe or {}).get('tag') or '?'}) via {kind} [{mech}]")
        if fe:
            fe["outputs"].append(f"{tn} ({(te or {}).get('tag') or '?'}) via {kind} [{mech}]")
        n_ledger_attached += 1

    # ── reconciliations / summaries ──
    by_drawing = {}
    for key in REPS:
        exp = [e for e in equipment if key in e["expected"]]
        pres = [e for e in exp if e["coverage"].get(key)]
        by_drawing[key] = dict(expected=len(exp), present=len(pres),
                               pct=round(100 * len(pres) / len(exp), 1) if exp else None)
    conn_cov = {}
    for key in ("pid", "process_schedules", "isometric", "route"):
        vals = [c["coverage"][key] for c in connections if c["coverage"][key] is not None]
        # P&ID shows process pipes (+ instruments/valves), NOT electrical power
        # cables or signal wires — those belong on the SLD / network drawing.
        # Excluding non-pipe connections from the P&ID applicable set corrects
        # the denominator so the coverage % is honest (universal — keyed by kind).
        applic = [c for c in connections
                  if not (key == "isometric" and "pipe" not in c["kind"])
                  and not (key == "pid" and "pipe" not in c["kind"])]
        pres = sum(1 for c in applic if c["coverage"][key])
        conn_cov[key] = dict(present=pres, applicable=len(applic),
                             pct=round(100 * pres / len(applic), 1) if applic else None)
    not_found = [e["tag"] for e in equipment if e["status"] == "NOT FOUND"]
    gapped = [e for e in equipment if e["gaps"]]

    # ── connectivity audit (type-aware) ────────────────────────────────────────
    # What "connected" means depends on the part TYPE:
    #
    # PROCESS EQUIPMENT (vessel, rotating, exchanger, separator, valve):
    #   Must have ≥1 input AND ≥1 output — something flows in, something flows out.
    #   Missing either = genuine topology gap.
    #
    # INSTRUMENTS (sensor, analyser, gauge):
    #   Must have ≥1 connection (input OR output) — it's associated with what it
    #   measures. Two connections is normal (sense + signal), one is minimum.
    #   Zero connections = orphan sensor, not wired to anything.
    #
    # ELECTRICAL (breaker, busbar, contactor, transformer):
    #   Must have ≥1 input AND ≥1 output — power flows through.
    #   Missing = wiring gap.
    #
    # CONTROL (PLC, controller, HMI):
    #   Must have ≥1 connection — at least a signal connection.
    #
    # STRUCTURAL/PASSIVE (frames, panels, doors, cladding, foundations):
    #   No process connections expected. Never flagged.
    #
    # ORIGINS (grid, water supply, feed, fuel, air intake):
    #   Legitimate start points — no input required, but SHOULD have output.
    #
    # SINKS (drains, effluent, waste, exhaust):
    #   Legitimate end points — no output required, but SHOULD have input.

    ORIGIN_KEYWORDS = {"grid", "mains", "water supply", "water intake", "make-up water",
                       # a make-up / dosing / day tank is fed by manual delivery (bagged
                       # reagent, tanker) — a battery-limit ORIGIN with an OUTPUT only.
                       # Aligns parts_ledger with connection_ledger._FLUID_ORIGIN_RE which
                       # already exempts "make-up" (Tristan 2026-06-24: the two audits must
                       # agree on what is a legitimate single-direction origin).
                       "make-up", "makeup", "make up",
                       "feed", "food", "fuel", "air intake", "seawater", "freshwater",
                       "oxygen supply", "chemical supply", "intake",
                       # a stored-medium SUPPLY tank (LOX / bulk chemical / fuel storage)
                       # is a battery-limit FEED — it legitimately has an OUTPUT only (it
                       # is filled by tanker, not piped from the process). Type-keyed.
                       "lox", "liquid oxygen", "bulk storage", "supply tank", "storage tank",
                       "day tank", "bulk tank", "buffer tank", "dosing tank"}
    SINK_KEYWORDS = {"drain", "effluent", "discharge", "waste", "sludge", "exhaust",
                     "heat rejection", "mortality", "overflow", "reject"}
    # a BUFFER / SURGE / EXPANSION vessel is a DEAD-LEG on the loop: it tees off at a
    # single point to absorb thermal expansion / pressure surge / level swing, so it
    # legitimately has ONE process connection (not a flow-through in + out). Universal —
    # keyed on the vessel ROLE word, no per-part table.
    BUFFER_KEYWORDS = {"expansion", "surge", "buffer", "accumulator", "balance tank",
                       "break tank", "header tank", "expansion vessel", "expansion reservoir"}

    PROCESS_TYPES = {"vessel", "rotating", "exchanger", "separator", "valve"}
    ELECTRICAL_TYPES = {"electrical"}
    INSTRUMENT_TYPES = {"instrument"}
    CONTROL_TYPES = {"control"}
    PASSIVE_TYPES = {"structural", "other"}
    # AIR-SERVICE / SUB-COMPONENT parts that get a PROCESS etype ("rotating" blower,
    # "exchanger" HVAC unit, an MBBR media fill) but carry AIR or belong to a PARENT —
    # NOT a process-WATER flow-through node. Their correct tie is an air line / a parent
    # edge, so requiring a water in+out is wrong (it deflated the coverage to 74 %). This
    # mirrors the connection_ledger completeness audit's air-mover + sub-component
    # exemptions, so the two connectivity gates agree. (Tristan 2026-06-20.)
    AIR_OR_SUBCOMPONENT_KEYWORDS = {
        "blower", "fan", "ventilation", "dehumidifier", "hrv", "air handling",
        "air handler", "ahu", "hvac", "extract air", "supply air", "ducting",
        "media", "carrier", "biofilm carrier", "screen panel", "mesh panel",
        "filter element", "backwash",
        # FINAL-CONTROL ELEMENTS (actuators on a line, not flow-through nodes), SUB-
        # COMPONENTS (a filter's own screen), and DRY material-handling stations (solids,
        # not process water) are NOT process-WATER both-fluid nodes — requiring each to
        # have its own fluid in+out wrongly deflated coverage to 76 % (Tristan 2026-06-21).
        # The STRICT connection-ledger completeness check models each part's REAL required
        # ties and already passes them; it stays the authoritative gate + the backstop for a
        # genuinely disconnected part. Universal role keywords, no per-class table.
        "control valve", "solenoid", "diffuser", "filter screen", "drum filter screen",
        "feed storage", "feed distribution", "feed system", "grading", "harvest",
        "mortality", "live-fish handling", "biosecurity",
        # SAFETY-RELIEF devices are DEAD-LEG taps off a protected vessel discharging to
        # atmosphere / flare / a header — NOT inline flow-through nodes. Like a buffer or
        # a control valve they do not carry the process loop, so requiring each to have
        # its own fluid in+out is a false orphan (the PSV on a reactor reads "no upstream"
        # because the relief tap is not drawn as a process line). Universal role keywords.
        "relief valve", "safety valve", "pressure-relief", "pressure relief", "psv",
        "rupture disc", "bursting disc", "vacuum breaker", "breather valve", "vent valve"}

    connectivity_concerns = []
    origin_parts = []
    sink_parts = []
    n_process_total = 0
    n_process_connected = 0
    n_instrument_total = 0
    n_instrument_associated = 0
    n_electrical_total = 0
    n_electrical_connected = 0

    # ── identity folding (universal — fixes the duplicate-line false orphan) ─────
    # The SAME physical part appears as several BoM lines (e.g. "Level Transmitter"
    # at 10 tanks + 1 sump + 8 lines = three rows, one IDENTITY; "Inlet Flow Control
    # Valve" ×3). The connection schedule wires ONE edge per identity (LT → Main
    # Controller), and resolve() attaches it to ONE row — so the other rows read 0/0
    # and were counted as separate orphans, deflating the %. Connectivity is a
    # property of the part IDENTITY (tag + normalised name), NOT of each duplicate
    # line: if ANY row of an identity carries the connection, the identity is wired,
    # and the identity counts ONCE. Keyed on (tag, norm-name) — no per-part table.
    ident_io: dict[tuple, dict] = {}
    for e in equipment:
        key = (str(e["tag"] or "—"), _norm(e["name"]))
        agg = ident_io.setdefault(key, {"has_in": False, "has_out": False})
        if e["inputs"]:
            agg["has_in"] = True
        if e["outputs"]:
            agg["has_out"] = True

    seen_idents: set = set()
    for e in equipment:
        ident = (str(e["tag"] or "—"), _norm(e["name"]))
        # evaluate each IDENTITY exactly once (the first row carries the verdict);
        # later duplicate rows of the same identity are skipped for the tally.
        if ident in seen_idents:
            continue
        seen_idents.add(ident)
        agg = ident_io.get(ident, {"has_in": bool(e["inputs"]), "has_out": bool(e["outputs"])})
        has_in = agg["has_in"]
        has_out = agg["has_out"]
        has_any = has_in or has_out
        name_l = (e["name"] or "").lower()
        tag = e["tag"] or "—"
        etype = e.get("type", "other")
        is_origin = any(kw in name_l for kw in ORIGIN_KEYWORDS)
        is_sink = any(kw in name_l for kw in SINK_KEYWORDS)

        if is_origin and not has_in:
            origin_parts.append({"tag": tag, "name": e["name"], "type": etype})
        if is_sink and not has_out:
            sink_parts.append({"tag": tag, "name": e["name"], "type": etype})

        if etype in PASSIVE_TYPES:
            continue  # structural elements — never a connectivity concern

        # AIR-mover / HVAC / sub-component: carries AIR or belongs to a parent, NOT a
        # process-WATER flow-through node — its air/parent tie is the correct connection,
        # so it must not be counted in the process-WATER both-fluid coverage (else a
        # blower/ventilation unit wrongly drags the % down). Aligns with the
        # connection_ledger audit's exemptions. (Tristan 2026-06-20 connectivity fix.)
        if etype in PROCESS_TYPES and any(kw in name_l for kw in AIR_OR_SUBCOMPONENT_KEYWORDS):
            continue

        is_buffer = any(kw in name_l for kw in BUFFER_KEYWORDS)

        if etype in PROCESS_TYPES:
            n_process_total += 1
            # a BUFFER / surge / expansion vessel is a DEAD-LEG — one tie is correct, so
            # it only needs ≥1 connection (in OR out), like an instrument's association.
            if is_buffer:
                if has_in or has_out:
                    n_process_connected += 1
                else:
                    connectivity_concerns.append({
                        "tag": tag, "name": e["name"], "type": etype,
                        "issue": "missing_connection",
                        "detail": "Buffer/surge/expansion vessel not tied to the loop — "
                                  "a dead-leg vessel still needs its single tee connection."})
                continue
            needs_in = not is_origin
            needs_out = not is_sink
            ok = True
            if needs_in and not has_in:
                connectivity_concerns.append({
                    "tag": tag, "name": e["name"], "type": etype,
                    "issue": "missing_input",
                    "detail": f"Process equipment with no upstream connection — "
                              f"nothing feeds into this {etype}. The topology is incomplete."})
                ok = False
            if needs_out and not has_out:
                connectivity_concerns.append({
                    "tag": tag, "name": e["name"], "type": etype,
                    "issue": "missing_output",
                    "detail": f"Process equipment with no downstream connection — "
                              f"nothing leaves this {etype}. Where does the flow go?"})
                ok = False
            if ok:
                n_process_connected += 1

        elif etype in INSTRUMENT_TYPES:
            n_instrument_total += 1
            if not has_any:
                connectivity_concerns.append({
                    "tag": tag, "name": e["name"], "type": etype,
                    "issue": "orphan_instrument",
                    "detail": "Sensor/analyser with no connection — not wired to "
                              "what it measures or to the control system."})
            else:
                n_instrument_associated += 1

        elif etype in ELECTRICAL_TYPES:
            n_electrical_total += 1
            # A TERMINAL / PASSIVE electrical device legitimately has no downstream
            # LOAD edge — it is the END of a circuit, not a distributor: a fuse / surge
            # protector (SPD) / protective relay protects the bus it taps; a cable tray
            # / terminal block / enclosure panel is passive containment. These need a
            # power feed IN (where present) but NOT an OUT — the electrical analogue of
            # a process SINK. Universal, name-only (no class table). A part with NO
            # required electrical role at all (a pure enclosure with no power feed) is
            # not a concern in either direction.
            is_terminal_elec = bool(re.search(
                r"\bfuse\b|surge|\bSPD\b|protective relay|protection relay|safety relay|"
                r"motor[- ]?protection|\bMPCB\b|earth leakage|\bRCD\b|\bRCBO\b|\bMCB\b|"
                r"cable tray|terminal block|enclosure|junction box|\bgland\b",
                name_l, re.I))
            needs_in = not is_origin and not (is_terminal_elec and not has_any)
            needs_out = not is_sink and not is_terminal_elec
            ok = True
            if needs_in and not has_in:
                connectivity_concerns.append({
                    "tag": tag, "name": e["name"], "type": etype,
                    "issue": "missing_input",
                    "detail": f"Electrical component with no upstream power supply."})
                ok = False
            if needs_out and not has_out:
                connectivity_concerns.append({
                    "tag": tag, "name": e["name"], "type": etype,
                    "issue": "missing_output",
                    "detail": f"Electrical component with no downstream load."})
                ok = False
            if ok:
                n_electrical_connected += 1

        elif etype in CONTROL_TYPES:
            if not has_any:
                connectivity_concerns.append({
                    "tag": tag, "name": e["name"], "type": etype,
                    "issue": "orphan_controller",
                    "detail": "Controller with no signal connections — not wired "
                              "to anything it controls."})

    # orphan = a PROCESS-type IDENTITY with no edge on ANY of its rows (identity-
    # folded, same as the connectivity tally — a duplicate line whose sibling row
    # carries the edge is not an orphan).
    orphans = []
    _orph_seen: set = set()
    for e in equipment:
        if e["type"] not in PROCESS_TYPES:
            continue
        ident = (str(e["tag"] or "—"), _norm(e["name"]))
        if ident in _orph_seen:
            continue
        _orph_seen.add(ident)
        agg = ident_io.get(ident, {})
        if not agg.get("has_in") and not agg.get("has_out"):
            orphans.append(e["tag"])

    uncov_conn = [f"{c['from_part']}→{c['to_part']}" for c in connections
                  if "pipe" in c["kind"] and not c["coverage"]["pid"]]

    for e in equipment:
        e.pop("ikey", None)

    # ── tool summary: which tools computed what, how many parts they cover ──────
    tool_summary: dict[str, dict] = {}
    for e in equipment:
        for t in (e.get("tools") or []):
            tid = t["tool_id"]
            if tid not in tool_summary:
                tool_summary[tid] = dict(
                    tool_id=tid, tool_name=t["tool_name"],
                    n_parts=0, n_calculations=0, n_claims=0,
                    sample_calculations=[])
            ts = tool_summary[tid]
            ts["n_parts"] += 1
            ts["n_calculations"] += len(t.get("calculations") or [])
            ts["n_claims"] += len(t.get("claims") or [])
            for calc in (t.get("calculations") or [])[:1]:
                if len(ts["sample_calculations"]) < 3:
                    ts["sample_calculations"].append(dict(
                        part=f"{e['tag']} {e['name'][:20]}",
                        label=calc.get("label"),
                        substitution=calc.get("substitution")))
    # parts with NO tool provenance
    parts_without_tools = [e["tag"] for e in equipment if not e.get("tools")]

    # ── CABINETS — house every small electrical/control device + prove its connectors ──
    _concern_tags = {c["tag"] for c in connectivity_concerns}
    cabinets = _build_cabinets(equipment, _concern_tags)

    report = dict(out_dir=str(out_dir), grand_total_gbp=round(grand), n_equipment=len(equipment),
                  n_connections=len(connections),
                  connections_gbp=round(sum(c["line_gbp"] or 0 for c in connections)),
                  coverage_by_drawing=by_drawing, connection_coverage=conn_cov,
                  not_found=not_found, n_gapped=len(gapped), orphan_equipment=orphans,
                  n_connections_off_pid=len(uncov_conn),
                  n_ambiguous_tags=len(ambiguous_tags),
                  ambiguous_tags=sorted(ambiguous_tags),
                  n_tools=len(tool_summary),
                  n_parts_without_tools=len(parts_without_tools),
                  parts_without_tools=parts_without_tools[:30],
                  tool_summary=list(tool_summary.values()),
                  equipment=equipment, connections=connections,
                  connectivity=dict(
                      n_concerns=len(connectivity_concerns),
                      concerns=connectivity_concerns,
                      n_origins=len(origin_parts), origins=origin_parts,
                      n_sinks=len(sink_parts), sinks=sink_parts,
                      n_process_total=n_process_total,
                      n_process_connected=n_process_connected,
                      n_instrument_total=n_instrument_total,
                      n_instrument_associated=n_instrument_associated,
                      n_electrical_total=n_electrical_total,
                      n_electrical_connected=n_electrical_connected,
                      n_orphans=len(orphans)),
                  cabinets=cabinets)
    (out_dir / "parts-ledger.json").write_text(json.dumps(report, indent=1))

    # ── printed ledger + coverage ──
    print(f"\n  LEDGER (BoM + connectivity + coverage + tools) — {out_dir.name}   "
          f"£{round(grand):,} raw materials   {len(equipment)} parts + {len(connections)} connections   "
          f"{len(tool_summary)} tools invoked")
    hdr = ("  " + f"{'tag':7}{'type':10}{'name':22}{'£ line':>9} {'in/out':>6} {'status':9}{'tool':>16}"
           + "".join(f"{SHORT[k]:>5}" for k in REPS))
    print(hdr); print("  " + "-" * (len(hdr) - 2))
    for e in equipment:
        cells = "".join(f"{'  ✓':>5}" if e["coverage"].get(k) else
                        (f"{'  ✗':>5}" if k in e["expected"] else f"{'  ·':>5}") for k in REPS)
        lg = f"{e['line_gbp']:>8,.0f}" if e.get("line_gbp") is not None else "       —"
        io = f"{len(e['inputs'])}/{len(e['outputs'])}"
        etools = (e.get("tools") or [])
        tshort = etools[0]["tool_id"].split(":")[-1][:15] if etools else "—"
        if len(etools) > 1:
            tshort += f" +{len(etools)-1}"
        print(f"  {e['tag']:7}{e['type']:10}{e['name'][:21]:22}{lg} {io:>6} "
              f"{str(e['status'] or '')[:8]:9}{tshort:>16}{cells}")
    print("  " + "-" * (len(hdr) - 2))
    part_cov = "   ".join(f"{SHORT[k]} {by_drawing[k]['present']}/{by_drawing[k]['expected']}"
                          for k in REPS if by_drawing[k]['expected'])
    print(f"  PART coverage by drawing (present / expected):   {part_cov}")
    cc = []
    for k in ("pid", "process_schedules", "isometric", "route"):
        d = conn_cov[k]
        pct = "" if d["pct"] is None else f" ({d['pct']}%)"
        cc.append(f"{k} {d['present']}/{d['applicable']}{pct}")
    print("  CONNECTION coverage (pipes/wires/sensors vs the views):   " + "   ".join(cc))
    # tool summary
    if tool_summary:
        print(f"  TOOLS invoked ({len(tool_summary)}):")
        for ts in sorted(tool_summary.values(), key=lambda x: -x["n_parts"]):
            print(f"    {ts['tool_id']:40} → {ts['n_parts']:3} parts  {ts['n_calculations']:3} calcs  {ts['n_claims']:3} claims")
            for s in ts.get("sample_calculations", [])[:1]:
                print(f"      └ {s.get('part','?')[:24]:24} {str(s.get('label',''))[:40]}")
    print(f"  → {len(not_found)} NOT FOUND · {len(gapped)} parts w/ coverage gap · "
          f"{len(orphans)} orphan · {len(uncov_conn)} connections off the P&ID.  "
          f"{len(ambiguous_tags)} ambiguous tag(s) (name-corroborated).  "
          f"{len(parts_without_tools)}/{len(equipment)} parts have NO tool provenance.  "
          f"wrote parts-ledger.json")
    proc_pct = round(100 * n_process_connected / n_process_total, 1) if n_process_total else 0
    inst_pct = round(100 * n_instrument_associated / n_instrument_total, 1) if n_instrument_total else 0
    print(f"  → CONNECTIVITY: {len(connectivity_concerns)} concern(s) — "
          f"process {n_process_connected}/{n_process_total} connected ({proc_pct}%) · "
          f"instruments {n_instrument_associated}/{n_instrument_total} associated ({inst_pct}%) · "
          f"{len(origin_parts)} origin(s) · {len(sink_parts)} sink(s)\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
