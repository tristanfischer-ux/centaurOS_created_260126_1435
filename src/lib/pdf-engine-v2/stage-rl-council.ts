/**
 * stage-rl-council.ts — Extracted council diff review logic and shared types
 * for the PDF Engine v2 RL framework.
 *
 * Split from stage-rl-iterate.ts so these exports can be imported by Jest
 * tests without triggering the fileURLToPath/__dirname declaration at the
 * top of stage-rl-iterate.ts (which causes SyntaxError: Identifier '__dirname'
 * has already been declared under Jest's CJS transform).
 *
 * Exported by stage-rl-iterate.ts via re-export.
 */

import { execFileSync } from 'child_process'

// ── JSON output schema ──────────────────────────────────────────────────────

/**
 * Machine-readable result written to --json-output path.
 * Consumed by rl-driver.sh to determine PROMOTE / ITERATE / GIVE-UP / REVERT.
 */
export interface RlIterationResult {
  stage: string
  iteration_number: number
  started_at: string
  ended_at: string
  duration_seconds: number
  briefs_run: string[]
  per_brief_scores: Record<string, number>
  mean_score: number | null
  prompt_changed: boolean
  prompt_diff_size_lines: number
  council_fired: boolean
  council_blockers_count: number
  committed_sha: string | null
  rl_decision: 'PROMOTE' | 'ITERATE' | 'GIVE-UP' | 'REVERT' | 'PENDING'
  /** Curriculum phase: 1 = fast loop (3 briefs), 2 = validation (10 briefs). */
  phase: 1 | 2
}

// ── Council diff review ──────────────────────────────────────────────────────

/**
 * Result type for prompt diff council review.
 */
export interface CouncilDiffResult {
  /** Number of seats that returned a BLOCKER verdict. */
  blockerCount: number
  /** Raw findings from all 6 seats (may be partially populated on error). */
  seatFindings: Array<{ model: string; blocker: boolean; reasons: string[] }>
  /** true if the council fired (diff > 20 lines), false if skipped. */
  fired: boolean
}

// Static path to cost-tick script — no user-controlled input, safe for execFileSync.
const COST_TICK_SCRIPT = `${process.env.HOME ?? '/Users/tristanfischer'}/.claude/scripts/cost-tick.sh`

// ── LLM helpers (duplicated here to avoid circular import) ────────────────────

async function callLLM(
  model: string,
  system: string,
  user: string,
  maxTokens = 4096,
): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.3,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(180_000),
  })

  if (!response.ok) throw new Error(`OpenRouter API ${response.status}`)
  const json = await response.json()
  return (json as any).choices?.[0]?.message?.content || ''
}

function extractJSON(text: string): any {
  let s = text
    .replace(/^\s*```json\s*/m, '')
    .replace(/```\s*$/m, '')
    .trim()
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first >= 0 && last > first) s = s.slice(first, last + 1)
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

// ── Council review function ───────────────────────────────────────────────────

/**
 * 6-LLM council review of a prompt diff.
 *
 * Fires when diffSizeLines > 20. All 6 seats called in parallel with
 * max_tokens=16000. If >= 2 seats flag a BLOCKER, the caller should revert.
 *
 * Diagnostic focus: prompt-engineering BLOCKERs — anti-invention rules removed,
 * JSON schema broken, hidden contradictions, hallucination triggers, output
 * schema drift. NOT code-correctness.
 *
 * Cost ticked via cost-tick.sh council_rounds += 1 after each council call.
 */
export async function reviewPromptDiffWithCouncil(
  stageName: string,
  diffText: string,
  diffSizeLines: number,
): Promise<CouncilDiffResult> {
  if (diffSizeLines <= 20) {
    return { blockerCount: 0, seatFindings: [], fired: false }
  }

  const COUNCIL_SEATS = [
    'google/gemini-3.1-pro-preview',
    'openai/gpt-5.4',
    'x-ai/grok-4.3',
    'z-ai/glm-5.1',
    'moonshotai/kimi-k2.6',
    'xiaomi/mimo-v2.5-pro',
  ]

  const councilSystemPrompt = `You are a prompt-engineering quality auditor for an engineering report PDF generator.
Your ONLY job: identify BLOCKER-class prompt-engineering problems in this diff.

BLOCKER criteria (flag if ANY of these apply):
1. Anti-invention safeguards REMOVED — rules preventing hallucinated parts/standards/specs deleted without replacement
2. JSON output schema BROKEN — required output fields deleted, renamed, or made inconsistent with downstream parsers
3. Hidden contradictions INTRODUCED — instructions that contradict each other, causing unpredictable LLM behaviour
4. Hallucination triggers ADDED — vague instructions like "include relevant X" with no specificity boundary
5. Output schema DRIFT — a field added/renamed in the diff but downstream consumers not updated

Do NOT flag:
- Minor wording changes or style tweaks
- Additions that tighten constraints
- Performance-neutral restructuring

Return ONLY valid JSON:
{
  "blocker": true,
  "reasons": ["reason 1"],
  "confident_review_pass": false
}`

  const councilUserPrompt = `Stage: ${stageName}
Diff size: ${diffSizeLines} lines

PROMPT DIFF:
\`\`\`diff
${diffText.slice(0, 6000)}
\`\`\`

Review for BLOCKER-class prompt-engineering problems only. Return JSON.`

  const seatFindings: Array<{ model: string; blocker: boolean; reasons: string[] }> = []

  const results = await Promise.allSettled(
    COUNCIL_SEATS.map(async (model) => {
      try {
        const raw = await callLLM(model, councilSystemPrompt, councilUserPrompt, 16000)
        const parsed = extractJSON(raw)
        return {
          model,
          blocker: parsed?.blocker === true,
          reasons: Array.isArray(parsed?.reasons) ? (parsed.reasons as string[]) : [],
        }
      } catch (err) {
        console.warn(`[stage-rl] council seat ${model} failed: ${(err as Error).message}`)
        return { model, blocker: false, reasons: [`Seat failed: ${(err as Error).message}`] }
      }
    }),
  )

  for (const r of results) {
    if (r.status === 'fulfilled') {
      seatFindings.push(r.value)
    } else {
      seatFindings.push({ model: 'unknown', blocker: false, reasons: ['Promise rejected'] })
    }
  }

  // Tick council cost counter — static args, no injection risk.
  try {
    execFileSync(COST_TICK_SCRIPT, ['council_rounds', '1'], { stdio: 'ignore' })
  } catch {
    // Non-fatal: cost tick failure must not block the RL iteration.
  }

  const blockerCount = seatFindings.filter(s => s.blocker).length
  console.log(`[stage-rl] Council review: ${blockerCount}/6 seats flagged BLOCKER`)
  for (const seat of seatFindings.filter(s => s.blocker)) {
    console.log(`  [BLOCKER] ${seat.model}: ${seat.reasons.join('; ')}`)
  }

  return { blockerCount, seatFindings, fired: true }
}
