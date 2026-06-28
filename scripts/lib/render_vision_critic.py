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
import json
import os
import re
import sys
import urllib.request

DEFAULT_MODEL = "google/gemini-3.1-pro-preview"  # multimodal; strongest reasoner seat

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


def critique_render(image_path: str, model: str = DEFAULT_MODEL, timeout: int = 90) -> dict:
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
            {"type": "text", "text": _PROMPT},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
        ]}],
    }).encode()
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions", data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
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
    return {"broken": bool(out.get("broken")), "defects": out.get("defects") or [], "model": model, "ok": True}


_HERO_CANDIDATES = ("00-hero.png", "blender-cover.png", "cover.png", "inspect-hero.png")


def critique_run(run_dir: str, model: str = DEFAULT_MODEL) -> dict:
    """Find the run's hero render, critique it, and WRITE render-vision-critique.json into run_dir.
    Non-fatal: returns {ok: False} if no render or no key (the dossier scorer then keeps the render's
    'visual quality UNVERIFIED' advisory → capped at 7, honest). Called from the Blender bg-runner."""
    hero = next((os.path.join(run_dir, f) for f in _HERO_CANDIDATES
                 if os.path.exists(os.path.join(run_dir, f))), None)
    if not hero:
        res = {"broken": None, "defects": [], "model": model, "ok": False, "error": "no hero render"}
    else:
        res = critique_render(hero, model)
        res["image"] = os.path.basename(hero)
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
