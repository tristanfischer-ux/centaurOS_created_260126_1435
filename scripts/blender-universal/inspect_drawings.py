#!/usr/bin/env python3
"""
inspect_drawings.py — DETERMINISTIC self-examination of the 8 engineering drawings
+ the Blender renders. This is the LOOP's drawing-quality feedback signal: a
universal, class-agnostic auditor that reads each drawing's persisted SVG (the
exact rendered text — no OCR, fully deterministic) + its PNG (pixel statistics via
PIL) + state.json + connection-schedule.json, then scores every drawing 0-10 and
emits a structured defect list the engine can act on to self-correct.

Why this exists (Tristan 2026-06-16): "the loop should be examining the 8
engineering drawings and the blender deterministically to see how the loop can
improve itself — if you have not been inspecting each drawing how can it do that?"
The 34 chain gates audit the PDF BoM / parts / standards; NOTHING audited the
drawings themselves. Inspecting each by eye surfaced ~10 deterministic defect
classes (placeholder title blocks on 5/8, "Irrigation pump" in a fish farm, five
0.0 A powered loads, tank named differently across drawings, sparse P&ID
instrumentation, HVAC covering a fraction of the hall). Every one is computable.

USAGE
    python3 inspect_drawings.py <out_dir> [state.json]
        state.json defaults to <out_dir>/state.json

OUTPUT
    <out_dir>/drawings-inspection.json  — {overall_score, floor_drawing,
        per_drawing:[{key,score,defects:[{severity,check,detail,fix_hint}]}], ...}
    + a printed scorecard.

DESIGN
    - Pure, deterministic, defensive: a check that cannot run records `skipped`,
      never crashes the inspector. British spelling. No fabricated data.
    - Universal: checks are keyed off generic signals (a 0.0 A load, a placeholder
      token, a foreign-domain vocabulary word), not RAS specifics, so a heat-pump
      or BESS drawing set is examined by the same code.
    - Severity → penalty: blocker 5.0, major 2.5, minor 1.0. score = max(0, 10-Σ).
      overall_score = MIN across drawings (the ≥8-EVERYWHERE floor, not the mean).
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

PENALTY = {"blocker": 5.0, "major": 2.5, "minor": 1.0}

# Foreign-domain vocabulary: a word here on a drawing label is a wrong-class leak
# UNLESS the product class legitimately belongs to that domain. Mirrors the gate-34
# tool-archetype idea at the drawing-label level. {domain: (trigger tokens, class
# substrings that make the domain legitimate)}.
DOMAIN_VOCAB = {
    "agriculture": (("irrigation", "sprinkler", "orchard", "crop ", "drip line"),
                    ("farm", "agri", "vertical_farm", "greenhouse", "irrigation")),
    "marine":      (("seawater", "sacrificial anode", "hull ", "subsea", "ballast"),
                    ("auv", "uuv", "rov", "submarine", "marine", "subsea", "naval")),
}
# "aquaculture"/"ras" is a FISH-water class: it is NOT agriculture (no irrigation)
# and NOT marine (closed freshwater tanks, no hull/anode). So both leaks fire on RAS.
_AQUA = ("aquaculture", "ras", "fish", "rearing")


def _read(p: Path) -> str:
    try:
        return p.read_text(errors="ignore")
    except Exception:
        return ""


def _texts(svg: str) -> list[str]:
    """All rendered text fragments from an SVG (deterministic, order-preserving)."""
    return [t.strip() for t in re.findall(r">([^<>]+)<", svg) if t.strip()]


def _load_json(p: Path):
    try:
        return json.loads(p.read_text())
    except Exception:
        return None


def _class_of(state: dict) -> str:
    if not isinstance(state, dict):
        return ""
    for path in (("parsedBrief", "product_class"), ("moduleDecomposition", "product_class"),
                 ("orchestratorContract", "product_class"), ("keyMetrics", "product_class")):
        cur = state
        ok = True
        for k in path:
            if isinstance(cur, dict) and k in cur:
                cur = cur[k]
            else:
                ok = False
                break
        if ok and isinstance(cur, str) and cur:
            return cur.lower()
    return ""


# ─────────────────────────── per-drawing checks ────────────────────────────

def check_title_block(key: str, svg: str) -> list[dict]:
    out = []
    # Match the title-block placeholder LITERALS the generators emitted — the parenthesised
    # '(placeholder)' REV token and the 'YYYY-MM-DD' DATE token. NOT the bare word
    # 'placeholder', which appears legitimately in body prose (e.g. the P&ID note
    # 'loop numbers are auto-allocated placeholders.') and is not a title-block defect.
    if "(placeholder)" in svg or "YYYY-MM-DD" in svg:
        out.append(dict(severity="major", check="title_block_placeholder",
                        detail="title block still shows a placeholder REV/DATE "
                               "('—   (placeholder)' / 'YYYY-MM-DD')",
                        fix_hint=f"give draw_{key}.py the deterministic issue_date() "
                                 "+ real REV ('P1') from the shared drawing_titleblock module "
                                 "(import drawing_titleblock as _tb; _tb.REV / _tb.issue_date)"))
    return out


def check_domain_leak(key: str, texts: list[str], klass: str) -> list[dict]:
    out = []
    joined = " ".join(texts).lower()
    is_aqua = any(a in klass for a in _AQUA)
    for domain, (triggers, legit) in DOMAIN_VOCAB.items():
        legitimate = any(l in klass for l in legit)
        # RAS is neither agriculture nor marine even though it is water-based.
        if is_aqua:
            legitimate = False
        if legitimate:
            continue
        for tok in triggers:
            if tok in joined:
                out.append(dict(severity="major", check="cross_domain_label",
                                detail=f"'{tok.strip()}' ({domain}) appears on a "
                                       f"'{klass or 'unknown'}' drawing — wrong-domain label leak",
                                fix_hint="derive the label from the real equipment name in "
                                         "state, not a hardcoded domain default (e.g. "
                                         "draw_panel_schedule.py:_load_label irrigation branch)"))
                break
    return out


def check_single_line(svg: str, texts: list[str], state: dict) -> list[dict]:
    out = []
    # 1. zero-current powered loads
    zero = sum(1 for t in texts if re.match(r"^0\.0+\s*A\b", t))
    if zero:
        out.append(dict(severity="major" if zero >= 3 else "minor",
                        check="zero_current_load",
                        detail=f"{zero} load(s) drawn at 0.0 A — powered equipment with no "
                               "electrical load assigned (UV / oxygenation / degasser etc.)",
                        fix_hint="assign every process duty an electrical_kw in the contract "
                                 "so the single-line sizes a real feeder; a load on the bus "
                                 "must never read 0.0 A"))
    # 2. standby generator present in BoM but absent from the SLD
    has_gen_bom = _state_has_generator(state)
    has_gen_sld = any(re.search(r"generat|genset|\bATS\b|standby", t, re.I) for t in texts)
    if has_gen_bom and not has_gen_sld:
        out.append(dict(severity="major", check="genset_missing_on_sld",
                        detail="state/BoM contains a standby generator but the single-line "
                               "draws no genset/ATS branch (life-critical: loss of power kills "
                               "stock in minutes)",
                        fix_hint="draw_single_line.py must instantiate a standby-generator + ATS "
                                 "branch whenever a generator exists in the connection schedule"))
    # 3. default-current uniformity (one value dominates the load tags)
    currents = [m.group(1) for t in texts
                for m in [re.match(r"^([0-9.]+)\s*A\b", t)] if m and m.group(1) not in ("0.0",)]
    if len(currents) >= 6:
        from collections import Counter
        val, n = Counter(currents).most_common(1)[0]
        if n / len(currents) > 0.45:
            out.append(dict(severity="minor", check="default_current_uniformity",
                            detail=f"{n}/{len(currents)} feeders share {val} A — looks like a "
                                   "fallback default, not per-load sizing",
                            fix_hint="size each feeder from its own load kW, not a shared default"))
    return out


def check_panel(svg: str, texts: list[str]) -> list[dict]:
    out = []
    # TOTALS connected-kW == 0 while there are real Design A currents
    joined = " ".join(texts)
    kw_zero = bool(re.search(r"\b0\.0\s*kW\b", joined))
    has_amps = any(re.search(r"\b\d{2,}\s*A\b", t) for t in texts)
    if kw_zero and has_amps:
        out.append(dict(severity="major", check="panel_connected_kw_zero",
                        detail="panel TOTALS connected kW = 0.0 kW while Design A is non-zero "
                               "— the per-circuit kW never propagated",
                        fix_hint="_connected_kw_for must resolve a real kW for every circuit "
                                 "(named-load lookup or design_A × √3 × V × pf); totals must sum it"))
    # board infrastructure listed as load circuits
    infra = [t for t in texts if re.search(r"\b(busbar|fuse holder|surge protection|distribution busbar)\b",
                                            t, re.I)]
    if infra:
        out.append(dict(severity="minor", check="infrastructure_as_load",
                        detail=f"board infrastructure listed as load circuits: {sorted(set(infra))[:3]}",
                        fix_hint="exclude busbar/fuse-holder/SPD from the circuit (load) rows"))
    return out


def check_naming_consistency(per_svg_texts: dict[str, list[str]]) -> list[dict]:
    """A culture/process vessel must carry ONE name across all drawings."""
    out = []
    variants = set()
    for texts in per_svg_texts.values():
        for t in texts:
            if re.fullmatch(r"(Rearing|Reactor|Culture|Grow[- ]?out|Fish) Tank", t):
                variants.add(t)
    if len(variants) > 1:
        out.append(dict(severity="major", check="tank_name_inconsistent",
                        detail=f"the same vessel is named {sorted(variants)} across drawings",
                        fix_hint="canonicalise the vessel name in ONE place (state equipment "
                                 "name) and have every draw_*.py read it — e.g. draw_ga.py uses "
                                 "the generic 'Reactor Tank' default; map it to the P&ID name"))
    return out


def check_instrument_density(per_svg_texts: dict[str, list[str]], state: dict,
                             conn: dict) -> list[dict]:
    """The P&ID + instrument index must reflect roughly the instrument count the
    BoM/state actually carries — not a tiny sample."""
    out = []
    n_state = _state_instrument_count(state, conn)
    if n_state < 4:
        return out  # nothing to be sparse against
    # count ISA-style instrument tags shown on the P&ID and the schedules
    def isa_tags(texts):
        return len({t for t in texts
                    if re.fullmatch(r"[A-Z]{1,4}-?\d{2,4}", t) and t[0] in "FLPTDACO"})
    pid_n = isa_tags(per_svg_texts.get("pid", []))
    proc_n = isa_tags(per_svg_texts.get("process-schedules", []))
    shown = max(pid_n, proc_n)
    if shown and shown < 0.4 * n_state:
        out.append(dict(severity="major", check="instrument_density_low", drawing="pid",
                        detail=f"P&ID/index show ~{shown} instrument tags but the BoM/state "
                               f"carries ~{n_state} — the synthesised per-tank instruments are "
                               "not projected onto the P&ID",
                        fix_hint="draw_pid.py must project every synthesised instrument "
                                 "(per-tank LT/TT/DO/pH + loop) as ISA bubbles + index rows"))
    return out


def check_hvac_coverage(per_svg_texts: dict[str, list[str]]) -> list[dict]:
    out = []
    def max_metres(texts):
        vals = [float(m.group(1)) for t in texts
                for m in [re.search(r"([0-9]{1,3}\.[0-9]{1,2})\s*m\b", t)] if m]
        return max(vals) if vals else None
    ga = max_metres(per_svg_texts.get("general-arrangement", []))
    hv = max_metres(per_svg_texts.get("hvac-layout", []))
    if ga and hv and hv < 0.6 * ga:
        out.append(dict(severity="major", check="hvac_coverage_partial", drawing="hvac-layout",
                        detail=f"HVAC plan spans ~{hv} m but the building (GA) spans ~{ga} m — "
                               "the air system covers a fraction of the hall",
                        fix_hint="size the HVAC zone/duct layout to the GA building envelope; "
                                 "one AHU rarely serves a 50 m+ hall — zone it"))
    return out


# ───────────────────────────── pixel checks ────────────────────────────────

def _png_stats(p: Path):
    try:
        from PIL import Image
        import numpy as np
        im = Image.open(p).convert("L")
        a = np.asarray(im, dtype="float32")
        bg = float(np.median(a))                       # paper colour
        ink = float((np.abs(a - bg) > 18).mean())      # fraction of non-background pixels
        # subject region = the ink bounding box; luminance spread within it
        mask = np.abs(a - bg) > 18
        if mask.any():
            ys, xs = np.where(mask)
            sub = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
            spread = float(sub.std())
            bbox_frac = float(mask.sum()) / (sub.shape[0] * sub.shape[1] + 1e-6)
        else:
            spread, bbox_frac = 0.0, 0.0
        return dict(ink=ink, spread=spread, bbox_frac=bbox_frac)
    except Exception as e:
        return dict(error=str(e)[:120])


def check_drawing_blank(key: str, png: Path) -> list[dict]:
    st = _png_stats(png)
    if "error" in st:
        return []
    if st["ink"] < 0.012:
        return [dict(severity="major", check="drawing_mostly_blank",
                     detail=f"only {st['ink']*100:.1f}% of the sheet carries ink — "
                            "under-populated / near-empty drawing",
                     fix_hint="the generator produced an almost-empty sheet; check its input data")]
    return []


def check_blender_render(out_dir: Path) -> dict:
    """Deterministic render-quality check on the dossier hero: SHADED (3-D, depth)
    vs FLAT (the blobby even-fill regression). Flat fill ⇒ low luminance spread in
    the subject region. Calibrated against inspect-hero (the flat 2D-drawing pass)."""
    hero = out_dir / "00-hero.png"
    flat_ref = out_dir / "inspect-hero.png"
    defects = []
    score = 10.0
    if not hero.exists():
        return dict(key="blender-hero", score=None, defects=[
            dict(severity="major", check="hero_missing", detail="00-hero.png absent",
                 fix_hint="render-blender-scene.py must emit a hero")])
    sh = _png_stats(hero)
    if "error" in sh:
        return dict(key="blender-hero", score=None, defects=[], note=sh["error"])
    # flatness: spread < 30 over an 8-bit subject is a near-uniform fill (blob)
    if sh["spread"] < 30:
        defects.append(dict(severity="blocker", check="blender_flat_not_shaded",
                            detail=f"hero subject luminance spread {sh['spread']:.0f} (<30) — "
                                   "reads as a FLAT even-fill (blobby), not a shaded 3-D render",
                            fix_hint="map the SHADED INSPECT=0 run_render_pipeline pass to "
                                     "00-hero, not the flat inspect-hero (studio key-sun + soft "
                                     "shadow + white world)"))
    # is the hero just a copy of the flat inspect pass?
    if flat_ref.exists():
        try:
            if hero.read_bytes() == flat_ref.read_bytes():
                defects.append(dict(severity="blocker", check="hero_is_flat_inspect_copy",
                                    detail="00-hero.png is byte-identical to the flat inspect-hero",
                                    fix_hint="the shaded pass did not run / was not mapped to hero"))
        except Exception:
            pass
    # framing: subject should fill a healthy fraction of the frame
    if sh["bbox_frac"] and sh["bbox_frac"] < 0.18:
        defects.append(dict(severity="minor", check="blender_subject_small",
                            detail=f"subject fills only {sh['bbox_frac']*100:.0f}% of its bbox — "
                                   "loose framing / dead margins",
                            fix_hint="tighten the hero camera (zoom/_HERO_HINT) onto the plant"))
    for d in defects:
        score -= PENALTY[d["severity"]]
    return dict(key="blender-hero", score=round(max(0.0, score), 1), defects=defects,
                stats=sh)


# ─────────────────────────── state/artifact reads ──────────────────────────

def _state_has_generator(state: dict) -> bool:
    blob = json.dumps(state).lower() if isinstance(state, dict) else ""
    return ("standby generator" in blob or "diesel generator" in blob
            or "genset" in blob or '"generator"' in blob)


def _state_instrument_count(state: dict, conn: dict) -> int:
    """Best-effort count of instruments the design carries (parts whose name reads
    like an instrument: transmitter/analyser/probe/sensor/switch/gauge)."""
    rx = re.compile(r"transmitter|analy[sz]er|\bprobe\b|sensor|level switch|"
                    r"flow meter|pressure gauge|do |dissolved.oxygen|ph |conductivity",
                    re.I)
    n = 0
    try:
        for part in (state.get("componentEngineering", {}) or {}).get("parts", []) or []:
            nm = str(part.get("name") or part.get("name_human") or "")
            if rx.search(nm):
                n += 1
    except Exception:
        pass
    if n == 0 and isinstance(conn, dict):
        for node in conn.get("nodes", []) or []:
            if rx.search(str(node.get("name") or node.get("label") or "")):
                n += 1
    return n


# ─── LEDGER → DISCIPLINE-DRAWING ENUMERATION (#122 one-source regression net) ───
# The universal rule: each drawing must RENDER every ledger item belonging to its
# discipline (environmental/latent → HVAC; life-safety valves + emergency paths → P&ID;
# critical electrical loads + boards → single-line; the building slab → GA/HVAC footprint).
# An item present in the ledger but absent from its discipline's drawing IS the bug — these
# checks fire it so iter-N catches iter-(N+1) regressions. Universal: every probe is GUARDED
# by the ledger carrying the item, so a class without it is never flagged.

def _q(state: dict, *keys):
    for ck in ("orchestratorContract", "engineeringContract"):
        q = (state.get(ck) or {}).get("quantities")
        if isinstance(q, dict):
            for k in keys:
                if k in q:
                    v = q[k]
                    return v.get("value") if isinstance(v, dict) else v
    return None


def _bom_has(state: dict, rx: re.Pattern) -> bool:
    rb = state.get("requirementsBom")
    if not isinstance(rb, list):
        return False
    for r in rb:
        if isinstance(r, dict) and rx.search(str(r.get("requirement") or "")):
            return True
    return False


def check_ledger_discipline_enumeration(per_svg_texts: dict[str, list[str]],
                                        state: dict) -> list[dict]:
    """Each ledger item must render in its discipline's drawing (the #122 one-source rule)."""
    out: list[dict] = []
    hv = " \n ".join(per_svg_texts.get("hvac-layout", []))
    pid = " \n ".join(per_svg_texts.get("pid", []))
    sld = " \n ".join(per_svg_texts.get("single-line-diagram", []))

    # 1. HVAC must render the dehumidifier when the ledger carries one (latent side).
    if (_q(state, "dehumidifier_power_kw", "evaporative_moisture_load_kg_h")
            or _bom_has(state, re.compile(r"dehumidif", re.I))):
        if not re.search(r"dehumidif", hv, re.I):
            out.append(dict(severity="major", check="hvac_dehumidifier_missing",
                            drawing="hvac-layout",
                            detail="the ledger carries a dehumidifier / latent-load duty but "
                                   "the HVAC drawing renders no dehumidification unit/coil",
                            fix_hint="draw_hvac.py must enumerate the ledger dehumidifier "
                                     "(_read_dehumidifier) + draw the coil/unit + latent note"))

    # 2. P&ID must tag the O₂ dosing valve FAIL-OPEN when the ledger marks it so.
    fs = _q(state, "o2_dosing_valve_fail_state")
    fail_open = str(fs).strip().lower() in ("1", "fail_open", "open", "fo", "true") or (
        isinstance(fs, (int, float)) and fs >= 1)
    if fail_open and not re.search(r"\bFO\b|fail-open|fail open", pid, re.I):
        out.append(dict(severity="major", check="pid_o2_failopen_missing", drawing="pid",
                        detail="the ledger marks the O₂ dosing valve fail-open but the P&ID "
                               "shows no FO / fail-open tag on the dosing valve",
                        fix_hint="draw_pid.py must draw the DO-loop final valve as fail-open "
                                 "(kind=failopen + 'FO' tag) per o2_dosing_valve_fail_state"))

    # 3. single-line must group a CRITICAL LIFE-SUPPORT board when the ledger has the
    #    critical-redundancy marker AND a standby source.
    crit_red = _q(state, "critical_equipment_redundancy", "life_support_redundancy")
    has_crit = (str(crit_red).strip() not in ("", "None", "0")
                and crit_red is not None)
    if has_crit and _state_has_generator(state):
        if not re.search(r"critical\s*life-?support", sld, re.I):
            out.append(dict(severity="major", check="sld_critical_board_missing",
                            drawing="single-line-diagram",
                            detail="the ledger has critical-equipment redundancy + a standby "
                                   "generator but the single-line draws no critical life-support "
                                   "sub-board grouping the life-safety loads",
                            fix_hint="draw_single_line.py _group_critical_life_support must "
                                     "build a UPS-backed CRITICAL LIFE-SUPPORT board"))

    # 4. the drawn building footprint must match the ledger slab area (not a placement
    #    ribbon). Compare the GA envelope area against the slab; flag a >2× divergence.
    slab = _q(state, "building_footprint_m2", "building_gross_floor_area_m2",
              "floor_area_m2")
    if slab:
        ga_txt = per_svg_texts.get("general-arrangement", [])
        m = next((re.search(r"envelope\s*([\d.]+)\s*m.*?×\s*([\d.]+)\s*m", t)
                  for t in ga_txt if "envelope" in t.lower()
                  and re.search(r"envelope\s*[\d.]+\s*m.*?×", t)), None)
        if m:
            drawn_area = float(m.group(1)) * float(m.group(2))
            try:
                slab_f = float(slab)
            except (TypeError, ValueError):
                slab_f = 0.0
            if slab_f > 0 and (drawn_area / slab_f > 2.0 or drawn_area / slab_f < 0.5):
                out.append(dict(severity="major", check="building_footprint_vs_slab",
                                drawing="general-arrangement",
                                detail=f"the drawn building envelope ≈{drawn_area:.0f} m² "
                                       f"diverges from the ledger slab {slab_f:.0f} m² (>2×) — "
                                       "the GA footprint must match the slab the BoM costs",
                                fix_hint="drawing_building_envelope.building_bbox must derive "
                                         "the GA/HVAC footprint from the ledger slab area"))
    return out


