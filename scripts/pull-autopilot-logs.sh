#!/usr/bin/env bash
#
# pull-autopilot-logs.sh — Capture Vercel logs for a ForgeOS preview before
# they roll off the 1-hour retention window. Writes a timestamped log bundle
# under ~/Developer/forgeos-autopilot-logs/<YYYY-MM-DD>/<project-uuid>/ so
# the evidence survives for root-cause analysis.
#
# Usage:
#   scripts/pull-autopilot-logs.sh <project-uuid> [preview-url]
#
# If preview-url is omitted, the latest Preview deployment from `npx vercel ls`
# is used. project-uuid is used purely for the output directory name; it does
# NOT filter the logs themselves (Vercel logs are per-deployment, not
# per-project-row). Pass a real UUID so post-incident triage has a paper
# trail linking back to the cad_lab_projects row under investigation.
#
# Storage layout:
#   ~/Developer/forgeos-autopilot-logs/<YYYY-MM-DD>/<project-uuid>/
#     full.log       — all Vercel logs for the preview, since 1 hour ago
#     errors.log     — --level error slice (noise-free)
#     autopilot.log  — grep for autopilot/stepWait/waiting_/after()
#     render.log     — grep for render-all/generate-one-module/XRay/module_
#     cookies.log    — grep for cookies/withAuth/sanitize/Unauthorized
#     metadata.json  — project id, preview url, capture timestamp,
#                      deployment age (best effort)
#
# Idempotence:
#   If the output directory already exists for today's date and this project
#   uuid, the new bundle is written alongside under a
#   <name>.<HHMMSS>.log suffix so prior captures are preserved. metadata.json
#   is also versioned with the timestamp. This lets you run the script
#   repeatedly during an incident without clobbering earlier evidence.
#
# Exit codes:
#   0   success (log bundle written)
#   10  precondition failure (vercel CLI missing, etc.)
#   20  project-uuid argument missing or invalid
#   30  couldn't resolve preview URL (vercel ls returned nothing)
#   40  vercel logs command failed (network, auth, unknown URL)

set -euo pipefail

# ---- inputs -----------------------------------------------------------------

PROJECT_UUID="${1:-}"
PREVIEW_URL="${2:-}"

if [ -z "$PROJECT_UUID" ]; then
  echo "pull-autopilot-logs: missing <project-uuid> argument" >&2
  echo "  Usage: scripts/pull-autopilot-logs.sh <project-uuid> [preview-url]" >&2
  exit 20
fi

# Loose UUID sanity check — accept any non-empty token without whitespace.
# We don't want to reject non-standard IDs outright; the path just needs to
# be safe for mkdir.
case "$PROJECT_UUID" in
  *[[:space:]]*|"/"*|*"/"*|".."|"."|*"../"*)
    echo "pull-autopilot-logs: project-uuid contains invalid chars: $PROJECT_UUID" >&2
    exit 20
    ;;
esac

# ---- preconditions ----------------------------------------------------------

if ! command -v npx >/dev/null 2>&1; then
  echo "pull-autopilot-logs: npx not on PATH" >&2
  exit 10
fi

# ---- resolve preview URL if not provided -----------------------------------

if [ -z "$PREVIEW_URL" ]; then
  echo "pull-autopilot-logs: no preview-url provided — auto-detecting latest"
  # `vercel ls` prints a table; the bottom has raw URLs (one per line).
  # Grab the first (most recent) URL after the table.
  PREVIEW_URL=$(npx vercel ls 2>/dev/null \
    | grep -Eo 'https://[a-zA-Z0-9.-]+\.vercel\.app' \
    | head -n 1 || true)
  if [ -z "$PREVIEW_URL" ]; then
    echo "pull-autopilot-logs: couldn't resolve a preview URL from 'npx vercel ls'" >&2
    echo "  Hint: make sure you're inside a linked Vercel project directory." >&2
    exit 30
  fi
  echo "pull-autopilot-logs: using preview $PREVIEW_URL"
fi

# ---- output path (survives Vercel's 1-hour retention) -----------------------

DATE_STAMP=$(date -u +%Y-%m-%d)
TIME_STAMP=$(date -u +%H%M%S)
CAPTURE_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)

