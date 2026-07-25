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
    "A COHERENT plant is the bar: every item sits ON the platform, connected to its neighbours, at a "
    "believable relative scale, and the whole thing reads as one designed layout — not a pile of blocks.\n"
    "Flag broken=true if ANY of these VISUAL defects is present (an INCOHERENT render is BROKEN even if "
    "each individual block looks 'fine' — judge the WHOLE):\n"
    "  • a STRAY pipe/beam/cable shooting OFF the platform or into empty space (a long thin element "
    "going nowhere, or to a floating box outside the plant)\n"
    "  • a FLOATING / disconnected object — anything not sitting on the platform, or visibly detached "
    "from the equipment it should join (a gap of empty space between a part and the chassis it belongs to)\n"
    "  • GROSS SCALE-INCOHERENCE — one part many times larger or smaller than physically plausible for "
    "its neighbours, OR an assembly of same-size blocks stacked/scattered like toy bricks in a box "
    "(a 'Lego-in-a-box' layout) rather than a real plant with a sensible size hierarchy\n"
    "  • a FEATURELESS layout — plain closed boxes with no pipes, connections, nozzles, or discernible "
    "equipment features; a render that could be any grey blocks, not a specific plant\n"
    "  • a BLANK / empty render (no plant visible)\n"
    "  • GARBLED / exploded / overlapping geometry that is obviously not a real layout\n"
    "Do NOT flag a clean, coherent, connected plant with a sensible size hierarchy and real features — "
    "simplified-but-recognisable equipment is acceptable and must PASS.\n"
    "Reply with STRICT JSON only: {\"broken\": true|false, \"defects\": [\"short description\", ...]}. "
    "broken=true if ANY defect above is visible; defects lists each one in a few words. If the render "
    "looks like a clean, plausible, connected plant layout, return {\"broken\": false, \"defects\": []}."
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
    "the internal architecture.\n\n"
    "COHERENCE OVERRIDE — always broken=true when the render is INCOHERENT as a whole, "
    "regardless of the checklist above:\n"
    "  • any internal part FLOATING or disconnected — a gap of empty space between a "
    "component and the enclosure/board it mounts to\n"
    "  • GROSS scale-incoherence — one part many times larger/smaller than plausible, "
    "or same-size blocks stacked/scattered like toy bricks in a box ('Lego-in-a-box')\n"
    "  • a FEATURELESS closed shell — a plain sealed box with NO discernible internal "
    "zones, ports, or product features (could be any anonymous block)\n"
    "A clean sealed product with a credible internal architecture and mounted, connected "
    "parts must still PASS — do not reject a coherent product. "
    "Reply with STRICT JSON only: "
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
    "Flag broken=true ONLY when any of these are present (an INCOHERENT device is BROKEN "
    "even if each block looks 'fine' on its own — judge the WHOLE product):\n"
    "  • blank / empty render (no product visible)\n"
    "  • parts floating OUTSIDE the product envelope or disconnected from the chassis "
    "(not merely visible through a translucent cube)\n"
    "  • exploded, floating, or wildly overlapping geometry\n"
    "  • a part FLOATING or DISCONNECTED — a visible gap of empty space between a component "
    "and the body/board it should mount to (parts that do not read as one assembled device)\n"
    "  • GROSS scale-incoherence — one part many times larger/smaller than plausible for a "
    "handheld/benchtop device, OR same-size blocks stacked/scattered like toy bricks in a box "
    "('Lego-in-a-box') instead of a real device with a sensible size hierarchy\n"
    "  • a hollow open-front arch / gutted chassis with internals hanging in empty air\n"
    "  • a featureless empty box with NO optical path, PCB, port, display, or grip cues "
    "(a plain sealed block that could be anything)\n"
    "  • cutaway that is only vertical grey slabs (cabinet language) with no optical axis\n"
    "  • display that reads as a pale blank patch or green FR4 plate on a closed exterior\n"
    "  • product cropped so small it is unreadable\n\n"
    "A clean, coherent benchtop/handheld instrument with a real fascia and mounted, connected "
    "parts (optical bench + PCB + ports) must still PASS — do NOT reject a coherent device. "
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


