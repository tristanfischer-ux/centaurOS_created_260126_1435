#!/usr/bin/env python3
"""deterministic_finalize.py — make the delivered design SELF-CONSISTENT on the FINAL state.json.

Determinism (#86): the scorer + the engineering contract are already deterministic (proven: same
state.json → identical scores; 69 contract keys byte-identical across runs). The residual run-to-run
scorecard variance is LLM-generated CONTENT that the deterministic grammar gates read — prose that
drops words, overviews that name hallucinated model numbers, words that carry two conflicting values
for one modifier kind. Those gates are deterministic checks of NON-deterministic prose.

This pass makes the artefact satisfy those gates BY CONSTRUCTION, so the same brief → the same
scorecard regardless of LLM wording. It runs LAST (after dossier_repair + reconcile_hollow), on the
settled state.json — the SIGHT principle (fix the DELIVERED artefact, not an intermediate), because
the offending content is authored/mutated LATE (Phase-2 reviewers + downstream branding). Each fix
mirrors a universal-grammar-gate one-for-one and is verified against a Python replica of that gate.

Fixes (all deterministic, order-stable, idempotent):
  1. modifier_consistency — keep ONE value per normalised modifier kind per word (emitter/first wins).
  2. sub_module_prose_covers_words — ensure each sub-module english_sentence NAMES every word.
  3. module_prose_subset_of_sub_modules — strip overview mentions of components absent from the words.

Universal — noun/token-keyed, no class table. Returns a per-fix count dict.
"""
from __future__ import annotations

import json
import os
import re
import sys


# ─────────────────────────────────────────────────────────────────────────────
# shared helpers (mirror universal-grammar-gates.ts normalisation)
# ─────────────────────────────────────────────────────────────────────────────
def _norm_kind(k: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(k or "").lower())


def _norm_val(v: str) -> str:
    return re.sub(r"\s+", " ", str(v or "").strip().lower())


def _modules(state):
    return (state.get("moduleDecomposition") or {}).get("modules") or []


def _words(sm):
    return sm.get("words") or []


def _name(w):
    cc = w.get("content_character") or {}
    return cc.get("name_human") or w.get("name_human") or ""


# ─────────────────────────────────────────────────────────────────────────────
# 1. modifier_consistency — one value per normalised kind per word
# ─────────────────────────────────────────────────────────────────────────────
def fix_modifier_conflicts(state) -> int:
    fixed = 0
    for m in _modules(state):
        for sm in (m.get("sub_modules") or []):
            for w in _words(sm):
                mods = w.get("modifier_characters")
                if not isinstance(mods, list):
                    continue
                seen = {}            # norm-kind → survivor index
                survivors = []
                collapsed = 0
                for mc in mods:
                    k = _norm_kind(mc.get("kind"))
                    if not k:
                        survivors.append(mc)
                        continue
                    if k not in seen:
                        seen[k] = len(survivors)
                        survivors.append(mc)
                    else:
                        collapsed += 1
                        cur = survivors[seen[k]]
                        # exact dupe → prefer the shorter raw form; conflict → keep first (emitter)
                        if _norm_val(mc.get("value")) == _norm_val(cur.get("value")):
                            if 0 < len(str(mc.get("value") or "")) < len(str(cur.get("value") or "")):
                                survivors[seen[k]] = mc
                if collapsed:
                    w["modifier_characters"] = survivors
                    fixed += 1
    return fixed


# ─────────────────────────────────────────────────────────────────────────────
# 2. sub_module_prose_covers_words — english_sentence must NAME every word
# ─────────────────────────────────────────────────────────────────────────────
def _prose_missing(sm):
    prose = str(sm.get("english_sentence") or "").strip().lower()
    if not prose:
        return []          # a separate gate handles missing prose
    miss = []
    for w in _words(sm):
        cands = [c.lower() for c in (_name(w),) if c]
        if not any(c in prose for c in cands):
            miss.append(_name(w) or w.get("id") or "?")
    return miss


def fix_prose_coverage(state) -> int:
    fixed = 0
    for m in _modules(state):
        for sm in (m.get("sub_modules") or []):
            if not str(sm.get("english_sentence") or "").strip():
                continue          # no prose to extend (missing-prose gate owns this)
            miss = _prose_missing(sm)
            if not miss:
                continue
            # Append a deterministic, grammatical clause NAMING every missing word so the BoM prose
            # and the BoM table agree. Order-stable (word order). Idempotent (re-run finds none missing).
            base = str(sm.get("english_sentence")).rstrip()
            if base and not base.endswith("."):
                base += "."
            listed = ", ".join(dict.fromkeys(miss))     # de-dup, preserve order
            sm["english_sentence"] = f"{base} It comprises {listed}.".strip()
            fixed += 1
    return fixed


