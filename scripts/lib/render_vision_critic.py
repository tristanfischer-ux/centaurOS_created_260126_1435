#!/usr/bin/env python3
"""render_vision_critic.py — a FLAG-ONLY vision critic for a CAD render (Tristan 2026-06-28: "why can't
you use a vision model to check the drawings?").

The answer: we can. Deterministic geometry checks (manifest_sight) demonstrably MISS real visual defects
— e.g. a red power-CABLE rendered as a long beam shooting off the platform is a CONNECTION, not a part,
so no part-shape check sees it, yet a human (or a vision model) catches it in one glance.

CONTRACT (the council's safe pattern, 2026-06-27):
  • The vision model may only FLAG / FAIL — it can NEVER turn a bad render into a PASS. Its output only
    ever CAPS a render's score; a clean verdict is necessary-but-not-sufficient (the deterministic
    checks still gate). So a model that silently rots can only make a render score LOWER, never falsely
    ship one.
  • It is proveCatch'd on a FROZEN known-bad image (the v30 red-beam hero) — if the model stops flagging
    that, the guard fails and the wiring is revisited.

Usage:  python3 render_vision_critic.py <image.png> [--model google/gemini-3.1-pro-preview] [--json]
Returns {broken: bool, defects: [...], model, ok}. broken=True ⇒ the render has a visible defect.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request
from typing import Optional

import instrument_form_grammar as ifg

DEFAULT_MODEL = "google/gemini-3.1-pro-preview"  # multimodal; strongest reasoner seat

# CORROBORATION DOCTRINE — geometry-hash cache (Tristan re-roll defect, 2026-07-03; same shape as
# the physics critic 247494a32 and gate 36 284c69c09). The vision CALL is non-deterministic on two
# axes: (1) EEVEE TAA sampling noise changes the rendered PNG bytes run-to-run by <=8/255 on <6% of
# pixels even for byte-identical geometry (established 906ea3f39), so a pixel-keyed cache misses
# every run; (2) the LLM itself can give a different verdict on visually-near-identical images. The
# fix keys the cache on the GEOMETRY MANIFEST (parts-manifest.json + route-manifest.json) — the true
# design identity, byte-identical across two runs of the same design — so identical geometry reuses
# the stored critique verbatim and never re-rolls the LLM.
_CACHE_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".cache", "vision-critic")


def geometry_hash(run_dir: str) -> Optional[str]:
    """The design-identity hash for a run: parts-manifest.json + route-manifest.json content,
    canonicalised (sorted keys, no whitespace) so key-order/formatting drift never misses a real
    cache hit. Returns None when neither manifest is present/parseable — caller then skips the
    cache (nothing stable to key on) rather than risk a false hit."""
    parts = []
    for name in ("parts-manifest.json", "route-manifest.json"):
        p = os.path.join(run_dir, name)
        try:
            with open(p, "r", encoding="utf-8") as fh:
                parts.append(json.dumps(json.load(fh), sort_keys=True, separators=(",", ":")))
        except (OSError, json.JSONDecodeError):
            continue
    if not parts:
        return None
    # THE PIXELS ARE THE IDENTITY (2026-07-11 run 75: the manifests are blind to
    # non-part scene geometry — new zone boards + the open-front cutaway changed the
    # IMAGE while parts/route stayed byte-identical, so the cache replayed run-74's
    # stale nameless-broken verdict and bypassed the tiebreak). Include the hero
    # image bytes: a changed render re-judges; a byte-stable render still hits.
    for name in _HERO_CANDIDATES:
        hp = os.path.join(run_dir, name)
        if os.path.exists(hp):
            try:
                with open(hp, "rb") as fh:
                    parts.append(hashlib.sha256(fh.read()).hexdigest())
            except OSError:
                pass
            break
    return hashlib.sha256("||".join(parts).encode("utf-8")).hexdigest()


def _cache_path(geo_hash: str) -> str:
    return os.path.join(_CACHE_ROOT, f"{geo_hash}.json")


def cache_read(geo_hash: str) -> Optional[dict]:
    try:
        with open(_cache_path(geo_hash), "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return None


def cache_write(geo_hash: str, res: dict) -> None:
    try:
        os.makedirs(_CACHE_ROOT, exist_ok=True)
        with open(_cache_path(geo_hash), "w", encoding="utf-8") as fh:
            json.dump(res, fh, indent=2)
    except OSError:
        pass

_PROMPT = (
    "You are an adversarial chartered engineer inspecting a 3-D render of a process/utility PLANT laid "
    "out on a rectangular platform/skid. Look ONLY at what is visibly wrong — do not invent defects.\n"
    "Flag any of these VISUAL defects if present:\n"
    "  • a STRAY pipe/beam/cable shooting OFF the platform or into empty space (a long thin element "
    "going nowhere, or to a floating box outside the plant)\n"
    "  • a FLOATING / disconnected object not sitting on the platform with the rest\n"
    "  • a BLANK / empty render (no plant visible)\n"
    "  • GARBLED / exploded / overlapping geometry that is obviously not a real layout\n"
    "  • a part at an absurd scale (e.g. one object dwarfing the whole plant)\n"
    "Reply with STRICT JSON only: {\"broken\": true|false, \"defects\": [\"short description\", ...]}. "
    "broken=true if ANY defect above is visible; defects lists each one in a few words. If the render "
    "looks like a clean, plausible plant layout, return {\"broken\": false, \"defects\": []}."
)


def _key() -> str:
    k = os.environ.get("OPENROUTER_API_KEY", "")
    if k:
        return k
    here = os.path.dirname(os.path.abspath(__file__))
    for rel in ("../.env.local", "../.env", "../secrets/.env", "../../.env.local"):
        p = os.path.join(here, rel)
        try:
            for line in open(p, encoding="utf-8"):
                m = re.match(r"\s*(?:export\s+)?OPENROUTER_API_KEY\s*=\s*[\"']?([^\"'\n]+)", line)
                if m:
                    return m.group(1).strip()
        except OSError:
            pass
    return ""


def _google_key() -> str:
    """Direct Google AI key for the 402 failover — same .env.local walk as _key()."""
    k = (os.environ.get("GOOGLE_AI_API_KEY") or "").strip()
    if k:
        return k
    here = os.path.dirname(os.path.abspath(__file__))
    for rel in ("../.env.local", "../.env", "../secrets/.env", "../../.env.local"):
        p = os.path.join(here, rel)
        try:
            for line in open(p, encoding="utf-8"):
                m = re.match(r"\s*(?:export\s+)?GOOGLE_AI_API_KEY\s*=\s*[\"\']?([^\"\'\n]+)", line)
                if m:
                    return m.group(1).strip()
        except OSError:
            pass
    return ""


_PRODUCT_PROMPT = (
    "You are an adversarial industrial-design reviewer inspecting a 3-D "
    "cutaway of a compact sealed electrical product. The render must be both "
    "geometrically intact AND architecturally credible.\n\n"
    "For an integrated wall battery / inverter, expect recognisable functional "
    "zones: a dense lower battery pack, substantial inverter/power electronics, "
    "controller/BMS electronics, a visible thermal path (fan duct, heatsink or "
    "cooling fins), and credible AC/DC/PV service interfaces. Simplified geometry "
    "is acceptable only when these functions remain visually distinguishable.\n\n"
    "Flag broken=true when any of these are present:\n"
    "  • hollow or mostly empty enclosure\n"
    "  • generic anonymous boxes that do not communicate functional architecture\n"
    "  • battery pack absent, tiny, or not dominant in the lower region\n"
    "  • no recognisable inverter/power-electronics region\n"
    "  • no credible control/BMS or thermal-management region\n"
    "  • components protruding through the enclosure\n"
    "  • disconnected/floating/exploded geometry\n"
    "  • implausible service access, airflow, or component stacking\n"
    "  • product cropped, too small, or unreadable\n\n"
    "A translucent cutaway is intentional, but translucency must not wash out "
    "the internal architecture. Reply with STRICT JSON only: "
    "{\"broken\": true|false, \"defects\": [\"specific visible defect\", ...]}."
)

# INTENT: handheld optical / PCB instruments are NOT wall batteries — the product
# rubric's pack/inverter/BMS checklist false-fails a colorimeter cutaway that correctly
# shows an optical bench (LED → path → detector) + PCB (colorimeter 0819). Signal-keyed
# on state.isInstrumentDevice, never a product-name table.
_INSTRUMENT_PROMPT = (
    "You are an adversarial industrial-design reviewer inspecting a 3-D render of a "
    "HANDHELD or BENCHTOP scientific/electronic INSTRUMENT (e.g. colorimeter, photometer, "
    "sensor probe — NOT a wall battery, NOT a plant skid).\n\n"
    "Expect a quiet, desirable product: charcoal polymer body with a clear L-step, "
    "dark recessed display glass (not a green PCB pretending to be a screen), finger-sized "
    "square tactile keys, a chunky optical cube with an open sample well, a parked ambient "
    "light LID (flange + grip — not a rotary knob), rubber feet, and — on cutaways — a "
    "structured interior: bright source → beam → cuvette (with sample) → detector on one "
    "axis, plus a main PCB and small cell under the UI deck.\n\n"
    "INTENTIONAL / DO NOT FLAG (these are correct instrument language):\n"
    "  • a TRANSLUCENT optical cube seated ON the body with PCB, cuvette, baffles, and "
    "detector INSIDE that cube — that is the designed cutaway, not an explosion\n"
    "  • a small vertical source PCB on the cube's front face (replaceable LED module)\n"
    "  • a translucent or ghosted body shell that still reads as one closed chassis\n\n"
    "Do NOT flag missing battery-pack density, inverter stacks, PV/AC busbars, plant pipes, "
    "or BESS thermal ducts — those belong to energy-storage products, not instruments.\n\n"
    "Flag broken=true ONLY when any of these are present:\n"
    "  • blank / empty render (no product visible)\n"
    "  • parts floating OUTSIDE the product envelope or disconnected from the chassis "
    "(not merely visible through a translucent cube)\n"
    "  • a hollow open-front arch / gutted chassis with internals hanging in empty air\n"
    "  • a featureless empty box with NO optical path, PCB, port, or grip cues\n"
    "  • cutaway that is only vertical grey slabs (cabinet language) with no optical axis\n"
    "  • display that reads as a pale blank patch or green FR4 plate on a closed exterior\n"
    "  • product cropped so small it is unreadable\n"
    "  • absurd scale (one part dwarfing the whole device unrealistically)\n\n"
    "Reply with STRICT JSON only: "
    "{\"broken\": true|false, \"defects\": [\"specific visible defect\", ...]}."
)

# INTENT: optical-instrument rubric false-fails a correct OPEN multi-channel
# syringe-pump array (exposed steppers/screws/carriages — mechanism IS the
# product face) because it demands optical-cube / closed-chassis language.
# Form gate: ifg.is_syringe_pump_form — never a product-noun branch.
_SYRINGE_PUMP_PROMPT = (
    "You are an adversarial industrial-design reviewer inspecting a 3-D render of a "
    "BENCHTOP MULTI-CHANNEL SYRINGE PUMP / linear dosing array (OPEN mechanism form — "
    "NOT a colorimeter, NOT a PCR box, NOT a wall battery, NOT a plant skid).\n\n"
    "Expect N parallel open bays on one benchtop base: black NEMA-class stepper at the "
    "rear of each bay, lead screw + dual guide rails, a CONTRASTING (often bright blue) "
    "carriage with a star/thumb clamp for the plunger, a V-cradle + star clamp at the "
    "tip for the syringe barrel, white/translucent syringe barrels, and a SEPARATE "
    "control console beside the array with a tipped landscape display (and often a blue "
    "top plate). A bundled wire harness from the motors into the console is normal. "
    "The open mechanism IS the product face — there is NO sealed optical cube / closed "
    "charcoal L-body.\n\n"
    "INTENTIONAL / DO NOT FLAG (correct syringe-pump language):\n"
    "  • exposed steppers, lead screws, rails, carriages, cradles — OPEN array, not a "
    "gutted hollow chassis\n"
    "  • bright blue / contrasting carriage blocks (motion readability)\n"
    "  • black star / lobed thumb knobs on carriage and tip cradle\n"
    "  • a control console as a separate volume beside the array\n"
    "  • thin tubing from syringe tips toward the console / stage\n"
    "  • missing optical cube / cuvette / ambient-light LID / charcoal D-pad — those "
    "belong to colorimeters\n"
    "  • missing battery pack / inverter / plant pipes / Mech Plant Rm\n\n"
    "Flag broken=true ONLY when any of these are present:\n"
    "  • blank / empty render (no product visible)\n"
    "  • a sealed featureless cube / empty crate with NO parallel actuator bays\n"
    "  • optical colorimeter tower / cuvette well wrongly on a syringe-pump array\n"
    "  • plant-room language (access ladders, expansion vessels, industrial EC motors "
    "as the product)\n"
    "  • carriages/syringes floating with NO shared base / rails / screws connecting them\n"
    "  • product cropped so small it is unreadable\n"
    "  • absurd scale (one part dwarfing the whole device unrealistically)\n\n"
    "Reply with STRICT JSON only: "
    "{\"broken\": true|false, \"defects\": [\"specific visible defect\", ...]}."
)

# INTENT (OpenFlexure 2026-07-17): optical-instrument rubric false-fails a correct
# OPEN lab_microscope (cream FDM + flexure stage + steppers) as "featureless empty
# box" because it demands charcoal L-body / cuvette / D-pad. Form gate:
# ifg.is_lab_microscope_form — never a product-noun branch.
_LAB_MICROSCOPE_PROMPT = (
    "You are an adversarial industrial-design reviewer inspecting a 3-D render of an "
    "OPEN FLEXURE / printed-stage LAB MICROSCOPE (benchtop maker instrument — "
    "NOT a colorimeter, NOT a PCR box, NOT a sealed charcoal handheld, NOT a plant skid).\n\n"
    "Expect a cream / off-white FDM polymer body as the product face, an XY / focus "
    "actuator stage with dark stepper motors (often NEMA-class cubes) and leadscrews, "
    "a stage plate that can hold a glass slide, an optics tube (often under or through "
    "the stage), and a condenser / illumination cue. The OPEN printed mechanism IS the "
    "product — there is NO sealed optical colorimeter cube and NO charcoal L-body D-pad.\n\n"
    "INTENTIONAL / DO NOT FLAG (correct lab-microscope language):\n"
    "  • cream / ivory FDM body instead of charcoal polymer\n"
    "  • exposed steppers, leadscrews, flexure arms, stage — OPEN mechanism, not a "
    "gutted hollow chassis\n"
    "  • dark optics tube / condenser as separate cylindrical volumes\n"
    "  • missing cuvette well / ambient-light LID / square tactile D-pad — those belong "
    "to colorimeters\n"
    "  • missing battery pack / inverter / plant pipes / Mech Plant Rm\n\n"
    "Flag broken=true ONLY when any of these are present:\n"
    "  • blank / empty render (no product visible)\n"
    "  • a sealed featureless charcoal / grey cube with NO cream body and NO stage / "
    "actuators / optics tube\n"
    "  • colorimeter optical tower / cuvette / ambient-light LID wrongly as the product\n"
    "  • plant-room language (racks, expansion vessels, industrial EC motors as the product)\n"
    "  • steppers/stage floating with NO shared cream body / pedestal connecting them\n"
    "  • product cropped so small it is unreadable\n"
    "  • absurd scale (one part dwarfing the whole device unrealistically)\n\n"
    "Reply with STRICT JSON only: "
    "{\"broken\": true|false, \"defects\": [\"specific visible defect\", ...]}."
)

# INTENT: optical-instrument rubric false-fails a correct PCR thermocycler cutaway
# (wood box + hinged lid + sample-block wells + PCB) because it demands
# cuvette/optical-path language. Tip-back-lid PCR form is a DIFFERENT family —
# judge maker-box thermal cues, never colorimeter cues. Form gate:
# ifg.is_thermocycler_form (class / part vocab — not a product-noun branch).
_THERMOCYCLER_PROMPT = (
    "You are an adversarial industrial-design reviewer inspecting a 3-D render of a "
    "BENCHTOP PCR THERMOCYCLER / thermal cycler (maker-box tip-back lid form — "
    "NOT a colorimeter, NOT a wall battery, NOT a plant skid).\n\n"
    "Expect a laser-cut wood (or wood-tone plate) box with finger-joint / tab cues, a "
    "hinged lid open tip-back, a dark FIVE-LOBE star pressure knob ON the outer lid "
    "face (low-poly joined hub+lobes count — not a featureless blank lid, not on the "
    "floor), an aluminium sample block with PCR-tube wells through the lid opening, "
    "preferably a metal platen on the lid underside, and on cutaways a PCB + TEC / "
    "heatsink under the block. Side vent slots showing fins are normal.\n\n"
    "INTENTIONAL / DO NOT FLAG (correct thermocycler language):\n"
    "  • open-front cutaway showing PCB + sample block (maker showcase, not a gutted arch)\n"
    "  • wood / plywood plate aesthetic instead of charcoal polymer\n"
    "  • green FR4 PCB on the FLOOR of an open cutaway (that is the controller board)\n"
    "  • a LOW-POLY five-lobe star on the lid made of joined dark boxes/prisms — that IS "
    "the star knob (do NOT call it floating/exploded debris when it sits on the lid)\n"
    "  • missing optical cube / cuvette / beam path / parked ambient-light LID — those "
    "belong to colorimeters, not PCR thermocyclers\n"
    "  • missing battery pack / inverter / plant pipes\n\n"
    "Flag broken=true ONLY when any of these are present:\n"
    "  • blank / empty render (no product visible)\n"
    "  • open box with EMPTY cavity — no sample block / tube wells visible under the lid\n"
    "  • closed exterior / product shot that reads as a featureless hollow wood crate "
    "(no wells through the open lid, no heatsink through side vents, no lid knob)\n"
    "  • lid knob / star handle sitting on the floor disconnected from the lid\n"
    "  • open lid with NO dark lobed/star handle on the outer lid face "
    "(a completely blank lid — a low-poly star of joined lobes is PASS)\n"
    "  • parts floating OUTSIDE the product envelope (NOT the lid-mounted star)\n"
    "  • colorimeter optical tower / cuvette well / ambient-light LID wrongly on a PCR box\n"
    "  • BESS / plant-room language (Mech Plant Rm, rack stacks, industrial EC motors)\n"
    "  • product cropped so small it is unreadable\n"
    "  • absurd scale (one part dwarfing the whole device unrealistically)\n\n"
    "Reply with STRICT JSON only: "
    "{\"broken\": true|false, \"defects\": [\"specific visible defect\", ...]}."
)


def _load_run_state(image_path: str) -> dict:
    try:
        run_dir = os.path.dirname(os.path.abspath(image_path))
        with open(os.path.join(run_dir, "state.json"), encoding="utf-8") as fh:
            st = json.load(fh)
        return st if isinstance(st, dict) else {}
    except Exception:  # noqa: BLE001
        return {}


def _product_class(image_path: str) -> str:
    st = _load_run_state(image_path)
    for src in (
        (st.get("orchestratorContract") or {}).get("product_class"),
        (st.get("moduleDecomposition") or {}).get("product_class"),
        (st.get("parsedBrief") or {}).get("product_class"),
        (st.get("keyMetrics") or {}).get("product_class"),
    ):
        if src:
            return str(src)
    return ""


def _part_blob_from_state(st: dict) -> str:
    part_blob = ""
    for m in ((st.get("moduleDecomposition") or {}).get("modules") or []):
        for sm in (m.get("sub_modules") or []):
            for w in (sm.get("words") or []):
                part_blob += " " + str(w.get("name_human") or "")
    return part_blob


def _is_thermocycler_mode(image_path: str) -> bool:
    """True for tip-back-lid PCR form — uses _THERMOCYCLER_PROMPT, not optical rubric."""
    st = _load_run_state(image_path)
    return ifg.is_thermocycler_form(
        product_class=_product_class(image_path),
        part_blob=_part_blob_from_state(st),
        is_instrument=bool(st.get("isInstrumentDevice", True)),
    )


def _is_syringe_pump_mode(image_path: str) -> bool:
    """True for OPEN multi-channel linear dosing — uses _SYRINGE_PUMP_PROMPT."""
    st = _load_run_state(image_path)
    return ifg.is_syringe_pump_form(
        product_class=_product_class(image_path),
        part_blob=_part_blob_from_state(st),
        is_instrument=bool(st.get("isInstrumentDevice", True)),
    )


def _is_lab_microscope_mode(image_path: str) -> bool:
    """True for OPEN flexure-stage lab microscope — uses _LAB_MICROSCOPE_PROMPT."""
    st = _load_run_state(image_path)
    fn = getattr(ifg, "is_lab_microscope_form", None)
    if not callable(fn):
        return False
    return bool(fn(
        product_class=_product_class(image_path),
        part_blob=_part_blob_from_state(st),
        is_instrument=bool(st.get("isInstrumentDevice", True)),
    ))


def _is_instrument_mode(image_path: str) -> bool:
    """True when the run's state declares a device-scale instrument."""
    st = _load_run_state(image_path)
    return bool(st.get("isInstrumentDevice"))