OUT_DIR="$HOME/Developer/forgeos-autopilot-logs/$DATE_STAMP/$PROJECT_UUID"
mkdir -p "$OUT_DIR"

# Idempotence: if full.log already exists, suffix this run with the
# current time so we don't destroy earlier evidence.
SUFFIX=""
if [ -e "$OUT_DIR/full.log" ]; then
  SUFFIX=".$TIME_STAMP"
  echo "pull-autopilot-logs: prior bundle present — suffixing this capture with $SUFFIX"
fi

FULL_LOG="$OUT_DIR/full$SUFFIX.log"
ERRORS_LOG="$OUT_DIR/errors$SUFFIX.log"
AUTOPILOT_LOG="$OUT_DIR/autopilot$SUFFIX.log"
RENDER_LOG="$OUT_DIR/render$SUFFIX.log"
COOKIES_LOG="$OUT_DIR/cookies$SUFFIX.log"
META_JSON="$OUT_DIR/metadata$SUFFIX.json"

# ---- full log capture -------------------------------------------------------

# --since 1h is the widest useful window before Vercel retention drops the
# oldest lines anyway. --expand shows the full console.log lines beneath
# each request line (without it you only get the request line which is
# useless). --no-follow prevents the command from blocking on a live tail.
# --limit 2000 is Vercel's hard cap for a single pull.
#
# GOTCHA: `vercel logs` writes the actual log content to STDERR when stdout
# is not a TTY (verified with CLI 51.7.0). Piping only stdout captures an
# empty file. We therefore use `2>&1` to merge the streams, which lands the
# "Retrieving project..." / "Fetching logs..." preamble lines in the file
# too — harmless, and the filtered slices below skip them anyway. If we
# ever switch to `--json`, that flag DOES go to stdout correctly, but
# then --expand stops rendering console.log lines the way we grep for
# them. Staying on the human-readable format + 2>&1 is the trade-off.
echo "pull-autopilot-logs: fetching full log (since 1h, up to 2000 lines)"
if ! npx vercel logs "$PREVIEW_URL" \
      --no-follow \
      --since 1h \
      --limit 2000 \
      --expand \
      > "$FULL_LOG" 2>&1; then
  echo "pull-autopilot-logs: 'vercel logs' failed — see $FULL_LOG for output" >&2
  tail -20 "$FULL_LOG" >&2 || true
  exit 40
fi

# ---- filtered slices --------------------------------------------------------

# Errors-only slice. Separately run --level error against the Vercel API
# so we get lines the local grep might miss (Vercel tags runtime errors
# with a structured level field even when the message text doesn't contain
# the literal word "error"). Fall back to a local grep if the dedicated
# pull fails for any reason.
echo "pull-autopilot-logs: fetching error-level slice"
if ! npx vercel logs "$PREVIEW_URL" \
      --no-follow \
      --since 1h \
      --limit 2000 \
      --level error \
      --expand \
      > "$ERRORS_LOG" 2>&1; then
  echo "pull-autopilot-logs: error-level pull failed — falling back to local grep"
  grep -iE 'error|failed|timeout|exception|stack trace|runtime error' \
    "$FULL_LOG" > "$ERRORS_LOG" || true
fi
# If the error-level pull returned only the preamble (~200 bytes with no
# actual log rows), fall back to grepping the full log — a missing slice is
# worse than a noisy one.
if [ "$(wc -c < "$ERRORS_LOG" | tr -d ' ')" -lt 400 ]; then
  grep -iE 'error|failed|timeout|exception|stack trace|runtime error' \
    "$FULL_LOG" > "$ERRORS_LOG" || true
fi

# GOTCHA: Vercel CLI's default --no-follow pull returns ONLY request-line
# traces (the "λ POST /path" header row) even with --expand — expanded
# console.error output is only included in the --level error slice.
# Therefore we grep BOTH full.log and errors.log into each topic slice and
# concatenate, so specialist-prefixed console.log lines that the --level
# error pull surfaces aren't lost. Duplicates are trimmed with awk at the
# end so the slice reads cleanly.