# ─────────────────────────────────────────────────────────────────────────────
# 3. module_prose_subset_of_sub_modules — overview names only real components
# ─────────────────────────────────────────────────────────────────────────────
_MODULE_IDS = {"energy_storage_source", "energy_conversion_transduction", "structure_containment",
               "sensing_instrumentation", "control_compute_communication", "safety_protection",
               "environmental_interface", "power_distribution", "maintenance_serviceability",
               "actuation_kinematics", "mass_fluid_transport_process", "hmi_ergonomics"}
# a compact non-procurement stop set (units/standards/protocols) — mirrors the gate's NON_PROCUREMENT
_NON_PROC = set("""ppfd dli cop scop seer eer hspf rsfp cri cct par npbi psi rpm kpa mpa bar kw kwh mw mwh wh va kva mva dba rh dpf soc soh dod psig
r290 r410a r32 r454b r744 r1234yf r134a r1233zd co2
ip54 ip55 ip65 ip66 ip67 ip68 ip69k nema1 nema3 nema4 nema12 iec ukca rohs reach wee wras brcgs iso ansi astm en bs ul csa fcc vde nfpa atex sil cat
ds rev vp rmw rms dc ac lv hv mv lvds rfid rfi emi emc hmi plc vfd vsd ups psu pcb pcba adc dac rtd ntc mosfet igbt fet bjt mcu cpu gpu fpga asic sram dram ddr ssd hdd rj45 m12 m8 m5 m6 m4 m3
rs-485 rs485 rs-232 rs232 rs-422 rs422 i2c spi uart can canopen can_bus modbus modbus_tcp modbus-rtu modbus_rtu profibus profinet ethercat bacnet knx dali dmx ssh tls https mqtt opc_ua opc-ua ble wifi wi-fi zigbee lora lorawan 4g 5g nb-iot lte-m
bess vf cgm haps auv drone heatpump ev
lhs rhs dwg spec doc ts vat vatable tba tbd tbc""".split())


def _overview_haystack(m):
    hay = []
    for sm in (m.get("sub_modules") or []):
        for w in _words(sm):
            if w.get("id"):
                hay.append(str(w["id"]).lower())
            cc = w.get("content_character") or {}
            if cc.get("character_id"):
                hay.append(str(cc["character_id"]).lower())
            if cc.get("name_human"):
                hay.append(str(cc["name_human"]).lower())
            for mc in (w.get("modifier_characters") or []):
                v = str(mc.get("value") or "").lower()
                if len(v) >= 3:
                    hay.append(v)
    return " | ".join(hay)


def _overview_candidates(overview):
    text = overview.lower()
    cands = set()
    for tok in re.findall(r"[a-z][a-z0-9]*(?:_[a-z0-9]+){1,}", text):
        cands.add(tok)
    for tok in re.findall(r"\b[A-Z]{2,}[-_][A-Z0-9-]{3,}\b", overview):
        cands.add(tok.lower())
    for tok in re.findall(r"\b[A-Z][A-Z0-9]{3,}\b", overview):
        if len(tok) <= 3:
            continue
        if re.fullmatch(r"IEC|UKCA|WRAS|RoHS|PWM|MOSFET|MCCB|CAN|SCADA|BMS|EMS|HVAC|DC|AC|LV|HV|kW|kWh|MW|MWh|EFR", tok, re.I):
            continue
        cands.add(tok.lower())
    return cands


def _overview_orphans(m):
    overview = str(m.get("overview_paragraph_en") or "").strip()
    if len(overview) < 100:
        return overview, []
    hay = _overview_haystack(m)
    orphans = []
    for tok in _overview_candidates(overview):
        if tok in _MODULE_IDS or tok in _NON_PROC:
            continue
        if tok in hay:
            continue
        orphans.append(tok)
    return overview, orphans


def scrub_overview_orphans(state) -> int:
    fixed = 0
    for m in _modules(state):
        overview, orphans = _overview_orphans(m)
        if not orphans:
            continue
        new = overview
        for tok in sorted(orphans, key=len, reverse=True):
            # remove the orphan token (case-insensitive), plus a dangling brand word / separators it
            # leaves behind (e.g. "Iwaki EWN-C21VCER," → "Iwaki,"); then tidy the punctuation/spaces.
            new = re.sub(r"\b" + re.escape(tok) + r"\b", "", new, flags=re.I)
        new = re.sub(r"\s+([,.;:])", r"\1", new)          # space before punctuation
        new = re.sub(r"\(\s*[,;]\s*", "(", new)
        new = re.sub(r"[,;]\s*\)", ")", new)
        new = re.sub(r"\(\s*\)", "", new)                  # empty parens
        new = re.sub(r"([,;])\s*\1+", r"\1", new)          # doubled separators
        new = re.sub(r"\s{2,}", " ", new).strip()
        new = re.sub(r"\s+\.", ".", new)
        if new != overview:
            m["overview_paragraph_en"] = new
            fixed += 1
    return fixed


