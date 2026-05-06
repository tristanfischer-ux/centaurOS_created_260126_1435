#!/bin/bash

PROMPT="You are a Staff Design Engineer on the ForgeOS project. I need you to critique the visual layout and narrative depth of our new V3 PDF engine (built with @react-pdf/renderer) and score each section out of 10.

Context: We are trying to reach an 80-page, highly detailed engineering document. The current sections are:
1. Cover Page & Totals
2. Feasibility Exception (Red/Amber/Green alerts)
3. Brief (Mission, Use Case, Constraints)
4. Regulatory Posture (Compliance matrix)
5. Modules (1 page per module with image, mass, cost, key parts, failure modes, unknowns, and Engineering Reviews)
6. Bill of Materials (Table of parts)
7. Cost Waterfall (Aggregate and per-module cost breakdown)
8. Risks Register (FMEA tables per module)
9. Suppliers (Matched suppliers, scores, descriptions, reasons)
10. Audit Log

We need to add data provenance (Source: Database vs LLM) and LLM Model attribution (e.g. 'Model: gemini-3.1-pro') to each section.

Critique each section (Score out of 10). Give brutal reasons why it could be better visually or structurally. Suggest how to elegantly inject the 'Provenance' and 'LLM Model' badges without making the PDF look like a developer debug log.
"

JSON_PAYLOAD=$(jq -n --arg prompt "$PROMPT" '{
  "max_tokens": 16000,
  "messages": [
    {"role": "system", "content": "You are a Staff Design Engineer reviewing PDF generation quality."},
    {"role": "user", "content": $prompt}
  ]
}')

run_model() {
  local model=$1
  local outfile=$2
  curl -s https://openrouter.ai/api/v1/chat/completions \
    -H "Authorization: Bearer $OPENROUTER_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$(echo "$JSON_PAYLOAD" | jq --arg m "$model" '. + {model: $m}')" | jq -r '.choices[0].message.content' > "$outfile"
}

run_model "google/gemini-3.1-pro-preview" "critique-gemini.txt" &
run_model "x-ai/grok-4.3" "critique-grok.txt" &
run_model "z-ai/glm-5.1" "critique-glm.txt" &

wait