# Autopilot + stage-runner activity. Includes both the named specialist
# prefixes you'd see inside console.log lines AND the request paths that
# represent autopilot in-flight traffic (a dense stream of POSTs to
# /the-forge-v2/projects/{uuid} is the autopilot tick endpoint firing
# every minute).
_autopilot_re='autopilot|waiting_|stepWait|after\(\)|runMaxDecomposition|tickAutopilotStage|recordFailure|triggered_by|/the-forge-v2/projects/|pipeline_run|specialist|/start|/resume'
{ grep -iE "$_autopilot_re" "$FULL_LOG" || true; grep -iE "$_autopilot_re" "$ERRORS_LOG" || true; } \
  | awk '!seen[$0]++' > "$AUTOPILOT_LOG" || true

# Image/render pipeline activity — specialist log prefixes plus the route
# patterns that represent the render-chain HTTP hops.
_render_re='render-all|generate-one-module|XRayImageGen|module_|image_render_state|generateOneModuleImage|renderNextModuleStage|cover_image_url|/api/render-stage|/api/image|gpt-image|replicate'
{ grep -iE "$_render_re" "$FULL_LOG" || true; grep -iE "$_render_re" "$ERRORS_LOG" || true; } \
  | awk '!seen[$0]++' > "$RENDER_LOG" || true

# Auth / cookies-in-after() / sanitisation sites — plus login / security
# audit lines which are the other half of the authenticated surface.
_cookies_re='cookies|withAuth|withUser|sanitize|Unauthorized|An unexpected error occurred|\[SECURITY\]|LOGIN_|AUTH_'
{ grep -iE "$_cookies_re" "$FULL_LOG" || true; grep -iE "$_cookies_re" "$ERRORS_LOG" || true; } \
  | awk '!seen[$0]++' > "$COOKIES_LOG" || true

# ---- metadata ---------------------------------------------------------------

FULL_BYTES=$(wc -c < "$FULL_LOG" | tr -d ' ')
ERRORS_BYTES=$(wc -c < "$ERRORS_LOG" | tr -d ' ')
AUTOPILOT_BYTES=$(wc -c < "$AUTOPILOT_LOG" | tr -d ' ')
RENDER_BYTES=$(wc -c < "$RENDER_LOG" | tr -d ' ')
COOKIES_BYTES=$(wc -c < "$COOKIES_LOG" | tr -d ' ')

# Best-effort deployment-age lookup — parse `vercel ls` for the matching URL
# row and grab the Age column. If parsing fails, we still write the JSON
# without that field rather than erroring.
DEPLOYMENT_AGE=$(npx vercel ls 2>/dev/null \
  | awk -v url="$PREVIEW_URL" '$0 ~ url { for (i=1; i<=NF; i++) { if ($i ~ url) { print $1; exit } } }' \
  || true)

cat > "$META_JSON" <<JSON
{
  "project_uuid": "$PROJECT_UUID",
  "preview_url": "$PREVIEW_URL",
  "captured_at_utc": "$CAPTURE_ISO",
  "deployment_age_at_capture": "${DEPLOYMENT_AGE:-unknown}",
  "log_window": "since 1h ago",
  "files": {
    "full": {"path": "$FULL_LOG", "bytes": $FULL_BYTES},
    "errors": {"path": "$ERRORS_LOG", "bytes": $ERRORS_BYTES},
    "autopilot": {"path": "$AUTOPILOT_LOG", "bytes": $AUTOPILOT_BYTES},
    "render": {"path": "$RENDER_LOG", "bytes": $RENDER_BYTES},
    "cookies": {"path": "$COOKIES_LOG", "bytes": $COOKIES_BYTES}
  }
}
JSON

# ---- summary line -----------------------------------------------------------

echo ""
echo "pull-autopilot-logs: ok"
echo "  out dir   : $OUT_DIR"
echo "  full      : $FULL_LOG ($FULL_BYTES bytes)"
echo "  errors    : $ERRORS_LOG ($ERRORS_BYTES bytes)"
echo "  autopilot : $AUTOPILOT_LOG ($AUTOPILOT_BYTES bytes)"
echo "  render    : $RENDER_LOG ($RENDER_BYTES bytes)"
echo "  cookies   : $COOKIES_LOG ($COOKIES_BYTES bytes)"
echo "  metadata  : $META_JSON"

exit 0
