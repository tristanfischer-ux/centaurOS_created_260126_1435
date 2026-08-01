#!/usr/bin/env python3
"""INTENT: Adversarial JLR-FE red-team council — Grok 4.5 + Sol + MiniMax-M3
(Opus 5 if MiniMax fails).

Reads the live twin digest and asks each model to rip the deliverable apart
as Jaguar Land Rover Formula E Head of Technology. Writes per-model JSON + a
merged punch list. Does NOT auto-fix — verification is a separate pass.

Seats come from scripts/lib/council_models.py → model_routing.py (single map).

FLOW: prefer `_redteam_digest_v2.json` (assumption/Bar B era); fall back to
legacy `_redteam_digest.json`. Output dir `_redteam_v2/` when v2 digest used.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
OUT = ROOT / "out/formula-e-front-mgu-20260729-1432"
DIGEST_V2 = OUT / "_redteam_digest_v2.json"
DIGEST_LEGACY = OUT / "_redteam_digest.json"
from scripts.lib.council_models import (  # noqa: E402
    COUNCIL_MODELS,
    FRAGILE_SEAT_NAME,
    run_fragile_seat_with_fallback,
)

MODELS = dict(COUNCIL_MODELS)  # grok45 / sol / minimax_m3; fragile → opus5

SYSTEM = """You are an adversarial chartered powertrain engineer hired by Jaguar Land Rover
Formula E Head of Technology to REJECT a supplier engineering pack.

PRIMARY TARGET = THE ENTIRE PROCESS, not a partner email. Attack the chain from
brief → engineering contract → motor multiphysics (FEMM / thermal / ISO 6336 /
CalculiX / OpenFOAM / Ross) → assumption register → Bar B readiness → PCB/HIL →
Blender morphology → Excel dossier → ship_ok. Email/Jack narrative is ONE surface
among many — do not let it dominate.

Be extremely harsh. Do not praise. Do not hedge. Author scorecards are irrelevant.

Attack ALL of these surfaces (cite evidence from the digest):
P1) PROCESS COHERENCE: do quantities stay identity-locked across EM / gears / cooling / CAD?
P2) GREENWASH: "Bar B list filled" / "RESULTS UNDER ASSUMPTIONS" / OK/CLEARED → race-ready?
P3) EM ARITHMETIC: 250 kW ↔ T=P/ω ↔ rpm ↔ peak vs mean vs torque_reliable
P4) THERMAL PROCESS: loss split → network → OpenFOAM Δp — units bugs or fantasy temps?
P5) GEARS / OIL: FoS≈1.2 screening theatre? cornering_ok=False buried?
P6) STRUCTURE / DYNAMICS: CalculiX FoS / Ross critical — mislabeled as retention proof?
P7) PCB / Gerbers / firmware / HIL — any false PASS? forgeDraftOnly respected?
P8) Blender morphology vs Lucid training check; clay shells; cutaway honesty
P9) Excel LIVE formulas vs pasted literals on power/thermal
P10) Interfaces XYZ types-only — invented millimetres?
P11) Mass 32 kg aspiration vs CAD roll-up
P12) ship_ok / homologationHonesty must stay NOT_HOMOLOGATED
P13) Assumption→ask loop — can a partner overwrite freezes, or is the process closed?
P14) Jack surfaces (email / fill-in xlsx) — secondary; flag only if process-critical

Use independent_arithmetic in the digest. If claimed torques disagree with T=P/ω, mark FATAL.

