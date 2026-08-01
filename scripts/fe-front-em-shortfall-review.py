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
BRIEF = ROOT / "docs/plans/FE-FRONT-EM-TORQUE-REVIEW-BRIEF-v2-2026-08-01.md"
OUT_DIR = ROOT / "out/formula-e-front-mgu-20260729-1432/_em_review_v2"

SEATS: dict[str, str] = {
    "kimi_k3": "moonshotai/kimi-k3",
}

SYSTEM = """You are a chartered electrical machines engineer reviewing another
engineer's analysis of a Formula E front MGU that is failing its duty torque.

Your job is to find what is WRONG or MISSING, not to agree. Specifically:
- CHECK THE ARITHMETIC in the brief. State any error explicitly with the correct value.
- CHALLENGE THE PREMISES. The derivation constants (1.42 radial build, 0.78
  cross-section fraction) are assumptions, not physics. So is the 24-slot/8-pole
  choice and the 477 A rms operating point.
- SANITY-CHECK AGAINST REAL MACHINES. A 139 mm bore, ~200 mm stack PMSM at ~477 A
  rms: what torque SHOULD it make? Give a torque density figure (N·m per litre of
  rotor volume, or kN·m/m^3 of airgap volume) and compare. If the measured 93.6 N·m
  is implausibly low for that size, say so and explain what FE setup error would
  cause it (winding turns, current definition rms vs peak, symmetry/periodicity
  factor, stack length units, magnet remanence, slot fill).
- The single most valuable output is identifying a MODELLING ERROR if one exists,
  because a 74.8% shortfall at bay-max geometry may indicate the FE model is wrong
  rather than the machine being incapable.

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


def call_model(seat: str, model: str, user: str, api_key: str) -> dict:
    body = {
        "model": model,
        "temperature": 0.15,
        # Reasoning models spend the budget THINKING before emitting the answer.
        # At 8000 Kimi K3 ran out mid-derivation and never produced the JSON —
        # which surfaced as a "parse" failure rather than "budget exhausted".
        "max_tokens": 40000,
        "messages": [
            {"role": "system", "content": SYSTEM},
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
        text = (msg.get("content") or msg.get("reasoning")
                or msg.get("reasoning_content") or "")
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
        try:
            return {"seat": seat, "model": model, "ok": True, "review": json.loads(text)}
        except json.JSONDecodeError:
            start, end = text.find("{"), text.rfind("}")
            if start >= 0 and end > start:
                return {"seat": seat, "model": model, "ok": True,
                        "review": json.loads(text[start:end + 1])}
            return {"seat": seat, "model": model, "ok": False,
                    "parse_error": True, "raw": text[:4000]}
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
    with cf.ThreadPoolExecutor(max_workers=len(SEATS)) as pool:
        futs = {pool.submit(call_model, s, m, user, api_key): s
                for s, m in SEATS.items()}
        for fut in cf.as_completed(futs):
            res = fut.result()
            seat = res["seat"]
            results[seat] = res
            (OUT_DIR / f"{seat}.json").write_text(json.dumps(res, indent=2))
            status = "OK" if res.get("ok") else f"FAIL ({res.get('error') or 'parse'})"
            verdict = (res.get("review") or {}).get("verdict", "—")
            print(f"  [{status:22s}] {seat:9s} {res['model']:24s} verdict={verdict}",
                  flush=True)
    (OUT_DIR / "panel.json").write_text(json.dumps(results, indent=2))
    ok = [r for r in results.values() if r.get("ok")]
    print(f"\n{len(ok)}/{len(SEATS)} seats returned. → {OUT_DIR}")
    verdicts = [(r["seat"], (r.get("review") or {}).get("verdict")) for r in ok]
    print("verdicts:", verdicts)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
