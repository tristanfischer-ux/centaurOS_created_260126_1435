#!/usr/bin/env python3
"""
Brainstorming Council — 3-question replication + non-Anthropic judge cross-check.

INPUT: nothing (config baked in below)
OUTPUT:
  - experiments/results/brainstorming-council-tier-test-3q-<timestamp>.json
  - BRAINSTORM-TIER-DEBATE-TEST-3Q.md at repo root
CONSTRAINTS:
  - reads `src/lib/agents/specialists-config.ts` for personality prompts
  - calls Anthropic / DeepSeek / OpenAI via env-variable keys
  - cost ceiling: £5 of LLM spend
  - read-only on production code; only writes to experiments/results/ and repo root

Per RED-TEAM-PIVOT-PLAN.md line 213:
  "3-question replication + non-Anthropic judge cross-check queued before
  this becomes a hard pricing rule"

Judges:
  - Anthropic judge: claude-opus-4-7 (same as original test — continuity baseline)
  - Non-Anthropic judge: deepseek-reasoner (DeepSeek V4-Pro reasoning model)
    Selected because it is non-Anthropic, has reasoning, and has clean sidecar
    wiring in runner_multi.py. DeepSeek was chosen over gpt-5.5 / gemini-3.1
    because it is available in .env.local and has a stable OpenAI-compatible
    endpoint already wired in the existing tier runner.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Any

# ─── Reuse the existing benchmark's specialist-prompt extractor ─────────────
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "experiments" / "autoagent-strategy-specialist" / "benchmark"))
from runner import extract_specialist_system_prompt  # type: ignore  # noqa: E402

# ─── Load env from .env.local ─────────────────────────────────────────────
ENV_FILE = REPO_ROOT / ".env.local"
if ENV_FILE.exists():
    for raw in ENV_FILE.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        os.environ.setdefault(k, v)


def _clean(k: str) -> str:
    v = os.environ.get(k, "")
    return v.replace("\\n", "").strip()


ANTHROPIC_API_KEY = _clean("ANTHROPIC_API_KEY")
OPENAI_API_KEY = _clean("OPENAI_API_KEY")
DEEPSEEK_API_KEY = _clean("DEEPSEEK_API_KEY")

# ─── Three questions spanning fundraising / product strategy / operations ────

QUESTIONS = [
    {
        "id": "Q1_fundraising",
        "flavour": "fundraising",
        "question": "Should we raise a Series A now or extend our runway by another 9 months?",
        "context": (
            "Hardware startup building an industrial inspection drone. "
            "Revenue is £380,000 annualised, growing at 18% per month for the last four months. "
            "Burn rate is £95,000 per month and there is nine months of runway at current burn. "
            "Two Series A term sheets on the table: one at £6M at a £28M post-money valuation, "
            "one at £5M at a £22M post-money valuation. The founder can likely extend runway "
            "by cutting burn to £55,000 per month by pausing two hires."
        ),
    },
    {
        "id": "Q2_product_strategy",
        "flavour": "product strategy",
        "question": "Our hardware product is 80% locked. Should we keep iterating or start manufacturing?",
        "context": (
            "Consumer health wearable startup, post-seed. "
            "Prototype has been through six design revisions over 14 months. "
            "Current bill of materials cost is £47 per unit at prototype volumes; "
            "contract manufacturer quotes £18 per unit at 10,000-unit minimum order quantity. "
            "Three beta users in the last iteration flagged a single unresolved issue: "
            "the sensor accuracy drops by 12% when ambient temperature exceeds 30 degrees Celsius. "
            "The fix requires a new sensor module that costs an additional £4 per unit. "
            "The team has 18 months of runway. The market window for this category is competitive "
            "with two funded rivals expected to launch within six months."
        ),
    },
    {
        "id": "Q3_operations_scaling",
        "flavour": "operations and scaling",
        "question": "Our team is 5 people; we need to triple in 12 months. What is the right hiring sequence?",
        "context": (
            "Business-to-business software-as-a-service startup in the logistics sector. "
            "Current team: 1 founder-chief executive officer, 1 lead engineer, "
            "1 product designer, 1 sales development representative, 1 customer success manager. "
            "Annual recurring revenue is £420,000 with a net revenue retention of 118%. "
            "The sales development representative closed 3 deals in the last 90 days at an "
            "average contract value of £28,000. Customer acquisition cost is £4,200. "
            "Seed funding closes at £1.8M in 30 days. "
            "The founder is technically strong but has not hired beyond 5 people before."
        ),
    },
]

# ─── Tier definitions (identical to original brainstorming-council-tier-test.py) ──

TIERS: dict[str, dict[str, Any]] = {
    "A": {  # Quick Council (Free)
        "fiona_open":  {"provider": "anthropic", "model": "claude-haiku-4-5",   "max_tokens": 1000, "thinking": False},
        "fiona_close": {"provider": "anthropic", "model": "claude-haiku-4-5",   "max_tokens": 2000, "thinking": False},
        "sage":        {"provider": "deepseek",  "model": "deepseek-chat",      "max_tokens": 1500},
        "finn":        {"provider": "deepseek",  "model": "deepseek-chat",      "max_tokens": 1500},
        "sal":         {"provider": "openai",    "model": "gpt-4.1-mini",       "max_tokens": 1500},
        "mia":         {"provider": "anthropic", "model": "claude-haiku-4-5",   "max_tokens": 1500, "thinking": False},
        "citations": False,
        "label": "Quick Council (Free)",
    },
    "B": {  # Full Council (Starter)
        "fiona_open":  {"provider": "anthropic", "model": "claude-sonnet-4-6",  "max_tokens": 1000, "thinking": False},
        "fiona_close": {"provider": "anthropic", "model": "claude-sonnet-4-6",  "max_tokens": 2000, "thinking": False},
        "sage":        {"provider": "anthropic", "model": "claude-sonnet-4-6",  "max_tokens": 1500, "thinking": False},
        "finn":        {"provider": "deepseek",  "model": "deepseek-chat",      "max_tokens": 1500},
        "sal":         {"provider": "openai",    "model": "gpt-4.1",            "max_tokens": 1500},
        "mia":         {"provider": "anthropic", "model": "claude-haiku-4-5",   "max_tokens": 1500, "thinking": False},
        "citations": True,
        "label": "Full Council (Starter)",
    },
    "C": {  # Deep Council (Pro)
        "fiona_open":  {"provider": "anthropic", "model": "claude-opus-4-7",    "max_tokens": 1000, "thinking": False},
        "fiona_close": {"provider": "anthropic", "model": "claude-opus-4-7",    "max_tokens": 2500, "thinking": False},
        "sage":        {"provider": "anthropic", "model": "claude-opus-4-7",    "max_tokens": 2500, "thinking": False},
        "finn":        {"provider": "deepseek",  "model": "deepseek-reasoner",  "max_tokens": 2500},
        "sal":         {"provider": "openai",    "model": "gpt-4.1",            "max_tokens": 2500},
        "mia":         {"provider": "anthropic", "model": "claude-sonnet-4-6",  "max_tokens": 2500, "thinking": False},
        "citations": True,
        "label": "Deep Council (Pro)",
    },
    "D": {  # Strategy Council (Enterprise) — extended thinking on
        "fiona_open":  {"provider": "anthropic", "model": "claude-opus-4-7",    "max_tokens": 1500, "thinking": True},
        "fiona_close": {"provider": "anthropic", "model": "claude-opus-4-7",    "max_tokens": 3500, "thinking": True},
        "sage":        {"provider": "anthropic", "model": "claude-opus-4-7",    "max_tokens": 3500, "thinking": True},
        "finn":        {"provider": "deepseek",  "model": "deepseek-reasoner",  "max_tokens": 3500},
        "sal":         {"provider": "openai",    "model": "gpt-4.1",            "max_tokens": 3500},
        "mia":         {"provider": "anthropic", "model": "claude-sonnet-4-6",  "max_tokens": 3500, "thinking": True},
        "citations": True,
        "label": "Strategy Council (Enterprise)",
    },
}

# ─── Provider call helpers ──────────────────────────────────────────────────


def _post_json(url: str, body: dict, headers: dict, timeout: int = 180) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} from {url}: {err[:500]}") from e


def call_anthropic(
    model: str, system: str, user: str, max_tokens: int, thinking: bool = False
) -> tuple[str, dict]:
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    body: dict = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }
    is_opus_4_7 = "opus-4-7" in model
    if thinking:
        if is_opus_4_7:
            body["thinking"] = {"type": "adaptive"}
            body["output_config"] = {"effort": "high"}
        else:
            body["thinking"] = {"type": "enabled", "budget_tokens": max(1024, max_tokens // 2)}
    else:
        if not is_opus_4_7:
            body["temperature"] = 0.3
    out = _post_json("https://api.anthropic.com/v1/messages", body, headers)
    text_parts: list[str] = []
    thinking_parts: list[str] = []
    for block in out.get("content", []):
        if block.get("type") == "text":
            text_parts.append(block.get("text", ""))
        elif block.get("type") == "thinking":
            thinking_parts.append(block.get("thinking", ""))
    usage = out.get("usage", {})
    return "\n".join(text_parts), {"usage": usage, "thinking": "\n".join(thinking_parts) if thinking_parts else None}


def call_openai_compat(
    base_url: str, api_key: str, model: str, system: str, user: str, max_tokens: int
) -> tuple[str, dict]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": 0.3,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    out = _post_json(f"{base_url}/chat/completions", body, headers)
    msg = out["choices"][0]["message"]
    text = msg.get("content") or ""
    extra: dict[str, Any] = {"usage": out.get("usage", {})}
    if msg.get("reasoning_content"):
        extra["reasoning_content"] = msg["reasoning_content"]
    return text, extra


def call_role(role_cfg: dict[str, Any], system: str, user: str) -> tuple[str, dict]:
    provider = role_cfg["provider"]
    model = role_cfg["model"]
    max_tokens = role_cfg["max_tokens"]
    if provider == "anthropic":
        return call_anthropic(model, system, user, max_tokens, thinking=role_cfg.get("thinking", False))
    if provider == "openai":
        return call_openai_compat("https://api.openai.com/v1", OPENAI_API_KEY, model, system, user, max_tokens)
    if provider == "deepseek":
        return call_openai_compat("https://api.deepseek.com/v1", DEEPSEEK_API_KEY, model, system, user, max_tokens)
    raise ValueError(f"unknown provider {provider}")


# ─── Prompt builders ─────────────────────────────────────────────────────────

FIONA_HOST_SYSTEM = """You are Fiona — the host of the ForgeOS Brainstorming Council and Fractional Forge's fundraising-and-investor-narrative lead.

