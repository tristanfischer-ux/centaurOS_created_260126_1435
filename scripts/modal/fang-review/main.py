"""
Modal app: forgeos-fang-review

PURPOSE
-------
Runs the long-running Fang (VP Manufacturing) per-module CAD review LLM call
on Modal serverless infrastructure, where containers have unlimited runtime
budget instead of Vercel's 22-minute hard cap.

CONTEXT
-------
Fang reviews can take 15-25 minutes per module on aerospace-class designs:
- Anthropic Sonnet tool-loop with up to MAX_TOOL_LOOPS=5 iterations
- Each iteration may call multiple tools in parallel (engineering compute,
  material lookups, supplier search) — some of those tools themselves run on
  Modal and take 1-5 minutes.
- Aggregated wall-clock breaches Vercel's hard SIGKILL ceiling and the
  pipeline_runs row stays at 'running' until the watchdog flips it.

This Modal app moves the LLM tool-loop to Modal:
- Vercel TS wrapper builds the prompt + tools-as-JSON-schema + memory context
  locally (fast, <1s), POSTs everything here.
- This Modal function holds the connection while running the LLM tool-loop.
  For each tool call, it calls back into a Vercel endpoint
  (`tool_callback_url`) which dispatches the existing tool handler.
  Each tool callback fits within Vercel's 300s budget easily.
- Returns final markdown text + tool calculations trace.
- Vercel TS wrapper continues normally: parses markdown, persists review,
  runs cascade, derives canonical_specs patches.

CONTRACT
--------
The Vercel-side wrapper is the source of truth for prompt-building. This
Modal app is intentionally dumb — it does not know about specialists, the
canonical_specs ledger, project shape, or persistence. Its only job is to
hold an LLM tool-loop open and proxy tool calls back to Vercel.

This keeps the Fang specialist contract identical: same prompt, same tools,
same markdown shape out, same Block G #11b extractor input.

PROVIDER ROUTING
----------------
FANG_MODEL_PROVIDER env var (read from forgeos-fang-secrets):
  - "anthropic" (default, safe rollback): uses Anthropic SDK + ANTHROPIC_API_KEY
  - "openrouter": uses OpenRouter chat-completions API (OpenAI-compatible)
    with deepseek/deepseek-v4-pro. Requires OPENROUTER_API_KEY.

Tool-call format translation (handled internally — Vercel callback unchanged):
  Anthropic:   response.content[i].type == "tool_use",  .id / .name / .input (dict)
  OpenRouter:  response["choices"][0]["message"]["tool_calls"][i],
               .id / .function.name / .function.arguments (JSON string)

Tool result format on messages (handled internally — Vercel callback unchanged):
  Anthropic:   {"type": "tool_result", "tool_use_id": id, "content": str}
  OpenRouter:  {"role": "tool", "tool_call_id": id, "content": str}

The /api/internal/fang-call-tool Vercel endpoint is NOT changed — it sees
the same request_id / tool_name / tool_input / ctx payload regardless of
which LLM provider is running the loop.

Rollback: unset FANG_MODEL_PROVIDER (or set to "anthropic") to revert to
Anthropic-Sonnet. One env var flip, zero code changes needed.

DEPLOY
------
modal deploy scripts/modal/fang-review/main.py

ENV / SECRETS (Modal Secret: "forgeos-fang-secrets")
- FANG_AUTH_TOKEN          — HMAC-style shared secret, header `X-Auth-Token`
- ANTHROPIC_API_KEY        — for the Anthropic path (default)
- OPENROUTER_API_KEY       — for the OpenRouter path (FANG_MODEL_PROVIDER=openrouter)
- FANG_MODEL_PROVIDER      — "anthropic" (default) | "openrouter"
- (no Supabase needed here — Vercel writes the review)
"""

import json
import os
import time
from typing import Any

import modal

# fastapi is not installed in the modal CLI's local venv (it IS installed in
# the Modal container image via pip_install above). This try/except lets
# `modal deploy` import the file without error. At container startup, the
# real fastapi.Request class is resolved and FastAPI correctly treats `request`
# as an injection target (not a query parameter).
try:
    from fastapi import Request as _FastAPIRequest
except ImportError:  # pragma: no cover — only hits at deploy-time parse
    _FastAPIRequest = None  # type: ignore[assignment,misc]


