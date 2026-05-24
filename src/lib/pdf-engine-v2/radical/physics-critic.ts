// Physics & engineering critic stage. Runs Flash-Lite in score+critique mode
// (NOT patch-emission mode) after Phase 2 + Design Decisions complete. Its
// job is to catch the class of issues structural gates miss:
//   - battery capacity vs required endurance
//   - heatsink area vs dissipated power
//   - cable current rating vs continuous load
//   - actuator force vs required mechanical work
//   - material/process compatibility (e.g. titanium fasteners are unusual)
//
// Honesty contract: every finding carries a confidence enum
//   (high|medium|low|unknown). The renderer surfaces all findings as
//   "needs human verification" — never claims the engine has fixed them.
//
// Design: post-Phase-2 inline call, fail-soft (chain continues on error).
// Cost: ~£0.005 per run.

import { readFileSync } from 'fs'

export type CritiqueSeverity = 'low' | 'med' | 'high'
export type CritiqueConfidence = 'high' | 'medium' | 'low' | 'unknown'

export interface CritiqueIssue {
  dimension: 'brief_to_design_fidelity' | 'engineering_plausibility' | 'internal_coherence' | 'part_realism' | 'honesty_signal'
  severity: CritiqueSeverity
  confidence: CritiqueConfidence
  where: string
  issue: string
  suggested_check?: string
}

export interface CritiqueReport {
  scores: {
    brief_to_design_fidelity: number
    engineering_plausibility: number
    internal_coherence: number
    part_realism: number
    honesty_signal: number
  }
  headline: string
  issues: CritiqueIssue[]
  what_worked: string[]
  model: string
  latency_ms: number
}

// 2026-05-19 v5.2: bumped to Gemini 3.5 Flash. Probe (ab-tests/probe-3.5-flash-
// physics-critic.json) confirmed it catches planted physics errors that 3.1
// Flash-Lite missed (claimed COP 3.5 vs actual 3.08 from 8kW/2.6kW input —
// 3.5 Flash flagged with high confidence + showed calculation; 3.1 Flash-Lite
// historically returned only generic "verify thermodynamic ratios" advice).
// Cost delta: ~$0.025/critique vs ~$0.005 (5× more) but only 1 call per
// chain run, so ~$0.02 per chain run is acceptable for sharper engineering
// judgment. Sweet spot for reasoning-first model: ~3K prompt + structured
// JSON output. JSON schema unchanged — drop-in.
//
// max_tokens MUST be ≥6000 for this model — at 2-3K it burns budget on
// internal reasoning and returns empty content (verified A/B in ab-tests/).
const FLASH_LITE_MODEL = 'google/gemini-3.5-flash'

function compactDesign(modules: any[], brief: any, keyMetrics: any, partSummary: any, decisions: any[], contractTradeOffs: any): any {
  const compactModules = (modules || []).map((m: any) => ({
    module: m.module,
    display_name: m.display_name,
    sub_modules: (m.sub_modules ?? []).map((sm: any) => ({
      sub_module_id: sm.sub_module_id,
      english_sentence: sm.english_sentence,
      words: (sm.words ?? []).map((w: any) => ({
        word_id: w.word_id,
        word_name: w.word_name,
        modifier_characters: w.modifier_characters ?? {},
      })),
    })),
  }))
  return {
    brief,
    keyMetrics: keyMetrics ?? null,
    moduleCount: compactModules.length,
    modules: compactModules,
    partVerificationSummary: partSummary ?? null,
    designDecisionsCount: (decisions ?? []).length,
    // BESS L4 (2026-05-24): contract-documented trade-offs. When the
    // engineering contract has explicitly accepted a shortfall against the
    // brief (e.g. usable capacity below target because the integer-feasible
    // single-container envelope cannot fit the requested cells), surface
    // that to the critic so it does NOT re-flag the documented trade-off as
    // a physics bug. The critic should report it as a NOTED constraint
    // rather than a brief_to_design_fidelity HIGH issue.
    contractAcceptedTradeOffs: contractTradeOffs ?? null,
  }
}

