#!/bin/bash
# Install the post-commit hook that appends each commit to ~/.memory/daily/YYYY-MM-DD.md.
# Run once per clone (or after a fresh clone) to enable auto-logging on commit.
#
# Usage: ./scripts/install-memory-hook.sh

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SRC="${REPO_ROOT}/scripts/git-hooks/post-commit"
DEST="${REPO_ROOT}/.git/hooks/post-commit"

if [ ! -f "$SRC" ]; then
  echo "Error: Hook source not found at $SRC" >&2
  exit 1
fi

cp "$SRC" "$DEST"
chmod +x "$DEST"
echo "Installed post-commit hook at .git/hooks/post-commit"
echo "Each commit will append an [AUTO-COMMIT] entry to ~/.memory/daily/YYYY-MM-DD.md (if ~/.memory/daily exists)."
