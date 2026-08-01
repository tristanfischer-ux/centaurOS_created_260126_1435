#!/usr/bin/env python3
"""Shared OpenRouter council / advisory model seats.

INTENT (Tristan 2026-07-29, refined 2026-08-01):
- Formal challenge council: GLM + Sol + Kimi (Kimi → Opus 5).
- Day-to-day advisory triad: GLM (default second opinion) → Sol (hard
  physics escalation only) → MiniMax-M3 (evidence/claim checker).

PHYSICS CEILING: CritPt tops out ~32%. No LLM validates magnetics/EM —
solvers + gates do. Sol leads CritPt but is near-worst at non-hallucination;
never accept Sol unchecked. Prefer GLM as standing first call.

See: .cursor/rules/multi-model-challenge-council.mdc
     docs/plans/LLM-ADVISORY-TRIAD-PHYSICS-CEILING-2026-08-01.md
"""
from __future__ import annotations

from typing import Any, Callable

# ---------------------------------------------------------------------------
# Formal three-seat challenge council (milestones / HoT reject)
# ---------------------------------------------------------------------------
COUNCIL_MODELS: dict[str, str] = {
    "glm52": "z-ai/glm-5.2",
    "sol": "openai/gpt-5.6-sol",
    "kimi": "moonshotai/kimi-k3",
}

# Tristan 2026-07-29: Kimi seat fallback
KIMI_FALLBACK_NAME = "opus5"
KIMI_FALLBACK_MODEL = "anthropic/claude-opus-5"

# ---------------------------------------------------------------------------
# Advisory triad (maker ≠ checker) — Tristan 2026-08-01 CritPt doctrine
# ---------------------------------------------------------------------------
# Default second opinion: usable CritPt + high honesty, ~⅛ Sol cost.
DEFAULT_SECOND_OPINION_NAME = "glm52"
DEFAULT_SECOND_OPINION_MODEL = "z-ai/glm-5.2"

# Hard physics escalation only — never accept unchecked (~18% non-hallucination).
PHYSICS_ESCALATION_NAME = "sol"
PHYSICS_ESCALATION_MODEL = "openai/gpt-5.6-sol"
PHYSICS_ESCALATION_PRO_MODEL = "openai/gpt-5.6-sol-pro"  # same price band; A/B ok

# Claim / evidence checker — ask "is this supported?", NOT "do the physics".
CHECKER_NAME = "minimax_m3"
CHECKER_MODEL = "minimax/minimax-m3"
CHECKER_LONG_CONTEXT_MODEL = "qwen/qwen3.7-max"

# Cheap voice only — weak CritPt AND weak honesty; not standing second opinion.
DEEPSEEK_VOICE_MODEL = "deepseek/deepseek-v4-pro"

# Avoid as Sol substitute (≈6× cost for worse CritPt per 2026-08-01 brief).
AVOID_AS_SOL_SUBSTITUTE = "openai/gpt-5.5-pro"

ADVISORY_TRIAD: dict[str, str] = {
    "second_opinion": DEFAULT_SECOND_OPINION_MODEL,
    "physics_escalation": PHYSICS_ESCALATION_MODEL,
    "checker": CHECKER_MODEL,
    "checker_long_context": CHECKER_LONG_CONTEXT_MODEL,
}


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


def advisory_role_model(role: str) -> str:
    """
    @description Resolve OpenRouter model id for an advisory triad role.
    @param role one of: second_opinion | physics_escalation | checker | checker_long_context
    @returns OpenRouter model id
    @throws KeyError if role unknown
    """
    return ADVISORY_TRIAD[role]
