#!/bin/bash
# check-ai-models.sh — Scan codebase for stale/retired AI model references.
# Runs on SessionStart hook and outputs JSON for Claude to act on.
#
# Model registry: maps retired/superseded model IDs to their replacements.
# Update this list when the weekly monitor (scripts/check-model-versions.ts)
# flags a new provider release, or when a provider announces a retirement.
# Canonical current ids live in src/lib/ai/models.ts.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO_ROOT/src"
# The PDF-generation engine lives in scripts/ and was UNWATCHED before 2026-05-29 —
# the supplier enricher silently ran a two-generation-old Gemini Flash-Lite because
# this scan only looked at src/. Scan both trees now.
SCRIPTS="$REPO_ROOT/scripts"

STALE_COUNT=0
OUTPUT=""

check_model() {
  local pattern="$1"
  local replacement="$2"
  local reason="$3"

  local matches
  # -w = word boundaries, prevents "gpt-4o" matching "gpt-4o-mini-tts"
  # and "o1" matching "icon", "color", etc.
  matches=$(grep -rnw --include="*.ts" --include="*.tsx" --include="*.mjs" "$pattern" "$SRC" "$SCRIPTS" 2>/dev/null \
    | grep -v node_modules \
    | grep -v __tests__ \
    | grep -v "\.test\." \
    | grep -v "\.spec\." \
    || true)

  if [ -n "$matches" ]; then
    local count
    count=$(echo "$matches" | wc -l | tr -d ' ')
    STALE_COUNT=$((STALE_COUNT + count))
    # Use printf to avoid shell expansion of grep output (no $() or backtick injection)
    OUTPUT="${OUTPUT}
## ${pattern} → ${replacement}
Reason: ${reason}
${count} reference(s):
$(echo "$matches" | head -10 | sed 's/^/- /' | sed 's/\$/\\$/g; s/`/\\`/g')
"
  fi
}

# ── Retired text models ────────────────────────────────────────────
# NOTE: gpt-4o needs a post-filter to exclude gpt-4o-mini-tts (the correct new TTS model).
# Using grep -P for Perl-compatible negative lookahead where available, else grep -v fallback.
check_model_filtered() {
  local pattern="$1"
  local exclude="$2"
  local replacement="$3"
  local reason="$4"

  local matches
  matches=$(grep -rnw --include="*.ts" --include="*.tsx" --include="*.mjs" "$pattern" "$SRC" "$SCRIPTS" 2>/dev/null \
    | grep -v node_modules \
    | grep -v __tests__ \
    | grep -v "\.test\." \
    | grep -v "\.spec\." \
    | grep -v "$exclude" \
    || true)

  if [ -n "$matches" ]; then
    local count
    count=$(echo "$matches" | wc -l | tr -d ' ')
    STALE_COUNT=$((STALE_COUNT + count))
    OUTPUT="${OUTPUT}
## ${pattern} → ${replacement}
Reason: ${reason}
${count} reference(s):
$(echo "$matches" | head -10 | sed 's/^/- /' | sed 's/\$/\\$/g; s/`/\\`/g')
"
  fi
}

# VERIFIED 2026-03-23: gpt-4o retired Feb 13 2026. API replacement is gpt-5.3-chat-latest
# (NOT gpt-5.3-instant — that's the ChatGPT consumer name, not the API model ID).
# Source: https://community.openai.com/t/api-model-gpt-5-3-chat-latest-available-aka-instant-on-chatgpt/1375606
check_model_filtered "gpt-4o" "gpt-4o-mini-tts" "gpt-5.3-chat-latest" "GPT-4o retired Feb 13 2026"
check_model "gpt-4-turbo" "gpt-5.3-chat-latest" "GPT-4 Turbo retired"

# ── Stale LLM model versions (engine + app) — refreshed 2026-05-29 ─
# Canonical current ids: src/lib/ai/models.ts. When the weekly monitor
# (scripts/check-model-versions.ts) reports a newer provider release, add the
# SUPERSEDED id below so this SessionStart hook catches stragglers in code, then
# bump the manifest. NOTE: the Gemini 3.1 GA ids are LIVE (the 2026-03-23
# "still in preview, no GA id" note was wrong by May — the engine uses
# google/gemini-3.1-flash-lite 24× in production).
check_model "gemini-2.5-pro" "gemini-3.1-pro-preview" "Gemini 3.1 Pro is current"
check_model "gemini-2.5-flash-lite" "gemini-3.1-flash-lite" "Gemini 3.1 Flash-Lite is GA"
check_model "gemini-2.0-flash-lite" "gemini-3.1-flash-lite" "Two generations stale — the supplier enricher silently ran this"
check_model "gemini-flash-1.5-8b" "gemini-3.1-flash-lite" "Gemini 1.5 — ancient"
check_model "gemini-1.5-flash" "gemini-3.1-flash-lite" "Gemini 1.5 — ancient"
check_model "gemini-3.1-flash-lite-preview" "gemini-3.1-flash-lite" "GA id is live — drop the -preview suffix"
check_model "claude-opus-4-5" "claude-opus-4-7" "Opus 4.7 is current"
check_model "claude-sonnet-4-7" "claude-sonnet-4-6" "No Sonnet 4-7 exists; latest Sonnet is 4.6"
check_model "deepseek-r1" "deepseek-v4-pro" "DeepSeek V4 era; R1 superseded"
check_model "qwen3.7-max" "qwen3.7-max" "Qwen3.7 Max replaced 3.6 Max on 2026-05-24"
check_model "qwen3.5-405b" "qwen3.7-max" "Qwen3.7 Max is current"

# ── Retired audio/TTS models ──────────────────────────────────────
check_model "\"tts-1\"" "gpt-4o-mini-tts" "Legacy TTS, 35% higher error rate"
check_model "tts-1-hd" "gpt-4o-mini-tts" "Legacy TTS HD"
check_model "eleven_multilingual_v2" "eleven_v3" "ElevenLabs v3 available"
check_model "eleven_turbo_v2_5" "eleven_v3" "ElevenLabs v3 available"

# ── Retired image models ──────────────────────────────────────────
check_model "stable-diffusion-xl" "stable-image-ultra" "SDXL from 2023, SD 3.5 available"
check_model "stable-image-core" "stable-image-ultra" "Replaced by Ultra (SD 3.5)"
check_model "flux-1.1-pro" "flux-2-pro" "Flux 2 available with better typography"

# ── Output ─────────────────────────────────────────────────────────
if [ "$STALE_COUNT" -eq 0 ]; then
  echo '{"systemMessage": "All AI models are up to date."}'
else
  # Write detailed report for Claude to read
  REPORT_FILE="$REPO_ROOT/.ai-model-audit.md"
  # Write header (needs variable expansion)
  printf '# AI Model Audit — %s\n\n' "$(date +%Y-%m-%d)" > "$REPORT_FILE"
  printf '**%d stale model reference(s) found.**\n' "$STALE_COUNT" >> "$REPORT_FILE"
  # Write body (no expansion — safe against shell metacharacters in grep output)
  printf '%s\n' "$OUTPUT" >> "$REPORT_FILE"
  printf '\n---\n*Auto-generated by scripts/check-ai-models.sh*\n' >> "$REPORT_FILE"

  echo "{\"systemMessage\": \"Found ${STALE_COUNT} stale AI model reference(s). Run: cat .ai-model-audit.md for details.\"}"
fi