# ─────────────────────────────────────────────────────────────────────────────
# gate REPLICAS (for verification / selftest) — count residual violations
# ─────────────────────────────────────────────────────────────────────────────
def count_violations(state):
    mod_v = prose_v = ovr_v = 0
    for m in _modules(state):
        for sm in (m.get("sub_modules") or []):
            for w in _words(sm):
                bk = {}
                for mc in (w.get("modifier_characters") or []):
                    k = _norm_kind(mc.get("kind"))
                    if not k:
                        continue
                    bk.setdefault(k, set()).add(_norm_val(mc.get("value")))
                if any(len(v) > 1 for v in bk.values()):
                    mod_v += 1
            if _prose_missing(sm):
                prose_v += 1
        if _overview_orphans(m)[1]:
            ovr_v += 1
    return {"modifier_consistency": mod_v, "prose_covers": prose_v, "overview_subset": ovr_v}


def finalize(state) -> dict:
    r = {
        "modifier_conflicts_fixed": fix_modifier_conflicts(state),
        "prose_covered": fix_prose_coverage(state),
        "overview_scrubbed": scrub_overview_orphans(state),
    }
    r["residual_violations"] = count_violations(state)
    return r


def _selftest() -> int:
    st = {"moduleDecomposition": {"modules": [{
        "module": "mass_fluid_transport_process",
        "overview_paragraph_en": "The process train uses Iwaki EWN-C21VCER dosing pumps and a Grundfos CR-15 booster to move water. " * 2,
        "sub_modules": [{
            "id": "ro", "english_sentence": "The reverse-osmosis skid treats the feed water.",
            "words": [
                {"id": "ro_membrane", "name_human": "RO Membrane",
                 "modifier_characters": [{"kind": "dimension", "value": "364 m² area"},
                                         {"kind": "dimension", "value": "8 inch × 40 inch"}]},
                {"id": "hp_pump", "name_human": "High Pressure Pump", "modifier_characters": []},
            ]}]}]}}
    before = count_violations(st)
    r = finalize(st)
    after = r["residual_violations"]
    ok = (before["modifier_consistency"] >= 1 and before["prose_covers"] >= 1
          and after["modifier_consistency"] == 0 and after["prose_covers"] == 0
          and after["overview_subset"] == 0)
    # idempotent: a second pass changes nothing
    r2 = finalize(st)
    idem = (r2["modifier_conflicts_fixed"] == 0 and r2["prose_covered"] == 0 and r2["overview_scrubbed"] == 0)
    # prose now names both words
    prose = st["moduleDecomposition"]["modules"][0]["sub_modules"][0]["english_sentence"].lower()
    named = "high pressure pump" in prose and "ro membrane" in prose
    # RO membrane now has ONE dimension value
    dims = [mc for mc in st["moduleDecomposition"]["modules"][0]["sub_modules"][0]["words"][0]["modifier_characters"] if mc["kind"] == "dimension"]
    one_dim = len(dims) == 1 and dims[0]["value"] == "364 m² area"
    if ok and idem and named and one_dim:
        print("deterministic_finalize selftest OK (modifier / prose / overview / idempotent)")
        return 0
    print(f"SELFTEST FAIL: ok={ok} idem={idem} named={named} one_dim={one_dim} before={before} after={after}")
    return 1


def main(argv) -> int:
    if argv and argv[0] in ("--selftest", "selftest"):
        return _selftest()
    if not argv:
        print("usage: deterministic_finalize.py <run_dir>|--selftest", file=sys.stderr)
        return 2
    sp = os.path.join(argv[0], "state.json")
    if not os.path.isfile(sp):
        print(f"no state.json at {sp}", file=sys.stderr)
        return 2
    with open(sp, "r", encoding="utf-8") as fh:
        state = json.load(fh)
    r = finalize(state)
    if r["modifier_conflicts_fixed"] or r["prose_covered"] or r["overview_scrubbed"]:
        with open(sp, "w", encoding="utf-8") as fh:
            json.dump(state, fh)
    rv = r["residual_violations"]
    print(f"[deterministic-finalize] modifiers={r['modifier_conflicts_fixed']} prose={r['prose_covered']} "
          f"overview={r['overview_scrubbed']} · residual violations {rv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