# ──────────────────────────────────────────────────────────────────────
# Modal app + image
# ──────────────────────────────────────────────────────────────────────

app = modal.App("forgeos-fang-review")

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "anthropic==0.40.0",
        "httpx==0.27.2",
        "pydantic==2.9.2",
        "fastapi[standard]==0.115.0",
        # openai package provides the typed chat-completions client used by the
        # OpenRouter path. OpenRouter's API is OpenAI-compatible, so the same
        # client works with a base_url swap. No separate openrouter SDK needed.
        "openai==1.58.1",
    )
)

# OpenRouter base URL and default model for the openrouter provider path.
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_FANG_MODEL = "deepseek/deepseek-v4-pro"

# HTTP referrer / app title sent to OpenRouter for analytics attribution.
OPENROUTER_SITE_URL = "https://fractionalforge.app"
OPENROUTER_APP_TITLE = "ForgeOS-Fang"

# Container timeout: 30 min. Vercel's hard cap is 22 min — this gives
# headroom for the 15-25 min observed Fang runs plus margin. Anthropic SDK
# already enforces a 240s per-call timeout inside the loop, so a stuck
# single LLM call still surfaces.
MODAL_TIMEOUT_SECONDS = 30 * 60

# Anthropic SDK params (mirror cad-lab-reviews.ts so production stays parity)
ANTHROPIC_TIMEOUT_MS = 240_000
ANTHROPIC_MAX_RETRIES = 2

DEFAULT_MAX_TOOL_LOOPS = 5
DEFAULT_MAX_TOKENS = 16_384

# Shared secret name on Modal — set via `modal secret create forgeos-fang-secrets ...`
FANG_SECRET_NAME = "forgeos-fang-secrets"


# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────


def _truncate(s: str, n: int = 200) -> str:
    s = s or ""
    return s if len(s) <= n else s[:n] + "…"


def _describe_tool_call(tool_name: str, tool_input: dict) -> str:
    """Mirror src/lib/agents/tools/registry.ts describeToolCall — best effort."""
    try:
        if not isinstance(tool_input, dict):
            return tool_name
        keys = ", ".join(f"{k}={_truncate(str(v), 40)}" for k, v in list(tool_input.items())[:3])
        return f"{tool_name}({keys})"
    except Exception:
        return tool_name


# ──────────────────────────────────────────────────────────────────────
# Shared tool-callback helper
# ──────────────────────────────────────────────────────────────────────


def _execute_tool_via_callback(
    tool_name: str,
    tool_input: dict,
    tool_use_id: str,
    tool_callback_url: str,
    tool_callback_token: str,
    tool_callback_ctx: dict,
    callback_client: Any,
    request_id: str,
    calculations: list,
) -> str:
    """
    POST one tool invocation to the Vercel callback endpoint and return the
    result string. Appends to `calculations` in-place.

    The callback contract is provider-agnostic: the Vercel handler at
    /api/internal/fang-call-tool only sees tool_name / tool_input / ctx and
    returns { ok, result }. It does NOT know which LLM provider initiated the
    call, so neither the Anthropic nor the OpenRouter path needs to change the
    callback.
    """
    try:
        cb_resp = callback_client.post(
            tool_callback_url,
            json={
                "request_id": request_id,
                "tool_name": tool_name,
                "tool_input": tool_input,
                "ctx": tool_callback_ctx,
            },
            headers={
                "Authorization": f"Bearer {tool_callback_token}",
                "Content-Type": "application/json",
            },
        )
        if cb_resp.status_code != 200:
            result_str = (
                f"Tool callback failed: HTTP {cb_resp.status_code} — "
                f"{_truncate(cb_resp.text or '', 400)}"
            )
        else:
            cb_json = cb_resp.json()
            # The callback returns { ok, result } where result is a string
            if cb_json.get("ok") and isinstance(cb_json.get("result"), str):
                result_str = cb_json["result"]
            else:
                result_str = f"Tool error: {cb_json.get('error') or 'unknown'}"
    except Exception as cb_err:  # pragma: no cover
        result_str = f"Tool callback exception: {cb_err}"

    calculations.append({
        "tool": tool_name,
        "description": _describe_tool_call(tool_name, tool_input),
        "result": _truncate(result_str, 200),
    })
    return result_str