function critiquePrompt(design: any, productClass: string): string {
  return `You are a senior systems-engineering reviewer. The chain that produced this design checks STRUCTURAL gates only (every heat source has a thermal_path link, modifiers are consistent, etc.). It does NOT check physics. That is your job.

Product class: ${productClass}

CONTRACT-ACCEPTED TRADE-OFFS (read FIRST):
The chain runs an upstream deterministic engineering contract that solves the design's integer-clean topology against ALL brief constraints simultaneously (mass cap, container envelope, voltage class, integer rack/string counts, cost ceiling). When the brief is over-constrained (e.g. a 3.5 MWh target cannot fit a single 40-ft / 28 t envelope at 800 V), the contract documents the accepted trade-off explicitly in \`contractAcceptedTradeOffs\` (see top of the design JSON). Trade-offs there are NOT bugs — they are deliberate engineering decisions the contract has already justified. Do not flag a trade-off recorded here as a brief_to_design_fidelity HIGH issue; instead, in your headline note "design honours documented trade-off X". Real fidelity bugs are values the contract does NOT record as accepted trade-offs.

Critique on five dimensions (0-10 each):
1. brief_to_design_fidelity — do the headline numbers actually satisfy the brief, EXCLUDING the trade-offs the contract has documented? Pay particular attention to: target endurance vs energy storage, target power output vs converter ratings, target throughput vs flow capacity, ambient temperature vs cooling capacity. Do the math.
2. engineering_plausibility — do the physics/spec values hold together? Check: current ratings vs cable cross-sections, heatsink capacity vs dissipated power, actuator torque vs required mechanical work, voltage classes consistent, mass/volume sane.
3. internal_coherence — modules link sensibly (sensor connects to controller not structural mount); no orphans; cross-links semantically correct.
4. part_realism — surviving (manufacturer, part_number) pairs look real, not fabricated-by-style.
5. honesty_signal — are uncertain items honestly flagged? Is the design claiming false confidence anywhere?

CRITICAL HONESTY RULE (read this twice):
- Every issue you surface MUST carry a confidence: high|medium|low|unknown
- "high" = you did the math and the number is wrong (with the wrong & right values)
- "medium" = the design looks suspect but verification needs a datasheet you don't have
- "low" = vibe-level concern, can't quantify
- "unknown" = you genuinely cannot tell — say so, do not guess
- For "unknown" findings, the suggested_check MUST be "manual review against datasheet/CAD/test plan" — never invent a specific value.

Be specific. Quote sub_module_ids and word_ids. If a value is wrong, show the calculation and what it should be.

Return ONLY this JSON (no markdown fences, no preamble):
{
  "scores": {
    "brief_to_design_fidelity": <0-10>,
    "engineering_plausibility": <0-10>,
    "internal_coherence": <0-10>,
    "part_realism": <0-10>,
    "honesty_signal": <0-10>
  },
  "headline": "<one sentence overall summary>",
  "issues": [
    {
      "dimension": "<one of the five>",
      "severity": "low|med|high",
      "confidence": "high|medium|low|unknown",
      "where": "<module/sub_module_id/word_id path>",
      "issue": "<concrete description with numbers and calculation if applicable>",
      "suggested_check": "<what the human reviewer should verify, or 'manual review against datasheet'>"
    }
  ],
  "what_worked": ["<one or two things this design got right>"]
}

DESIGN UNDER REVIEW:
${JSON.stringify(design, null, 2).slice(0, 80_000)}
`
}

export async function runPhysicsCritic(opts: {
  modules: any[]
  brief: any
  keyMetrics?: any
  partSummary?: any
  decisions?: any[]
  productClass: string
  apiKey: string
  model?: string
  /** BESS L4 (2026-05-24): contract-documented accepted trade-offs. Pass the
   *  engineering contract's brief_summary + brief_target_feasibility +
   *  container_count + the relevant closure reason text so the critic can see
   *  "design honours brief X with documented shortfall Y" rather than
   *  re-flag the shortfall as a brief_to_design_fidelity bug. */
  contractTradeOffs?: any
}): Promise<CritiqueReport | null> {
  const t0 = Date.now()
  const model = opts.model || FLASH_LITE_MODEL
  const design = compactDesign(opts.modules, opts.brief, opts.keyMetrics, opts.partSummary, opts.decisions ?? [], opts.contractTradeOffs)
  const prompt = critiquePrompt(design, opts.productClass)

  let res: Response
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://forge-os.com/critic',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        // 2026-05-19 firestorm iter-1 fix: 8K wasn't enough for 3.5 Flash on
        // the physics critic prompt — chain log "[chain] G3 review: ⚠
        // physics_critic: Physics critic did not return a structured critique"
        // (council G3 finding). Bumped to 16K. 3.5 Flash burns ~70% on
        // reasoning so output content is ~5K — fits at this budget.
        max_tokens: 16000,
        temperature: 0,
      }),
    })
  } catch (e) {
    console.error(`[physics-critic] network error: ${(e as Error).message}`)
    return null
  }
  if (!res.ok) {
    const body = await res.text()
    console.error(`[physics-critic] HTTP ${res.status}: ${body.slice(0, 300)}`)
    return null
  }
  const body = await res.json() as any
  const text = body?.choices?.[0]?.message?.content ?? ''
  let parsed: any
  try {
    parsed = JSON.parse(text)
  } catch {
    console.error(`[physics-critic] JSON parse failed; raw: ${text.slice(0, 300)}`)
    return null
  }

  // Honesty-rule enforcement: any issue without a confidence field gets 'unknown'
  // appended + the suggested_check is forced to the safe default.
  const issues: CritiqueIssue[] = (parsed.issues || []).map((raw: any) => {
    const conf = ['high', 'medium', 'low', 'unknown'].includes(raw.confidence) ? raw.confidence : 'unknown'
    const sev = ['low', 'med', 'high'].includes(raw.severity) ? raw.severity : 'med'
    const check = conf === 'unknown' ? 'manual review against datasheet/CAD/test plan' : (raw.suggested_check ?? '')
    return {
      dimension: raw.dimension ?? 'engineering_plausibility',
      severity: sev,
      confidence: conf,
      where: String(raw.where ?? '-'),
      issue: String(raw.issue ?? ''),
      suggested_check: check,
    }
  })

  return {
    scores: parsed.scores ?? {
      brief_to_design_fidelity: 0,
      engineering_plausibility: 0,
      internal_coherence: 0,
      part_realism: 0,
      honesty_signal: 0,
    },
    headline: String(parsed.headline ?? ''),
    issues,
    what_worked: Array.isArray(parsed.what_worked) ? parsed.what_worked.map(String) : [],
    model,
    latency_ms: Date.now() - t0,
  }
}