# INCOHERENCE FLOOR (V1b, 2026-07-21) — the pure verdict-from-rubric-output decision. The
# rubric prompts now instruct the model to set broken=true on a floating/disconnected part,
# gross scale-incoherence (a Lego-in-a-box), or a featureless closed shell. But a flaky
# vision model can NAME the very defect in its `defects` list and still emit broken=false
# (the exact failure the 2150 organoid Lego hero slipped through — ~8 checks, broken=false,
# only the deterministic V1a phenotype gate saved it). This floor closes that hole
# DETERMINISTICALLY: if the model's OWN words describe a hard-incoherence defect, the verdict
# is BROKEN regardless of the flag it set. Pure + offline (no API) → proveCatch'able directly.
_INCOHERENCE_MARKERS = (
    "floating", "float ", "disconnected", "detached", "not connected", "unsupported",
    "hovering", "suspended in", "gap between", "not attached", "not sitting", "off the platform",
    "shooting off", "into empty space", "into the air", "flies off", "flying off",
    "lego", "toy brick", "toy block", "stacked block", "scattered block", "pile of block",
    "scale-incoheren", "scale incoheren", "absurd scale", "wildly out of scale",
    "dwarf", "many times larger", "many times smaller", "out of proportion", "wrong scale",
    "featureless", "anonymous box", "anonymous block", "plain box", "plain block",
    "empty box", "hollow shell", "no discernible", "no features", "no product feature",
    "exploded", "garbled", "overlapping geometry",
)


def _defect_names_incoherence(defects) -> bool:
    """True when any defect string describes a HARD-incoherence phenotype (floating /
    disconnected / gross scale / Lego-in-a-box / featureless shell / exploded)."""
    for d in defects or []:
        s = str(d).lower()
        if any(m in s for m in _INCOHERENCE_MARKERS):
            return True
    return False


def verdict_from_model_output(raw: dict) -> dict:
    """Canonicalise the model's raw JSON ({broken, defects}) into the final critic verdict,
    applying the INCOHERENCE FLOOR: a named hard-incoherence defect forces broken=true even
    if the model set broken=false (a model that SEES it but does not FLIP the flag). Never
    turns a broken verdict clean — the flag can only be floored UP, never relaxed (the
    flag-only council contract: the critic may FLAG/FAIL, never rescue). Pure; no I/O."""
    if not isinstance(raw, dict):
        return {"broken": None, "defects": []}
    defects = raw.get("defects") or []
    broken = bool(raw.get("broken"))
    floored = False
    if not broken and _defect_names_incoherence(defects):
        broken = True
        floored = True
    out = {"broken": broken, "defects": defects}
    if floored:
        out["incoherence_floor"] = True
    return out


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