Return STRICT JSON:
{
  "verdict": "REJECT" | "CONDITIONAL" | "ACCEPT",
  "confidence": 0-100,
  "fatal_findings": [{"id":"F1","area":"...","severity":"FATAL|HIGH|MED","claim":"...","evidence":"...","fix":"...","source_rule_hint":"..."}],
  "high_findings": [...],
  "med_findings": [...],
  "physics_checks": [{"quantity":"...","claimed":"...","expected_check":"...","likely_wrong":true/false,"why":"..."}],
  "process_coherence_verdict": {"verdict":"...","problems":["..."]},
  "greenwash_verdict": {"verdict":"...","problems":["..."]},
  "excel_traceability": {"verdict":"...","problems":["..."]},
  "pcb_verdict": {"verdict":"...","problems":["..."]},
  "blender_verdict": {"verdict":"...","problems":["..."]},
  "multiphysics_verdict": {"verdict":"...","problems":["..."]},
  "assumption_loop_verdict": {"verdict":"...","problems":["..."]},
  "top_10_punchlist_for_fix": ["..."]
}
No markdown outside JSON.
"""


def load_env() -> str:
    key = os.environ.get("OPENROUTER_API_KEY", "")
    if key:
        return key
    env_path = ROOT / ".env.local"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("OPENROUTER_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("OPENROUTER_API_KEY missing")


def call_model(model: str, user: str, api_key: str) -> dict:
    body = {
        "model": model,
        "temperature": 0.2,
        "max_tokens": 8000,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user},
        ],
    }
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://forgeos.local",
            "X-Title": "ForgeOS FE Front FPK Red Team",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        data = json.loads(resp.read().decode())
    msg = data["choices"][0]["message"]
    content = msg.get("content")
    if content is None:
        # GOTCHA: some OpenRouter reasoning models return content=null.
        content = msg.get("reasoning") or msg.get("refusal") or json.dumps(msg)
    text = str(content).strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:].strip()
    start = text.find("{")
    if start < 0:
        return {"raw": content, "parse_error": True}
    # Prefer balanced decode; fall back to salvage-close for truncated max_tokens.
    from json import JSONDecoder

    try:
        obj, _ = JSONDecoder().raw_decode(text, start)
        return obj
    except json.JSONDecodeError:
        pass
    chunk = text[start:]
    # Close unterminated string + open brackets (token-limit truncations).
    in_s = False
    esc = False
    for ch in chunk:
        if in_s:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_s = False
        elif ch == '"':
            in_s = True
    if in_s:
        chunk += '"'
    import re as _re

    chunk = _re.sub(r",\s*$", "", chunk)
    opens: list[str] = []
    in_s = False
    esc = False
    for ch in chunk:
        if in_s:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_s = False
            continue
        if ch == '"':
            in_s = True
        elif ch in "{[":
            opens.append(ch)
        elif ch == "}" and opens and opens[-1] == "{":
            opens.pop()
        elif ch == "]" and opens and opens[-1] == "[":
            opens.pop()
    closers = {"{": "}", "[": "]"}
    while opens:
        chunk += closers[opens.pop()]
    try:
        obj = json.loads(chunk)
        if isinstance(obj, dict):
            obj["_salvaged_from_truncated"] = True
        return obj
    except json.JSONDecodeError:
        return {"raw": content, "parse_error": True}


def main() -> int:
    parser = argparse.ArgumentParser(description="FE front FPK adversarial red-team council")
    parser.add_argument(
        "--rebuild-digest",
        action="store_true",
        help="Run fe-front-build-redteam-digest.py before calling models",
    )
    parser.add_argument(
        "--legacy",
        action="store_true",
        help="Force legacy _redteam_digest.json + _redteam/ output",
    )
    args = parser.parse_args()

    if args.rebuild_digest and not args.legacy:
        import importlib.util

        spec = importlib.util.spec_from_file_location(
            "fe_front_build_redteam_digest",
            ROOT / "scripts" / "fe-front-build-redteam-digest.py",
        )
        assert spec and spec.loader
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        mod.main()

    api_key = load_env()
    if args.legacy or not DIGEST_V2.exists():
        digest_path = DIGEST_LEGACY if DIGEST_LEGACY.exists() else DIGEST_V2
        out_dir = OUT / "_redteam"
    else:
        digest_path = DIGEST_V2
        out_dir = OUT / "_redteam_v2"
    if not digest_path.exists():
        raise SystemExit(f"digest missing: {digest_path} (pass --rebuild-digest)")

    digest = json.loads(digest_path.read_text())
    excel_note = digest.get("excel_notes") or {
        "formula_coverage_pct_by_sheet_sample": {
            "Calculations": 21.5,
            "Brief": 8.9,
            "Engineering Analysis": 11.4,
        },
        "require_check": "FPK power/thermal LIVE trace must exist; bare literals FAIL",
    }
    user = (
        "ARTEFACT DIGEST v2 — FULL PROCESS (brief→contract→multiphysics→assumptions→"
        "Bar B→PCB→Blender→Excel→ship_ok). Jack email is secondary.\n"
        + json.dumps(digest, indent=2)[:120000]
        + "\n\nEXCEL / TRACEABILITY NOTES:\n"
        + json.dumps(excel_note, indent=2)
        + "\n\nRip the PROCESS apart as JLR FE HoT. Return JSON only."
    )

    results: dict = {}
    used_models: dict[str, str] = {}

    def _seat(name: str, mid: str) -> dict:
        return call_model(mid, user, api_key)

    with ThreadPoolExecutor(max_workers=3) as ex:
        futs = {}
        for name, mid in MODELS.items():
            if name == FRAGILE_SEAT_NAME:
                futs[
                    ex.submit(
                        run_fragile_seat_with_fallback,
                        lambda n, m: _seat(n, m),
                    )
                ] = "fragile_seat"
            else:
                futs[ex.submit(_seat, name, mid)] = name
        for fut in as_completed(futs):
            tag = futs[fut]
            try:
                if tag == "fragile_seat":
                    seat_name, model_id, payload = fut.result()
                    results[seat_name] = payload
                    used_models[seat_name] = model_id
                    print(f"[ok] {seat_name} {model_id}", flush=True)
                else:
                    payload = fut.result()
                    results[tag] = payload
                    used_models[tag] = MODELS[tag]
                    print(f"[ok] {tag} {MODELS[tag]}", flush=True)
            except Exception as e:
                results[tag] = {"error": str(e)}
                print(f"[fail] {tag}: {e}", flush=True)

    out_dir.mkdir(exist_ok=True)
    for name, payload in results.items():
        (out_dir / f"{name}.json").write_text(json.dumps(payload, indent=2) + "\n")

    merged: list[dict] = []
    for name, payload in results.items():
        if not isinstance(payload, dict) or payload.get("parse_error") or payload.get("error"):
            continue
        for key in ("fatal_findings", "high_findings", "med_findings"):
            for f in payload.get(key) or []:
                if isinstance(f, dict):
                    f = dict(f)
                    f["from_model"] = name
                    merged.append(f)
        for i, t in enumerate(payload.get("top_10_punchlist_for_fix") or []):
            merged.append({
                "id": f"{name.upper()}-P{i+1}",
                "area": "punchlist",
                "severity": "HIGH",
                "claim": t,
                "from_model": name,
            })

    summary = {
        "digest": str(digest_path.name),
        "models": used_models or MODELS,
        "verdicts": {
            n: (results[n].get("verdict") if isinstance(results[n], dict) else "ERROR")
            for n in results
        },
        "confidences": {
            n: (results[n].get("confidence") if isinstance(results[n], dict) else None)
            for n in results
        },
        "n_findings": len(merged),
        "findings": merged,
        "fragile_seat_fallback": "anthropic/claude-opus-5 if minimax_m3 fails",
        "plan": "docs/plans/JLR-FE-FRONT-FPK-ADVERSARIAL-REDTEAM-PLAN-2026-07-31.md",
    }
    (out_dir / "merged-findings.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps({"verdicts": summary["verdicts"], "confidences": summary["confidences"]}, indent=2))
    print(f"wrote {out_dir} findings={len(merged)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