# ──────────────────────────────────────────────────────────────────────
# Anthropic tool-loop (existing path — preserved byte-for-byte in logic)
# ──────────────────────────────────────────────────────────────────────


def _run_anthropic_loop(
    *,
    anthropic_key: str,
    model: str,
    system_prompt: str,
    messages: list,
    tools: list,
    max_tokens: int,
    max_tool_loops: int,
    tool_callback_url: str,
    tool_callback_token: str,
    tool_callback_ctx: dict,
    callback_client: Any,
    request_id: str,
) -> tuple:
    """
    Run the Anthropic tool-loop and return (final_text, calculations, loop_count).

    This is the original logic from run_fang_review, extracted into a helper so
    it lives alongside the new OpenRouter path without any behavioural change.
    The Anthropic path is the safe rollback target — do NOT modify its logic.
    """
    from anthropic import Anthropic

    client = Anthropic(
        api_key=anthropic_key,
        timeout=ANTHROPIC_TIMEOUT_MS / 1000.0,
        max_retries=ANTHROPIC_MAX_RETRIES,
    )

    create_params: dict = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system_prompt,
        "messages": list(messages),
    }
    if tools:
        create_params["tools"] = tools
        create_params["tool_choice"] = {"type": "auto"}

    final_text = ""
    calculations: list = []
    loop_count = 0

    while loop_count <= max_tool_loops:
        response = client.messages.create(**create_params)
        content = response.content or []

        turn_text = ""
        tool_use_blocks: list = []
        for block in content:
            btype = getattr(block, "type", None)
            if btype == "text":
                turn_text += getattr(block, "text", "") or ""
            elif btype == "tool_use":
                tool_use_blocks.append({
                    "id": getattr(block, "id", ""),
                    "name": getattr(block, "name", ""),
                    "input": getattr(block, "input", {}) or {},
                })

        if not tool_use_blocks or loop_count >= max_tool_loops:
            final_text = turn_text
            break

        tool_results = []
        for tb in tool_use_blocks:
            result_str = _execute_tool_via_callback(
                tool_name=tb["name"],
                tool_input=tb["input"],
                tool_use_id=tb["id"],
                tool_callback_url=tool_callback_url,
                tool_callback_token=tool_callback_token,
                tool_callback_ctx=tool_callback_ctx,
                callback_client=callback_client,
                request_id=request_id,
                calculations=calculations,
            )
            # Anthropic tool result format
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tb["id"],
                "content": result_str,
            })

        # Rebuild assistant content block list (same shape as TS wrapper)
        assistant_content = [
            {
                "type": getattr(b, "type", "text"),
                **(
                    {"text": getattr(b, "text", "")} if getattr(b, "type", "") == "text"
                    else {}
                ),
                **(
                    {
                        "id": getattr(b, "id", ""),
                        "name": getattr(b, "name", ""),
                        "input": getattr(b, "input", {}) or {},
                    }
                    if getattr(b, "type", "") == "tool_use"
                    else {}
                ),
            }
            for b in content
        ]

        msgs = list(create_params["messages"])
        msgs.append({"role": "assistant", "content": assistant_content})
        loop_count += 1
        remaining = max_tool_loops - loop_count
        msgs.append({
            "role": "user",
            "content": [
                *tool_results,
                {
                    "type": "text",
                    "text": (
                        f"[System: {remaining} tool call"
                        f"{'' if remaining == 1 else 's'} remaining]"
                    ),
                },
            ],
        })
        create_params["messages"] = msgs

    return final_text, calculations, loop_count


