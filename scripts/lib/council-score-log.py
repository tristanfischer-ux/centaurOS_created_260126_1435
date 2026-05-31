#!/usr/bin/env python3
"""
Permanent append-only council score recorder.

Usage (as a library):
    from scripts.lib.council_score_log import record_council_score

    record_council_score({
        "ts": "2026-05-29T14:35:00Z",
        "product_class": "bess",
        "run_tag": "iter-vf5",
        "pdf_path": "/path/to/radical.pdf",
        "chain_commit_sha": "abc1234",
        "seats": {"gemini": 8.1, "claude": 7.9, "qwen": 8.3},
        "mean": 8.1,
        "gate": 8.0,
        "pass": True,
        "notes": "First BESS run that cleared the gate.",
        "backfilled": False,
    })

Schema (one JSON object per line in ~/Downloads/engine-evidence/council-scores.jsonl):
    {
        "ts":               ISO-8601 string,
        "product_class":    str   (slug, e.g. "bess", "vertical-farm"),
        "run_tag":          str   (e.g. "iter-vf5", "L54"),
        "pdf_path":         str | null,
        "chain_commit_sha": str | null,
        "seats":            dict[str, float | None]  model_id -> score 0-10,
        "mean":             float,
        "gate":             float  (default 8.0),
        "pass":             bool,
        "notes":            str,
        "backfilled":       bool,
    }

Rules:
    - NEVER overwrites existing lines. Pure append.
    - mkdir -p the parent directory if absent.
    - Creates the file if absent.
    - Caller is responsible for providing a well-formed record dict;
      this module validates required keys and raises ValueError on failure.
"""

import json
import os
import subprocess
from pathlib import Path
from typing import Any

LOG_PATH = Path("~/Downloads/engine-evidence/council-scores.jsonl").expanduser()

REQUIRED_KEYS = {
    "ts",
    "product_class",
    "run_tag",
    "mean",
    "gate",
    "pass",
    "backfilled",
}

OPTIONAL_KEYS_DEFAULTS: dict[str, Any] = {
    "pdf_path": None,
    "chain_commit_sha": None,
    "seats": {},
    "notes": "",
}


def _validate(record: dict) -> None:
    missing = REQUIRED_KEYS - set(record.keys())
    if missing:
        raise ValueError(
            f"record_council_score: missing required keys: {sorted(missing)}"
        )
    if not isinstance(record["mean"], (int, float)):
        raise TypeError(
            f"record_council_score: 'mean' must be numeric, got {type(record['mean'])}"
        )
    if not isinstance(record["pass"], bool):
        raise TypeError(
            f"record_council_score: 'pass' must be bool, got {type(record['pass'])}"
        )


def _apply_brief_adherence_cap(record: dict) -> None:
    """BF-2 (2026-05-31): deterministically CAP the council mean when the design
    fails the brief's hard constraints.

    The multimodal council rubric scores DOCUMENT quality and never penalises a
    hard-constraint breach (BESS scored 9.28 at 7.7x over the cost ceiling + 23%
    under energy). The council cannot be trusted to notice, so this does NOT ask
    it to: it runs scripts/brief-adherence.ts on the sibling state.json, reads the
    structured ACHIEVED values, and caps the logged mean so an unmet hard
    requirement cannot be recorded as an 8+ 'pass'. Graceful no-op on ANY error —
    score logging must never break because of the cap.
    """
    try:
        pdf = record.get("pdf_path")
        if not pdf:
            return
        state = Path(pdf).expanduser().resolve().parent / "state.json"
        if not state.exists():
            return
        repo = Path(__file__).resolve().parents[2]  # scripts/lib/ -> repo root
        adh = repo / "scripts" / "brief-adherence.ts"
        if not adh.exists():
            return
        out = subprocess.run(
            ["npx", "tsx", str(adh), str(state)],
            cwd=str(repo), capture_output=True, text=True, timeout=120,
        )
        if out.returncode != 0 or not out.stdout.strip():
            return
        verdict = json.loads(out.stdout)
        cap = verdict.get("recommended_cap")
        record["brief_adherence"] = {
            "all_hard_met": verdict.get("all_hard_met"),
            "brief_infeasible": verdict.get("brief_infeasible"),
            "recommended_cap": cap,
            "breaches": verdict.get("breaches"),
        }
        if cap is not None and isinstance(record.get("mean"), (int, float)) and record["mean"] > cap:
            record["raw_mean"] = record["mean"]
            record["mean"] = cap
            record["pass"] = bool(cap >= record.get("gate", 8.0))
            note = (record.get("notes") or "").strip()
            record["notes"] = (note + f" [BF-2 cap {cap}: {verdict.get('reason', '')}]").strip()
    except Exception as e:  # noqa: BLE001 — never break logging
        print(f"[council-score-log] brief-adherence cap skipped: {e}")


def record_council_score(record: dict) -> None:
    """
    Append one JSON line to the canonical council-score log.

    Parameters
    ----------
    record : dict
        Must contain all REQUIRED_KEYS. Optional keys are filled from
        OPTIONAL_KEYS_DEFAULTS if absent.

    Raises
    ------
    ValueError  if required keys are missing.
    TypeError   if 'mean' is not numeric or 'pass' is not bool.
    """
    _validate(record)

    # BF-2: cap the mean deterministically when the design fails the brief.
    _apply_brief_adherence_cap(record)

    # Fill optional fields with defaults
    full = dict(OPTIONAL_KEYS_DEFAULTS)
    full.update(record)

    # Ensure log directory exists
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Append — never overwrite
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(full, ensure_ascii=False) + "\n")
