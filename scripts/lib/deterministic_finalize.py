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
 -1. class_alien_control_rename — a telemetry/SCADA-family word whose NAME is class-alien
     (the gate-34-style suppress-on-home-class CLASS_ALIEN_MARKERS vocabulary, shared with
     the exporter's row check) on a plant whose BRIEF names its control system is RENAMED
     to the brief's named system (ids + modifier structure preserved; rename provenance
     recorded; the DB fill then serves the named system's MPN). NEVER fires without a
     brief-named replacement — an alien name with no brief-named system stays, honestly
     flagged by the exporter's class-alien row check. Runs FIRST so every later prose fix
     sees the corrected name.
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
# -1. class_alien_control_rename — the brief-named control system replaces a
#     class-alien telemetry/SCADA brand (codema v58b: the generator kept
#     re-emitting 'Aquavista Remote Monitoring' — an AQUACULTURE SCADA product —
#     on a water plant whose brief NAMES its control system:
#       "F. PROCESS-CONTROL COMPUTER — a horticultural irrigation/fertigation
#        process computer (Hoogendoorn iSii class) managing the irrigation
#        scheduling, …"
#     The rename is deterministic + universal: it fires ONLY when (a) the word is
#     telemetry/SCADA-family, (b) its name trips a CLASS_ALIEN_MARKERS marker whose
#     home class is NOT this plant's class (gate-34 suppress-on-home-class), and
#     (c) the brief STATES a named control system to rename TO. Ids and modifier
#     structure are preserved; every human-name echo of the alien name (BoM
#     requirement, cost label, part-verification word_name, prose) is renamed so
#     the artefact is consistent and the DB fill serves the named system's MPN.
#     Without a brief-named replacement NOTHING is renamed — the exporter's
#     class-alien row check keeps flagging it (honest).
# ─────────────────────────────────────────────────────────────────────────────

# ONE-SOURCE vocabulary — the exporter's ledger row check (_class_alien_reason in
# scripts/build-excel-export.py) imports THIS table, so the flagger and the fixer
# can never disagree on what "class-alien" means. Each entry: (domain label,
# marker regex, home-class regex — the marker is LEGITIMATE on its home class).
CLASS_ALIEN_MARKERS = [
    ("aquaculture monitoring/SCADA",
     re.compile(r"\baquavista\b|\bfishtalk\b|\bakva\s?connect\b|\bfeed\s?barge\b|"
                r"\bbiomass\s+(?:camera|estimat)", re.I),
     re.compile(r"aquaculture|\bras\b|fish|hatchery", re.I)),
    ("hydroponic / grow-room",
     re.compile(r"\bnutrient\s+film\s+technique\b|\bebb\s*&?\s*flow\s+tray\b|"
                r"\bgrow\s?light\b", re.I),
     re.compile(r"vertical_farm|hydroponic|greenhouse|grow", re.I)),
    ("marine / subsea",
     re.compile(r"\bsacrificial\s+anode\b|\bhull\s+penetrator\b|\bbilge\s+pump\b", re.I),
     re.compile(r"\bauv\b|\brov\b|marine|subsea|submersible|naval|ship|boat", re.I)),
]

# telemetry / SCADA family — mirrors the parts-ledger control-type vocabulary (a
# remote-monitoring gateway / SCADA head / data logger is a CONTROL system).
_TELEMETRY_RE = re.compile(
    r"\bSCADA\b|telemetry|remote\s*monitor|data\s*logg(?:er|ing)|edge\s*gateway|"
    r"cloud\s*(?:monitor|link|gateway|platform)|\bIoT\b", re.I)

# a brief-NAMED control system: a Brand + Model token pair stated in a control-
# system context ("… process computer (Hoogendoorn iSii class) …", "… a Siemens
# S7-1500 PLC …"). The CONTEXT word must appear within the same sentence.
_CTRL_CONTEXT_RE = re.compile(
    r"process[- ]computer|control(?:\s+system|ler)?\b|\bSCADA\b|\bPLC\b|\bDCS\b|"
    r"automation\s+system|process\s+controller", re.I)
_BRAND_MODEL_RE = re.compile(
    # Brand (capitalised word ≥3 chars) + Model (token with a letter, may carry
    # digits/dots/dashes), optionally suffixed '-class'/' class' — the brief idiom
    # for "this named system or equivalent".
    r"\b([A-Z][a-zA-Z]{2,})\s+([A-Za-z][\w.\-]*\w)(?:[- ]?class\b)?")


def _product_class(state) -> str:
    for ck in ("orchestratorContract", "parsedBrief", "engineeringContract"):
        pc = (state.get(ck) or {}).get("product_class")
        if pc:
            return str(pc)
    return ""


def _brief_text(state) -> str:
    pb = state.get("parsedBrief") or {}
    br = state.get("brief") or {}
    for cand in (pb.get("original_text"), br.get("original_text"),
                 (br.get("parsed_original") or {}).get("original_text") if isinstance(br.get("parsed_original"), dict) else None):
        if isinstance(cand, str) and cand.strip():
            return cand
    return ""


def brief_named_control_system(state) -> str | None:
    """The control system the BRIEF names ('Hoogendoorn iSii'), or None. Deterministic:
    the FIRST Brand+Model pair found in a sentence that also carries control-system
    vocabulary. A generic phrase without a branded name returns None."""
    text = _brief_text(state)
    if not text:
        return None
    for sentence in re.split(r"(?<=[.;])\s+|\n", text):
        if not _CTRL_CONTEXT_RE.search(sentence):
            continue
        for m in _BRAND_MODEL_RE.finditer(sentence):
            brand, model = m.group(1), m.group(2)
            # the pair must not be the context noun itself ("Process Computer") or a
            # sentence-initial article pair; the MODEL must carry a digit OR mixed case
            # (iSii / S7-1500 / EWN-C21) so plain prose bigrams never match.
            if _CTRL_CONTEXT_RE.fullmatch(f"{brand} {model}"):
                continue
            if not (re.search(r"\d", model) or re.search(r"[a-z][A-Z]|^[a-z].*[A-Z]", model)):
                continue
            return f"{brand} {model}"
    return None


def _alien_hit(name: str, product_class: str):
    """The (match, domain) of a class-alien marker in `name`, or None — suppressed on
    the marker's home class (gate-34 pattern)."""
    for dom, marker, legit in CLASS_ALIEN_MARKERS:
        hit = marker.search(str(name or ""))
        if hit and not legit.search(str(product_class or "")):
            return hit, dom
    return None


def _replace_everywhere(node, patterns):
    """Recursively apply [(compiled_rx, replacement)] to every STRING VALUE in the state
    (never dict keys). Snake_case identifiers survive because every pattern is bounded
    by (?<!\\w)…(?!\\w) — an id token like 'aquavista_remote_monitoring_word' has \\w on
    both sides of the brand token, so ids are structurally untouchable."""
    n = 0
    if isinstance(node, dict):
        for k, v in list(node.items()):
            if isinstance(v, str):
                new = v
                for rx, rep in patterns:
                    new = rx.sub(rep, new)
                if new != v:
                    node[k] = new
                    n += 1
            else:
                n += _replace_everywhere(v, patterns)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            if isinstance(v, str):
                new = v
                for rx, rep in patterns:
                    new = rx.sub(rep, new)
                if new != v:
                    node[i] = new
                    n += 1
            else:
                n += _replace_everywhere(v, patterns)
    return n


def rename_class_alien_control(state) -> int:
    """Fix -1 — rename each class-alien telemetry/SCADA word to the brief's named
    control system. Returns the number of WORDS renamed (0 when the brief names no
    system — the alien name then stays, honestly flagged downstream)."""
    pclass = _product_class(state)
    patterns = []          # collected, then applied state-wide in ONE deterministic pass
    provenance = []        # (word, note) — stamped AFTER the sweep so the note keeps the OLD name
    for m in _modules(state):
        for sm in (m.get("sub_modules") or []):
            for w in _words(sm):
                name = _name(w)
                if not name or not _TELEMETRY_RE.search(name):
                    continue
                hit_dom = _alien_hit(name, pclass)
                if not hit_dom:
                    continue
                target = brief_named_control_system(state)
                if not target:
                    continue        # no brief-named replacement → stays flagged (honest)
                hit, dom = hit_dom
                alien_token = hit.group(0)
                if target.lower() in name.lower():
                    continue        # already renamed (idempotent)
                new_name = (name[:hit.start()] + target + name[hit.end():]).strip()
                # the exact full-name echo first (BoM requirement / cost label / prose),
                # then any leftover standalone brand token ('the Aquavista gateway').
                # (?<!\w)/(?!\w) boundaries keep snake_case ids + character_ids intact.
                patterns.append((re.compile(r"(?<!\w)" + re.escape(name) + r"(?!\w)", re.I),
                                 new_name))
                patterns.append((re.compile(r"(?<!\w)" + re.escape(alien_token) + r"(?!\w)", re.I),
                                 target))
                provenance.append((w, (
                    f"deterministic_finalize class_alien_control_rename: '{name}' is a "
                    f"{dom} name on a '{pclass or 'unknown'}' plant; the brief names the "
                    f"control system '{target}', so the word is renamed to '{new_name}' "
                    f"(id + modifier structure preserved)")))
    if patterns:
        _replace_everywhere(state, patterns)
    for w, note in provenance:      # after the sweep — the note must keep the OLD name verbatim
        w["rename_provenance"] = note
    return len(provenance)


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
# 4. scope_word_demotion — a scope/system/consumable head-noun word emitted as a
#    PRICED BoM equipment line is a documentation/scope/consumable mis-emission
#    (round-3 residual dissection, 2026-07-04): 'Piping Network', 'Module Support
#    System', 'Modular Stack Design', 'Protective Coating', 'Sealant', 'CIP System
#    [Connections]' are never themselves a purchasable catalogue item — they are
#    SCOPE NOTES (what the plant's piping/structure/CIP loop INCLUDES), not a line
#    a buyer can order. A word is demoted to a scope note (folded into its
#    sub-module's prose, removed from the priced word list) only when ALL of:
#      (a) its name matches the SCOPE_WORD vocabulary below, OR it carries the
#          `mis_emission_note` provenance a upstream duty-derivation pass (e.g.
#          universal-contract-sizing.deriveDutylessDriveWords) stamps on a word it
#          positively determined has no physical referent to size against —
#          ONE shared drop mechanism for any upstream pass that can prove a word
#          is not real equipment, never a second bespoke removal path;
#      (b) it carries NO real manufacturer + part_number (a genuinely-pinned real
#          part — e.g. a branded packaged CIP skid — is NEVER demoted regardless
#          of name);
#      (c) it owns no exploded sub-components (no sibling word's id is prefixed
#          `<this id>__` — a real principal with children stays);
#      (d) its cost-basis method (costBasis.lines[*].basis.method) is a generic
#          parametric estimate (class_reference / llm_estimate) when costBasis
#          data exists for the word — a genuinely catalogue-priced line never
#          demotes even if its name coincidentally matches the vocabulary.
#    'CIP System' bare and 'CIP System Connections' both qualify on codema v70
#    (both TBD, no manufacturer, no children, class_reference-priced) — a FUTURE
#    run where the generator emits a REAL packaged CIP skid (branded, dims, its
#    own sub-components) stays untouched by guards (b)+(c).
# ─────────────────────────────────────────────────────────────────────────────
_SCOPE_WORD_RE = re.compile(
    r"\bpiping\s+network\b|\bmodule\s+support\s+system\b|\bmodular\s+stack\s+design\b|"
    r"\bprotective\s+coating\b|\bsealant\b|\bcip\s+system(?:\s+connections)?\b",
    re.I)

_BLANK_MPN_RE = re.compile(
    r"^\s*$|\b(specify|tbd|to\s+be\s+(confirmed|selected|determined|advised)|detailed\s+design|"
    r"n/?a|placeholder|unknown)\b", re.I)

_GENERIC_BASIS_METHODS = {"class_reference", "llm_estimate"}


def _is_blank_mpn(pn) -> bool:
    s = str(pn or "").strip()
    return (not s) or bool(_BLANK_MPN_RE.search(s))


def _mod_value(w, norm_kind_wanted: str):
    for mc in (w.get("modifier_characters") or []):
        if _norm_kind(mc.get("kind")) == norm_kind_wanted:
            return mc.get("value")
    return None


def _has_real_mpn(w) -> bool:
    mfr = str(_mod_value(w, "manufacturer") or "").strip()
    return bool(mfr) and not _is_blank_mpn(_mod_value(w, "partnumber"))


def _owns_subcomponents(w, sm) -> bool:
    wid = str(w.get("id") or "")
    if not wid:
        return False
    prefix = wid + "__"
    return any(str(o.get("id") or "").startswith(prefix) for o in _words(sm) if o is not w)


def _cost_basis_method(state, word_id):
    cb = state.get("costBasis") or {}
    lines = cb.get("lines") if isinstance(cb, dict) else cb
    if not isinstance(lines, list) or not word_id:
        return None
    for l in lines:
        if isinstance(l, dict) and l.get("word_id") == word_id:
            return (l.get("basis") or {}).get("method")
    return None


def scope_word_candidates(state):
    """[(module, sub_module, word)] eligible for scope-note demotion — pure query, no
    mutation, so the selftest / a dry-run report can inspect the set before committing."""
    out = []
    for m in _modules(state):
        for sm in (m.get("sub_modules") or []):
            for w in _words(sm):
                name = _name(w)
                flagged_upstream = bool(w.get("mis_emission_note"))
                if not flagged_upstream and not (name and _SCOPE_WORD_RE.search(name)):
                    continue
                if _has_real_mpn(w):
                    continue                       # a genuinely-pinned real part stays
                if _owns_subcomponents(w, sm):
                    continue                        # a real principal with children stays
                method = _cost_basis_method(state, w.get("id"))
                if method is not None and method not in _GENERIC_BASIS_METHODS:
                    continue                        # a catalogue-priced line stays
                out.append((m, sm, w))
    return out


def demote_scope_words(state) -> int:
    """Fix 4 — demote each scope-word / upstream-flagged-mis-emission candidate to a scope
    note in its sub-module prose, and drop it from the priced word list (never a priced
    BoM equipment line). Idempotent (a re-run finds no candidates: the word is gone)."""
    demoted = 0
    for m, sm, w in scope_word_candidates(state):
        name = _name(w) or "?"
        reason = w.get("mis_emission_note")
        note = (f"Scope includes {name.lower()} (specified at detailed design; "
                f"not a separately priced line).")
        base = str(sm.get("english_sentence") or "").rstrip()
        if base and not base.endswith("."):
            base += "."
        if note not in base:
            sm["english_sentence"] = (base + " " + note).strip() if base else note
        sm["words"] = [o for o in _words(sm) if o is not w]
        w["scope_note_demoted_from_priced_line"] = reason or (
            f"deterministic_finalize scope_word_demotion: '{name}' matches the "
            f"scope/system/consumable vocabulary, carries no real MPN, owns no "
            f"sub-components, and has a generic parametric price basis — demoted "
            f"to a scope note, never a priced equipment line")
        demoted += 1
    return demoted


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
        # class-alien rename VERY FIRST so every later fix (density merge / prose
        # coverage / overview scrub) sees the corrected, brief-named system name
        "class_alien_renamed": rename_class_alien_control(state),
        # scope-word demotion BEFORE the density merge so the merge's word-count
        # decisions see the FINAL word set (a sub-module a demotion thins out must
        # be judged on what's left, not on a count that's about to shrink)
        "scope_words_demoted": demote_scope_words(state),
        # density merge next so prose coverage (fix 2) names the transplanted words
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

    # ── fix -1: class_alien_control_rename — proveCatch BOTH directions ────────
    def _alien_state(brief_text, pclass="water_treatment", name="Aquavista Remote Monitoring"):
        return {
            "orchestratorContract": {"product_class": pclass},
            "parsedBrief": {"original_text": brief_text},
            "moduleDecomposition": {"modules": [{
                "module": "control_compute_communication",
                "overview_paragraph_en": f"Plant telemetry is provided by the {name} gateway. " * 3,
                "sub_modules": [{
                    "id": "ccc__plc", "english_sentence": f"The group integrates a {name} unit.",
                    "words": [{
                        "id": "aquavista_remote_monitoring_word",
                        "name_human": name,
                        "content_character": {"character_id": "aquavista_remote_monitoring",
                                              "name_human": name},
                        "modifier_characters": [
                            {"kind": "quantity", "value": "×1"},
                            {"kind": "form", "value": f"{name} — representative control component"},
                            {"kind": "part_number", "value": "TBD (detailed design)"}],
                    }] + [_w(i) for i in range(4)]}]}]},
            "requirementsBom": [{"tag": "X-119", "requirement": name, "part": "requirement stated"}],
            "costBasis": {"lines": [{"word_id": "aquavista_remote_monitoring_word", "label": name}]},
        }

    _brief_named = ("The plant control uses a horticultural irrigation/fertigation process "
                    "computer (Hoogendoorn iSii class) managing the irrigation scheduling.")
    # (a) FIRES: alien telemetry name + brief-named system → renamed EVERYWHERE the
    #     name is echoed; ids + modifier structure preserved; provenance recorded.
    st_a = _alien_state(_brief_named)
    n_a = rename_class_alien_control(st_a)
    w_a = st_a["moduleDecomposition"]["modules"][0]["sub_modules"][0]["words"][0]
    rename_ok = (
        n_a == 1
        and w_a["name_human"] == "Hoogendoorn iSii Remote Monitoring"
        and w_a["content_character"]["name_human"] == "Hoogendoorn iSii Remote Monitoring"
        and w_a["id"] == "aquavista_remote_monitoring_word"                        # id PRESERVED
        and w_a["content_character"]["character_id"] == "aquavista_remote_monitoring"
        and len(w_a["modifier_characters"]) == 3                                   # structure PRESERVED
        and w_a["modifier_characters"][1]["value"].startswith("Hoogendoorn iSii Remote Monitoring")
        and st_a["requirementsBom"][0]["requirement"] == "Hoogendoorn iSii Remote Monitoring"
        and st_a["costBasis"]["lines"][0]["label"] == "Hoogendoorn iSii Remote Monitoring"
        and "Hoogendoorn iSii" in st_a["moduleDecomposition"]["modules"][0]["overview_paragraph_en"]
        and "Aquavista" not in json.dumps(st_a["requirementsBom"])
        and "'Aquavista Remote Monitoring'" in w_a.get("rename_provenance", "")
        and "Hoogendoorn iSii class" in st_a["parsedBrief"]["original_text"]       # brief text untouched
        and rename_class_alien_control(st_a) == 0)                                 # idempotent
    # (b) NEVER fires without a brief-named replacement — alien stays, honestly flagged.
    st_b = _alien_state("The plant needs a modern control system with remote monitoring.")
    rename_none_ok = (rename_class_alien_control(st_b) == 0
                      and st_b["moduleDecomposition"]["modules"][0]["sub_modules"][0]
                              ["words"][0]["name_human"] == "Aquavista Remote Monitoring")
    # (c) suppressed on the marker's HOME class (Aquavista on an aquaculture plant is legitimate).
    st_c = _alien_state(_brief_named, pclass="aquaculture_ras")
    home_ok = rename_class_alien_control(st_c) == 0
    # (d) a NON-telemetry word never renames under this rule (it is not a control-system swap).
    st_d = _alien_state(_brief_named, name="Feed Barge Chute")
    non_telemetry_ok = rename_class_alien_control(st_d) == 0
    # (e) the brief extractor: named system found; generic prose → None.
    extract_ok = (brief_named_control_system({"parsedBrief": {"original_text": _brief_named}})
                  == "Hoogendoorn iSii"
                  and brief_named_control_system({"parsedBrief": {"original_text":
                      "A robust control system shall manage the plant."}}) is None)

    # ── fix 4: scope_word_demotion — proveCatch BOTH directions ─────────────────
    def _scope_word(name, wid, mfr=None, pn="TBD (detailed design)", mis_note=None):
        mods = [{"kind": "quantity", "value": "×1"},
                {"kind": "part_number", "value": pn}]
        if mfr:
            mods.append({"kind": "manufacturer", "value": mfr})
        w = {"id": wid, "name_human": name,
             "content_character": {"character_id": wid, "name_human": name},
             "modifier_characters": mods}
        if mis_note:
            w["mis_emission_note"] = mis_note
        return w

    def _scope_state(word, method="class_reference", child=None, filler_count=6):
        words = [word] + [_w(i) for i in range(filler_count)]
        if child is not None:
            words.append(child)
        st = {"moduleDecomposition": {"modules": [{
            "module": "m1",
            "sub_modules": [{"id": "m1__s", "english_sentence": "The skid comprises the listed items.",
                              "words": words}]}]}}
        if method is not None:
            st["costBasis"] = {"lines": [{"word_id": word["id"], "basis": {"method": method}}]}
        return st

    # (a) FIRES: 'Piping Network' — vocabulary match, no MPN, no children, generic basis.
    st_sw1 = _scope_state(_scope_word("Piping Network", "piping_network_word"))
    n_sw1 = demote_scope_words(st_sw1)
    sub1 = st_sw1["moduleDecomposition"]["modules"][0]["sub_modules"][0]
    scope_fires_ok = (n_sw1 == 1
                       and not any(w["id"] == "piping_network_word" for w in sub1["words"])
                       and "piping network" in sub1["english_sentence"].lower()
                       and "not a separately priced line" in sub1["english_sentence"]
                       and demote_scope_words(st_sw1) == 0)               # idempotent

    # (b) FIRES on the OTHER 4 named vocabulary families too.
    other_families_ok = True
    for nm, wid in [("Module Support System", "mss_word"), ("Modular Stack Design", "msd_word"),
                     ("Protective Coating", "pc_word"), ("Sealant", "sealant_word"),
                     ("Cip System Connections", "cipc_word")]:
        st_x = _scope_state(_scope_word(nm, wid))
        other_families_ok = other_families_ok and demote_scope_words(st_x) == 1

    # (c) NEVER fires on a genuinely-pinned real part (a real manufacturer + MPN) even
    #     though the name matches the vocabulary — the CIP-System caution.
    st_real = _scope_state(_scope_word("Cip System", "cip_system_word", mfr="Alfa Laval", pn="CIP-2000-SS"))
    real_part_stays_ok = demote_scope_words(st_real) == 0

    # (d) NEVER fires on a word that owns exploded sub-components (a real principal).
    child = {"id": "cip_system_word__pump", "name_human": "CIP Pump",
             "content_character": {"character_id": "cip_system_word__pump", "name_human": "CIP Pump"},
             "modifier_characters": []}
    st_owns = _scope_state(_scope_word("Cip System", "cip_system_word"), child=child)
    owns_children_stays_ok = demote_scope_words(st_owns) == 0

    # (e) NEVER fires on a catalogue-priced line even if the name coincidentally matches.
    st_cat = _scope_state(_scope_word("Sealant", "sealant_word"), method="catalogue")
    catalogue_priced_stays_ok = demote_scope_words(st_cat) == 0

    # (f) FIRES on an upstream mis_emission_note flag alone — no vocabulary match needed
    #     (the shared drop mechanism deriveDutylessDriveWords feeds into).
    st_flagged = _scope_state(_scope_word("Vfd Drive", "vfd_drive_word",
                                           mis_note="deterministic_finalize scope-note candidate: "
                                                     "'Vfd Drive' is a drive/starter word with no "
                                                     "driven-motor evidence anywhere in module 'power_distribution' "
                                                     "— a mis-emission (nothing to size against)"))
    n_flagged = demote_scope_words(st_flagged)
    sub_flagged = st_flagged["moduleDecomposition"]["modules"][0]["sub_modules"][0]
    mis_emission_flag_ok = (n_flagged == 1
                             and not any(w["id"] == "vfd_drive_word" for w in sub_flagged["words"]))

    # (g) a word with NEITHER a vocabulary match NOR an upstream flag is untouched.
    st_none = _scope_state(_scope_word("Reverse Osmosis Skid", "ro_skid_word"))
    no_match_untouched_ok = (demote_scope_words(st_none) == 0
                              and any(w["id"] == "ro_skid_word"
                                      for w in st_none["moduleDecomposition"]["modules"][0]["sub_modules"][0]["words"]))

    scope_ok = (scope_fires_ok and other_families_ok and real_part_stays_ok and owns_children_stays_ok
                and catalogue_priced_stays_ok and mis_emission_flag_ok and no_match_untouched_ok)

    if (ok and idem and named and one_dim and merge_ok and loop_ok and exempt_ok and partition_ok
            and domain_ok and rename_ok and rename_none_ok and home_ok and non_telemetry_ok
            and extract_ok and scope_ok):
        print("deterministic_finalize selftest OK (class-alien-rename / scope-word-demotion / "
              "density-merge / modifier / prose / overview / idempotent)")
        return 0
    print(f"SELFTEST FAIL: ok={ok} idem={idem} named={named} one_dim={one_dim} "
          f"merge_ok={merge_ok} loop_ok={loop_ok} exempt_ok={exempt_ok} "
          f"partition_ok={partition_ok} domain_ok={domain_ok} rename_ok={rename_ok} "
          f"rename_none_ok={rename_none_ok} home_ok={home_ok} "
          f"non_telemetry_ok={non_telemetry_ok} extract_ok={extract_ok} "
          f"scope_fires_ok={scope_fires_ok} other_families_ok={other_families_ok} "
          f"real_part_stays_ok={real_part_stays_ok} owns_children_stays_ok={owns_children_stays_ok} "
          f"catalogue_priced_stays_ok={catalogue_priced_stays_ok} mis_emission_flag_ok={mis_emission_flag_ok} "
          f"no_match_untouched_ok={no_match_untouched_ok} "
          f"before={before} after={after}")
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
    if (r["class_alien_renamed"] or r["scope_words_demoted"] or r["thin_sub_modules_merged"]
            or r["modifier_conflicts_fixed"] or r["prose_covered"] or r["overview_scrubbed"]):
        with open(sp, "w", encoding="utf-8") as fh:
            json.dump(state, fh)
    rv = r["residual_violations"]
    print(f"[deterministic-finalize] class-alien-renamed={r['class_alien_renamed']} "
          f"scope-words-demoted={r['scope_words_demoted']} "
          f"density-merged={r['thin_sub_modules_merged']} "
          f"modifiers={r['modifier_conflicts_fixed']} prose={r['prose_covered']} "
          f"overview={r['overview_scrubbed']} · residual violations {rv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