def _is_product_mode(image_path: str) -> bool:
    """Sealed-product runs (enclosure_volume_m3 < 1 in the contract) are judged by the
    PRODUCT rubric — a ghosted cutaway is intentional there, not 'not a real plant'
    (2026-07-11 run 60: the plant prompt flagged the product hero as 'abstract
    semi-transparent blocks'). Signal-keyed on the run's own contract, never a class.
    Instruments use _INSTRUMENT_PROMPT instead (not the wall-battery product checklist)."""
    if _is_instrument_mode(image_path):
        return False
    try:
        st = _load_run_state(image_path)
        q = ((st.get("orchestratorContract") or {}).get("quantities") or {})
        v = q.get("enclosure_volume_m3")
        val = v.get("value") if isinstance(v, dict) else v
        return bool(val is not None and 0 < float(val) < 1.0)
    except Exception:  # noqa: BLE001
        return False


def _prompt_for_image(image_path: str) -> str:
    # Form-specific instrument rubrics BEFORE generic optical instrument.
    if _is_syringe_pump_mode(image_path):
        return _SYRINGE_PUMP_PROMPT
    if _is_thermocycler_mode(image_path):
        return _THERMOCYCLER_PROMPT
    if _is_lab_microscope_mode(image_path):
        return _LAB_MICROSCOPE_PROMPT
    if _is_instrument_mode(image_path):
        return _INSTRUMENT_PROMPT
    if _is_product_mode(image_path):
        return _PRODUCT_PROMPT
    return _PROMPT


