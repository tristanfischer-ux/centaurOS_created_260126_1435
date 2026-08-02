#!/usr/bin/env python3
"""Independent multi-model review of the FE front EM torque shortfall.

INTENT (Tristan 2026-07-31): "get glm 5.2, Kimi k3, and Sol and Grok 4.5 all to
give recommendations and suggestions on how to solve these problems. First, you
need to lay out what you think the problem is and for them to look at the maths
again."

Each seat gets the SAME brief and is asked to attack the premises, not polish the
conclusion. Seats run independently (no cross-talk) so agreement is evidence.
"""
from __future__ import annotations

import concurrent.futures as cf
import json
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BRIEF = ROOT / os.environ.get("EM_REVIEW_BRIEF",
                             "docs/plans/FE-FRONT-EM-TORQUE-REVIEW-BRIEF-v2-2026-08-01.md")
OUT_DIR = ROOT / os.environ.get("EM_REVIEW_OUT",
                               "out/formula-e-front-mgu-20260729-1432/_em_review_v2")

SEATS: dict[str, tuple[str, str]] = {
    # Tristan 2026-08-01: "call on the new DeepSeek V4 Flash 0731 version, and
    # ask Kimi K3 too. Grok 4.5 high as a sparring partner." IDs were read from
    # the live OpenRouter model list, never inferred from the nickname.
    # Each seat carries a ROLE. The auditor must NOT be asked the physics
    # question — see scripts/lib/model_routing.py: CritPt tops out at 32%, so no
    # seat here VALIDATES anything. Validation belongs to xfemm and the gates.
    # EM_REVIEW_SEATS (comma-separated) selects a subset.
    "glm52": ("z-ai/glm-5.2", "physics"),          # STANDING FIRST CALL
    "terra": ("openai/gpt-5.6-terra", "physics"),  # code review, 1/5 of Sol
    "sol": ("openai/gpt-5.6-sol", "physics"),      # ESCALATION only, never unchecked
    "deepseek_v4_flash": ("deepseek/deepseek-v4-flash-0731", "physics"),
    "kimi_k3": ("moonshotai/kimi-k3", "physics"),
    "grok45": ("x-ai/grok-4.5", "physics"),
    # CritPt 4% — never asked physics; only whether a claim is supported.
    "minimax_m3": ("minimax/minimax-m3", "audit"),
}

SYSTEM_AUDIT = """You are a CLAIM AUDITOR. You are NOT being asked to do
physics, and you must not attempt it — you hold this seat because you are good
at spotting claims that outrun their evidence, not because you can check the
maths.

For EVERY load-bearing claim in the document, decide ONLY:
  SUPPORTED    — the document itself contains the measurement or derivation
  UNSUPPORTED  — asserted with no evidence given here
  OVERSTATED   — evidence exists but is weaker than the claim made of it
  CONTRADICTED — another part of the document disagrees with it

Pay special attention to: numbers quoted with more confidence than their source
warrants; a mean taken over data that may not support a mean; conclusions drawn
from a measurement the author has already called unreliable; and any place the
author writes "ruled out" without stating the test that ruled it out.

Return STRICT JSON only, no markdown fence:
{
  "claims": [{"claim": "...", "verdict": "SUPPORTED|UNSUPPORTED|OVERSTATED|CONTRADICTED", "why": "...", "quote": "..."}],
  "weakest_link": "...",
  "what_would_settle_it": ["..."],
  "one_line_summary": "..."
}"""

