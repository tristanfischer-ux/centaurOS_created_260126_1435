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
    "You are an adversarial industrial-design reviewer inspecting a 3-D PRODUCT hero render — a "
    "sealed consumer/outdoor unit (wall-mounted or floor-standing), shown as a closed body or a "
    "deliberate translucent cutaway revealing the internal modules. Ghosted/translucent skin and "
    "simplified block internals are INTENTIONAL for this artefact type — do not flag them.\n"
    "Flag ONLY these visual defects if present:\n"
    "  • a part visibly POKING THROUGH the product's skin/outline\n"
    "  • the product or a part FLOATING disconnected (no wall/floor contact where one is implied)\n"
    "  • a BLANK/empty render (no product visible)\n"
    "  • garbled/exploded geometry (parts scattered outside the body)\n"
    "  • the product cropped/overflowing the frame or absurdly small in it\n"
    "  • a HOLLOW INTERIOR: a cutaway/translucent view whose visible internals occupy well "
    "under half of the enclosure — a real sealed product (battery wall unit, charger, "
    "converter cabinet) is engineered DENSE: a dominant pack/stack block plus stacked "
    "electronics filling the body. Mostly empty air inside the shell is broken:true "
    "('hollow interior'), even when nothing is geometrically damaged.\n"
    "Reply with STRICT JSON only: {\"broken\": true|false, \"defects\": [\"short description\", ...]}."
)


def _is_product_mode(image_path: str) -> bool:
    """Sealed-product runs (enclosure_volume_m3 < 1 in the contract) are judged by the
    PRODUCT rubric — a ghosted cutaway is intentional there, not 'not a real plant'
    (2026-07-11 run 60: the plant prompt flagged the product hero as 'abstract
    semi-transparent blocks'). Signal-keyed on the run's own contract, never a class."""
    try:
        run_dir = os.path.dirname(os.path.abspath(image_path))
        st = json.load(open(os.path.join(run_dir, "state.json")))
        q = ((st.get("orchestratorContract") or {}).get("quantities") or {})
        v = q.get("enclosure_volume_m3")
        val = v.get("value") if isinstance(v, dict) else v
        return bool(val is not None and 0 < float(val) < 1.0)
    except Exception:  # noqa: BLE001
        return False


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
            {"type": "text", "text": _PRODUCT_PROMPT if _is_product_mode(image_path) else _PROMPT},
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
    return {"broken": bool(out.get("broken")), "defects": out.get("defects") or [], "model": model, "ok": True}


_HERO_CANDIDATES = ("00-hero.png", "blender-cover.png", "cover.png", "inspect-hero.png")


def critique_run(run_dir: str, model: str = DEFAULT_MODEL) -> dict:
    """Find the run's hero render, critique it, and WRITE render-vision-critique.json into run_dir.
    Non-fatal: returns {ok: False} if no render or no key (the dossier scorer then keeps the render's
    'visual quality UNVERIFIED' advisory → capped at 7, honest). Called from the Blender bg-runner.

    CACHED on the geometry-manifest hash (geometry_hash(run_dir)): a run whose parts-manifest +
    route-manifest are byte-identical to a PRIOR critiqued run reuses that prior verdict verbatim —
    no LLM call, no re-roll. Only an 'ok' prior verdict from the SAME model is reused (a failed/no-key
    prior attempt is not cached as a verdict). Absence of either manifest (geo_hash is None) disables
    caching for that run — correctness over speed when there is nothing stable to key on."""
    hero = next((os.path.join(run_dir, f) for f in _HERO_CANDIDATES
                 if os.path.exists(os.path.join(run_dir, f))), None)
    geo_hash = geometry_hash(run_dir)
    if geo_hash:
        cached = cache_read(geo_hash)
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