def _post_vision(content: list, model: str, timeout: int, checks_prompt: str) -> dict:
    """Shared transport + robust parse for one OpenRouter vision call.

    @param content Prebuilt OpenAI-shape content array (text + N image_url parts).
    @param checks_prompt The rubric text used to count checks_run (Excel honesty gate).
    Mirrors _critique_render_impl's 402 failover + fenced/truncated JSON recovery so
    the single-image and multi-image entrypoints share ONE battle-tested code path.
    """
    key = _key()
    if not key:
        return {"broken": None, "defects": [], "model": model, "ok": False, "error": "no OPENROUTER_API_KEY"}
    body = json.dumps({
        "model": model,
        "max_tokens": 600,
        "messages": [{"role": "user", "content": content}],
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
    # ROBUSTNESS (2026-07-21): a flaky provider can return content=None / non-string (or an empty
    # body) — treat it as a failed call (ok:False → the caller skips), never crash the re.sub below.
    if not isinstance(txt, str) or not txt.strip():
        return {"broken": None, "defects": [], "model": model, "ok": False,
                "error": f"empty/non-string content: {type(txt).__name__}"}
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
    # INCOHERENCE FLOOR (V1b, 2026-07-21): a named hard-incoherence defect forces broken=true
    # even if the flaky model set broken=false (the 2150 Lego-hero hole).
    v = verdict_from_model_output(out)
    # INTENT (2026-07-14): Excel Renders scorer requires checks_run≥3 so an empty
    # broken=false cannot mint a 9. Count the rubric's explicit "Flag broken=true"
    # criteria that this prompt asked the model to evaluate — a real glance, not a
    # nameless shrug. Deterministic from the prompt text; never invents per-item PASS.
    checks = _rubric_check_labels(checks_prompt)
    res = {
        "broken": bool(v.get("broken")),
        "defects": v.get("defects") or [],
        "model": model,
        "ok": True,
        "checks_run": len(checks),
        "n_checks": len(checks),
        "checklist": checks,
    }
    if v.get("incoherence_floor"):
        res["incoherence_floor"] = True
    return res


def _critique_render_impl(image_path: str, model: str = DEFAULT_MODEL, timeout: int = 90) -> dict:
    try:
        with open(image_path, "rb") as fh:
            b64 = base64.b64encode(fh.read()).decode()
    except OSError as exc:
        return {"broken": None, "defects": [], "model": model, "ok": False, "error": f"read failed: {exc}"}
    prompt = _prompt_for_image(image_path)
    content = [
        {"type": "text", "text": prompt},
        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
    ]
    return _post_vision(content, model, timeout, prompt)


def critique_images(image_paths: list, prompt: str, model: str = DEFAULT_MODEL,
                    timeout: int = 90) -> dict:
    """Critique MULTIPLE images in one call against an explicit prompt.

    @description Sends every image (labelled IMAGE 1..N in a text preamble) plus the
    caller's prompt to the vision model. Used by the render-vs-GA coherence SIGHT
    (drawing_vision_glance) — the two artefacts must depict ONE device; the model is
    shown both together so it can judge cross-artefact agreement, not each alone.
    Shares _post_vision's 402 failover + incoherence floor + robust parse.
    """
    if not image_paths:
        return {"broken": None, "defects": [], "model": model, "ok": False, "error": "no images"}
    content: list = [{"type": "text", "text": prompt}]
    for idx, p in enumerate(image_paths, 1):
        try:
            with open(p, "rb") as fh:
                b64 = base64.b64encode(fh.read()).decode()
        except OSError as exc:
            return {"broken": None, "defects": [], "model": model, "ok": False,
                    "error": f"read failed ({p}): {exc}"}
        content.append({"type": "text", "text": f"IMAGE {idx}:"})
        content.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}})
    return _post_vision(content, model, timeout, prompt)


_HERO_CANDIDATES = ("00-hero.png", "blender-cover.png", "cover.png", "inspect-hero.png")
# INTENT (colorimeter 2254): sealed handheld product face — prefer exterior over
# a cutaway/inspect that can be left as the labelled CAD arch when shaded hero
# fails mid-race.
_INSTRUMENT_EXTERIOR_CANDIDATES = ("04-product-exterior.png",)


# DELIVERABLE PRODUCT-RENDER names that must never be a byte-copy of a diagnostic
# inspect-*.png proxy pass (the X-103 clay shipped as 01-top, Tristan 2026-07-23 defect #3).
_DELIVERABLE_RENDER_GLOBS = (
    "00-hero.png", "01-top.png", "blender-cover.png",
    "04-product-exterior.png", "05-product-left.png",
    "06-product-right.png", "07-product-service.png",
    "08-product-ghost-shell.png",
)


def _md5_file(path: str):
    try:
        with open(path, "rb") as fh:
            return hashlib.md5(fh.read()).hexdigest()
    except OSError:
        return None


def inspect_proxy_collisions(run_dir: str):
    """Every deliverable product render that is a BYTE-COPY (md5 match) of a diagnostic
    inspect-*.png proxy pass. Returns [(render_name, inspect_name), ...]. A diagnostic
    pass (grey placeholder cylinders + a floating equipment tag like 'X-103') must NEVER
    ship badged as a customer 'Product render' (Tristan 2026-07-23). Deterministic, £0."""
    import glob as _glob
    collisions = []
    # md5 every inspect-*.png once.
    inspect_md5: dict = {}
    for ip in sorted(_glob.glob(os.path.join(run_dir, "inspect-*.png"))):
        h = _md5_file(ip)
        if h:
            inspect_md5.setdefault(h, os.path.basename(ip))
    if not inspect_md5:
        return collisions
    for rn in _DELIVERABLE_RENDER_GLOBS:
        rp = os.path.join(run_dir, rn)
        if not os.path.isfile(rp):
            continue
        h = _md5_file(rp)
        if h and h in inspect_md5:
            collisions.append((rn, inspect_md5[h]))
    return collisions