SYSTEM = """You are a chartered engineer reviewing another engineer's analysis.

⭐ THIS PROMPT CARRIES NO MACHINE FACTS, DELIBERATELY (fixed 2026-08-02). It used
to hardcode "a 139 mm bore, ~200 mm stack PMSM", "the measured 93.6 N.m" and a
"74.8% shortfall". The real stack is 97.58 mm and all three figures are now void
— so every seat, in every council run for a day, was reasoning against stale
numbers baked into the harness rather than the ones in the brief. Sol caught it
by flagging a "97.58-versus-approximately-200 mm stack depth" conflict that
existed only because this prompt contradicted the brief.

FACTS LIVE IN THE BRIEF. This prompt defines the ROLE only.

Your job is to find what is WRONG or MISSING, not to agree. Specifically:
- CHECK THE ARITHMETIC. State any error explicitly with the correct value.
- CHALLENGE THE PREMISES. Derivation constants are assumptions, not physics.
  So are topology choices and operating points.
- SANITY-CHECK AGAINST REAL MACHINES of the size and duty the brief states.
  Give a comparable figure of merit (e.g. torque density, shear stress, loss
  fraction) and say whether the brief's numbers are plausible for that class.
- The single most valuable output is identifying a MODELLING ERROR if one
  exists, because a large shortfall may mean the model is wrong rather than the
  machine incapable.
- If the brief contradicts itself, SAY SO and name both values — do not silently
  pick one.

Return STRICT JSON only, no markdown fence:
{
  "arithmetic_errors": [{"where": "...", "stated": "...", "correct": "...", "impact": "..."}],
  "suspected_fe_model_errors": [{"hypothesis": "...", "why": "...", "how_to_test": "...", "expected_torque_if_true_nm": 0}],
  "expected_torque_density": {"metric": "...", "value": 0, "units": "...", "implied_torque_nm": 0, "basis": "..."},
  "premise_challenges": [{"premise": "...", "challenge": "...", "consequence": "..."}],
  "recommended_levers": [{"lever": "...", "rationale": "...", "expected_gain_pct": 0, "risk": "...", "priority": 1}],
  "what_was_missed": ["..."],
  "verdict": "MODEL_ERROR_LIKELY | MACHINE_GENUINELY_SHORT | INSUFFICIENT_DATA",
  "confidence": "high|medium|low",
  "one_line_summary": "..."
}"""


def _extract_json_objects(text: str) -> list[dict]:
    """Every balanced {...} in `text` that parses, largest first.

    WHY NOT first-brace-to-last-brace: reasoning models narrate before they
    answer ("Need strict JSON. Need find arithmetic errors, ... {"), and that
    prose contains braces. Spanning from the FIRST '{' to the LAST '}' then
    swallows the narration and fails with a misleading
    "Expecting property name enclosed in double quotes: line 1 column 2" —
    which reads as a broken model rather than a bad extractor. Scanning for
    BALANCED objects and keeping the largest one that actually parses recovers
    the answer even when it is buried in commentary.

    String-aware: braces inside JSON string literals must not change depth.
    """
    found: list[dict] = []
    depth = 0
    start = -1
    in_str = False
    escape = False
    for i, ch in enumerate(text):
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            if depth > 0:
                depth -= 1
                if depth == 0 and start >= 0:
                    try:
                        obj = json.loads(text[start:i + 1])
                        if isinstance(obj, dict):
                            found.append(obj)
                    except json.JSONDecodeError:
                        pass
                    start = -1
    return sorted(found, key=lambda o: len(json.dumps(o)), reverse=True)


