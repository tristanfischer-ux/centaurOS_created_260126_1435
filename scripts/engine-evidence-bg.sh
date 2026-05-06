#!/usr/bin/env bash
#
# engine-evidence-bg.sh — run pipeline in background, return immediately.
#
# Usage:
#   ./scripts/engine-evidence-bg.sh <label> <brief-file>
#
# Writes ~/Downloads/engine-evidence/<label>/{brief.md,log.txt,report.pdf,qa-scores.json,.done,.pid}
# Poll with: test -f ~/Downloads/engine-evidence/<label>/.done

set -eo pipefail

REPO_ROOT="/Users/tristanfischer/Developer/CentaurOS created 260126 1435"
EVIDENCE_ROOT="$HOME/Downloads/engine-evidence"

LABEL="$1"
BRIEF_FILE="$2"

if [ -z "$LABEL" ] || [ -z "$BRIEF_FILE" ]; then
  echo "Usage: $0 <label> <brief-file>" >&2
  exit 2
fi

if [ -f "$REPO_ROOT/$BRIEF_FILE" ]; then
  BRIEF_PATH="$REPO_ROOT/$BRIEF_FILE"
elif [ -f "$BRIEF_FILE" ]; then
  BRIEF_PATH="$(realpath "$BRIEF_FILE")"
else
  echo "Brief file not found: $BRIEF_FILE" >&2
  exit 1
fi

OUT_DIR="$EVIDENCE_ROOT/$LABEL"
mkdir -p "$OUT_DIR"
cp "$BRIEF_PATH" "$OUT_DIR/brief.md"
BRIEF_TEXT="$(cat "$BRIEF_PATH")"

cd "$REPO_ROOT"

# Snapshot existing PDFs / qa-scores
ls -1 output-*.pdf 2>/dev/null | sort > "$OUT_DIR/.pre-pdfs.txt" || : > "$OUT_DIR/.pre-pdfs.txt"
ls -1 qa-scores-*.json 2>/dev/null | sort > "$OUT_DIR/.pre-qa.txt" || : > "$OUT_DIR/.pre-qa.txt"

# Kick pipeline in background. The brief text is passed via a temp file to
# avoid shell quoting issues.
BRIEF_TMP="$OUT_DIR/.brief-passthrough.txt"
printf '%s' "$BRIEF_TEXT" > "$BRIEF_TMP"

( cd "$REPO_ROOT" && {
    python3 -c "import datetime; print('[bg-run] start at', datetime.datetime.utcnow().isoformat())"
    set +e
    # Read brief from file into an env var, pass to run.ts
    BRIEF="$(cat "$BRIEF_TMP")"
    npx tsx src/lib/pdf-engine-v2/run.ts --brief "$BRIEF"
    EXIT=$?
    echo "[bg-run] exit=$EXIT"

    # Move new PDF
    ls -1 output-*.pdf 2>/dev/null | sort > "$OUT_DIR/.post-pdfs.txt" || : > "$OUT_DIR/.post-pdfs.txt"
    NEW_PDF=$(comm -13 "$OUT_DIR/.pre-pdfs.txt" "$OUT_DIR/.post-pdfs.txt" | tail -1)
    if [ -n "$NEW_PDF" ] && [ -f "$NEW_PDF" ]; then
      mv "$NEW_PDF" "$OUT_DIR/report.pdf"
    fi

    # Move qa-scores
    ls -1 qa-scores-*.json 2>/dev/null | sort > "$OUT_DIR/.post-qa.txt" || : > "$OUT_DIR/.post-qa.txt"
    NEW_QA=$(comm -13 "$OUT_DIR/.pre-qa.txt" "$OUT_DIR/.post-qa.txt" | tail -1)
    if [ -n "$NEW_QA" ] && [ -f "$NEW_QA" ]; then
      mv "$NEW_QA" "$OUT_DIR/qa-scores.json"
    fi

    python3 -c "import datetime; print('[bg-run] end   at', datetime.datetime.utcnow().isoformat())"
    touch "$OUT_DIR/.done"
} ) > "$OUT_DIR/log.txt" 2>&1 &

echo $! > "$OUT_DIR/.pid"
disown

echo "=== backgrounded ==="
echo "Label: $LABEL"
echo "PID:   $(cat $OUT_DIR/.pid)"
echo "Log:   $OUT_DIR/log.txt"
echo "Done:  $OUT_DIR/.done (appears when finished)"
