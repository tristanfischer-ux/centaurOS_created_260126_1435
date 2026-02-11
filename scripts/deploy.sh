#!/bin/bash
# deploy.sh — Push to remote and automatically log to daily memory
#
# Usage:
#   ./scripts/deploy.sh                    # push current branch to origin
#   ./scripts/deploy.sh "deploy message"   # push with a custom note in the log
#
# This script:
#   1. Runs git push
#   2. If push succeeds, appends an auto-log entry to ~/.memory/daily/YYYY-MM-DD.md
#   3. Prints confirmation
#
# This is the ONLY reliable way to guarantee every deploy gets logged,
# because git has no client-side post-push hook.

set -euo pipefail

DEPLOY_NOTE="${1:-}"
MEMORY_DIR="$HOME/.memory/daily"
TODAY=$(date +"%Y-%m-%d")
NOW=$(date +"%H:%M")
LOG_FILE="$MEMORY_DIR/$TODAY.md"

# Gather info before push
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
LAST_HASH=$(git log -1 --format="%h" 2>/dev/null || echo "unknown")
LAST_MSG=$(git log -1 --format="%s" 2>/dev/null || echo "unknown")

# Count recent commits (since last 30 min — approximation of session work)
RECENT_COUNT=$(git log --oneline --since="30 minutes ago" 2>/dev/null | wc -l | tr -d ' ')
if [ "$RECENT_COUNT" -eq 0 ]; then
    RECENT_COUNT=1
fi

# Get changed files in last commit
CHANGED_FILES=$(git diff-tree --no-commit-id --name-only -r HEAD 2>/dev/null | head -10)
CHANGED_COUNT=$(git diff-tree --no-commit-id --name-only -r HEAD 2>/dev/null | wc -l | tr -d ' ')

# ---- PUSH ----
echo "🚀 Pushing ${BRANCH} to origin..."
set +e  # Temporarily allow failure so we can capture exit code
git push 2>&1
PUSH_EXIT=$?
set -e  # Re-enable strict mode

if [ $PUSH_EXIT -ne 0 ]; then
    echo "❌ Push failed (exit code $PUSH_EXIT). Not logging."
    exit $PUSH_EXIT
fi

echo "✅ Push succeeded."

# ---- LOG ----
mkdir -p "$MEMORY_DIR"

# Create daily log file if it doesn't exist
if [ ! -f "$LOG_FILE" ]; then
    cat > "$LOG_FILE" << HEADER
# Daily Log: ${TODAY}

## Entries

HEADER
fi

# Build the key files section
KEY_FILES=""
if [ -n "$CHANGED_FILES" ]; then
    KEY_FILES=$(echo "$CHANGED_FILES" | while read -r f; do echo "- \`$f\`"; done)
    if [ "$CHANGED_COUNT" -gt 10 ]; then
        KEY_FILES="${KEY_FILES}
- ... and $((CHANGED_COUNT - 10)) more"
    fi
fi

# Build optional note line
NOTE_LINE=""
if [ -n "$DEPLOY_NOTE" ]; then
    NOTE_LINE="**Note:** ${DEPLOY_NOTE}"
fi

# Append entry
cat >> "$LOG_FILE" << ENTRY

### ${NOW} - #ForgeOS [AUTO-DEPLOY] Push to ${BRANCH}
**Tags:** #ForgeOS #deploy #auto-log
**Branch:** ${BRANCH}
**Head commit:** \`${LAST_HASH}\` — ${LAST_MSG}
**Files in head commit:** ${CHANGED_COUNT}
**Commits in session (~30min):** ${RECENT_COUNT}
${NOTE_LINE}
**Key files:**
${KEY_FILES}
ENTRY

echo "📝 Logged to ${LOG_FILE}"