Your hosting voice: calm, structurally aware, occasionally theatrical when it sharpens the point. British spelling. Direct, but uses softer connectives than the engineer specialists. You read the question, name what is actually being asked, surface the dissents the council will produce, and close with the single concrete action.

You do NOT answer the question yourself in the opening. You frame it.
You do NOT add new opinion in the closing. You synthesise what the four said.

You always anchor in the founder's specific numbers when they exist. You never say "AI", "powered by", or talk about the model. You talk about the council.

Hard rules:
- Spell out acronyms on first use AND every use after that. "Contract manufacturer" not the two-letter version. "Total addressable market" not the three-letter version.
- No emojis in body copy.
- If the question is a hedged framing ("X or Y?"), name the hedge before listing dissents.
- One sign-off line at the very end of the closing — in your voice, dated to a real next-week day."""

ROLE_TO_SPECIALIST_ID = {
    "sage": "strategist",
    "finn": "finance-lead",
    "sal":  "sales-lead",
    "mia":  "growth-marketer",
}


def build_fiona_open_prompt(question: str, context: str) -> str:
    return f"""You are about to host a brainstorming council for a startup founder.

THE FOUNDER'S QUESTION:
"{question}"

FOUNDRY CONTEXT (the only facts you have about this founder's situation):
{context}

YOUR JOB IN THIS OPENING:
Frame the question for the council. Do NOT answer it.

Specifically:
1. In 2 sentences, name what is actually being asked versus what was asked on the surface.
2. Then list 3 things worth disagreeing about — the dimensions where reasonable specialists will pull apart. Each one is one bold sentence plus one sentence of why it matters. Use the specific numbers from the foundry context.
3. Close with one sentence inviting Sage (Strategy), Finn (Finance), Sal (Sales), and Mia (Marketing) to weigh in. Do NOT introduce yourself. Do NOT sign off.

Write in your real voice — Fiona. Calm, structurally aware, slightly theatrical when it sharpens the point. British spelling. No bullet markdown — write as flowing paragraphs and a numbered list.
"""


def build_specialist_prompt(role_name: str, question: str, context: str, fiona_framing: str, citations: bool) -> str:
    cite_clause = ""
    if citations:
        cite_clause = (
            "\n\nCITATION RULE (this tier requires it): Every numerical or factual claim about the founder's situation "
            "MUST cite the foundry-context field it came from. If you make a claim without a citation, you have failed this rule."
        )
    return f"""You are joining a four-specialist brainstorming council.

THE FOUNDER'S QUESTION:
"{question}"

FOUNDRY CONTEXT (the only facts you have about this founder's situation):
{context}

FIONA HAS JUST FRAMED THE QUESTION (read this and respond AFTER her, picking up on the framings she surfaced — agree, disagree, or extend):
---
{fiona_framing}
---

YOUR TASK:
Give your specialist's take in your real voice. Three to five paragraphs.
- Anchor in the SPECIFIC numbers from the foundry context. Do not write generically.
- Take a position. Be willing to disagree with the framings Fiona surfaced or with what other specialists would say.
- End with your specialist's signature close block in your character voice — for {role_name}, this is the punchy "what to do this week" close (e.g. Sage: 'WHAT TO DO MONDAY MORNING', Finn: 'THE NUMBERS THAT MATTER', Sal: 'SEND THIS TODAY', Mia: 'SHIP THIS WEEK').{cite_clause}

Do NOT summarise the question. Do NOT acknowledge Fiona. Do NOT introduce yourself. Just respond as the specialist."""


def build_fiona_close_prompt(
    question: str,
    context: str,
    fiona_framing: str,
    transcripts: list[tuple[str, str, str]],
    citations: bool,
) -> str:
    cite_clause = (
        "\nThis tier requires citations. Every concrete claim must reference either a foundry-context field "
        "or which specialist said it (e.g. 'Finn made the runway-math case')."
        if citations else ""
    )
    transcript_block = "\n\n".join(
        [f"--- {name.upper()} ({role}) ---\n{text}" for (name, role, text) in transcripts]
    )
    return f"""You are Fiona, closing the brainstorming council. The founder just heard from four specialists in parallel and now needs YOUR synthesis.

THE FOUNDER'S QUESTION:
"{question}"

FOUNDRY CONTEXT:
{context}

YOUR EARLIER FRAMING:
---
{fiona_framing}
---

THE FOUR SPECIALIST RESPONSES (verbatim):
{transcript_block}

YOUR JOB IN THIS CLOSE:
Three sections, in this order, no extra preamble.

1. WHERE THEY AGREED — one tight paragraph naming what all four (or three of four) actually agreed on, even if they did not say it the same way.
2. WHERE THEY DISAGREED — one tight paragraph naming the SHARPEST dissent. Name the two specialists on either side of it. Do not soften the disagreement.
3. NEXT CONCRETE ACTION — one bold sentence with a deadline (this week / by Friday / by Monday) followed by 2-3 sentences explaining the test or step that would let the founder pick a path. End with a single sign-off line in your voice.{cite_clause}

Voice: Fiona, calm, structurally aware, British spelling. The synthesis is the deliverable — be specific, do not waffle."""


# ─── Run one tier on one question ────────────────────────────────────────────


def run_tier_for_question(tier_id: str, q: dict[str, str]) -> dict[str, Any]:
    cfg = TIERS[tier_id]
    citations: bool = cfg["citations"]  # type: ignore[assignment]
    question = q["question"]
    context = q["context"]
    transcript: dict[str, Any] = {
        "tier": tier_id,
        "tier_label": cfg["label"],
        "question_id": q["id"],
        "question": question,
        "models": {},
        "transcripts": {},
        "meta": {},
    }
    print(f"\n  -- Tier {tier_id} ({cfg['label']}) --", flush=True)

    # Fiona open
    print(f"    Fiona open ({cfg['fiona_open']['model']})...", flush=True)
    fiona_user = build_fiona_open_prompt(question, context)
    t0 = time.time()
    fiona_open_text, fiona_open_meta = call_role(cfg["fiona_open"], FIONA_HOST_SYSTEM, fiona_user)
    transcript["models"]["fiona_open"] = cfg["fiona_open"]["model"]
    transcript["transcripts"]["fiona_open"] = fiona_open_text
    transcript["meta"]["fiona_open"] = {"latency_s": round(time.time() - t0, 1), **fiona_open_meta}
    print(f"      done in {transcript['meta']['fiona_open']['latency_s']}s, {len(fiona_open_text)} chars")

    # 4 specialists in parallel
    specialists_to_run = ["sage", "finn", "sal", "mia"]
    specialist_results: dict[str, tuple[str, dict]] = {}

    def run_specialist(role: str) -> tuple[str, str, dict]:
        spec_id = ROLE_TO_SPECIALIST_ID[role]
        sys_prompt = extract_specialist_system_prompt(spec_id)
        user_prompt = build_specialist_prompt(role.capitalize(), question, context, fiona_open_text, citations)
        ts = time.time()
        text, meta = call_role(cfg[role], sys_prompt, user_prompt)
        return role, text, {"latency_s": round(time.time() - ts, 1), **meta}

    print(f"    Council fires in parallel: {', '.join(specialists_to_run)}...", flush=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(run_specialist, r): r for r in specialists_to_run}
        for fut in as_completed(futures):
            try:
                role, text, meta = fut.result()
                specialist_results[role] = (text, meta)
                print(f"      {role:>5} ({cfg[role]['model']:>22}) done in {meta['latency_s']}s, {len(text)} chars")
            except Exception as e:
                role = futures[fut]
                print(f"      {role:>5} FAILED: {e}")
                specialist_results[role] = (f"[{role.upper()} FAILED: {e}]", {"latency_s": 0, "error": str(e)})

    for role in specialists_to_run:
        text, meta = specialist_results[role]
        transcript["models"][role] = cfg[role]["model"]
        transcript["transcripts"][role] = text
        transcript["meta"][role] = meta

    # Fiona close
    print(f"    Fiona close ({cfg['fiona_close']['model']})...", flush=True)
    role_titles = {"sage": "Strategy", "finn": "Finance", "sal": "Sales", "mia": "Marketing"}
    transcripts_for_close = [
        (role.capitalize(), role_titles[role], specialist_results[role][0])
        for role in specialists_to_run
    ]
    fiona_close_user = build_fiona_close_prompt(question, context, fiona_open_text, transcripts_for_close, citations)
    tc = time.time()
    fiona_close_text, fiona_close_meta = call_role(cfg["fiona_close"], FIONA_HOST_SYSTEM, fiona_close_user)
    transcript["models"]["fiona_close"] = cfg["fiona_close"]["model"]
    transcript["transcripts"]["fiona_close"] = fiona_close_text
    transcript["meta"]["fiona_close"] = {"latency_s": round(time.time() - tc, 1), **fiona_close_meta}
    print(f"      done in {transcript['meta']['fiona_close']['latency_s']}s, {len(fiona_close_text)} chars")

    return transcript


# ─── Judge system prompt (5-dimension rubric matching original test) ─────────

JUDGE_SYSTEM_5DIM = """You are an expert evaluator of multi-specialist AI council output for a startup-advisory product called ForgeOS.

You score a Brainstorming Council on FIVE dimensions, 1-5 with 0.5 increments. Be calibrated, not generous.

1. ACTIONABILITY — does the synthesis end with a CONCRETE next step the founder can execute (deadline + measurable + owner)? 1=vague, 5=could-act-Monday.
2. SPECIFICITY — does the output cite numbers from the foundry context? 1=generic, 5=cites multiple foundry-context fields by their actual values.
3. STRATEGIC_DEPTH — does it surface non-obvious tensions (timing vs traction, valuation effect of waiting, dilution maths, market window risk, hiring sequence trade-offs, second-order effects)? 1=surface, 5=multiple second-order effects.
4. VOICE_CONSISTENCY — do specialists sound like themselves? Sage strategic, Finn numerical, Sal sales-objection, Mia growth/funnel. 1=generic, 5=unmistakable signature voices.
5. MULTI_SPECIALIST_COHERENCE — does the council actually disagree productively? Does Fiona's synthesis reflect REAL tensions? 1=just a summary, 5=names a sharp dissent and tells founder how to resolve it.

Return ONLY a JSON object, no markdown, no explanation:
{
  "actionability": <num>,
  "specificity": <num>,
  "strategic_depth": <num>,
  "voice_consistency": <num>,
  "multi_specialist_coherence": <num>,
  "composite": <mean of 5>,
  "notes": "<one paragraph, max 3 sentences>"
}"""


def build_judge_user(tier_id: str, transcript: dict[str, Any]) -> str:
    parts = [f"COUNCIL OUTPUT — Tier {tier_id} ({TIERS[tier_id]['label']})"]
    parts.append(f"\nQUESTION: {transcript['question']}")
    parts.append("\nFIONA OPEN:\n" + transcript["transcripts"]["fiona_open"])
    for role in ["sage", "finn", "sal", "mia"]:
        parts.append(f"\n{role.upper()}:\n" + transcript["transcripts"][role])
    parts.append("\nFIONA CLOSE:\n" + transcript["transcripts"]["fiona_close"])
    parts.append("\n\nReturn ONLY the JSON object specified.")
    return "\n".join(parts)


def judge_anthropic(tier_id: str, transcript: dict[str, Any]) -> dict[str, Any]:
    """Anthropic judge: claude-opus-4-7."""
    print(f"      Judging tier {tier_id} (Anthropic claude-opus-4-7)...", flush=True)
    user = build_judge_user(tier_id, transcript)
    text, _ = call_anthropic(
        model="claude-opus-4-7",
        system=JUDGE_SYSTEM_5DIM,
        user=user,
        max_tokens=800,
        thinking=False,
    )
    return _parse_judge_json(text)


def judge_deepseek(tier_id: str, transcript: dict[str, Any]) -> dict[str, Any]:
    """Non-Anthropic judge: deepseek-reasoner (DeepSeek V4-Pro reasoning model)."""
    print(f"      Judging tier {tier_id} (DeepSeek deepseek-reasoner)...", flush=True)
    user = build_judge_user(tier_id, transcript)
    # deepseek-reasoner is a reasoning model; temperature must not be set
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }
    body = {
        "model": "deepseek-reasoner",
        "max_tokens": 1500,
        "messages": [
            {"role": "system", "content": JUDGE_SYSTEM_5DIM},
            {"role": "user", "content": user},
        ],
    }
    out = _post_json("https://api.deepseek.com/v1/chat/completions", body, headers, timeout=240)
    msg = out["choices"][0]["message"]
    text = msg.get("content") or ""
    return _parse_judge_json(text)


def _parse_judge_json(raw: str) -> dict[str, Any]:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        l = raw.find("{")
        r = raw.rfind("}")
        if l != -1 and r != -1 and r > l:
            return json.loads(raw[l:r + 1])
        return {"error": "could not parse judge output", "raw": raw[:500]}


# ─── Compute deltas ───────────────────────────────────────────────────────────

DIMS = ["actionability", "specificity", "strategic_depth", "voice_consistency", "multi_specialist_coherence", "composite"]


def compute_deltas(scores_by_tier: dict[str, dict]) -> dict[str, float]:
    """Given {A: scores, B: scores, C: scores, D: scores}, return tier-step deltas."""
    out: dict[str, float] = {}
    pairs = [("A", "B", "Free_to_Starter"), ("B", "C", "Starter_to_Pro"), ("C", "D", "Pro_to_Enterprise")]
    for lo, hi, name in pairs:
        lo_comp = scores_by_tier.get(lo, {}).get("composite", None)
        hi_comp = scores_by_tier.get(hi, {}).get("composite", None)
        if lo_comp is not None and hi_comp is not None:
            out[name] = round(hi_comp - lo_comp, 3)
        else:
            out[name] = None  # type: ignore[assignment]
    return out


# ─── Main ─────────────────────────────────────────────────────────────────────


def main() -> None:
    if not (ANTHROPIC_API_KEY and OPENAI_API_KEY and DEEPSEEK_API_KEY):
        missing = [k for k, v in [
            ("ANTHROPIC_API_KEY", ANTHROPIC_API_KEY),
            ("OPENAI_API_KEY", OPENAI_API_KEY),
            ("DEEPSEEK_API_KEY", DEEPSEEK_API_KEY),
        ] if not v]
        print(f"Missing API keys: {missing}")
        sys.exit(1)

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    results_dir = REPO_ROOT / "experiments" / "results"
    results_dir.mkdir(parents=True, exist_ok=True)

    all_data: dict[str, Any] = {
        "run_timestamp": timestamp,
        "questions": QUESTIONS,
        "tiers": {k: {"label": v["label"]} for k, v in TIERS.items()},
        "judge_anthropic": "claude-opus-4-7",
        "judge_non_anthropic": "deepseek-reasoner",
        "results": {},  # keyed by question_id
    }

    # ── For each question, run all 4 tiers then judge both ways ──────────────
    for q in QUESTIONS:
        qid = q["id"]
        print(f"\n{'='*78}")
        print(f"QUESTION: {q['id']} ({q['flavour']})")
        print(f"  {q['question']}")
        print(f"{'='*78}")

        q_data: dict[str, Any] = {
            "question_id": qid,
            "question": q["question"],
            "flavour": q["flavour"],
            "context": q["context"],
            "tiers": {},
        }

        for tier_id in ["A", "B", "C", "D"]:
            try:
                transcript = run_tier_for_question(tier_id, q)
            except Exception as e:
                print(f"  Tier {tier_id} failed at run-time: {e}")
                q_data["tiers"][tier_id] = {"error": str(e)}
                continue

            # Judge: Anthropic
            try:
                scores_anthropic = judge_anthropic(tier_id, transcript)
            except Exception as e:
                print(f"  Anthropic judge failed for tier {tier_id}: {e}")
                scores_anthropic = {"error": str(e)}

            # Judge: DeepSeek (non-Anthropic)
            try:
                scores_deepseek = judge_deepseek(tier_id, transcript)
            except Exception as e:
                print(f"  DeepSeek judge failed for tier {tier_id}: {e}")
                scores_deepseek = {"error": str(e)}

            q_data["tiers"][tier_id] = {
                "tier_label": TIERS[tier_id]["label"],
                "transcripts": transcript["transcripts"],
                "models": transcript["models"],
                "meta": transcript["meta"],
                "scores_anthropic": scores_anthropic,
                "scores_deepseek": scores_deepseek,
            }
            print(f"  Tier {tier_id} — Anthropic composite: {scores_anthropic.get('composite', 'n/a')}, "
                  f"DeepSeek composite: {scores_deepseek.get('composite', 'n/a')}")

        # Compute deltas for this question
        anthropic_by_tier = {t: q_data["tiers"][t].get("scores_anthropic", {}) for t in ["A", "B", "C", "D"]}
        deepseek_by_tier  = {t: q_data["tiers"][t].get("scores_deepseek", {})  for t in ["A", "B", "C", "D"]}
        q_data["deltas_anthropic"] = compute_deltas(anthropic_by_tier)
        q_data["deltas_deepseek"]  = compute_deltas(deepseek_by_tier)

        all_data["results"][qid] = q_data

    # ── Aggregate deltas across 3 questions ───────────────────────────────────
    step_names = ["Free_to_Starter", "Starter_to_Pro", "Pro_to_Enterprise"]
    agg: dict[str, dict] = {sn: {"anthropic": [], "deepseek": []} for sn in step_names}
    for qid, q_res in all_data["results"].items():
        for sn in step_names:
            a_val = q_res.get("deltas_anthropic", {}).get(sn)
            d_val = q_res.get("deltas_deepseek",  {}).get(sn)
            if a_val is not None:
                agg[sn]["anthropic"].append(a_val)
            if d_val is not None:
                agg[sn]["deepseek"].append(d_val)

    agg_summary: dict[str, Any] = {}
    for sn in step_names:
        anth_vals = agg[sn]["anthropic"]
        deep_vals = agg[sn]["deepseek"]
        agg_summary[sn] = {
            "anthropic_mean": round(sum(anth_vals) / len(anth_vals), 3) if anth_vals else None,
            "anthropic_range": [round(min(anth_vals), 3), round(max(anth_vals), 3)] if anth_vals else None,
            "deepseek_mean": round(sum(deep_vals) / len(deep_vals), 3) if deep_vals else None,
            "deepseek_range": [round(min(deep_vals), 3), round(max(deep_vals), 3)] if deep_vals else None,
        }

    all_data["aggregated_deltas"] = agg_summary

    # ── Save JSON ──────────────────────────────────────────────────────────────
    json_path = results_dir / f"brainstorming-council-tier-test-3q-{timestamp}.json"
    json_path.write_text(json.dumps(all_data, indent=2))
    print(f"\nWrote {json_path}")

    # Validate JSON
    try:
        import subprocess
        result = subprocess.run(
            ["python3", "-m", "json.tool", str(json_path)],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            print(f"WARNING: JSON validation failed: {result.stderr}")
        else:
            print("JSON validation: OK")
    except Exception as e:
        print(f"JSON validation check failed: {e}")

    # ── Write the markdown report ──────────────────────────────────────────────
    write_markdown_report(all_data, json_path)

    print("\nDone.")


def write_markdown_report(data: dict[str, Any], json_path: Path) -> None:
    """Write BRAINSTORM-TIER-DEBATE-TEST-3Q.md to the repo root."""
    agg = data["aggregated_deltas"]
    results = data["results"]
    lines: list[str] = []

    lines.append("# Brainstorming Council Tier Debate Test — 3-Question Replication")
    lines.append("")
    lines.append(f"**Run date:** {data['run_timestamp'][:8]}")
    lines.append(f"**Branch:** feat/forge-v2-cutover")
    lines.append(f"**Anthropic judge:** {data['judge_anthropic']}")
    lines.append(f"**Non-Anthropic judge:** {data['judge_non_anthropic']} (DeepSeek V4-Pro reasoning model)")
    lines.append(f"**JSON output:** `experiments/results/{json_path.name}`")
    lines.append("")
    lines.append(
        "Per RED-TEAM-PIVOT-PLAN.md line 213: the original single-question test "
        "used only an Anthropic judge. This run extends to 3 questions and "
        "cross-checks with DeepSeek deepseek-reasoner as the non-Anthropic judge."
    )
    lines.append("")

    # Rubric note
    lines.append("## Scoring rubric")
    lines.append("")
    lines.append(
        "Five dimensions, 1-5 scale with 0.5 increments. "
        "Same rubric as the original test (Actionability / Specificity / Strategic Depth / "
        "Voice Consistency / Multi-specialist Coherence). "
        "Composite = mean of all five dimensions."
    )
    lines.append("")
    lines.append("Tier labels: A = Quick Council (Free), B = Full Council (Starter), "
                 "C = Deep Council (Pro), D = Strategy Council (Enterprise).")
    lines.append("")

    # The 3 questions
    lines.append("## Questions used")
    lines.append("")
    for i, q in enumerate(data["questions"], 1):
        lines.append(f"**Q{i} ({q['flavour']}):** {q['question']}")
        lines.append("")
        lines.append(f"Context: {q['context']}")
        lines.append("")

    # Per-question results
    lines.append("## Per-question results")
    lines.append("")

    for i, q in enumerate(data["questions"], 1):
        qid = q["id"]
        q_res = results.get(qid, {})
        lines.append(f"### Q{i}: {q['question']}")
        lines.append("")

        # Rubric scores table
        lines.append("#### Scores by tier and judge")
        lines.append("")
        lines.append("| Tier | Judge | Action. | Spec. | Depth | Voice | Coherence | Composite |")
        lines.append("|---|---|---|---|---|---|---|---|")
        for tier_id in ["A", "B", "C", "D"]:
            t_data = q_res.get("tiers", {}).get(tier_id, {})
            tier_label = TIERS[tier_id]["label"]
            for judge_key, judge_name in [("scores_anthropic", "Anthropic"), ("scores_deepseek", "DeepSeek")]:
                sc = t_data.get(judge_key, {})
                if "error" in sc:
                    lines.append(f"| {tier_label} | {judge_name} | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |")
                else:
                    lines.append(
                        f"| {tier_label} | {judge_name} "
                        f"| {sc.get('actionability', '-')} "
                        f"| {sc.get('specificity', '-')} "
                        f"| {sc.get('strategic_depth', '-')} "
                        f"| {sc.get('voice_consistency', '-')} "
                        f"| {sc.get('multi_specialist_coherence', '-')} "
                        f"| {sc.get('composite', '-')} |"
                    )
        lines.append("")

        # Tier deltas for this question
        d_anth = q_res.get("deltas_anthropic", {})
        d_deep = q_res.get("deltas_deepseek", {})
        lines.append("#### Tier step deltas (composite score)")
        lines.append("")
        lines.append("| Step | Anthropic judge | DeepSeek judge |")
        lines.append("|---|---|---|")
        for sn, label in [("Free_to_Starter", "Free to Starter"), ("Starter_to_Pro", "Starter to Pro"), ("Pro_to_Enterprise", "Pro to Enterprise")]:
            a_val = d_anth.get(sn, "n/a")
            d_val = d_deep.get(sn, "n/a")
            lines.append(f"| {label} | {a_val} | {d_val} |")
        lines.append("")

        # Fiona close summaries (abbreviated)
        lines.append("#### Fiona close synthesis (abbreviated per tier)")
        lines.append("")
        for tier_id in ["A", "B", "C", "D"]:
            t_data = q_res.get("tiers", {}).get(tier_id, {})
            close = t_data.get("transcripts", {}).get("fiona_close", "[missing]")
            # Truncate to first 600 chars for the report
            close_abbrev = close[:600].replace("\n", " ").strip()
            if len(close) > 600:
                close_abbrev += "..."
            lines.append(f"**{TIERS[tier_id]['label']}:** {close_abbrev}")
            lines.append("")

    # Aggregated deltas
    lines.append("## Aggregated tier deltas (mean and range across 3 questions)")
    lines.append("")
    lines.append("| Step | Anthropic mean | Anthropic range | DeepSeek mean | DeepSeek range |")
    lines.append("|---|---|---|---|---|")
    for sn, label in [("Free_to_Starter", "Free to Starter"), ("Starter_to_Pro", "Starter to Pro"), ("Pro_to_Enterprise", "Pro to Enterprise")]:
        a = agg.get(sn, {})
        lines.append(
            f"| {label} "
            f"| {a.get('anthropic_mean', 'n/a')} "
            f"| {a.get('anthropic_range', 'n/a')} "
            f"| {a.get('deepseek_mean', 'n/a')} "
            f"| {a.get('deepseek_range', 'n/a')} |"
        )
    lines.append("")

    # Original 1-question result for comparison
    lines.append("### Original 1-question result (reference)")
    lines.append("")
    lines.append(
        "Original test used a single fundraising question "
        "(\"Should I raise £2M now or hit 100 paying users first?\") "
        "scored by Anthropic judge only."
    )
    lines.append("")
    lines.append("| Step | Original delta (Anthropic judge) |")
    lines.append("|---|---|")
    lines.append("| Free to Starter | +0.16 |")
    lines.append("| Starter to Pro | +0.17 |")
    lines.append("| Pro to Enterprise | +0.00 |")
    lines.append("")

    # Cross-judge agreement
    lines.append("## Cross-judge agreement analysis")
    lines.append("")
    # Compute correlation-style summary
    all_anth: list[float] = []
    all_deep: list[float] = []
    for qid, q_res in results.items():
        for tier_id in ["A", "B", "C", "D"]:
            t_data = q_res.get("tiers", {}).get(tier_id, {})
            a_comp = t_data.get("scores_anthropic", {}).get("composite")
            d_comp = t_data.get("scores_deepseek", {}).get("composite")
            if a_comp is not None and d_comp is not None:
                all_anth.append(float(a_comp))
                all_deep.append(float(d_comp))

    if len(all_anth) >= 2:
        # Mean absolute difference
        diffs = [abs(a - d) for a, d in zip(all_anth, all_deep)]
        mean_diff = round(sum(diffs) / len(diffs), 3)
        max_diff = round(max(diffs), 3)
        # Simple Pearson correlation
        n = len(all_anth)
        mean_a = sum(all_anth) / n
        mean_d = sum(all_deep) / n
        cov = sum((a - mean_a) * (d - mean_d) for a, d in zip(all_anth, all_deep)) / n
        std_a = (sum((a - mean_a) ** 2 for a in all_anth) / n) ** 0.5
        std_d = (sum((d - mean_d) ** 2 for d in all_deep) / n) ** 0.5
        if std_a > 0 and std_d > 0:
            corr = round(cov / (std_a * std_d), 3)
        else:
            corr = None

        lines.append(f"Across {n} tier-question combinations ({len(data['questions'])} questions x 4 tiers):")
        lines.append("")
        lines.append(f"- Anthropic judge composites (all): {[round(x, 2) for x in all_anth]}")
        lines.append(f"- DeepSeek judge composites (all): {[round(x, 2) for x in all_deep]}")
        lines.append(f"- Mean absolute difference between judges: {mean_diff}")
        lines.append(f"- Maximum difference on any single tier/question: {max_diff}")
        lines.append(f"- Pearson correlation between judges: {corr}")
        lines.append("")

        # Agreement on delta direction
        agreement_on_pro_ent = []
        for qid, q_res in results.items():
            a_d = q_res.get("deltas_anthropic", {}).get("Pro_to_Enterprise")
            d_d = q_res.get("deltas_deepseek", {}).get("Pro_to_Enterprise")
            if a_d is not None and d_d is not None:
                agreement_on_pro_ent.append({
                    "qid": qid,
                    "anthropic": a_d,
                    "deepseek": d_d,
                    "same_direction": (a_d >= 0) == (d_d >= 0),
                    "both_below_0_10": abs(a_d) < 0.10 and abs(d_d) < 0.10,
                })

        if agreement_on_pro_ent:
            lines.append("#### Pro to Enterprise delta agreement (the critical question)")
            lines.append("")
            lines.append("| Question | Anthropic delta | DeepSeek delta | Both below +0.10 |")
            lines.append("|---|---|---|---|")
            for row in agreement_on_pro_ent:
                lines.append(f"| {row['qid']} | {row['anthropic']} | {row['deepseek']} | {row['both_below_0_10']} |")
            lines.append("")

    # Verdict
    lines.append("## Verdict on the Strategy Council reposition decision")
    lines.append("")

    # Derive the verdict from the data
    pro_ent_anth = agg.get("Pro_to_Enterprise", {}).get("anthropic_mean")
    pro_ent_deep = agg.get("Pro_to_Enterprise", {}).get("deepseek_mean")
    pro_ent_anth_range = agg.get("Pro_to_Enterprise", {}).get("anthropic_range", [None, None])
    pro_ent_deep_range = agg.get("Pro_to_Enterprise", {}).get("deepseek_range", [None, None])

    if pro_ent_anth is not None and pro_ent_deep is not None:
        anth_below_threshold = pro_ent_anth < 0.10
        deep_below_threshold = pro_ent_deep < 0.10
        any_q_above_010_anth = pro_ent_anth_range[1] is not None and pro_ent_anth_range[1] > 0.10
        any_q_above_010_deep = pro_ent_deep_range[1] is not None and pro_ent_deep_range[1] > 0.10

        lines.append(
            "The reposition decision is: if Pro-to-Enterprise shows near-zero improvement "
            "across multiple questions AND a non-Anthropic judge concurs, the Strategy Council "
            "adds marginal value as currently built (extended thinking on Opus). "
            "This supports repositioning Enterprise to deliver value through RAG over foundry data "
            "rather than extended thinking budget."
        )
        lines.append("")
        lines.append(f"Anthropic judge Pro-to-Enterprise mean: {pro_ent_anth} (range: {pro_ent_anth_range})")
        lines.append(f"DeepSeek judge Pro-to-Enterprise mean: {pro_ent_deep} (range: {pro_ent_deep_range})")
        lines.append("")

        if anth_below_threshold and deep_below_threshold and not any_q_above_010_anth and not any_q_above_010_deep:
            lines.append(
                "**VERDICT: The reposition decision is SUPPORTED.** "
                "Both judges score Pro-to-Enterprise mean below +0.10 across all 3 questions. "
                "No individual question showed a delta above +0.10 on either judge. "
                "Extended thinking on Opus does not produce a measurable uplift at the composite level "
                "for these question types. "
                "Repositioning Enterprise to RAG-augmented context (foundry data) is the correct direction."
            )
        elif anth_below_threshold and deep_below_threshold and (any_q_above_010_anth or any_q_above_010_deep):
            lines.append(
                "**VERDICT: The reposition decision is PARTIALLY SUPPORTED.** "
                "Both judges agree the Pro-to-Enterprise mean is below +0.10. "
                "However, at least one question showed a delta above +0.10 on one judge. "
                "This weakens but does not reverse the reposition decision. "
                "Proceed with repositioning but monitor the question flavour "
                "that showed above-threshold improvement."
            )
        elif not anth_below_threshold and deep_below_threshold:
            lines.append(
                "**VERDICT: MIXED. Anthropic judge does not agree with the near-zero finding. "
                "DeepSeek judge concurs. The data is ambiguous — do not use this as a hard pricing rule without further testing.**"
            )
        elif anth_below_threshold and not deep_below_threshold:
            lines.append(
                "**VERDICT: MIXED. Anthropic judge shows near-zero improvement; "
                "DeepSeek judge disagrees. Possible Anthropic-self-rating bias remains. "
                "Do not use this run as a hard pricing rule.**"
            )
        else:
            lines.append(
                "**VERDICT: The reposition decision is NOT SUPPORTED by this run. "
                "Both judges detect meaningful Pro-to-Enterprise improvement above +0.10. "
                "Extended thinking on Opus does add measurable value. "
                "Do not reposition Enterprise away from extended thinking without further investigation.**"
            )
    else:
        lines.append(
            "**VERDICT: Could not compute — insufficient score data. "
            "Check JSON output for errors.**"
        )

    lines.append("")

    # Caveats
    lines.append("## Caveats and limitations")
    lines.append("")
    lines.append(
        "1. Rubric scores are from an LLM judge, not human evaluators. "
        "LLM-as-judge benchmarks are calibration tools, not ground truth."
    )
    lines.append(
        "2. DeepSeek deepseek-reasoner is non-Anthropic but is itself a reasoning model "
        "that may share some biases with Claude's reasoning chains. "
        "A fully independent judge (e.g. a human panel) would be more rigorous."
    )
    lines.append(
        "3. The 5-dimension rubric does not capture founder usability, "
        "willingness to pay, or churn reduction — all relevant to pricing decisions."
    )
    lines.append(
        "4. Three questions is a small sample. "
        "Variance across question flavours is visible in the range column above."
    )
    lines.append("")

    # Footer
    lines.append("---")
    lines.append(f"*Generated by `experiments/brainstorming-council-tier-test-3q.py`. "
                 f"Full outputs in `{json_path.name}`.*")

    md_path = REPO_ROOT / "BRAINSTORM-TIER-DEBATE-TEST-3Q.md"
    md_path.write_text("\n".join(lines))
    print(f"Wrote {md_path}")


if __name__ == "__main__":
    main()
