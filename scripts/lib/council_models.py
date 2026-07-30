#!/usr/bin/env python3
"""Shared OpenRouter council model seats for FPK challenge loops.

INTENT (Tristan 2026-07-29): Sol + Kimi K3 + GLM regularly. If Kimi fails
(parse / empty / timeout / HTTP) → retry that seat with Opus 5.

See: .cursor/rules/multi-model-challenge-council.mdc
"""
from __future__ import annotations

from typing import Any, Callable

# Primary three seats
COUNCIL_MODELS: dict[str, str] = {
    "glm52": "z-ai/glm-5.2",
    "sol": "openai/gpt-5.6-sol",
    "kimi": "moonshotai/kimi-k3",
}

# Tristan 2026-07-29: Kimi seat fallback
KIMI_FALLBACK_NAME = "opus5"
KIMI_FALLBACK_MODEL = "anthropic/claude-opus-5"


def kimi_result_failed(obj: Any) -> bool:
    """True if the Kimi seat did not produce usable structured output."""
    if obj is None:
        return True
    if not isinstance(obj, dict):
        return True
    if obj.get("parse_error") or obj.get("error") or obj.get("salvage_failed"):
        return True
    # Empty useful payload
    if obj.get("rows") is not None and len(obj.get("rows") or []) == 0:
        if not obj.get("assemblies"):
            return True
    if obj.get("verdict") is None and not obj.get("rows") and not obj.get("assemblies"):
        if not obj.get("fatal_findings") and not obj.get("top_10_punchlist_for_fix"):
            # raw-only or empty
            if obj.get("raw") or not obj:
                return True
    return False


def run_kimi_with_opus5_fallback(
    call_fn: Callable[[str, str], dict],
    *,
    kimi_name: str = "kimi",
    kimi_model: str = "moonshotai/kimi-k3",
    opus_name: str = KIMI_FALLBACK_NAME,
    opus_model: str = KIMI_FALLBACK_MODEL,
) -> tuple[str, str, dict]:
    """Call Kimi; on failure call Opus 5.

    @returns (seat_label, model_id, result_dict)
    """
    print(f"[council] calling {kimi_name} ({kimi_model}) …", flush=True)
    try:
        result = call_fn(kimi_name, kimi_model)
    except Exception as e:
        result = {"parse_error": True, "error": str(e)}
    if not kimi_result_failed(result):
        return kimi_name, kimi_model, result

    print(
        f"[council] {kimi_name} failed → fallback {opus_name} ({opus_model})",
        flush=True,
    )
    try:
        result = call_fn(opus_name, opus_model)
    except Exception as e:
        result = {"parse_error": True, "error": str(e), "fallback_from": kimi_name}
    else:
        if isinstance(result, dict):
            result["fallback_from"] = kimi_name
            result["fallback_model"] = opus_model
    return opus_name, opus_model, result
