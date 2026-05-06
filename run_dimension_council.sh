#!/bin/bash

PROMPT="You are a Staff Design Engineer and Quality Lead on the ForgeOS project. 

The founder wants to overhaul how we judge the quality of our generated 80-page engineering PDFs. Instead of a single score out of 10 for a section, we need a 5-6 dimension scoring rubric that fundamentally answers: 'Is this section actually delivering value for the reader and is it useful?'

Dimensions suggested so far:
- Layout and presentation
- Language
- Narrative
- Accuracy
- Value / Usefulness

Task: Propose the definitive 5-6 dimensions we should use to score EVERY section of an engineering report (Brief, Cost Waterfall, Risk Register, etc.).
For each dimension, provide:
1. The exact name of the dimension.
2. The core question it answers.
3. Why it matters for an engineering document.

Return a concise list of these 5-6 dimensions so I (Gemini) can implement them into the codebase's TypeScript interfaces."

JSON_PAYLOAD=$(jq -n --arg prompt "$PROMPT" '{
  "max_tokens": 4000,
  "messages": [
    {"role": "system", "content": "You are a Staff Design Engineer reviewing PDF generation quality rubrics."},
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

run_model "openai/gpt-5.4" "dim-gpt.txt" &
run_model "x-ai/grok-4.3" "dim-grok.txt" &
run_model "z-ai/glm-5.1" "dim-glm.txt" &
run_model "moonshotai/kimi-k2.6" "dim-kimi.txt" &

wait
echo "Council finished."
