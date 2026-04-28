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
- This Modal function holds the connection while running the Anthropic
  tool-loop. For each tool call, it calls back into a Vercel endpoint
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
hold an Anthropic tool-loop open and proxy tool calls back to Vercel.

This keeps the Fang specialist contract identical: same prompt, same model,
same tools, same markdown shape out, same Block G #11b extractor input.

DEPLOY
------
modal deploy scripts/modal/fang-review/main.py

ENV / SECRETS (Modal Secret: "forgeos-fang-secrets")
- FANG_AUTH_TOKEN          — HMAC-style shared secret, header `X-Auth-Token`
- ANTHROPIC_API_KEY        — for the LLM call
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
    )
)

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
# Main function — runs the Anthropic tool loop
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
      "model":            "<echoed>"
    }

    Errors return:
    { "ok": false, "error": "...", "errorCode": "...", "request_id": "..." }
    """
    import httpx
    from anthropic import Anthropic

    started_at = time.time()
    request_id = (payload or {}).get("request_id") or "no-request-id"

    # ── Health mode (no auth required, no LLM work) ────────────────────
    # Used by smoke tests to verify the deployment is reachable. Folded
    # into this endpoint to stay under Modal's free-tier 8-endpoint cap.
    if (payload or {}).get("mode") == "health":
        return {
            "ok": True,
            "app": "forgeos-fang-review",
            "anthropic_key_present": bool((os.environ.get("ANTHROPIC_API_KEY") or "").strip()),
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

    anthropic_key = (os.environ.get("ANTHROPIC_API_KEY") or "").strip()
    if not anthropic_key:
        return {
            "ok": False,
            "error": "ANTHROPIC_API_KEY missing from Modal secret",
            "errorCode": "MODAL_MISCONFIGURED",
            "request_id": request_id,
        }

    print(
        f"[fang-modal] request_id={request_id} model={model} "
        f"tools={len(tools)} max_tool_loops={max_tool_loops} max_tokens={max_tokens}"
    )

    # ── Anthropic client ───────────────────────────────────────────────
    client = Anthropic(
        api_key=anthropic_key,
        timeout=ANTHROPIC_TIMEOUT_MS / 1000.0,
        max_retries=ANTHROPIC_MAX_RETRIES,
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

    create_params: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system_prompt,
        "messages": messages,
    }
    if tools:
        create_params["tools"] = tools
        create_params["tool_choice"] = {"type": "auto"}

    final_text = ""
    calculations: list[dict] = []
    loop_count = 0

    try:
        while loop_count <= max_tool_loops:
            response = client.messages.create(**create_params)
            content = response.content or []

            # Extract any text from this turn
            turn_text = ""
            tool_use_blocks: list[dict] = []
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
                # Final response — use this turn's text
                final_text = turn_text
                break

            # ── Execute tool calls via Vercel callback ─────────────
            tool_results = []
            for tb in tool_use_blocks:
                tool_name = tb["name"]
                tool_input = tb["input"]
                tool_use_id = tb["id"]

                callback_result_str: str
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
                        callback_result_str = (
                            f"Tool callback failed: HTTP {cb_resp.status_code} — "
                            f"{_truncate(cb_resp.text or '', 400)}"
                        )
                    else:
                        cb_json = cb_resp.json()
                        # The callback returns { ok, result } where result is a string
                        if cb_json.get("ok") and isinstance(cb_json.get("result"), str):
                            callback_result_str = cb_json["result"]
                        else:
                            callback_result_str = (
                                f"Tool error: {cb_json.get('error') or 'unknown'}"
                            )
                except Exception as cb_err:  # pragma: no cover
                    callback_result_str = f"Tool callback exception: {cb_err}"

                calculations.append({
                    "tool": tool_name,
                    "description": _describe_tool_call(tool_name, tool_input),
                    "result": _truncate(callback_result_str, 200),
                })
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "content": callback_result_str,
                })

            # Append assistant turn + tool results, mirroring the TS shape.
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

            messages = list(messages) + [
                {"role": "assistant", "content": assistant_content},
            ]
            loop_count += 1
            remaining = max_tool_loops - loop_count
            messages.append({
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
            create_params["messages"] = messages

        elapsed_ms = int((time.time() - started_at) * 1000)
        print(
            f"[fang-modal] request_id={request_id} done loops={loop_count} "
            f"text_len={len(final_text)} calculations={len(calculations)} elapsed_ms={elapsed_ms}"
        )
        return {
            "ok": True,
            "request_id": request_id,
            "final_text": final_text,
            "calculations": calculations,
            "tool_loop_count": loop_count,
            "elapsed_ms": elapsed_ms,
            "model": model,
        }

    except Exception as err:  # pragma: no cover
        elapsed_ms = int((time.time() - started_at) * 1000)
        msg = f"{type(err).__name__}: {err}"
        print(f"[fang-modal] request_id={request_id} ERROR after {elapsed_ms}ms: {msg}")
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
