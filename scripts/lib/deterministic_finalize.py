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
  0. sub_module_word_density — MERGE each thin (<5-word, non-exempt) sub-module into its DENSEST
     eligible sibling in the SAME module (words moved verbatim; grammar_links rewritten; emptied
     shell deleted). Mirrors the gate's own exemptions (faithful split partition, single-thin-4-word)
     so it only fires where the gate would fail. Runs FIRST so fix 2 (prose coverage) automatically
     names the transplanted words in the target's english_sentence.
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
# 0. sub_module_word_density — merge thin sub-modules into their densest sibling
#
# Mirrors src/lib/pdf-engine-v2/radical/universal-grammar-gates.ts
# `sub_module_word_density`: a sub-module with <5 words is THIN unless it is a
# faithful split-partition child (split_parent_id group of ≥2, all stamped with
# split_radicals); EXACTLY ONE non-partition 4-word sub-module is also forgiven
# (single-thin exception). Where the gate would fail, each remaining thin
# sub-module's words are moved VERBATIM into the DENSEST eligible sibling of the
# SAME module and the emptied shell is deleted (never creating an empty
# sub-module — gate 23 — and never merging across modules).
#
# Eligibility guards (each mirrors the gate that would otherwise newly fail):
#   • target must already have ≥5 words — so the merge can never mint a NEW thin
#     entry, and never a NEW <3-priced-lines entry either (an n≥5 target was
#     already subject to that check; added words can only raise its priced count)
#   • dc_/ac_ domain compatibility (gate 29 submodule-domain-guard): the thin
#     sub-module's id AND every one of its words' character_ids must not carry a
#     domain prefix conflicting with the target sub-module id's domain
#   • grammar_links referencing the merged id are REWRITTEN to the target
#     (no_dangling_references); self-loops created by the rewrite are dropped
#     unless dropping would orphan the target (no_orphan_sub_modules); duplicate
#     (from, to, mechanism) triples are deduped keep-first (declared_links_unique)
#
# A thin sub-module with NO eligible sibling (single-sub-module module, or all
# siblings themselves thin) is left untouched — that is an emitter coverage gap
# to fix upstream (universal-repair.ts: never fabricate filler words).
# ─────────────────────────────────────────────────────────────────────────────
def _infer_domain(ident) -> str | None:
    """Mirror submodule-domain-guard.ts inferDomain: 'ac' / 'dc' / None (bidirectional → None)."""
    if not ident:
        return None
    s = str(ident).lower()
    has_ac = bool(re.match(r"^ac_", s)) or "_ac_" in s
    has_dc = bool(re.match(r"^dc_", s)) or "_dc_" in s
    if has_ac and has_dc:
        return None
    if has_ac:
        return "ac"
    if has_dc:
        return "dc"
    return None


def _is_faithful_partition_child(m, sm) -> bool:
    """Mirror the gate's isFaithfulPartitionChild (explicit split_parent_id provenance)."""
    parent = sm.get("split_parent_id")
    if not parent:
        return False
    group = [s for s in (m.get("sub_modules") or []) if s.get("split_parent_id") == parent]
    if len(group) < 2:
        return False
    return all(isinstance(s.get("split_radicals"), list) and s.get("split_radicals") for s in group)


def _density_thin(state):
    """Non-exempt thin sub-modules, gate-mirrored: [(module, sub_module)] in stable tree order."""
    thin = []
    for m in _modules(state):
        for sm in (m.get("sub_modules") or []):
            if len(_words(sm)) < 5 and not _is_faithful_partition_child(m, sm):
                thin.append((m, sm))
    return thin


def _density_violation_count(state) -> int:
    """Gate-verdict replica for the WORD-density facet: thin count after the gate's exemptions
    (0 when the single-thin-4-word exception applies — the gate's advisory PASS)."""
    thin = _density_thin(state)
    if len(thin) == 1 and len(_words(thin[0][1])) == 4:
        return 0
    return len(thin)