def _hero_is_inspect_clone(run_dir: str, hero_path: str) -> bool:
    """True when 00-hero.png is byte-identical to inspect-hero (failed shaded pass).
    Thin wrapper over the generalised md5 proxy detector."""
    if os.path.basename(hero_path) not in ("00-hero.png", "blender-cover.png"):
        return False
    inspect = os.path.join(run_dir, "inspect-hero.png")
    if not os.path.isfile(inspect):
        return False
    try:
        return open(hero_path, "rb").read() == open(inspect, "rb").read()
    except OSError:
        return False


# DELIVERABLE product-render set critiqued by the vision model (the customer-facing views).
_DELIVERABLE_CRITIQUE_NAMES = (
    "00-hero.png", "blender-cover.png",
    "04-product-exterior.png", "05-product-left.png",
    "06-product-right.png", "07-product-service.png",
    "08-product-ghost-shell.png",
)


def critique_deliverable_set(run_dir: str, model: str = DEFAULT_MODEL) -> dict:
    """Run the single-image critique over EVERY customer-facing deliverable render present
    (hero + exterior views + translucent see-inside), write render-vision-critique-<name>.json
    per render, and an aggregate render-vision-critique.json with {broken: any_broken, per_image}.
    So a broken NON-hero deliverable (a washed-out exterior, a buried-feature see-inside) now
    binds ships — not just the hero. Reuses critique_render (one-retry + tiebreak intact)."""
    per_image: dict = {}
    any_broken = False
    for name in _DELIVERABLE_CRITIQUE_NAMES:
        p = os.path.join(run_dir, name)
        if not os.path.isfile(p):
            continue
        if _hero_is_inspect_clone(run_dir, p):
            continue  # an inspect-clone is caught deterministically upstream, not re-critiqued
        res = critique_render(p, model)
        res["image"] = name
        per_image[name] = res
        if isinstance(res, dict) and res.get("ok") and bool(res.get("broken")):
            any_broken = True
        try:
            with open(os.path.join(run_dir, f"render-vision-critique-{name.rsplit('.', 1)[0]}.json"),
                      "w", encoding="utf-8") as fh:
                json.dump(res, fh, indent=2)
        except OSError:
            pass
    agg = {"broken": any_broken, "per_image": per_image,
           "images": sorted(per_image.keys()), "model": model, "ok": bool(per_image)}
    try:
        with open(os.path.join(run_dir, "render-vision-critique.json"), "w", encoding="utf-8") as fh:
            json.dump(agg, fh, indent=2)
    except OSError:
        pass
    return agg


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
        _cands = list(ifg.tipback_lid_vision_image_candidates()) + list(_HERO_CANDIDATES)
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


