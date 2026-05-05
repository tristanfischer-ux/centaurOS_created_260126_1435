#!/usr/bin/env bash
#
# engine-evidence.sh — run the pdf engine on a brief and archive the output
#
# Usage:
#   ./scripts/engine-evidence.sh <label> <brief-file>
#
# Example:
#   ./scripts/engine-evidence.sh baseline-0/bess src/lib/pdf-engine-v2/briefs/bess.md
#
# Produces ~/Downloads/engine-evidence/<label>/
#   report.pdf      — the generated PDF
#   log.txt         — stderr from the pipeline (all progress logs)
#   summary.json    — stdout from run.ts (stages, gates, timing)
#   qa-scores.json  — engine's qa-scores output, if produced
#   brief.md        — copy of the brief used
#

set -eo pipefail

REPO_ROOT="/Users/tristanfischer/Developer/CentaurOS created 260126 1435"
EVIDENCE_ROOT="$HOME/Downloads/engine-evidence"

if [ $# -ne 2 ]; then
  echo "Usage: $0 <label> <brief-file>" >&2
  echo "Example: $0 baseline-0/bess src/lib/pdf-engine-v2/briefs/bess.md" >&2
  exit 2
fi

LABEL="$1"
BRIEF_FILE="$2"

if [ ! -f "$REPO_ROOT/$BRIEF_FILE" ] && [ ! -f "$BRIEF_FILE" ]; then
  echo "Brief file not found: $BRIEF_FILE" >&2
  exit 1
fi

# Resolve brief path — accept repo-relative or absolute
if [ -f "$REPO_ROOT/$BRIEF_FILE" ]; then
  BRIEF_PATH="$REPO_ROOT/$BRIEF_FILE"
else
  BRIEF_PATH="$(realpath "$BRIEF_FILE")"
fi

OUT_DIR="$EVIDENCE_ROOT/$LABEL"
mkdir -p "$OUT_DIR"

# Copy brief for reproducibility
cp "$BRIEF_PATH" "$OUT_DIR/brief.md"

BRIEF_TEXT="$(cat "$BRIEF_PATH")"

echo "=== engine-evidence: $LABEL ==="
echo "Brief: $BRIEF_PATH ($(wc -c < "$BRIEF_PATH" | tr -d ' ') bytes)"
echo "Output: $OUT_DIR"
echo "Starting at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

cd "$REPO_ROOT"

# Snapshot of existing output-*.pdf and qa-scores-*.json so we can detect new ones
BEFORE_PDFS=$(ls -1 output-*.pdf 2>/dev/null | sort)
BEFORE_QA=$(ls -1 qa-scores-*.json 2>/dev/null | sort)

START_MS=$(python3 -c 'import time; print(int(time.time()*1000))')

# Run pipeline. Merge stdout+stderr into one log file. run.ts writes the PDF
# to cwd, so we move it afterwards.
if npx tsx src/lib/pdf-engine-v2/run.ts --brief "$BRIEF_TEXT" \
     > "$OUT_DIR/log.txt" 2>&1; then
  RUN_STATUS=ok
else
  RUN_STATUS=fail
fi

END_MS=$(python3 -c 'import time; print(int(time.time()*1000))')
DURATION=$((END_MS - START_MS))

AFTER_PDFS=$(ls -1 output-*.pdf 2>/dev/null | sort)
AFTER_QA=$(ls -1 qa-scores-*.json 2>/dev/null | sort)

# Find the new PDF and move it
NEW_PDF=$(comm -13 <(echo "$BEFORE_PDFS") <(echo "$AFTER_PDFS") | tail -n1)
if [ -n "${NEW_PDF:-}" ] && [ -f "$NEW_PDF" ]; then
  mv "$NEW_PDF" "$OUT_DIR/report.pdf"
  PDF_SIZE=$(stat -f%z "$OUT_DIR/report.pdf" 2>/dev/null || stat -c%s "$OUT_DIR/report.pdf")
else
  PDF_SIZE=0
fi

# Find the new qa-scores and move it
NEW_QA=$(comm -13 <(echo "$BEFORE_QA") <(echo "$AFTER_QA") | tail -n1)
if [ -n "${NEW_QA:-}" ] && [ -f "$NEW_QA" ]; then
  mv "$NEW_QA" "$OUT_DIR/qa-scores.json"
fi

echo ""
echo "=== complete ==="
echo "Run status: $RUN_STATUS"
echo "Duration: ${DURATION}ms"
echo "PDF: $OUT_DIR/report.pdf ($PDF_SIZE bytes)"
echo "Log: $OUT_DIR/log.txt"
echo "Summary: $OUT_DIR/summary.json"

# Page count if pdfinfo is around
if command -v pdfinfo >/dev/null 2>&1 && [ "$PDF_SIZE" -gt 0 ]; then
  PAGES=$(pdfinfo "$OUT_DIR/report.pdf" 2>/dev/null | awk '/^Pages:/ {print $2}')
  echo "Pages: ${PAGES:-unknown}"
fi

# Terminal grep for most useful log signals
echo ""
echo "=== log highlights ==="
grep -E "\[pipeline\] === |\[pipeline\] Feasibility|\[bom-cost\] Grounded|\[pipeline\] Overall score|: FAILED|Stage failed|: OK \(|FATAL|Error:" "$OUT_DIR/log.txt" | head -30 || true

exit 0