def load_api_key() -> str:
    key = os.environ.get("OPENROUTER_API_KEY", "")
    if key:
        return key
    for candidate in (ROOT / ".env.local", Path.home() / ".env", Path.home() / "secrets/.env"):
        if candidate.exists():
            for line in candidate.read_text().splitlines():
                if line.startswith("OPENROUTER_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("OPENROUTER_API_KEY missing")


def call_model(seat: str, model: str, user: str, api_key: str,
               role: str = "physics") -> dict:
    body = {
        "model": model,
        "temperature": 0.15,
        # Reasoning models spend the budget THINKING before emitting the answer.
        # At 8000 Kimi K3 ran out mid-derivation and never produced the JSON —
        # which surfaced as a "parse" failure rather than "budget exhausted".
        "max_tokens": 40000,
        "messages": [
            {"role": "system",
             "content": SYSTEM_AUDIT if role == "audit" else SYSTEM},
            {"role": "user", "content": user},
        ],
    }
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {api_key}",
                 "Content-Type": "application/json"},
    )
    # OpenRouter emits WHITESPACE KEEP-ALIVE PADDING while a slow model thinks
    # (hundreds of blank lines before the JSON body). If the connection ends
    # mid-stream the body is padding-only and json.loads dies with a misleading
    # "Expecting value: line 253 column 1" — which reads as a model/parse fault
    # rather than a truncated HTTP response. Strip, verify, and retry.
    payload = None
    last_err = ""
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=900) as resp:
                raw = resp.read().decode().strip()
            if not raw:
                last_err = "empty body (keep-alive padding only)"
                continue
            start = raw.find("{")
            if start < 0:
                last_err = f"no JSON in {len(raw)} bytes of body"
                continue
            payload = json.loads(raw[start:])
            break
        except json.JSONDecodeError as exc:
            last_err = f"truncated body: {exc}"
        except Exception as exc:  # noqa: BLE001
            last_err = f"{type(exc).__name__}: {exc}"
    if payload is None:
        return {"seat": seat, "model": model, "ok": False,
                "error": f"{last_err} (after 3 attempts)"}
    try:
        msg = payload["choices"][0]["message"]
        # Reasoning models (Kimi K3, GLM) can return content=None with the answer
        # under `reasoning` / `reasoning_content`. The v1 run lost 2 of 4 seats to
        # `'NoneType' object has no attribute 'strip'` for exactly this reason.
        # finish_reason distinguishes "the model rambled" from "the model was
        # CUT OFF mid-thought". Both previously surfaced as a parse failure.
        finish = (payload["choices"][0].get("finish_reason") or "")
        field = "content"
        text = msg.get("content") or ""
        if not text:
            text = msg.get("reasoning") or msg.get("reasoning_content") or ""
            field = "reasoning"
        if isinstance(text, list):
            text = " ".join(
                part.get("text", "") if isinstance(part, dict) else str(part)
                for part in text)
        text = str(text).strip()
        if not text:
            return {"seat": seat, "model": model, "ok": False,
                    "error": f"empty content; keys={sorted(msg.keys())}"}
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            text = text.split("\n", 1)[1] if "\n" in text else text
            text = text.rsplit("```", 1)[0]
        candidates = _extract_json_objects(text)
        # Prefer an object that looks like the requested schema over any
        # incidental JSON the model may have quoted in its narration.
        keys = ("verdict", "claims", "suspected_fe_model_errors",
                "recommended_levers", "weakest_link")
        for obj in candidates:
            if any(k in obj for k in keys):
                return {"seat": seat, "model": model, "ok": True, "review": obj}
        if candidates:
            return {"seat": seat, "model": model, "ok": True,
                    "review": candidates[0], "schema_mismatch": True}
        return {"seat": seat, "model": model, "ok": False, "parse_error": True,
                "finish_reason": finish, "used_field": field,
                "hint": ("hit the token cap while reasoning — raise max_tokens"
                         if finish == "length" else "no balanced JSON in reply"),
                "raw": text[:4000]}
    except Exception as exc:  # noqa: BLE001 — one dead seat must not kill the panel
        return {"seat": seat, "model": model, "ok": False, "error": str(exc)}


def main() -> int:
    if not BRIEF.exists():
        print(f"brief missing: {BRIEF}", file=sys.stderr)
        return 2
    user = (
        "Review this analysis. Attack the maths and the premises.\n\n"
        + BRIEF.read_text()
    )
    api_key = load_api_key()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    results: dict[str, dict] = {}
    wanted = [x.strip() for x in os.environ.get("EM_REVIEW_SEATS", "").split(",")
              if x.strip()]
    seats = {k: v for k, v in SEATS.items() if not wanted or k in wanted}
    if not seats:
        raise SystemExit(f"no seats matched {wanted}; known: {sorted(SEATS)}")
    with cf.ThreadPoolExecutor(max_workers=len(seats)) as pool:
        futs = {pool.submit(call_model, s, m, user, api_key, role): s
                for s, (m, role) in seats.items()}
        for fut in cf.as_completed(futs):
            res = fut.result()
            seat = res["seat"]
            results[seat] = res
            (OUT_DIR / f"{seat}.json").write_text(json.dumps(res, indent=2))
            status = "OK" if res.get("ok") else f"FAIL ({res.get('error') or 'parse'})"
            rev = res.get("review") or {}
            verdict = rev.get("verdict") or rev.get("weakest_link") or "—"
            print(f"  [{status:22s}] {seat:9s} {res['model']:24s} verdict={verdict}",
                  flush=True)
    (OUT_DIR / "panel.json").write_text(json.dumps(results, indent=2))
    ok = [r for r in results.values() if r.get("ok")]
    print(f"\n{len(ok)}/{len(seats)} seats returned. → {OUT_DIR}")
    verdicts = [(r["seat"], (r.get("review") or {}).get("verdict")) for r in ok]
    print("verdicts:", verdicts)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