def _selftest() -> int:
    """proveCatch (GATE INTENT RULE) for the V1b incoherence floor — offline/pure, no vision
    API. Drives verdict_from_model_output() with the exact known-bad rubric-outputs the 2150
    organoid Lego hero produced (model NAMES the incoherence but leaves broken=false) and
    asserts the verdict is floored to broken=true; and drives it with a clean coherent output
    and asserts it stays broken=false (false-positive discipline)."""
    fails = []

    # KNOWN-BAD: the exact 2150 failure shape — the model listed the defect but did NOT flip
    # the flag. Each of these MUST floor to broken=true.
    known_bad = [
        {"broken": False, "defects": ["parts appear to be floating above the base"]},
        {"broken": False, "defects": ["stacked blocks look like Lego bricks in a box"]},
        {"broken": False, "defects": ["one cube dwarfs the whole device — scale-incoherent"]},
        {"broken": False, "defects": ["featureless grey box with no discernible product features"]},
        {"broken": False, "defects": ["a component is disconnected from the chassis"]},
        {"broken": False, "defects": ["exploded geometry, parts scattered"]},
    ]
    for kb in known_bad:
        v = verdict_from_model_output(kb)
        if v.get("broken") is not True or not v.get("incoherence_floor"):
            fails.append(f"FLOOR MISSED: {kb['defects']} → {v}")

    # ALREADY-BROKEN: a model that flipped the flag stays broken (never relaxed).
    v = verdict_from_model_output({"broken": True, "defects": ["stray red beam off the platform"]})
    if v.get("broken") is not True:
        fails.append(f"BROKEN RELAXED: {v}")

    # CLEAN COHERENT: no incoherence phenotype in the words → must PASS (false-positive discipline).
    clean = [
        {"broken": False, "defects": []},
        {"broken": False, "defects": ["minor: display slightly dim"]},  # soft, not incoherence
        {"broken": False, "defects": ["cuvette port could be more recessed"]},
    ]
    for c in clean:
        v = verdict_from_model_output(c)
        if v.get("broken") is not False or v.get("incoherence_floor"):
            fails.append(f"FALSE POSITIVE: {c['defects']} → {v}")

    # ── DELIVERABLE-SET FOLD (2026-07-23): the aggregate any_broken=True when ANY per-image
    # verdict is broken (offline, drive with frozen rubric outputs → verdict_from_model_output).
    _bad_set = {
        "04-product-exterior.png": verdict_from_model_output(
            {"broken": False, "defects": ["parts appear to be floating above the base"]}),
        "05-product-left.png": verdict_from_model_output({"broken": False, "defects": []}),
    }
    if not any(v.get("broken") for v in _bad_set.values()):
        fails.append("DELIVERABLE FOLD: a broken per-image verdict must make any_broken True")
    _clean_set = {
        "04-product-exterior.png": verdict_from_model_output({"broken": False, "defects": []}),
        "08-product-ghost-shell.png": verdict_from_model_output(
            {"broken": False, "defects": ["minor: cuvette port could be recessed"]}),
    }
    if any(v.get("broken") for v in _clean_set.values()):
        fails.append("DELIVERABLE FOLD: an all-clean set must leave any_broken False")

    # ── INSPECT-PROXY md5 collision proveCatch (defect #3, the X-103 clay shipped as 01-top).
    # Uses the REAL fixture when present (out/organoid-for-simon 01-top == inspect-top), else
    # synthesises a byte-identical pair in a temp dir.
    import tempfile as _tf
    _repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    _real = os.path.join(_repo, "out", "organoid-for-simon")
    if os.path.isfile(os.path.join(_real, "01-top.png")) and \
       os.path.isfile(os.path.join(_real, "inspect-top.png")):
        _cols = inspect_proxy_collisions(_real)
        if not any(r == "01-top.png" for (r, _i) in _cols):
            fails.append(f"INSPECT-PROXY: 01-top.png must be flagged a byte-copy of an "
                         f"inspect-*.png (got {_cols})")
    else:
        _td = _tf.mkdtemp(prefix="rvc_proxy_")
        try:
            _blob = b"\x89PNG\r\nclay-proxy-bytes"
            with open(os.path.join(_td, "inspect-top.png"), "wb") as fh:
                fh.write(_blob)
            with open(os.path.join(_td, "01-top.png"), "wb") as fh:
                fh.write(_blob)  # byte-identical
            with open(os.path.join(_td, "04-product-exterior.png"), "wb") as fh:
                fh.write(b"\x89PNG\r\nDIFFERENT-crisp-render")  # NOT a proxy
            _cols = inspect_proxy_collisions(_td)
            if not any(r == "01-top.png" for (r, _i) in _cols):
                fails.append(f"INSPECT-PROXY (synthetic): 01-top byte-copy must fire (got {_cols})")
            if any(r == "04-product-exterior.png" for (r, _i) in _cols):
                fails.append("INSPECT-PROXY (synthetic): a distinct render must NOT false-fire")
        finally:
            import shutil as _sh
            _sh.rmtree(_td, ignore_errors=True)

    if fails:
        print("render_vision_critic _selftest: FAIL")
        for f in fails:
            print("  " + f)
        return 1
    print("render_vision_critic _selftest passed "
          f"({len(known_bad)} incoherence-floor catches, 1 no-relax, {len(clean)} clean-pass, "
          "deliverable-fold + inspect-proxy proveCatch)")
    return 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        raise SystemExit(_selftest())
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