def _domain_compatible(thin_sm, target_sm) -> bool:
    """No dc_/ac_ conflict between the thin sub-module (id + every word character_id)
    and the target sub-module id (mirrors gate 29's word-vs-parent check)."""
    t_dom = _infer_domain(target_sm.get("id"))
    s_dom = _infer_domain(thin_sm.get("id"))
    if t_dom and s_dom and t_dom != s_dom:
        return False
    if t_dom:
        for w in _words(thin_sm):
            w_dom = _infer_domain((w.get("content_character") or {}).get("character_id"))
            if w_dom and w_dom != t_dom:
                return False
    # (the moved words end up under the TARGET id, so only the target id's domain governs —
    # gate 29 checks word-vs-PARENT only, which the two tests above fully cover)
    return True


def _rewrite_merge_links(state, module, thin_id: str, target_id: str) -> None:
    """Repoint every grammar_link naming thin_id at target_id; move the thin sub-module's own
    link list onto the target; drop rewrite-created self-loops (keeping one on the module-level
    store only if the target would otherwise be link-orphaned); dedupe (from,to,mechanism)."""
    md = state.get("moduleDecomposition") or {}
    cross = md.get("cross_module_grammar_links") or []
    mod_name = module.get("module")
    module_has_cross = any(
        isinstance(cl, dict) and (cl.get("from_module") == mod_name or cl.get("to_module") == mod_name)
        for cl in (cross if isinstance(cross, list) else []))

    subs = module.get("sub_modules") or []
    thin_sm = next((s for s in subs if s.get("id") == thin_id), None)
    target_sm = next((s for s in subs if s.get("id") == target_id), None)

    def _rewritten(links):
        out = []
        for l in links:
            if not isinstance(l, dict):
                continue
            l2 = dict(l)
            if l2.get("from_sub_module") == thin_id:
                l2["from_sub_module"] = target_id
            if l2.get("to_sub_module") == thin_id:
                l2["to_sub_module"] = target_id
            out.append(l2)
        return out

    def _dedupe(links):
        seen, out = set(), []
        for l in links:
            key = (l.get("from_sub_module"), l.get("to_sub_module"), l.get("mechanism"))
            if key in seen:
                continue
            seen.add(key)
            out.append(l)
        return out

    # module-level store (the one the grammar gates read)
    mlinks = module.get("grammar_links")
    if isinstance(mlinks, list):
        rw = _dedupe(_rewritten(mlinks))
        loops = [l for l in rw if l.get("from_sub_module") == l.get("to_sub_module") == target_id]
        keep = [l for l in rw if not (l.get("from_sub_module") == l.get("to_sub_module") == target_id)]
        participates = any(target_id in (l.get("from_sub_module"), l.get("to_sub_module")) for l in keep)
        if loops and not participates and not module_has_cross:
            keep.append(loops[0])   # keep ONE self-loop rather than orphan the target
        module["grammar_links"] = keep

    # sub-module-level stores (renderer-facing mirrors): rewrite in every sibling; the thin
    # sub-module's own (rewritten) list is appended onto the target's, then deduped.
    thin_own = []
    for s in subs:
        slinks = s.get("grammar_links")
        if not isinstance(slinks, list):
            continue
        rw = [l for l in _rewritten(slinks)
              if not (l.get("from_sub_module") == l.get("to_sub_module") == target_id)]
        if s is thin_sm:
            thin_own = rw
            continue
        s["grammar_links"] = _dedupe(rw)
    if thin_own and target_sm is not None:
        base = target_sm.get("grammar_links") if isinstance(target_sm.get("grammar_links"), list) else []
        target_sm["grammar_links"] = _dedupe(list(base) + thin_own)


def _sub_module_display_name(sm) -> str:
    nm = str(sm.get("name_human") or "").strip()
    if nm:
        return nm
    tail = str(sm.get("id") or "").split("__")[-1]
    return tail.replace("_", " ").strip() or "unnamed"