def _rubric_check_labels(prompt: str) -> list[str]:
    """Extract the bullet criteria under 'Flag broken=true' from a vision rubric.

    @description Counts named failure modes the model was asked to evaluate so a
    successful critique can report checks_run ≥ 3 (Excel Renders honesty gate).
    @param prompt Full vision rubric text
    @returns Short labels for each bullet criterion (empty if none found)
    """
    labels: list[str] = []
    in_flag = False
    for raw in prompt.splitlines():
        line = raw.strip()
        if "Flag broken=true" in line or "flag broken=true" in line.lower():
            in_flag = True
            continue
        if in_flag:
            if line.startswith("•") or line.startswith("-") or line.startswith("*"):
                lab = line.lstrip("•-* ").strip()
                if lab:
                    labels.append(lab[:80])
            elif line.startswith("A ") or line.startswith("Do NOT") or line.startswith("Reply"):
                break
            elif not line:
                if labels:
                    break
    return labels


def _critique_once(image_path: str, model: str, timeout: int) -> dict:
    return _critique_render_impl(image_path, model, timeout)


def critique_render(image_path: str, model: str = DEFAULT_MODEL, timeout: int = 90) -> dict:
    """FLAKE FILTER (2026-07-11 run 67): broken=true with an EMPTY defects list is the
    model's known flake mode (#86 — near-identical geometry flips verdicts run-to-run;
    run 65 clean, run 67 nameless-broken on the same clean product, verified by eye).
    A nameless flag gets EXACTLY ONE retry to substantiate: a retry that NAMES a defect
    scores (cap ≤4); a clean retry is clean; nameless twice keeps the honest cap-at-7.
    A named first verdict is NEVER retried away (flag-only council rule intact)."""
    res = _critique_once(image_path, model, timeout)
    if isinstance(res, dict) and res.get("ok") and res.get("broken") is True and not res.get("defects"):
        retry = _critique_once(image_path, model, timeout)
        if isinstance(retry, dict) and retry.get("ok"):
            retry["flake_retry"] = True
            res = retry
    # DIFFERENT-FAMILY TIEBREAK (2026-07-11 run 74 — the SECOND nameless-broken on a
    # render verified clean by eye + by every deterministic gate: run 67, then run 74
    # straight through the one-retry filter). A broken verdict with NO named defect
    # violates the rubric's own output contract ('flag ONLY these defects'), twice —
    # that is a NON-VERDICT, and a false FAIL is as dishonest as a false PASS. Ask a
    # DIFFERENT model family to arbitrate (perspective diversity, not re-rolling the
    # same flaky judge): a tiebreak that names defects → broken stands WITH names; a
    # clean tiebreak → clean, flake overruled + logged. Tiebreak errors change nothing.
    if isinstance(res, dict) and res.get("ok") and res.get("broken") is True and not res.get("defects"):
        tb_model = os.environ.get("VISION_TIEBREAK_MODEL", "x-ai/grok-4.3")
        tb = _critique_once(image_path, tb_model, timeout)
        if isinstance(tb, dict) and tb.get("ok"):
            tb["flake_retry"] = True
            tb["tiebreak_after_nameless"] = {"first_model": model, "verdict": "overruled"
                                             if tb.get("broken") is False else "upheld"}
            return tb
    return res


