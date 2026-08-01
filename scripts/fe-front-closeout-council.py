#!/usr/bin/env python3
"""Close-out push council — Sol + GLM + Kimi (Opus fallback).

INTENT: Produce an actionable Bar A/B close-out plan for the FE front FPK twin,
not a generic reject. Reads `_redteam_digest_v2.json` + closeout tracker excerpt.
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
DIGEST = OUT / "_redteam_digest_v2.json"
TRACKER = ROOT / "docs/plans/JLR-FE-FRONT-FPK-BAR-A-BAR-B-CLOSEOUT-TRACKER-2026-07-31.md"
OUT_DIR = OUT / "_closeout_council_v1"

from scripts.lib.council_models import (  # noqa: E402
    COUNCIL_MODELS,
    run_kimi_with_opus5_fallback,
)

SYSTEM = """You are a senior Formula E powertrain engineering programme manager advising
Jaguar Land Rover on how to CLOSE OUT a supplier concept pack.

You are adversarial about greenwash, but your JOB is a BIG PUSH PLAN:
prioritised workstreams, owners, evidence, and what must stay OPEN as Bar B.

Bar A = concept under assumptions (software-closable).
Bar B = race/homologation (hardware/partner). ship_ok must stay false until Bar B.

Return STRICT JSON:
{
  "verdict": "PUSH_READY" | "PUSH_WITH_HOLDS" | "NOT_READY",
  "confidence": 0-100,
  "bar_a_remaining": [{"id":"A..","title":"...","severity":"P0|P1|P2","why":"...","steps":["..."],"evidence_paths":["..."],"owner":"...","est_days":0}],
  "bar_b_remaining": [{"id":"B..","title":"...","why_not_software":"...","partner_ask":"...","blocks_ship_ok":true}],
  "blender_drawing_push": {"cutaway":["..."],"exploded_individual_parts":["..."],"ga":["..."],"sight_checks":["..."]},
  "em_oil_architecture": {"em_status":"...","oil_status":"...","next_actions":["..."]},
  "process_risks": [{"id":"R..","risk":"...","mitigation":"..."}],
  "top_15_push_sequence": ["1. ...", "2. ..."],
  "do_not_do": ["never mint ship_ok from assumptions", "..."],
  "council_notes": "short"
}
No markdown outside JSON.
"""


def load_api_key() -> str:
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
            "X-Title": "ForgeOS FE Front FPK Closeout Council",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=360) as resp:
        data = json.loads(resp.read().decode())
    msg = data["choices"][0]["message"]
    content = msg.get("content")
    if content is None:
        content = msg.get("reasoning") or msg.get("refusal") or json.dumps(msg)
    text = str(content).strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:].strip()
    start = text.find("{")
    if start < 0:
        return {"raw": content, "parse_error": True}
    from json import JSONDecoder

    try:
        obj, _ = JSONDecoder().raw_decode(text, start)
        return obj if isinstance(obj, dict) else {"raw": obj, "parse_error": True}
    except json.JSONDecodeError:
        return {"raw": content, "parse_error": True}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rebuild-digest", action="store_true")
    args = parser.parse_args()
    if args.rebuild_digest:
        import subprocess

        subprocess.check_call(
            [sys.executable, str(ROOT / "scripts/fe-front-build-redteam-digest.py")],
            cwd=str(ROOT),
        )
    if not DIGEST.is_file():
        raise SystemExit(f"missing digest {DIGEST}")
    digest = json.loads(DIGEST.read_text(encoding="utf-8"))
    tracker_excerpt = ""
    if TRACKER.is_file():
        tracker_excerpt = TRACKER.read_text(encoding="utf-8")[:12000]
    user = (
        "CLOSE-OUT PUSH BRIEF\n\n"
        "DIGEST (JSON):\n"
        + json.dumps(digest, indent=2)[:110000]
        + "\n\nTRACKER EXCERPT:\n"
        + tracker_excerpt
        + "\n\nProduce the close-out JSON plan now."
    )
    api_key = load_api_key()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    results: dict[str, dict] = {}

    def run_seat(name: str, model: str) -> tuple[str, dict]:
        print(f"[closeout-council] calling {name} ({model}) …", flush=True)
        return name, call_model(model, user, api_key)

    with ThreadPoolExecutor(max_workers=3) as pool:
        futs = []
        for name, model in COUNCIL_MODELS.items():
            if name == "kimi":
                continue
            futs.append(pool.submit(run_seat, name, model))
        for fut in as_completed(futs):
            name, obj = fut.result()
            results[name] = obj
            (OUT_DIR / f"{name}.json").write_text(
                json.dumps(obj, indent=2) + "\n", encoding="utf-8"
            )

    def kimi_call(name: str, model: str) -> dict:
        return call_model(model, user, api_key)

    seat, model_id, kimi_obj = run_kimi_with_opus5_fallback(kimi_call)
    results[seat] = kimi_obj
    (OUT_DIR / f"{seat}.json").write_text(
        json.dumps(kimi_obj, indent=2) + "\n", encoding="utf-8"
    )

    merged = {
        "schema": "forgeos.fpk.closeout_council/v1",
        "twin": str(OUT),
        "seats": {k: {"verdict": (v or {}).get("verdict"), "confidence": (v or {}).get("confidence")} for k, v in results.items()},
        "top_15_push_sequence_union": [],
        "bar_a_remaining_union": [],
        "bar_b_remaining_union": [],
        "do_not_do_union": [],
    }
    seen_seq: set[str] = set()
    for seat_name, obj in results.items():
        if not isinstance(obj, dict):
            continue
        for step in obj.get("top_15_push_sequence") or []:
            s = str(step).strip()
            if s and s not in seen_seq:
                seen_seq.add(s)
                merged["top_15_push_sequence_union"].append(s)
        for row in obj.get("bar_a_remaining") or []:
            if isinstance(row, dict):
                merged["bar_a_remaining_union"].append({"seat": seat_name, **row})
        for row in obj.get("bar_b_remaining") or []:
            if isinstance(row, dict):
                merged["bar_b_remaining_union"].append({"seat": seat_name, **row})
        for item in obj.get("do_not_do") or []:
            if item not in merged["do_not_do_union"]:
                merged["do_not_do_union"].append(item)
    (OUT_DIR / "merged-closeout.json").write_text(
        json.dumps(merged, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(merged["seats"], indent=2))
    print(f"wrote {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