# ───────────────────────────────── main ────────────────────────────────────

DRAWINGS = ["general-arrangement", "single-line-diagram", "pid", "hvac-layout",
            "block-flow-diagram", "panel-schedule", "process-schedules", "isometric-index"]
# map a drawing key → the draw_*.py base used in fix hints / title checks
TITLE_KEY = {"single-line-diagram": "single_line", "pid": "pid", "general-arrangement": "ga",
             "hvac-layout": "hvac", "block-flow-diagram": "bfd", "panel-schedule": "panel_schedule",
             "process-schedules": "process_schedules", "isometric-index": "isometric"}


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: inspect_drawings.py <out_dir> [state.json]", file=sys.stderr)
        return 2
    out_dir = Path(sys.argv[1]).resolve()
    state_path = Path(sys.argv[2]) if len(sys.argv) > 2 else out_dir / "state.json"
    ddir = out_dir / "drawings"
    state = _load_json(state_path) or {}
    conn = _load_json(out_dir / "connection-schedule.json") or {}
    klass = _class_of(state)

    # read every SVG once
    per_svg_texts: dict[str, list[str]] = {}
    for key in DRAWINGS:
        svg = _read(ddir / f"{key}.svg")
        per_svg_texts[key] = _texts(svg) if svg else []

    # cross-drawing checks (computed once, attributed to a home drawing)
    cross = (check_naming_consistency(per_svg_texts)
             + check_instrument_density(per_svg_texts, state, conn)
             + check_hvac_coverage(per_svg_texts)
             + check_ledger_discipline_enumeration(per_svg_texts, state))

    per_drawing = []
    for key in DRAWINGS:
        svg = _read(ddir / f"{key}.svg")
        texts = per_svg_texts[key]
        png = ddir / f"{key}.png"
        defects: list[dict] = []
        if not svg and not png.exists():
            per_drawing.append(dict(key=key, score=None, defects=[
                dict(severity="major", check="drawing_absent",
                     detail="neither SVG nor PNG present", fix_hint="generator did not run")]))
            continue
        defects += check_title_block(TITLE_KEY.get(key, key), svg)
        defects += check_domain_leak(key, texts, klass)
        if key == "single-line-diagram":
            defects += check_single_line(svg, texts, state)
        if key == "panel-schedule":
            defects += check_panel(svg, texts)
        defects += check_drawing_blank(key, png)
        # attribute cross-drawing defects to their home drawing
        for c in cross:
            if c.get("drawing", "pid" if c["check"] == "instrument_density_low" else
                     "hvac-layout" if c["check"] == "hvac_coverage_partial" else
                     "general-arrangement") == key:
                defects.append({k: v for k, v in c.items() if k != "drawing"})
        score = 10.0
        for d in defects:
            score -= PENALTY[d["severity"]]
        per_drawing.append(dict(key=key, score=round(max(0.0, score), 1), defects=defects))

    blender = check_blender_render(out_dir)

    scored = [d for d in per_drawing + [blender] if d.get("score") is not None]
    floor = min(scored, key=lambda d: d["score"]) if scored else None
    overall = round(min(d["score"] for d in scored), 1) if scored else None
    total_defects = sum(len(d["defects"]) for d in per_drawing) + len(blender["defects"])

    report = dict(out_dir=str(out_dir), product_class=klass, overall_score=overall,
                  floor_drawing=(floor or {}).get("key"), total_defects=total_defects,
                  per_drawing=per_drawing, blender=blender)
    (out_dir / "drawings-inspection.json").write_text(json.dumps(report, indent=1))

    # ── printed scorecard ──
    print(f"\n  DRAWING INSPECTION — {out_dir.name}  (class={klass or '?'})")
    print(f"  {'drawing':24} {'score':>5}  defects")
    print(f"  {'-'*24} {'-'*5}  {'-'*7}")
    for d in per_drawing + [blender]:
        s = "  —  " if d["score"] is None else f"{d['score']:>4.1f} "
        tags = ", ".join(sorted({x["check"] for x in d["defects"]})) or "clean"
        print(f"  {d['key']:24} {s}  {tags}")
    print(f"  {'-'*24} {'-'*5}")
    print(f"  OVERALL (floor) = {overall}  → {(floor or {}).get('key')}   "
          f"({total_defects} defects)   wrote drawings-inspection.json\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