def _critique_render_impl(image_path: str, model: str = DEFAULT_MODEL, timeout: int = 90) -> dict:
    key = _key()
    if not key:
        return {"broken": None, "defects": [], "model": model, "ok": False, "error": "no OPENROUTER_API_KEY"}
    try:
        with open(image_path, "rb") as fh:
            b64 = base64.b64encode(fh.read()).decode()
    except OSError as exc:
        return {"broken": None, "defects": [], "model": model, "ok": False, "error": f"read failed: {exc}"}
    body = json.dumps({
        "model": model,
        "max_tokens": 600,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": _prompt_for_image(image_path)},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
        ]}],
    }).encode()
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions", data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    try:
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode())
        except urllib.error.HTTPError as http_exc:
            # 402 failover (2026-07-10, mirrors or402-failover.mjs): OpenRouter credits
            # exhausted must not silently blind the drawing-quality net. Gemini is
            # multimodal, so route the SAME OpenAI-shape request to the direct Google
            # key; google/* models map 1:1, anything else substitutes gemini-3.5-flash.
            gkey = _google_key()
            if http_exc.code != 402 or not gkey or os.environ.get("OPENROUTER_402_FAILOVER") == "0":
                raise
            gmodel = model.split("google/", 1)[1] if model.startswith("google/") else "gemini-3.5-flash"
            gbody = json.loads(body.decode()); gbody["model"] = gmodel
            greq = urllib.request.Request(
                "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
                data=json.dumps(gbody).encode(),
                headers={"Authorization": f"Bearer {gkey}", "Content-Type": "application/json"})
            print(f"[vision-critic] OpenRouter 402 → google:{gmodel}", file=sys.stderr)
            with urllib.request.urlopen(greq, timeout=timeout) as resp:
                data = json.loads(resp.read().decode())
        txt = data["choices"][0]["message"]["content"]
    except Exception as exc:  # noqa: BLE001
        return {"broken": None, "defects": [], "model": model, "ok": False, "error": str(exc)[:160]}
    # Robust parse: the model may wrap the JSON in a ```json fence and/or TRUNCATE it mid-string. Strip
    # fences, try full JSON, else fall back to extracting the broken flag + any quoted defect strings
    # (a truncated '{"broken": true, "defects": ["red pipe …' still yields the verdict).
    txt2 = re.sub(r"```(?:json)?", "", txt)
    out = None
    mm = re.search(r"\{.*\}", txt2, re.S)
    if mm:
        try:
            out = json.loads(mm.group(0))
        except json.JSONDecodeError:
            out = None
    if out is None:
        bm = re.search(r'"broken"\s*:\s*(true|false)', txt2, re.I)
        if not bm:
            return {"broken": None, "defects": [], "model": model, "ok": False, "error": f"no verdict: {txt[:120]}"}
        tail = txt2.split('"defects"', 1)[-1] if '"defects"' in txt2 else ""
        out = {"broken": bm.group(1).lower() == "true",
               "defects": re.findall(r'"([^"]{3,90})"', tail)}
    # INTENT (2026-07-14): Excel Renders scorer requires checks_run≥3 so an empty
    # broken=false cannot mint a 9. Count the rubric's explicit "Flag broken=true"
    # criteria that this prompt asked the model to evaluate — a real glance, not a
    # nameless shrug. Deterministic from the prompt text; never invents per-item PASS.
    prompt = _prompt_for_image(image_path)
    checks = _rubric_check_labels(prompt)
    return {
        "broken": bool(out.get("broken")),
        "defects": out.get("defects") or [],
        "model": model,
        "ok": True,
        "checks_run": len(checks),
        "n_checks": len(checks),
        "checklist": checks,
    }