def merge_thin_sub_modules(state) -> int:
    """Fix 0 — density merge. Returns the number of sub-modules merged away."""
    thin = _density_thin(state)
    if not thin:
        return 0
    # single-thin-4-word exemption: the gate forgives EXACTLY ONE non-partition 4-word
    # sub-module — never merge a sub-module the gate already exempts.
    if len(thin) == 1 and len(_words(thin[0][1])) == 4:
        return 0
    merged = 0
    for m, sm in thin:                      # stable tree order (module order, sub-module order)
        subs = m.get("sub_modules") or []
        if not any(s is sm for s in subs):
            continue                         # defensive: already removed
        if len(subs) < 2:
            continue                         # single-sub-module module — nothing to merge into
        candidates = [(i, s) for i, s in enumerate(subs)
                      if s is not sm and len(_words(s)) >= 5 and _domain_compatible(sm, s)]
        if not candidates:
            continue                         # all siblings thin/incompatible — upstream emitter gap
        # densest sibling; tie → earliest in sub_modules order (deterministic)
        target = max(candidates, key=lambda it: (len(_words(it[1])), -it[0]))[1]
        # move the word objects VERBATIM (ids, content_character, modifier_characters untouched)
        target.setdefault("words", [])
        target["words"] = list(_words(target)) + list(_words(sm))
        # record the merged identity in the target prose (the file's existing prose idiom;
        # fix_prose_coverage will additionally NAME every transplanted word). Skip when the
        # target has no prose — the missing-prose gate owns that case.
        if str(target.get("english_sentence") or "").strip():
            base = str(target.get("english_sentence")).rstrip()
            if base and not base.endswith("."):
                base += "."
            note = f" Consolidates the former {_sub_module_display_name(sm)} sub-module."
            if note not in base + " ":
                target["english_sentence"] = (base + note).strip()
        _rewrite_merge_links(state, m, str(sm.get("id")), str(target.get("id")))
        m["sub_modules"] = [s for s in subs if s is not sm]
        merged += 1
    return merged


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
    return {"modifier_consistency": mod_v, "prose_covers": prose_v, "overview_subset": ovr_v,
            "word_density_thin": _density_violation_count(state)}


