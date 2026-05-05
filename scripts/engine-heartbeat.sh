#!/usr/bin/env bash
#
# engine-heartbeat.sh — 15-minute progress snapshot for autonomous overnight work
#
# Writes one entry every 15 minutes to ~/Downloads/engine-evidence/HEARTBEAT.log
# with: timestamp, git state, evidence folders, whether pipeline is running.
#
# Start with:   nohup bash scripts/engine-heartbeat.sh >> /tmp/heartbeat-launch.log 2>&1 &
# Stop with:    pkill -f engine-heartbeat.sh
#
# Not an LLM cron. No Claude invocations. Just bash + ps + git + ls.

REPO_ROOT="/Users/tristanfischer/Developer/CentaurOS created 260126 1435"
LOG="$HOME/Downloads/engine-evidence/HEARTBEAT.log"
mkdir -p "$(dirname "$LOG")"

while true; do
  TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  {
    echo "=== $TS ==="
    echo "--- git ---"
    cd "$REPO_ROOT" 2>/dev/null && {
      git log --oneline -5 2>/dev/null || echo "(git log failed)"
      echo "working-tree:"
      git status --short 2>/dev/null | head -20 || echo "(git status failed)"
    }
    echo "--- evidence folders (last 20 modified) ---"
    find "$HOME/Downloads/engine-evidence" -mindepth 1 -maxdepth 3 -type d 2>/dev/null | head -30
    echo "--- pipeline process ---"
    ps aux | grep -E "tsx.*(run\.ts|pdf-engine)" | grep -v grep | head -3 || echo "(no pipeline running right now)"
    echo "--- tracker head ---"
    head -5 "$REPO_ROOT/src/lib/pdf-engine-v2/TRACKER.md" 2>/dev/null | sed 's/^/  /'
    grep -A1 "^## Active increment" "$REPO_ROOT/src/lib/pdf-engine-v2/TRACKER.md" 2>/dev/null | head -5 | sed 's/^/  /'
    echo ""
  } >> "$LOG"
  sleep 900
done