_HERO_CANDIDATES = ("00-hero.png", "blender-cover.png", "cover.png", "inspect-hero.png")
# INTENT (colorimeter 2254): sealed handheld product face — prefer exterior over
# a cutaway/inspect that can be left as the labelled CAD arch when shaded hero
# fails mid-race.
_INSTRUMENT_EXTERIOR_CANDIDATES = ("04-product-exterior.png",)


def _hero_is_inspect_clone(run_dir: str, hero_path: str) -> bool:
    """True when 00-hero.png is byte-identical to inspect-hero (failed shaded pass)."""
    if os.path.basename(hero_path) not in ("00-hero.png", "blender-cover.png"):
        return False
    inspect = os.path.join(run_dir, "inspect-hero.png")
    if not os.path.isfile(inspect):
        return False
    try:
        return open(hero_path, "rb").read() == open(inspect, "rb").read()
    except OSError:
        return False


def critique_run(run_dir: str, model: str = DEFAULT_MODEL) -> dict:
    """Find the run's hero render, critique it, and WRITE render-vision-critique.json into run_dir.
    Non-fatal: returns {ok: False} if no render or no key (the dossier scorer then keeps the render's
    'visual quality UNVERIFIED' advisory → capped at 7, honest). Called from the Blender bg-runner.

    CACHED on the geometry-manifest hash (geometry_hash(run_dir)): a run whose parts-manifest +
    route-manifest are byte-identical to a PRIOR critiqued run reuses that prior verdict verbatim —
    no LLM call, no re-roll. Only an 'ok' prior verdict from the SAME model is reused (a failed/no-key
    prior attempt is not cached as a verdict). Absence of either manifest (geo_hash is None) disables
    caching for that run — correctness over speed when there is nothing stable to key on."""
    # RULE: tip-back lid outer-face controls → prefer sealed product exterior
    # (ifg.tipback_lid_vision_image_candidates) over cutaway hero.
    _probe = os.path.join(run_dir, "state.json")
    _cands: list[str]
    if _is_thermocycler_mode(_probe):
        _cands = ifg.tipback_lid_vision_image_candidates() + list(_HERO_CANDIDATES)
    else:
        # Optical handheld / sealed instruments: prefer product exterior when the
        # cutaway hero is still the inspect clone (colorimeter 2254).
        _cands = list(_INSTRUMENT_EXTERIOR_CANDIDATES) + list(_HERO_CANDIDATES)
    # Dedupe while preserving preference order.
    _seen: set[str] = set()
    _ordered: list[str] = []
    for _f in _cands:
        if _f not in _seen:
            _seen.add(_f)
            _ordered.append(_f)
    hero = None
    for f in _ordered:
        p = os.path.join(run_dir, f)
        if not os.path.exists(p):
            continue
        if _hero_is_inspect_clone(run_dir, p):
            continue  # skip inspect-as-hero; prefer 04-product-exterior
        hero = p
        break
    geo_hash = geometry_hash(run_dir)
    if geo_hash:
        cached = cache_read(geo_hash)
        # a NAMELESS broken verdict is a NON-VERDICT (the rubric demands named
        # defects) — never replay it from cache; re-judge so the tiebreak can run.
        if (isinstance(cached, dict) and cached.get("broken") is True
                and not cached.get("defects")):
            cached = None
        if isinstance(cached, dict) and cached.get("ok") and cached.get("model") == model:
            res = dict(cached)
            res["cache_hit"] = True
            res["geometry_hash"] = geo_hash
            if hero:
                res["image"] = os.path.basename(hero)
            try:
                with open(os.path.join(run_dir, "render-vision-critique.json"), "w", encoding="utf-8") as fh:
                    json.dump(res, fh, indent=2)
            except OSError:
                pass
            return res
    if not hero:
        res = {"broken": None, "defects": [], "model": model, "ok": False, "error": "no hero render"}
    else:
        res = critique_render(hero, model)
        res["image"] = os.path.basename(hero)
    if geo_hash:
        res["geometry_hash"] = geo_hash
        res["cache_hit"] = False
        if res.get("ok"):
            cache_write(geo_hash, res)
    try:
        with open(os.path.join(run_dir, "render-vision-critique.json"), "w", encoding="utf-8") as fh:
            json.dump(res, fh, indent=2)
    except OSError:
        pass
    return res


if __name__ == "__main__":
    mdl = next((sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == "--model"), DEFAULT_MODEL)
    if "--write" in sys.argv:
        rd = sys.argv[sys.argv.index("--write") + 1]
        print(json.dumps(critique_run(rd, mdl), indent=2))
        raise SystemExit(0)
    args = [a for a in sys.argv[1:] if not a.startswith("--") and a != mdl]
    if not args:
        print("usage: render_vision_critic.py <image.png> | --write <run_dir> [--model M]", file=sys.stderr)
        raise SystemExit(2)
    print(json.dumps(critique_render(args[0], mdl), indent=2))
