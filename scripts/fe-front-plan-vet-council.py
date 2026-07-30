#!/usr/bin/env python3
"""INTENT: Sol + GLM + Kimi (Opus 5 fallback) vet the autonomous 1–9 plan
before execution. Writes per-seat JSON + merged.md. Does not execute the plan.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.lib.council_models import (  # noqa: E402
    COUNCIL_MODELS,
    run_kimi_with_opus5_fallback,
)

PLAN = ROOT / "docs/plans/JLR-FE-FRONT-FPK-AUTONOMOUS-1-9-2026-07-29.md"
OUT = ROOT / "out/formula-e-front-mgu-20260729-1432/_autonomous/plan-vet"

SYSTEM = """You are an adversarial chartered Formula E powertrain engineer + programme
lead reviewing an autonomous execution plan for a Gen3 front FPK design pack.

Vet the plan for:
1) Completeness vs items 1-9 (physics deepen, literature, PCB, ESL/CFD, topology,
   mesh authenticity, Excel LIVE, dyno/HIL evidence, race OPEN + re-challenge)
2) Honesty — does it refuse fake HIL/Gerbers/dyno/FIA mm / Lucid paste / SHIPS greenwash?
3) Sequencing risk — wrong order, missing dependencies, too much parallel chaos
4) Missing SOURCE fixes or proveCatch gaps
5) Whether 10-min watchdog + Sol/GLM/Kimi|Opus5 unstick is adequate
6) What must be cut or added before autonomous start

Return STRICT JSON only:
{
  "verdict": "GO" | "GO_WITH_CHANGES" | "NO_GO",
  "confidence": 0-100,
  "fatal_gaps": [{"id":"G1","claim":"...","fix":"..."}],
  "required_changes": ["..."],
  "optional_improvements": ["..."],
  "phase_order_ok": true/false,
  "honesty_ok": true/false,
  "top_5_risks": ["..."]
}
No markdown outside JSON.
"""


def load_api_key() -> str:
    key = os.environ.get("OPENROUTER_API_KEY", "")
    if key:
        return key
    for env_path in (
        ROOT / ".env.local",
        Path.home() / "secrets" / "openrouter.env",
    ):
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if "OPENROUTER_API_KEY=" in line:
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("OPENROUTER_API_KEY missing")


def extract_json(text: str) -> dict:
    text = (text or "").strip()
    if not text:
        return {"parse_error": True, "error": "empty"}
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError as e:
            return {"parse_error": True, "error": str(e), "raw": text[:4000]}
    return {"parse_error": True, "error": "no_json", "raw": text[:4000]}


def call_model(name: str, model: str, api_key: str, user: str) -> dict:
    body = {
        "model": model,
        "temperature": 0.2,
        "max_tokens": 6000,
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
            "X-Title": "ForgeOS FE Front FPK Plan Vet",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        data = json.loads(resp.read().decode())
    msg = data["choices"][0]["message"]
    content = msg.get("content") or msg.get("reasoning") or ""
    obj = extract_json(content if isinstance(content, str) else str(content))
    obj["_seat"] = name
    obj["_model"] = model
    return obj


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    plan_text = PLAN.read_text(encoding="utf-8")
    user = (
        "Vet this autonomous plan. Be harsh. Prefer GO_WITH_CHANGES over GO if "
        "anything material is missing.\n\n"
        f"PLAN PATH: {PLAN}\n\n{plan_text}"
    )
    api_key = load_api_key()
    results: dict[str, dict] = {}

    def run_seat(name: str, model: str) -> tuple[str, dict]:
        print(f"[plan-vet] calling {name} ({model}) …", flush=True)
        return name, call_model(name, model, api_key, user)

    # Parallel Sol + GLM; Kimi with Opus5 fallback sequential after or in pool
    with ThreadPoolExecutor(max_workers=2) as ex:
        futs = [
            ex.submit(run_seat, "glm52", COUNCIL_MODELS["glm52"]),
            ex.submit(run_seat, "sol", COUNCIL_MODELS["sol"]),
        ]
        for fut in as_completed(futs):
            name, obj = fut.result()
            results[name] = obj
            (OUT / f"{name}.json").write_text(json.dumps(obj, indent=2), encoding="utf-8")
            print(f"[plan-vet] wrote {name}.json verdict={obj.get('verdict')}", flush=True)

    def kimi_call(name: str, model: str) -> dict:
        return call_model(name, model, api_key, user)

    seat, mid, kobj = run_kimi_with_opus5_fallback(kimi_call)
    results[seat] = kobj
    (OUT / f"{seat}.json").write_text(json.dumps(kobj, indent=2), encoding="utf-8")
    print(f"[plan-vet] wrote {seat}.json verdict={kobj.get('verdict')}", flush=True)

    # Merge
    required: list[str] = []
    fatals: list[dict] = []
    risks: list[str] = []
    verdicts: list[str] = []
    for seat_name, obj in results.items():
        if obj.get("parse_error"):
            verdicts.append(f"{seat_name}:PARSE_FAIL")
            continue
        verdicts.append(f"{seat_name}:{obj.get('verdict')}")
        for c in obj.get("required_changes") or []:
            required.append(f"[{seat_name}] {c}")
        for g in obj.get("fatal_gaps") or []:
            fatals.append({"seat": seat_name, **(g if isinstance(g, dict) else {"claim": g})})
        for r in obj.get("top_5_risks") or []:
            risks.append(f"[{seat_name}] {r}")

    go_votes = sum(1 for v in verdicts if ":GO" in v or ":GO_WITH_CHANGES" in v)
    overall = "GO_WITH_CHANGES" if go_votes >= 2 else ("NO_GO" if go_votes == 0 else "GO_WITH_CHANGES")
    if any(v.endswith(":NO_GO") for v in verdicts):
        overall = "GO_WITH_CHANGES"  # still start but apply required changes
    if go_votes == 3 and not fatals and all(
        (results.get(s) or {}).get("verdict") == "GO" for s in results
    ):
        overall = "GO"

    merged = {
        "overall": overall,
        "seat_verdicts": verdicts,
        "fatal_gaps": fatals,
        "required_changes_dedup": list(dict.fromkeys(required)),
        "risks": list(dict.fromkeys(risks))[:20],
    }
    (OUT / "merged.json").write_text(json.dumps(merged, indent=2), encoding="utf-8")

    md = ["# Plan vet — merged\n", f"**Overall:** {overall}\n", f"**Seats:** {', '.join(verdicts)}\n"]
    md.append("\n## Required changes\n")
    for c in merged["required_changes_dedup"] or ["(none)"]:
        md.append(f"- {c}\n")
    md.append("\n## Fatal gaps\n")
    if fatals:
        for g in fatals:
            md.append(f"- [{g.get('seat')}] {g.get('id', '')}: {g.get('claim')} → {g.get('fix')}\n")
    else:
        md.append("- (none)\n")
    md.append("\n## Risks\n")
    for r in merged["risks"] or ["(none)"]:
        md.append(f"- {r}\n")
    (OUT / "merged.md").write_text("".join(md), encoding="utf-8")
    print(json.dumps({"overall": overall, "verdicts": verdicts, "out": str(OUT)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