# ──────────────────────────────────────────────────────────────────────
# OpenRouter tool-loop (Decision 1 — DeepSeek V4 Pro via OpenRouter)
# ──────────────────────────────────────────────────────────────────────
#
# OpenRouter exposes an OpenAI-compatible chat-completions endpoint. Tool-call
# format follows OpenAI conventions:
#
#   REQUEST  — tools array:
#     Anthropic: [{name, description, input_schema}]
#     OpenAI:    [{type: "function", function: {name, description, parameters}}]
#     -> translate anthropicTools -> oaiTools on entry
#
#   RESPONSE — tool invocations:
#     Anthropic: response.content[i].type == "tool_use",  .id / .name / .input (dict)
#     OpenAI:    response.choices[0].message.tool_calls[i],
#                .id / .function.name / .function.arguments (JSON string)
#     -> translate on extraction
#
#   MESSAGES — tool results injected back:
#     Anthropic: user-role message with content list containing
#                {type:"tool_result", tool_use_id:id, content:str}
#     OpenAI:    separate message per result:
#                {role:"tool", tool_call_id:id, content:str}
#     -> translate on injection
#
#   SYSTEM prompt:
#     Anthropic: top-level "system" param
#     OpenAI:    {"role": "system", "content": system_prompt} prepended to messages
#
# The Vercel tool-callback endpoint (/api/internal/fang-call-tool) is
# NOT changed — it sees the same provider-agnostic payload regardless of
# which LLM is running the loop.
# ──────────────────────────────────────────────────────────────────────


def _anthropic_tools_to_openai(anthropic_tools: list) -> list:
    """
    Translate Anthropic tool definitions to OpenAI function-calling format.

    Anthropic:  {name, description, input_schema}  (input_schema is JSON Schema)
    OpenAI:     {type:"function", function:{name, description, parameters}}
    """
    result = []
    for t in anthropic_tools:
        result.append({
            "type": "function",
            "function": {
                "name": t.get("name", ""),
                "description": t.get("description", ""),
                "parameters": t.get("input_schema", {"type": "object", "properties": {}}),
            },
        })
    return result


def _run_openrouter_loop(
    *,
    openrouter_key: str,
    model: str,
    system_prompt: str,
    messages: list,
    tools: list,
    max_tokens: int,
    max_tool_loops: int,
    tool_callback_url: str,
    tool_callback_token: str,
    tool_callback_ctx: dict,
    callback_client: Any,
    request_id: str,
) -> tuple:
    """
    Run the OpenRouter tool-loop (DeepSeek V4 Pro) and return
    (final_text, calculations, loop_count).

    Uses the OpenAI Python client with base_url=openrouter.ai — OpenRouter's
    API is a strict superset of the OpenAI chat-completions spec. Tools are
    translated from Anthropic format on entry; tool-call responses are
    translated back to the neutral format used by _execute_tool_via_callback.

    The Vercel callback at /api/internal/fang-call-tool is unchanged — it
    receives the same {request_id, tool_name, tool_input, ctx} payload and
    returns {ok, result: string} regardless of which LLM provider called it.
    """
    from openai import OpenAI

    or_client = OpenAI(
        api_key=openrouter_key,
        base_url=OPENROUTER_BASE_URL,
        timeout=ANTHROPIC_TIMEOUT_MS / 1000.0,  # same per-call timeout as Anthropic path
        default_headers={
            # OpenRouter attribution headers (optional but good practice)
            "HTTP-Referer": OPENROUTER_SITE_URL,
            "X-Title": OPENROUTER_APP_TITLE,
        },
        max_retries=ANTHROPIC_MAX_RETRIES,
    )

    # Translate tool definitions: Anthropic -> OpenAI format
    oai_tools = _anthropic_tools_to_openai(tools) if tools else []

    # OpenAI-style messages: system goes as first message, not a top-level param
    oai_messages: list = [{"role": "system", "content": system_prompt}]
    for msg in messages:
        # Input messages from Vercel are already in Anthropic/OpenAI-compatible
        # format (role + content string) for the initial user turn.
        # Deep-copy to avoid mutating the caller's list.
        oai_messages.append(dict(msg))

    final_text = ""
    calculations: list = []
    loop_count = 0

    while loop_count <= max_tool_loops:
        # DeepSeek V4 Pro via OpenRouter requires max_tokens <= 8192 (hard API
        # limit — requests above this return HTTP 400). The incoming max_tokens
        # from Vercel is 16384 (Sonnet-class default), so clamp it here.
        # This matches the clamp in streamDeepSeek (commit c7ae580b).
        clamped_max_tokens = min(max_tokens, 8192)

        call_kwargs: dict = {
            "model": model,
            "messages": oai_messages,
            "max_tokens": clamped_max_tokens,
        }
        if oai_tools:
            call_kwargs["tools"] = oai_tools
            call_kwargs["tool_choice"] = "auto"

        response = or_client.chat.completions.create(**call_kwargs)

        choice = response.choices[0] if response.choices else None
        if not choice:
            # Empty response — treat as final (no text)
            break

        msg_obj = choice.message

        # Extract text from this turn
        turn_text = msg_obj.content or ""

        # Extract tool calls (OpenAI format: .tool_calls list)
        raw_tool_calls = msg_obj.tool_calls or []
        tool_use_blocks: list = []
        for tc in raw_tool_calls:
            try:
                arguments_str = tc.function.arguments or "{}"
                tool_input = json.loads(arguments_str)
            except (json.JSONDecodeError, AttributeError):
                tool_input = {}
            tool_use_blocks.append({
                "id": tc.id or "",
                "name": tc.function.name if tc.function else "",
                "input": tool_input,
            })

        if not tool_use_blocks or loop_count >= max_tool_loops:
            final_text = turn_text
            break

        # ── Execute tool calls via Vercel callback ─────────────────────
        # Append the assistant message (with tool_calls) before injecting results.
        # OpenAI requires the raw assistant message object in the messages list.
        oai_messages.append({
            "role": "assistant",
            "content": turn_text or None,  # None if text is empty (pure tool call turn)
            "tool_calls": [
                {
                    "id": tb["id"],
                    "type": "function",
                    "function": {
                        "name": tb["name"],
                        "arguments": json.dumps(tb["input"]),
                    },
                }
                for tb in tool_use_blocks
            ],
        })

        for tb in tool_use_blocks:
            result_str = _execute_tool_via_callback(
                tool_name=tb["name"],
                tool_input=tb["input"],
                tool_use_id=tb["id"],
                tool_callback_url=tool_callback_url,
                tool_callback_token=tool_callback_token,
                tool_callback_ctx=tool_callback_ctx,
                callback_client=callback_client,
                request_id=request_id,
                calculations=calculations,
            )
            # OpenAI tool result format: separate message per tool call
            oai_messages.append({
                "role": "tool",
                "tool_call_id": tb["id"],
                "content": result_str,
            })

        loop_count += 1
        remaining = max_tool_loops - loop_count
        # Inject the remaining-budget hint as a user message (mirrors Anthropic path)
        oai_messages.append({
            "role": "user",
            "content": (
                f"[System: {remaining} tool call"
                f"{'' if remaining == 1 else 's'} remaining]"
            ),
        })

    return final_text, calculations, loop_count