def finalize(state) -> dict:
    r = {
        # density merge FIRST so prose coverage (fix 2) names the transplanted words
        "thin_sub_modules_merged": merge_thin_sub_modules(state),
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
    # ── fix 0: sub_module_word_density merge ───────────────────────────────────
    def _w(i, priced=True):
        mods = [{"kind": "unit_price_gbp", "value": "10"}] if priced else []
        return {"id": f"w{i}", "name_human": f"Part {i}",
                "content_character": {"character_id": f"part_{i}", "name_human": f"Part {i}"},
                "modifier_characters": mods}

    def _mk_state(subs, links=None):
        return {"moduleDecomposition": {"modules": [{
            "module": "m1", "grammar_links": links or [], "sub_modules": subs}]}}

    # (a) 1 thin + 1 dense sibling → MERGE: words move verbatim, shell deleted, link rewritten
    dense = {"id": "m1__dense", "english_sentence": "The dense assembly does things.",
             "words": [_w(i) for i in range(5)], "grammar_links": []}
    thin_sm = {"id": "m1__thin", "name_human": "Dosing Skid", "english_sentence": "A thin one.",
               "words": [_w(99, priced=False)],
               "grammar_links": [{"from_sub_module": "m1__thin", "to_sub_module": "m1__dense",
                                  "mechanism": "fluid_pipe"}]}
    st_m = _mk_state([dense, thin_sm],
                     links=[{"from_sub_module": "m1__thin", "to_sub_module": "m1__dense",
                             "mechanism": "fluid_pipe"},
                            {"from_sub_module": "m1__dense", "to_sub_module": "m1__thin",
                             "mechanism": "signal"}])
    n_merged = merge_thin_sub_modules(st_m)
    subs_after = st_m["moduleDecomposition"]["modules"][0]["sub_modules"]
    mlinks_after = st_m["moduleDecomposition"]["modules"][0]["grammar_links"]
    merge_ok = (n_merged == 1 and len(subs_after) == 1 and subs_after[0]["id"] == "m1__dense"
                and len(subs_after[0]["words"]) == 6
                and subs_after[0]["words"][5]["id"] == "w99"                       # verbatim, appended
                and "Consolidates the former Dosing Skid sub-module." in subs_after[0]["english_sentence"]
                and all("m1__thin" not in (l.get("from_sub_module"), l.get("to_sub_module"))
                        for l in mlinks_after)
                and _density_violation_count(st_m) == 0
                and merge_thin_sub_modules(st_m) == 0)                              # idempotent
    # rewrite-created self-loops must be gone but the target must NOT be orphaned:
    # both original links became m1__dense↔m1__dense self-loops; exactly one survives.
    loop_ok = (len(mlinks_after) == 1
               and mlinks_after[0]["from_sub_module"] == mlinks_after[0]["to_sub_module"] == "m1__dense")

    # (b) single-thin-4-word exemption → NO merge (the gate itself forgives it)
    st_e = _mk_state([{"id": "m1__dense", "words": [_w(i) for i in range(5)]},
                      {"id": "m1__four", "words": [_w(i + 10) for i in range(4)]}])
    exempt_ok = (merge_thin_sub_modules(st_e) == 0
                 and len(st_e["moduleDecomposition"]["modules"][0]["sub_modules"]) == 2
                 and _density_violation_count(st_e) == 0)

    # (c) faithful split partition → NOT thin, NO merge
    st_p = _mk_state([
        {"id": "m1__dense", "words": [_w(i) for i in range(6)]},
        {"id": "m1__bin_a", "split_parent_id": "m1__parent", "split_radicals": ["r1"],
         "words": [_w(20)]},
        {"id": "m1__bin_b", "split_parent_id": "m1__parent", "split_radicals": ["r2"],
         "words": [_w(21)]}])
    partition_ok = (merge_thin_sub_modules(st_p) == 0
                    and len(st_p["moduleDecomposition"]["modules"][0]["sub_modules"]) == 3)

    # (d) dc_ thin whose only dense sibling is ac_ → domain guard skips the pair
    dc_word = {"id": "wdc", "name_human": "DC Cable",
               "content_character": {"character_id": "dc_power_cable"}, "modifier_characters": []}
    st_d = _mk_state([{"id": "m1__ac_switchgear", "words": [_w(i) for i in range(5)]},
                      {"id": "m1__dc_distribution", "words": [dc_word]},
                      {"id": "m1__spare", "words": [_w(30, priced=False)]}])  # 2 thin → gate fails
    domain_ok = (merge_thin_sub_modules(st_d) >= 1)  # spare merges into ac (no domain marker)…
    d_subs = st_d["moduleDecomposition"]["modules"][0]["sub_modules"]
    domain_ok = domain_ok and any(s["id"] == "m1__dc_distribution" for s in d_subs) \
        and not any(w.get("id") == "wdc" and s["id"] == "m1__ac_switchgear"
                    for s in d_subs for w in s.get("words") or [])              # …dc one stays put

    if ok and idem and named and one_dim and merge_ok and loop_ok and exempt_ok and partition_ok and domain_ok:
        print("deterministic_finalize selftest OK (density-merge / modifier / prose / overview / idempotent)")
        return 0
    print(f"SELFTEST FAIL: ok={ok} idem={idem} named={named} one_dim={one_dim} "
          f"merge_ok={merge_ok} loop_ok={loop_ok} exempt_ok={exempt_ok} "
          f"partition_ok={partition_ok} domain_ok={domain_ok} before={before} after={after}")
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
    if (r["thin_sub_modules_merged"] or r["modifier_conflicts_fixed"]
            or r["prose_covered"] or r["overview_scrubbed"]):
        with open(sp, "w", encoding="utf-8") as fh:
            json.dump(state, fh)
    rv = r["residual_violations"]
    print(f"[deterministic-finalize] density-merged={r['thin_sub_modules_merged']} "
          f"modifiers={r['modifier_conflicts_fixed']} prose={r['prose_covered']} "
          f"overview={r['overview_scrubbed']} · residual violations {rv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
