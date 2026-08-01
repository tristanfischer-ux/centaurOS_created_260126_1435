#!/usr/bin/env python3
"""Shared OpenRouter council / advisory model seats.

INTENT: One seat map for every FE council script. This module is a FACADE over
`model_routing.py` (the in-anger record + CritPt doctrine). Do not redefine
model ids here — change `model_routing.py` and this re-exports.

REVISED 2026-08-01 (terminal record, mirrored here):
- Standing diagnose: Grok 4.5 (replaced GLM — 3/3 vs 2/4 return)
- Code review / propose: GPT-5.6 Sol (never accept domain advice unchecked)
- Claim audit: MiniMax-M3 (not physics)
- Cheap backup voice: DeepSeek V4 Flash 0731 (never auditor)
- Kimi K3: DROPPED (1/3 return, token-cap deaths)
- GLM-5.2: demoted corroborator only

PHYSICS CEILING: CritPt tops out ~32%. No LLM validates magnetics/EM —
solvers + gates do.

See: .cursor/rules/multi-model-challenge-council.mdc
     docs/plans/LLM-ADVISORY-TRIAD-PHYSICS-CEILING-2026-08-01.md
     scripts/lib/model_routing.py
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Callable

# FLOW: council scripts import THIS module → seats come from model_routing
_LIB = Path(__file__).resolve().parent
if str(_LIB) not in sys.path:
    sys.path.insert(0, str(_LIB))

from model_routing import (  # noqa: E402
    AUDIT,
    AUDIT_LONG_CONTEXT,
    BACKUP,
    CORROBORATE,
    CRITPT_CEILING_PCT,
    DIAGNOSE,
    DO_NOT_USE_AS_AUDITOR,
    PROPOSE,
    TRIAD,
    VALIDATION_DISCLAIMER,
    seats_for,
)

# ---------------------------------------------------------------------------
# Formal challenge council (milestones / HoT reject) — three lineages
# ---------------------------------------------------------------------------
# GOTCHA: keys used to be glm52/sol/kimi. Callers that still hardcode those
# names MUST be updated — silent aliases would label Grok output as "glm52".
COUNCIL_MODELS: dict[str, str] = {
    "grok45": DIAGNOSE.model,
    "sol": PROPOSE.model,
    "minimax_m3": AUDIT.model,
}

# Optional fourth lineage for always-on cheap diversity (never the auditor).
COUNCIL_BACKUP_MODEL: str = BACKUP.model

# Fragile seat: if the third seat fails to parse, fall back to Opus 5.
# Was Kimi (parse-fragile); MiniMax is more reliable but empty/timeout still happens.
FRAGILE_SEAT_NAME = "minimax_m3"
FRAGILE_SEAT_MODEL = AUDIT.model
FRAGILE_FALLBACK_NAME = "opus5"
FRAGILE_FALLBACK_MODEL = "anthropic/claude-opus-5"

# Backward-compat names for the Opus fallback (old Kimi→Opus path).
KIMI_FALLBACK_NAME = FRAGILE_FALLBACK_NAME
KIMI_FALLBACK_MODEL = FRAGILE_FALLBACK_MODEL

# ---------------------------------------------------------------------------
# Advisory triad (maker ≠ checker) — day-to-day
# ---------------------------------------------------------------------------
DEFAULT_SECOND_OPINION_NAME = "grok45"
DEFAULT_SECOND_OPINION_MODEL = DIAGNOSE.model

PHYSICS_ESCALATION_NAME = "sol"
PHYSICS_ESCALATION_MODEL = PROPOSE.model
PHYSICS_ESCALATION_PRO_MODEL = "openai/gpt-5.6-sol-pro"

CHECKER_NAME = "minimax_m3"
CHECKER_MODEL = AUDIT.model
CHECKER_LONG_CONTEXT_MODEL = AUDIT_LONG_CONTEXT.model

# Cheap backup voice — DeepSeek Flash, not Pro. Never auditor.
DEEPSEEK_VOICE_MODEL = BACKUP.model

# Demoted — available for optional corroboration, not standing first call.
CORROBORATE_NAME = "glm52"
CORROBORATE_MODEL = CORROBORATE.model

AVOID_AS_SOL_SUBSTITUTE = "openai/gpt-5.5-pro"

ADVISORY_TRIAD: dict[str, str] = {
    "second_opinion": DEFAULT_SECOND_OPINION_MODEL,
    "physics_escalation": PHYSICS_ESCALATION_MODEL,
    "checker": CHECKER_MODEL,
    "checker_long_context": CHECKER_LONG_CONTEXT_MODEL,
    "backup_voice": DEEPSEEK_VOICE_MODEL,
}


def seat_failed(obj: Any) -> bool:
    """True if a council seat did not produce usable structured output."""
    if obj is None:
        return True
    if not isinstance(obj, dict):
        return True
    if obj.get("parse_error") or obj.get("error") or obj.get("salvage_failed"):
        return True
    if obj.get("rows") is not None and len(obj.get("rows") or []) == 0:
        if not obj.get("assemblies"):
            return True
    if obj.get("verdict") is None and not obj.get("rows") and not obj.get("assemblies"):
        if not obj.get("fatal_findings") and not obj.get("top_10_punchlist_for_fix"):
            if obj.get("raw") or not obj:
                return True
    return False


# Deprecated alias — old name from the Kimi era.
kimi_result_failed = seat_failed


def run_fragile_seat_with_fallback(
    call_fn: Callable[[str, str], dict],
    *,
    primary_name: str = FRAGILE_SEAT_NAME,
    primary_model: str = FRAGILE_SEAT_MODEL,
    fallback_name: str = FRAGILE_FALLBACK_NAME,
    fallback_model: str = FRAGILE_FALLBACK_MODEL,
) -> tuple[str, str, dict]:
    """Call the fragile seat; on failure call Opus 5.

    @returns (seat_label, model_id, result_dict)
    """
    print(f"[council] calling {primary_name} ({primary_model}) …", flush=True)
    try:
        result = call_fn(primary_name, primary_model)
    except Exception as e:
        result = {"parse_error": True, "error": str(e)}
    if not seat_failed(result):
        return primary_name, primary_model, result

    print(
        f"[council] {primary_name} failed → fallback {fallback_name} ({fallback_model})",
        flush=True,
    )
    try:
        result = call_fn(fallback_name, fallback_model)
    except Exception as e:
        result = {"parse_error": True, "error": str(e), "fallback_from": primary_name}
    else:
        if isinstance(result, dict):
            result["fallback_from"] = primary_name
            result["fallback_model"] = fallback_model
    return fallback_name, fallback_model, result


def run_kimi_with_opus5_fallback(
    call_fn: Callable[[str, str], dict],
    *,
    kimi_name: str = FRAGILE_SEAT_NAME,
    kimi_model: str = FRAGILE_SEAT_MODEL,
    opus_name: str = FRAGILE_FALLBACK_NAME,
    opus_model: str = FRAGILE_FALLBACK_MODEL,
) -> tuple[str, str, dict]:
    """Deprecated name — now routes the FRAGILE seat (MiniMax) → Opus 5.

    Kept so older call sites keep working after COUNCIL_MODELS dropped `kimi`.
    """
    return run_fragile_seat_with_fallback(
        call_fn,
        primary_name=kimi_name,
        primary_model=kimi_model,
        fallback_name=opus_name,
        fallback_model=opus_model,
    )


def advisory_role_model(role: str) -> str:
    """
    @description Resolve OpenRouter model id for an advisory triad role.
    @param role one of: second_opinion | physics_escalation | checker |
           checker_long_context | backup_voice
    @returns OpenRouter model id
    @throws KeyError if role unknown
    """
    return ADVISORY_TRIAD[role]


def _selftest() -> int:
    """proveCatch: facade stays locked to model_routing (no divergent ids)."""
    fails: list[str] = []

    def check(name: str, cond: bool, detail: str = "") -> None:
        if not cond:
            fails.append(f"{name}: {detail}")

    check("council.keys",
          set(COUNCIL_MODELS) == {"grok45", "sol", "minimax_m3"},
          f"unexpected keys {set(COUNCIL_MODELS)}")
    check("council.grok_is_diagnose",
          COUNCIL_MODELS["grok45"] == DIAGNOSE.model, "")
    check("council.sol_is_propose",
          COUNCIL_MODELS["sol"] == PROPOSE.model, "")
    check("council.minimax_is_audit",
          COUNCIL_MODELS["minimax_m3"] == AUDIT.model, "")
    check("advisory.second_is_grok",
          ADVISORY_TRIAD["second_opinion"] == DIAGNOSE.model,
          "standing second opinion must be Grok, not GLM")
    check("advisory.no_kimi_in_council",
          "kimi" not in COUNCIL_MODELS and "glm52" not in COUNCIL_MODELS,
          "legacy glm52/kimi keys must not silently remain")
    check("backup.never_auditor",
          DEEPSEEK_VOICE_MODEL in DO_NOT_USE_AS_AUDITOR, "")
    check("seats_for.physics",
          seats_for("magnetics review") == TRIAD, "")
    check("ceiling.exported", CRITPT_CEILING_PCT == 32.0, "")
    check("disclaimer.present", "32%" in VALIDATION_DISCLAIMER, "")

    for f in fails:
        print(f"  FAIL {f}")
    print(f"{'FAIL' if fails else 'PASS'} council_models selftest "
          f"({len(fails)} failures)")
    return 1 if fails else 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        raise SystemExit(_selftest())
    print(VALIDATION_DISCLAIMER)
    print("\nCOUNCIL_MODELS:")
    for k, v in COUNCIL_MODELS.items():
        print(f"  {k:12s} {v}")
    print("\nADVISORY_TRIAD:")
    for k, v in ADVISORY_TRIAD.items():
        print(f"  {k:22s} {v}")
