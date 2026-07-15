#!/usr/bin/env python3
"""drawing_vision_glance.py — FLAG-ONLY vision critic for delivered DRAWING PNGs.

INTENT (Tristan 2026-07-14): G17 audits GA SVG text/markers. The irreducible
residue is the RASTER — a sheet can stamp the right tokens and still look wrong.
This module shows the vision model the DELIVERED PNG (OPERATING-FRAME §0.5 SIGHT
sense 3) and may only FLAG / FAIL — never turn a bad sheet into a PASS.

CONTRACT (mirrors render_vision_critic):
  • Flag-only — broken=True with named defects CAPS the sheet; clean is
    necessary-but-not-sufficient (deterministic G17 still gates).
  • proveCatch on a frozen known-bad fixture; offline (no API key) → SKIP.
  • Shadow by default in drawing_gates; enforce via DRAWING_VISION_ENFORCING=1.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Optional

_HERE = Path(__file__).resolve().parent
_LIB = _HERE.parent / "lib"
if str(_LIB) not in sys.path:
    sys.path.insert(0, str(_LIB))

import render_vision_critic as rvc  # noqa: E402

_GA_INSTRUMENT_PROMPT = (
    "You are an adversarial chartered engineer glancing at a GENERAL ARRANGEMENT "
    "drawing of a handheld/benchtop OPTICAL INSTRUMENT (colorimeter / photometer).\n\n"
    "Expect three orthographic views: FRONT (product form), TOP (keys + display + "
    "optical cube), SIDE. FRONT must show BOTH the optical tower AND a UI/display "
    "band — not an empty L-body with only 'OPTICAL'. Title-block envelope should be "
    "in millimetres for a sub-500 mm product.\n\n"
    "Flag broken=true ONLY when any of these are clearly visible:\n"
    "  • FRONT elevation is empty / featureless / only a blank rectangle\n"
    "  • FRONT claims a cutaway ('door removed') over an empty interior\n"
    "  • FRONT shows optical mass but NO display/UI/HMI band at all\n"
    "  • title block prints metres (0.1 m) for a handheld while dims are mm\n"
    "  • views are blank / cropped / unreadable\n\n"
    "Do NOT flag missing plant pipes, battery packs, or inverter stacks.\n"
    "Reply with STRICT JSON only: "
    "{\"broken\": true|false, \"defects\": [\"short description\", ...]}."
)

_EXTERIOR_INSTRUMENT_PROMPT = (
    "You are an adversarial industrial-design reviewer glancing at a closed-product "
    "3-D exterior render of a handheld OPTICAL INSTRUMENT.\n\n"
    "Expect: charcoal polymer L-body, dark recessed display glass (NOT a green FR4 "
    "plate), square tactile keys in a coherent D-pad, chunky optical cube with "
    "sample well, and at most a small dark source WINDOW on the optical face — "
    "not a full green PCB slapped on the exterior.\n\n"
    "Flag broken=true ONLY when any of these are clearly visible:\n"
    "  • blank / empty / featureless black render\n"
    "  • green FR4 board covering the display OR a large bare PCB on the exterior\n"
    "  • keys wildly misaligned / overlapping / floating off the deck\n"
    "  • exploded or floating geometry\n"
    "  • product cropped unreadably small\n\n"
    "Reply with STRICT JSON only: "
    "{\"broken\": true|false, \"defects\": [\"short description\", ...]}."
)

# INTENT (NinjaPCR 2026-07-15): optical GA/exterior prompts false-fail a correct
# PCR thermocycler (wood box + lid + sample-block wells, no cuvette tower).
_GA_THERMOCYCLER_PROMPT = (
    "You are an adversarial chartered engineer glancing at a GENERAL ARRANGEMENT "
    "drawing of a BENCHTOP PCR THERMOCYCLER / thermal cycler (NinjaPCR / OpenPCR "
    "class — NOT a colorimeter).\n\n"
    "Expect orthographic views of a compact wood / plate box with lid, sample-block "
    "wells, and controller PCB cues. Title-block envelope in millimetres.\n\n"
    "Flag broken=true ONLY when any of these are clearly visible:\n"
    "  • FRONT/TOP elevations are empty / featureless blank rectangles\n"
    "  • views are blank / cropped / unreadable\n"
    "  • title block prints metres for a sub-500 mm benchtop instrument\n\n"
    "Do NOT flag missing optical cube / cuvette / D-pad / charcoal polymer L-body — "
    "those belong to colorimeters, not PCR thermocyclers.\n"
    "Do NOT flag missing plant pipes, battery packs, or inverter stacks.\n"
    "Reply with STRICT JSON only: "
    "{\"broken\": true|false, \"defects\": [\"short description\", ...]}."
)

_EXTERIOR_THERMOCYCLER_PROMPT = (
    "You are an adversarial industrial-design reviewer glancing at a product render "
    "of a BENCHTOP PCR THERMOCYCLER (laser-cut wood box class — NOT a colorimeter).\n\n"
    "Expect: wood-tone box, hinged lid open tip-back, a dark FIVE-LOBE star knob on "
    "the outer lid face (low-poly joined hub+lobes count as the star), aluminium "
    "sample block with tube wells through the lid opening, preferably side vents. "
    "Green FR4 on a CUTAWAY floor is OK.\n\n"
    "Flag broken=true ONLY when any of these are clearly visible:\n"
    "  • blank / empty / featureless render\n"
    "  • open lid over a hollow empty cavity with no sample block / wells\n"
    "  • star knob sitting on the floor disconnected from the lid\n"
    "  • open lid with a completely blank outer face (no dark lobed/star handle — "
    "a low-poly joined star on the lid is PASS)\n"
    "  • exploded geometry OUTSIDE the product envelope (lid-mounted star lobes are NOT this)\n"
    "  • product cropped unreadably small\n\n"
    "Do NOT flag missing cuvette tower / ambient-light LID / charcoal polymer D-pad.\n"
    "Do NOT flag a lid-mounted low-poly star as floating/exploded debris.\n"
    "Reply with STRICT JSON only: "
    "{\"broken\": true|false, \"defects\": [\"short description\", ...]}."
)


def _is_thermocycler_out_dir(out_dir: str) -> bool:
    """True when state.json declares PCR / thermocycler class."""
    try:
        st = json.loads((Path(out_dir) / "state.json").read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return False
    for src in (
        (st.get("orchestratorContract") or {}).get("product_class"),
        (st.get("moduleDecomposition") or {}).get("product_class"),
        (st.get("parsedBrief") or {}).get("product_class"),
    ):
        if src and re.search(
            r"thermocycler|thermal[_ -]?cycler|\bpcr\b|ninjapcr|openpcr",
            str(src),
            re.I,
        ):
            return True
    return False

_FIXTURE_BAD_GA = (
    _HERE.parent.parent / "tests" / "fixtures" / "render-vision" / "known-bad-red-beam.png"
)


def critique_image(image_path: str, prompt: str, model: Optional[str] = None) -> dict:
    """Run the vision critic with an explicit drawing/exterior prompt."""
    mdl = model or rvc.DEFAULT_MODEL
    # Temporarily reuse the critic's transport by monkey-patching the prompt
    # selector for this path — avoid forking the HTTP stack.
    prev = rvc._prompt_for_image

    def _forced(_path: str) -> str:
        return prompt

    rvc._prompt_for_image = _forced  # type: ignore[assignment]
    try:
        return rvc.critique_render(image_path, model=mdl)
    finally:
        rvc._prompt_for_image = prev  # type: ignore[assignment]


def critique_drawing_set(out_dir: str, *, is_instrument: bool = False) -> dict:
    """Critique GA PNG (+ product exterior when instrument). Non-fatal if no key.

    @returns {ok, broken, defects, images: [{file, broken, defects}], skipped?}
    """
    out = Path(out_dir)
    images: list[dict] = []
    if not rvc._key():
        return {
            "ok": False,
            "broken": None,
            "defects": [],
            "images": [],
            "skipped": True,
            "error": "no OPENROUTER_API_KEY",
        }
    targets: list[tuple[str, str]] = []
    thermo = bool(is_instrument and _is_thermocycler_out_dir(out_dir))
    ga = out / "drawings" / "general-arrangement.png"
    if ga.is_file() and ga.stat().st_size > 800:
        if thermo:
            prompt = _GA_THERMOCYCLER_PROMPT
        elif is_instrument:
            prompt = _GA_INSTRUMENT_PROMPT
        else:
            prompt = (
                "You are an adversarial chartered engineer glancing at a GENERAL "
                "ARRANGEMENT drawing. Flag broken=true for empty elevations, blank "
                "sheets, or views that clearly fail a 5-second professional glance. "
                "Reply STRICT JSON: {\"broken\": true|false, \"defects\": [...]}."
            )
        targets.append((str(ga), prompt))
    if is_instrument:
        exterior_prompt = (
            _EXTERIOR_THERMOCYCLER_PROMPT if thermo else _EXTERIOR_INSTRUMENT_PROMPT
        )
        for name in ("04-product-exterior.png", "00-hero.png"):
            p = out / name
            if p.is_file() and p.stat().st_size > 800:
                targets.append((str(p), exterior_prompt))
                break
    if not targets:
        return {
            "ok": False,
            "broken": None,
            "defects": [],
            "images": [],
            "skipped": True,
            "error": "no drawing/exterior PNG to critique",
        }
    any_broken = False
    all_defects: list[str] = []
    call_ok = True
    for path, prompt in targets:
        res = critique_image(path, prompt)
        entry = {
            "file": os.path.basename(path),
            "ok": bool(res.get("ok")),
            "broken": res.get("broken"),
            "defects": list(res.get("defects") or []),
            "error": res.get("error"),
        }
        images.append(entry)
        if not res.get("ok"):
            call_ok = False
            continue
        if res.get("broken") is True and entry["defects"]:
            any_broken = True
            all_defects.extend(f"{entry['file']}: {d}" for d in entry["defects"][:4])
    return {
        "ok": call_ok,
        "broken": any_broken if call_ok else None,
        "defects": all_defects,
        "images": images,
        "skipped": False,
    }


def drawing_vision_coherent(
    out_dir: str, *, is_instrument: bool = False,
) -> Optional[tuple[bool, str]]:
    """Gate-shaped wrapper. None = abstain (no key / skip).

    FLOW: also writes drawings/drawing-vision-critique.json so Excel Assembly
    can lift its honest cap above 6 (build-excel-export Assembly scorer).
    """
    if os.environ.get("CHAIN_SKIP_DRAWING_VISION", "").strip() in ("1", "true", "yes"):
        return None
    res = critique_drawing_set(out_dir, is_instrument=is_instrument)
    # Always persist when we have a real verdict — Assembly scorer needs the file.
    if not res.get("skipped"):
        try:
            dest = Path(out_dir) / "drawings" / "drawing-vision-critique.json"
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(json.dumps(res, indent=2), encoding="utf-8")
        except OSError as exc:
            print(f"[drawing-vision] write failed: {exc}", file=sys.stderr)
    if res.get("skipped"):
        return None
    if not res.get("ok"):
        return None  # transient API — don't fail the set
    if res.get("broken") is True:
        detail = "; ".join(res.get("defects") or ["unnamed visual defect"])[:280]
        return False, detail
    return True, f"vision glance clean on {len(res.get('images') or [])} image(s)"


def _selftest() -> None:
    """proveCatch: transport + prompt wiring; rot-guard on known-bad when keyed."""
    # Offline proveCatch: prompt constants must reject the known lies by content.
    assert "FRONT" in _GA_INSTRUMENT_PROMPT and "display" in _GA_INSTRUMENT_PROMPT.lower()
    assert "FR4" in _EXTERIOR_INSTRUMENT_PROMPT
    assert "bare PCB" in _EXTERIOR_INSTRUMENT_PROMPT or "PCB" in _EXTERIOR_INSTRUMENT_PROMPT
    assert "thermocycler" in _GA_THERMOCYCLER_PROMPT.lower()
    assert "sample block" in _EXTERIOR_THERMOCYCLER_PROMPT.lower()
    assert "cuvette" in _GA_THERMOCYCLER_PROMPT.lower()  # must explicitly NOT-flag
    # Without a key, critique_drawing_set must SKIP (never pretend PASS).
    old = os.environ.pop("OPENROUTER_API_KEY", None)
    try:
        # Force no key even if .env would load — patch _key.
        prev_key = rvc._key
        rvc._key = lambda: ""  # type: ignore[assignment]
        try:
            res = critique_drawing_set("/tmp/nonexistent-drawing-vision", is_instrument=True)
            assert res.get("skipped") is True, res
        finally:
            rvc._key = prev_key  # type: ignore[assignment]
    finally:
        if old is not None:
            os.environ["OPENROUTER_API_KEY"] = old
    # Optional live rot check against frozen plant fixture (SKIP without key/file).
    if rvc._key() and _FIXTURE_BAD_GA.is_file():
        res = critique_image(str(_FIXTURE_BAD_GA), (
            "Flag broken=true if you see a stray pipe/beam/cable shooting off a "
            "platform. STRICT JSON: {\"broken\": true|false, \"defects\": [...]}."
        ))
        if res.get("ok") and res.get("broken") is not True:
            raise AssertionError(
                "drawing_vision_glance rot: known-bad red-beam no longer flagged")
    print("drawing_vision_glance _selftest: OK (prompt + skip + optional rot)")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
        raise SystemExit(0)
    if len(sys.argv) < 2:
        print("usage: drawing_vision_glance.py <out_dir> [--write] | --selftest",
              file=sys.stderr)
        raise SystemExit(2)
    out_dir = sys.argv[1]
    res = critique_drawing_set(out_dir, is_instrument=True)
    if "--write" in sys.argv:
        # FLOW: Excel Assembly scorer reads drawings/drawing-vision-critique.json
        dest = Path(out_dir) / "drawings" / "drawing-vision-critique.json"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(res, indent=2), encoding="utf-8")
        print(f"[drawing-vision] wrote {dest}", file=sys.stderr)
    print(json.dumps(res, indent=2))
