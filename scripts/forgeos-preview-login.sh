#!/usr/bin/env bash
# Wrapper: override FORGEOS_TEST_URL AFTER creds sourced, then login.
set -euo pipefail
TARGET_URL="${1:?preview URL required as arg 1}"
TARGET_PATH="${2:-/today}"
CREDS_FILE="$HOME/.claude/secrets/forgeos-test.env"
set -a; . "$CREDS_FILE"; set +a
export FORGEOS_TEST_URL="$TARGET_URL"

agent-browser open "$FORGEOS_TEST_URL/login" --headless >/dev/null
sleep 2
PRE_URL=$(agent-browser get url 2>/dev/null || echo "")
if [[ "$PRE_URL" == "$TARGET_URL"/* ]] && [[ "$PRE_URL" != *"/login"* ]]; then
  echo "preview-login: already authenticated at $PRE_URL"
else
  for i in 1 2 3 4 5 6 7 8 9 10; do
    READY=$(agent-browser eval "document.querySelector('#email') && document.querySelector('#password') ? 'yes' : 'no'" 2>/dev/null | tr -d '"' | tr -d ' ')
    case "$READY" in *yes*) break ;; esac
    sleep 1
  done
  agent-browser click "#email" >/dev/null
  agent-browser type "#email" "$FORGEOS_TEST_EMAIL" >/dev/null
  agent-browser click "#password" >/dev/null
  agent-browser type "#password" "$FORGEOS_TEST_PASSWORD" >/dev/null
  agent-browser press Enter >/dev/null
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    sleep 1
    CUR=$(agent-browser get url 2>/dev/null || echo "")
    case "$CUR" in *"/login"*) ;; "") ;; *) break ;; esac
  done
  if [[ "$CUR" == *"/login"* ]] || [[ -z "$CUR" ]]; then
    echo "preview-login: still on /login after submit" >&2
    echo "  current: $CUR" >&2
    exit 4
  fi
fi

if [ -n "$TARGET_PATH" ]; then agent-browser navigate "$TARGET_URL$TARGET_PATH" >/dev/null; fi
FINAL=$(agent-browser get url 2>/dev/null || echo "")
echo "preview-login: ok, at $FINAL"
