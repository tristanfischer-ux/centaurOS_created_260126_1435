#!/usr/bin/env python3
"""INTENT: Adversarial JLR-FE red-team council — GLM 5.2 + SOL + Kimi K3
(Opus 5 if Kimi fails).

Reads the live twin digest and asks each model to rip the deliverable apart
as Jaguar Land Rover Formula E Head of Technology. Writes per-model JSON + a
merged punch list. Does NOT auto-fix — verification is a separate pass.
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
OUT = ROOT / "out/formula-e-front-mgu-20260729-1432"
DIGEST = OUT / "_redteam_digest.json"
from scripts.lib.council_models import (  # noqa: E402
    COUNCIL_MODELS,
    run_kimi_with_opus5_fallback,
)

MODELS = dict(COUNCIL_MODELS)  # glm52 / sol / kimi; kimi → opus5 on fail

SYSTEM = """You are an adversarial chartered powertrain engineer hired by Jaguar Land Rover
Formula E Head of Technology to REJECT a supplier engineering pack.

Your job is to find every reason a competent FE tech lead would refuse to rely on
this dossier to develop future vehicles. Be extremely harsh. Do not praise. Do not
hedge. Ship-gate "SHIPS / 8.9" is irrelevant — that is the author's own scorecard.

Focus especially on:
1) Blender / morphology photorealism vs Lucid/Atieva sealed FPK training check
2) PCB / Gerbers / firmware / pinout / HIL honesty
3) Whether Excel cells contain LIVE formulas vs pasted literals (traceability)
4) Power flow: where power comes from, where it goes, assumptions
5) Thermal / coolant assumptions
6) Mass / weight assumptions
7) Magnetic / electromagnetic assumptions (IPMSM, field weakening, SiC)
8) Wiring / topology / harness completeness
9) Physics correctness of formulas (I_ph, T=P/ω, gear, FIA energy)
10) Whether this is first-class enough for a Tier-1 automotive tech lead

Return STRICT JSON:
{
  "verdict": "REJECT" | "CONDITIONAL" | "ACCEPT",
  "confidence": 0-100,
  "fatal_findings": [{"id":"F1","area":"...","severity":"FATAL|HIGH|MED","claim":"...","evidence":"...","fix":"...","source_rule_hint":"..."}],
  "high_findings": [...],
  "med_findings": [...],
  "physics_checks": [{"quantity":"...","claimed":"...","expected_check":"...","likely_wrong":true/false,"why":"..."}],
  "excel_traceability": {"verdict":"...","problems":["..."]},
  "pcb_verdict": {"verdict":"...","problems":["..."]},
  "blender_verdict": {"verdict":"...","problems":["..."]},
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
    api_key = load_env()
    digest = json.loads(DIGEST.read_text())
    excel_note = {
        "formula_coverage_pct_by_sheet_sample": {
            "Calculations": 21.5,
            "Brief": 8.9,
            "Engineering Analysis": 11.4,
            "Financial model": 67.2,
            "Bill of Materials": 31.2,
            "Executive Summary": 13.1,
        },
        "calculations_sheet_observation": (
            "Many design quantities appear as bare numeric literals in column C "
            "(e.g. C16=350 traction_motor_power_kw, C18=117 torque) with prose in E/F — "
            "NOT Excel formulas deriving from Inputs. Traceability claim FAILS."
        ),
        "topology_routed": "0/18 edges routed in Blender connection ledger (unresolved electrical/thermal)",
        "pcb_pipeline": None,
        "pcb_disposition": digest.get("pcb", {}).get("disposition"),
        "form_meshes": digest.get("form"),
        "operator_concerns": [
            "Blender render not first-class vs Lucid gold",
            "PCB story: no Gerbers, COTS hand-wave unacceptable for JLR HoT",
            "Not FIA homologated — must get MUCH closer in engineering substance",
            "Dyno holds still open",
            "All physics cells must be formulas, fully traceable",
            "Power/heat/weight/magnetism assumptions must be explicit and correct",
            "Wiring: where power comes from / goes to must be complete",
        ],
    }
    user = (
        "ARTEFACT DIGEST (state + scorecard + BoM + quantities + decisions):\n"
        + json.dumps(digest, indent=2)[:120000]
        + "\n\nEXCEL / WIRING / PCB NOTES:\n"
        + json.dumps(excel_note, indent=2)
        + "\n\nRip this apart. Return JSON only."
    )

    results: dict = {}
    used_models: dict[str, str] = {}

    def _seat(name: str, mid: str) -> dict:
        return call_model(mid, user, api_key)

    with ThreadPoolExecutor(max_workers=3) as ex:
        futs = {}
        for name, mid in MODELS.items():
            if name == "kimi":
                futs[
                    ex.submit(
                        run_kimi_with_opus5_fallback,
                        lambda n, m: _seat(n, m),
                    )
                ] = "kimi_seat"
            else:
                futs[ex.submit(_seat, name, mid)] = name
        for fut in as_completed(futs):
            tag = futs[fut]
            try:
                if tag == "kimi_seat":
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

    out_dir = OUT / "_redteam"
    out_dir.mkdir(exist_ok=True)
    for name, payload in results.items():
        (out_dir / f"{name}.json").write_text(json.dumps(payload, indent=2) + "\n")

    # Merge punch ids
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
        "models": used_models or MODELS,
        "verdicts": {
            n: (results[n].get("verdict") if isinstance(results[n], dict) else "ERROR")
            for n in results
        },
        "n_findings": len(merged),
        "findings": merged,
        "kimi_fallback": "anthropic/claude-opus-5 if kimi fails",
    }
    (out_dir / "merged-findings.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary["verdicts"], indent=2))
    print(f"wrote {out_dir} findings={len(merged)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