# ──────────────────────────────────────────────────────────────────────
# Main function — routes between Anthropic and OpenRouter loops
# ──────────────────────────────────────────────────────────────────────


@app.function(
    image=image,
    secrets=[modal.Secret.from_name(FANG_SECRET_NAME)],
    timeout=MODAL_TIMEOUT_SECONDS,
    # Modal serverless: scale-to-zero between calls; first call cold-starts.
    # min_containers kept at 0 — Fang fires per-module, bursty, OK to cold-start.
)
@modal.fastapi_endpoint(method="POST")
def run_fang_review(payload: dict, request: _FastAPIRequest) -> dict:  # noqa: D401
    """
    HTTP entrypoint for Vercel TS wrapper.

    Expected JSON shape:
    {
      "auth_token":          "<X-Auth-Token>" (also accepted in header),
      "request_id":          "<uuid>" (echoed in logs/return for tracing),
      "model":               "claude-sonnet-4-6",
      "system":              "<full specialist system prompt>",
      "messages":            [ {role, content}, ... ] (Anthropic shape),
      "tools":               [ {name, description, input_schema}, ... ] (Anthropic shape),
      "max_tokens":          16384,
      "max_tool_loops":      5,
      "tool_callback_url":   "https://fractionalforge.app/api/internal/fang-execute-tool",
      "tool_callback_token": "<bearer for the callback endpoint>",
      "tool_callback_ctx":   { "foundryId": "...", "specialistId": "...", "userId": "..." },
    }

    Returns:
    {
      "ok":               true,
      "request_id":       "<echoed>",
      "final_text":       "<markdown>",
      "calculations":     [ {tool, description, result}, ... ],
      "tool_loop_count":  <int>,
      "elapsed_ms":       <int>,
      "model":            "<echoed>",
      "provider":         "anthropic" | "openrouter"
    }

    Errors return:
    { "ok": false, "error": "...", "errorCode": "...", "request_id": "..." }
    """
    import httpx

    started_at = time.time()
    request_id = (payload or {}).get("request_id") or "no-request-id"

    # ── Health mode (no auth required, no LLM work) ────────────────────
    # Used by smoke tests to verify the deployment is reachable. Folded
    # into this endpoint to stay under Modal's free-tier 8-endpoint cap.
    if (payload or {}).get("mode") == "health":
        provider_env = (os.environ.get("FANG_MODEL_PROVIDER") or "anthropic").strip().lower()
        return {
            "ok": True,
            "app": "forgeos-fang-review",
            "provider": provider_env,
            "anthropic_key_present": bool((os.environ.get("ANTHROPIC_API_KEY") or "").strip()),
            "openrouter_key_present": bool((os.environ.get("OPENROUTER_API_KEY") or "").strip()),
            "auth_token_present": bool((os.environ.get("FANG_AUTH_TOKEN") or "").strip()),
            "max_timeout_seconds": MODAL_TIMEOUT_SECONDS,
        }

    # ── Auth ───────────────────────────────────────────────────────────
    expected_token = (os.environ.get("FANG_AUTH_TOKEN") or "").strip()
    if not expected_token:
        return {
            "ok": False,
            "error": "Server misconfigured — FANG_AUTH_TOKEN not set on Modal secret",
            "errorCode": "MODAL_MISCONFIGURED",
            "request_id": request_id,
        }

    header_token = ""
    try:
        header_token = (request.headers.get("X-Auth-Token") or "").strip()
    except Exception:
        pass
    body_token = (payload or {}).get("auth_token", "")
    body_token = body_token.strip() if isinstance(body_token, str) else ""

    if header_token != expected_token and body_token != expected_token:
        return {
            "ok": False,
            "error": "Unauthorised",
            "errorCode": "UNAUTHORIZED",
            "request_id": request_id,
        }

    # ── Validate payload ───────────────────────────────────────────────
    try:
        model = str(payload["model"]).strip()
        system_prompt = str(payload["system"])
        messages = list(payload["messages"])
        tools = list(payload.get("tools") or [])
        max_tokens = int(payload.get("max_tokens") or DEFAULT_MAX_TOKENS)
        max_tool_loops = int(payload.get("max_tool_loops") or DEFAULT_MAX_TOOL_LOOPS)
        tool_callback_url = str(payload.get("tool_callback_url") or "").strip()
        tool_callback_token = str(payload.get("tool_callback_token") or "").strip()
        tool_callback_ctx = dict(payload.get("tool_callback_ctx") or {})
    except (KeyError, ValueError, TypeError) as e:
        return {
            "ok": False,
            "error": f"Bad payload shape: {e}",
            "errorCode": "BAD_PAYLOAD",
            "request_id": request_id,
        }

    if tools and not tool_callback_url:
        return {
            "ok": False,
            "error": "tools provided but tool_callback_url is empty",
            "errorCode": "BAD_PAYLOAD",
            "request_id": request_id,
        }

    # ── Provider selection ─────────────────────────────────────────────
    # FANG_MODEL_PROVIDER controls which LLM backend runs the tool-loop.
    # Default is "anthropic" — safe rollback target, untouched code path.
    # Set to "openrouter" to use DeepSeek V4 Pro via OpenRouter's
    # OpenAI-compatible API (audit Decision 1).
    provider = (os.environ.get("FANG_MODEL_PROVIDER") or "anthropic").strip().lower()
    if provider not in ("anthropic", "openrouter"):
        return {
            "ok": False,
            "error": (
                f"Unknown FANG_MODEL_PROVIDER value: {provider!r}. "
                "Must be 'anthropic' or 'openrouter'."
            ),
            "errorCode": "MODAL_MISCONFIGURED",
            "request_id": request_id,
        }

    # Validate the relevant API key for the selected provider
    anthropic_key = ""
    openrouter_key = ""
    if provider == "openrouter":
        openrouter_key = (os.environ.get("OPENROUTER_API_KEY") or "").strip()
        if not openrouter_key:
            return {
                "ok": False,
                "error": (
                    "OPENROUTER_API_KEY missing from Modal secret "
                    "(required when FANG_MODEL_PROVIDER=openrouter)"
                ),
                "errorCode": "MODAL_MISCONFIGURED",
                "request_id": request_id,
            }
    else:
        anthropic_key = (os.environ.get("ANTHROPIC_API_KEY") or "").strip()
        if not anthropic_key:
            return {
                "ok": False,
                "error": "ANTHROPIC_API_KEY missing from Modal secret",
                "errorCode": "MODAL_MISCONFIGURED",
                "request_id": request_id,
            }

    # On the openrouter path, ignore the model from the payload — we always
    # use OPENROUTER_FANG_MODEL (DeepSeek V4 Pro). The incoming `model` field
    # is Sonnet-class and is meaningless to OpenRouter.
    effective_model = OPENROUTER_FANG_MODEL if provider == "openrouter" else model

    print(
        f"[fang-modal] request_id={request_id} provider={provider} model={effective_model} "
        f"tools={len(tools)} max_tool_loops={max_tool_loops} max_tokens={max_tokens}"
    )

    # ── HTTP client for tool callbacks ─────────────────────────────────
    # Per-tool-call timeout: 4 minutes. Vercel's 300s budget for a single
    # callback should comfortably hold all the tool handlers including
    # engineering-compute (which itself dispatches to Modal). Generous
    # pool, since we serialise tool calls within a turn anyway via httpx
    # connection reuse. We do NOT retry tool callbacks here — a failed
    # tool returns its error string into the model, same as in TS.
    callback_timeout = httpx.Timeout(connect=10.0, read=240.0, write=30.0, pool=10.0)
    callback_client = httpx.Client(timeout=callback_timeout)

    final_text = ""
    calculations: list = []
    loop_count = 0

    try:
        if provider == "openrouter":
            final_text, calculations, loop_count = _run_openrouter_loop(
                openrouter_key=openrouter_key,
                model=effective_model,
                system_prompt=system_prompt,
                messages=messages,
                tools=tools,
                max_tokens=max_tokens,
                max_tool_loops=max_tool_loops,
                tool_callback_url=tool_callback_url,
                tool_callback_token=tool_callback_token,
                tool_callback_ctx=tool_callback_ctx,
                callback_client=callback_client,
                request_id=request_id,
            )
        else:
            final_text, calculations, loop_count = _run_anthropic_loop(
                anthropic_key=anthropic_key,
                model=model,
                system_prompt=system_prompt,
                messages=messages,
                tools=tools,
                max_tokens=max_tokens,
                max_tool_loops=max_tool_loops,
                tool_callback_url=tool_callback_url,
                tool_callback_token=tool_callback_token,
                tool_callback_ctx=tool_callback_ctx,
                callback_client=callback_client,
                request_id=request_id,
            )

        elapsed_ms = int((time.time() - started_at) * 1000)
        print(
            f"[fang-modal] request_id={request_id} provider={provider} done "
            f"loops={loop_count} text_len={len(final_text)} "
            f"calculations={len(calculations)} elapsed_ms={elapsed_ms}"
        )
        return {
            "ok": True,
            "request_id": request_id,
            "final_text": final_text,
            "calculations": calculations,
            "tool_loop_count": loop_count,
            "elapsed_ms": elapsed_ms,
            "model": effective_model,
            "provider": provider,
        }

    except Exception as err:  # pragma: no cover
        elapsed_ms = int((time.time() - started_at) * 1000)
        msg = f"{type(err).__name__}: {err}"
        print(
            f"[fang-modal] request_id={request_id} provider={provider} "
            f"ERROR after {elapsed_ms}ms: {msg}"
        )
        return {
            "ok": False,
            "error": msg[:1000],
            "errorCode": "MODAL_RUNTIME_ERROR",
            "request_id": request_id,
            "elapsed_ms": elapsed_ms,
            "tool_loop_count": loop_count,
        }
    finally:
        try:
            callback_client.close()
        except Exception:
            pass


# Health check is folded into run_fang_review under `payload = {"mode": "health"}`
# rather than a separate endpoint, to stay under Modal's free-tier 8-endpoint
# cap. The handler short-circuits the health-mode branch before any LLM work.
