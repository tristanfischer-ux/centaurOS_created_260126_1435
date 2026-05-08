/**
 * stage-rl-iterate.ts — Stage-agnostic, growing-window RL loop for the PDF engine v2.
 *
 * Fixes four flaws in the per-stage RL scripts:
 *
 * 1. NO CACHING of upstream outputs — every iteration re-runs pipeline stages 0..N
 *    from the founder brief so the target stage is optimised against the live
 *    upstream distribution, not a single frozen realisation.
 *
 * 2. ALL 10 BASELINE BRIEFS — by default every brief in
 *    src/lib/pdf-engine-v2/briefs/baseline-10/ is used. The score that matters is
 *    the mean across the full diversity set, not one BESS or one HAPS.
 *
 * 3. SAME COUNCIL AS PRODUCTION — scoring calls runCouncilScoring() from
 *    council-scorer.ts directly (the exact same code path the pipeline uses),
 *    then extracts the target section score. No re-implementation.
 *
 * 4. STAGE-AGNOSTIC — parameterised by stage name, not a separate script per stage.
 *
 * Usage:
 *   npx tsx src/lib/pdf-engine-v2/stage-rl-iterate.ts \
 *     --stage decompose \
 *     --iterations 5 \
 *     --briefs all \
 *     --label my-run \
 *     --output ~/Downloads/engine-evidence/my-run
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readdirSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..', '..')
const BRIEFS_DIR = join(__dirname, 'briefs', 'baseline-10')

// ─── Stage → council section mapping ──────────────────────────────────────────
// Maps each pipeline stage name to the council section key(s) that measure its
// output quality. The first key in the array is the PRIMARY score used for RL.
const STAGE_TO_COUNCIL_SECTION: Record<string, string[]> = {
  training_data:   ['Research'],         // training data enriches research
  research:        ['Research'],
  brief_generation:['Brief'],
  decompose:       ['Modules'],
  size_layout:     ['Sizing'],
  bom_cost:        ['BOM', 'Cost'],
  suppliers:       ['Suppliers'],
  review:          ['Risks'],            // review produces risk matrix + proofreader
}

// Canonical list of supported stage names (mirrors pipeline stage names used in
// trackStage() calls in index.ts). Used for validation and help text.
const SUPPORTED_STAGES = Object.keys(STAGE_TO_COUNCIL_SECTION)

// ─── CLI arg parsing ───────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag: string) => {
    const idx = args.indexOf(flag)
    return idx >= 0 ? args[idx + 1] : undefined
  }

  const stage = get('--stage')
  if (!stage) {
    console.error(`[stage-rl] --stage is required. Supported stages: ${SUPPORTED_STAGES.join(', ')}`)
    process.exit(1)
  }
  if (!SUPPORTED_STAGES.includes(stage)) {
    console.error(`[stage-rl] Unknown stage "${stage}". Supported: ${SUPPORTED_STAGES.join(', ')}`)
    process.exit(1)
  }

  const iterations = parseInt(get('--iterations') || '5')
  const briefsArg = get('--briefs') || 'all'
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const label = get('--label') || `rl-stage-${stage}-${timestamp}`
  const output = get('--output') || join(process.env.HOME || '~', 'Downloads', 'engine-evidence', label)

  // Resolve brief file list
  let briefFiles: string[] = []
  if (briefsArg === 'all') {
    if (!existsSync(BRIEFS_DIR)) {
      console.error(`[stage-rl] Briefs directory not found: ${BRIEFS_DIR}`)
      process.exit(1)
    }
    briefFiles = readdirSync(BRIEFS_DIR)
      .filter(f => f.endsWith('.md'))
      .sort()
      .map(f => join(BRIEFS_DIR, f))
  } else {
    briefFiles = briefsArg.split(',').map(b => {
      const trimmed = b.trim()
      // Accept absolute paths, relative paths, or bare filenames
      if (trimmed.startsWith('/')) return trimmed
      if (existsSync(join(BRIEFS_DIR, trimmed))) return join(BRIEFS_DIR, trimmed)
      if (existsSync(join(BRIEFS_DIR, trimmed + '.md'))) return join(BRIEFS_DIR, trimmed + '.md')
      return trimmed // will fail later with a clear error
    })
  }

  return { stage, iterations, briefFiles, label, outputDir: output }
}

// ─── Per-brief pipeline run up to target stage ────────────────────────────────

/**
 * Run pipeline stages 0..targetStage for a single brief and return the
 * full PipelineState. Every call starts fresh — no caching of upstream outputs.
 *
 * Returns null on unrecoverable failure (e.g. research fails).
 */
async function runPipelineUpToStage(
  briefText: string,
  targetStage: string,
  briefSlug: string,
): Promise<any | null> {
  console.log(`  [${briefSlug}] Running pipeline up to stage "${targetStage}"...`)

  // Dynamic imports — avoids loading the whole pipeline at module parse time
  // and keeps the RL script self-contained.
  const { runTrainingDataDump } = await import('./stages/0-training-data.js')
  const { runBriefGeneration } = await import('./stages/0-brief-generation.js')
  const { runResearch } = await import('./stages/1-research.js')
  const { runDecompose } = await import('./stages/2-decompose.js')
  const { runSizeLayout } = await import('./stages/3-size-layout.js')
  const { runBomCost } = await import('./stages/4-bom-cost.js')
  const { runSuppliers } = await import('./stages/5-suppliers.js')
  const { runReview } = await import('./stages/6-review.js')
  const { classifyProduct } = await import('./product-classifier.js')

  // Build a minimal PipelineState (matches PipelineState from types.ts)
  const state: any = {
    projectId: briefSlug,
    briefText,
    research: null,
    modules: [],
    dimensionSheet: null,
    parts: [],
    bomLines: [],
    costBreakdown: null,
    reviews: [],
    suppliers: [],
    proofreadFindings: null,
    sourceAttributions: [],
    llmAttributions: [],
    sectionScores: [],
  }

  const stagesOrdered = [
    'training_data',
    'research',
    'brief_generation',
    'decompose',
    'size_layout',
    'bom_cost',
    'suppliers',
    'review',
  ]

  const targetIdx = stagesOrdered.indexOf(targetStage)

  // ── training_data ──────────────────────────────────────────────────────────
  let trainingDossier: string | undefined
  if (stagesOrdered.indexOf('training_data') <= targetIdx) {
    try {
      const r = await runTrainingDataDump(briefText)
      if (r.ok && r.data) {
        trainingDossier = (r.data as any).dossier
      }
    } catch (err) {
      console.warn(`  [${briefSlug}] training_data failed (non-fatal): ${(err as Error).message}`)
    }
  }

  // ── research ───────────────────────────────────────────────────────────────
  if (stagesOrdered.indexOf('research') <= targetIdx) {
    const r = await runResearch(briefText, { trainingDataDossier: trainingDossier })
    if (!r.ok || !r.data) {
      console.error(`  [${briefSlug}] research FAILED: ${r.error} — skipping brief`)
      return null
    }
    state.research = r.data
  }

  // ── brief_generation ───────────────────────────────────────────────────────
  if (stagesOrdered.indexOf('brief_generation') <= targetIdx) {
    const classification = classifyProduct(briefText)
    const r = await runBriefGeneration(briefText, classification.productClass)
    if (r.ok && r.data) {
      state.generatedBrief = r.data
      // Sync generated brief fields back to designBrief (mirrors index.ts logic)
      if (state.research) {
        const bf = r.data.fields
        const existing = state.research.designBrief || {}
        state.research.designBrief = {
          ...existing,
          useCase: bf.objectives?.join('. ') || existing.useCase || '',
          targetProcess: existing.targetProcess || '',
          targetMaterial: existing.targetMaterial || '',
          toleranceTarget: existing.toleranceTarget || '',
          quantityTarget: bf.productionVolume || existing.quantityTarget || '',
          complianceNotes: existing.complianceNotes || '',
          mission: bf.purpose || existing.mission,
          constraints: {
            ...existing.constraints,
            unitCostCeilingGbp: bf.costCeiling ?? existing.constraints?.unitCostCeilingGbp,
            maxMassKg: bf.maxMass ?? existing.constraints?.maxMassKg,
            batchSize: bf.productionVolume || existing.constraints?.batchSize,
            jurisdiction: bf.jurisdiction || existing.constraints?.jurisdiction,
            envelope: bf.envelope || existing.constraints?.envelope,
            operatingTemperature: bf.operatingTemp || existing.constraints?.operatingTemperature,
          },
        }
      }
    } else {
      console.warn(`  [${briefSlug}] brief_generation failed (non-fatal): ${r.error}`)
    }
  }

  // ── decompose ──────────────────────────────────────────────────────────────
  if (stagesOrdered.indexOf('decompose') <= targetIdx) {
    if (!state.research) {
      console.error(`  [${briefSlug}] decompose requires research — skipping`)
      return null
    }
    const r = await runDecompose(state.research, { trainingDataDossier: trainingDossier })
    if (!r.ok || !r.data) {
      console.error(`  [${briefSlug}] decompose FAILED: ${r.error} — skipping brief`)
      return null
    }
    state.modules = r.data
  }

  // ── size_layout ────────────────────────────────────────────────────────────
  if (stagesOrdered.indexOf('size_layout') <= targetIdx) {
    if (!state.modules?.length) {
      console.warn(`  [${briefSlug}] size_layout: no modules available, skipping`)
    } else {
      const r = await runSizeLayout(state.modules, {
        domain: state.research?.industryDomain,
      })
      if (r.ok && r.data) state.dimensionSheet = r.data
      // Non-fatal: sizing may be INFEASIBLE but we still want to score the output
    }
  }

  // ── bom_cost ───────────────────────────────────────────────────────────────
  if (stagesOrdered.indexOf('bom_cost') <= targetIdx) {
    if (!state.modules?.length) {
      console.warn(`  [${briefSlug}] bom_cost: no modules available, skipping`)
    } else {
      const r = await runBomCost(state.modules, state.dimensionSheet, {
        domain: state.research?.industryDomain,
      })
      if (r.ok && r.data) {
        state.parts = r.data.parts
        state.bomLines = r.data.bomLines
        state.costBreakdown = r.data.costBreakdown
      } else {
        console.warn(`  [${briefSlug}] bom_cost failed (non-fatal): ${r.error}`)
      }
    }
  }

  // ── suppliers ──────────────────────────────────────────────────────────────
  if (stagesOrdered.indexOf('suppliers') <= targetIdx) {
    if (!state.parts?.length) {
      console.warn(`  [${briefSlug}] suppliers: no parts available, skipping`)
    } else {
      const r = await runSuppliers(state.parts, {
        domain: state.research?.industryDomain,
      })
      if (r.ok && r.data) state.suppliers = r.data
      else console.warn(`  [${briefSlug}] suppliers failed (non-fatal): ${r.error}`)
    }
  }

  // ── review ─────────────────────────────────────────────────────────────────
  if (stagesOrdered.indexOf('review') <= targetIdx) {
    if (!state.modules?.length || !state.research) {
      console.warn(`  [${briefSlug}] review: missing modules or research, skipping`)
    } else {
      const r = await runReview(state.modules, state.research)
      if (r.ok && r.data) {
        state.reviews = r.data.reviews
        state.proofreadFindings = r.data.proofreadFindings
      } else {
        console.warn(`  [${briefSlug}] review failed (non-fatal): ${r.error}`)
      }
    }
  }

  return state
}

// ─── Score target section from PipelineState ──────────────────────────────────

/**
 * Run the SAME council scorer the pipeline uses and extract the primary
 * section score for the target stage. Returns -1 if the section could not
 * be scored (propagated sentinel, excluded from averages).
 */
async function scoreState(
  state: any,
  targetStage: string,
): Promise<{ primary: number; allSections: any[] }> {
  const { runCouncilScoring } = await import('./council-scorer.js')

  const result = await runCouncilScoring(state)
  if (!result.ok || !result.data) {
    return { primary: -1, allSections: [] }
  }

  const primarySection = STAGE_TO_COUNCIL_SECTION[targetStage]?.[0]
  const sectionScore = result.data.find((s: any) => s.section === primarySection)
  const primary = sectionScore?.score ?? -1

  return { primary, allSections: result.data }
}

// ─── Prompt evolution (mirrors mechanic from existing *-rl-iterate.ts files) ──

/**
 * Ask an LLM council to suggest changes to the stage's system prompt based
 * on the aggregated scores and reasons from this iteration.
 *
 * Returns suggested changes as an array of { what, reasoning } objects.
 */
async function proposeSuggestions(
  stage: string,
  currentPrompt: string,
  iterScores: Array<{ briefSlug: string; score: number; reasons: string[] }>,
  iterationIdx: number,
): Promise<Array<{ what: string; reasoning: string }>> {
  const scored = iterScores.filter(s => s.score >= 0)
  if (scored.length === 0) return []

  const meanScore = scored.reduce((acc, s) => acc + s.score, 0) / scored.length
  const allReasons = [...new Set(scored.flatMap(s => s.reasons))].slice(0, 10)

  const prompt = `You are improving the system prompt for the "${stage}" stage of an engineering report PDF generator.

CURRENT MEAN SCORE: ${meanScore.toFixed(2)}/10 (across ${scored.length} briefs)
ISSUES IDENTIFIED BY JUDGES:
${allReasons.map((r, i) => `${i + 1}. ${r}`).join('\n')}

WORST-PERFORMING BRIEFS:
${scored
  .sort((a, b) => a.score - b.score)
  .slice(0, 3)
  .map(s => `- ${s.briefSlug}: ${s.score}/10`)
  .join('\n')}

CURRENT PROMPT (first 3000 chars):
\`\`\`
${currentPrompt.slice(0, 3000)}
\`\`\`

Suggest 1-3 specific, targeted changes to the prompt that would lift the mean score toward 8/10.
Each change must be a concrete text addition or replacement — not vague advice.
Focus on what the judges consistently flagged as missing or weak.

Return ONLY valid JSON:
{
  "changes": [
    {
      "what": "Concise description of the change",
      "reasoning": "Why this addresses the judge feedback"
    }
  ]
}`

  try {
    const raw = await callLLM(
      'google/gemini-3.1-pro-preview',
      'You are a prompt engineering expert. Return ONLY valid JSON.',
      prompt,
      4096,
    )
    const parsed = extractJSON(raw)
    return parsed?.changes || []
  } catch (err) {
    console.warn(`[stage-rl] getSuggestions failed: ${(err as Error).message}`)
    return []
  }
}

// ─── Prompt persistence ────────────────────────────────────────────────────────

/**
 * Load the current system prompt for a stage from the source file (if it exists).
 * Falls back to a placeholder so the loop can still record suggestions.
 *
 * The existing RL scripts all carry a local TEMPLATE constant — this function
 * reads the matching constant from the stage file where possible, so suggestions
 * target the actual live prompt.
 */
async function loadCurrentPrompt(stage: string): Promise<string> {
  const stageFileMap: Record<string, string> = {
    research:         join(__dirname, 'stages', '1-research.ts'),
    brief_generation: join(__dirname, 'stages', '0-brief-generation.ts'),
    decompose:        join(__dirname, 'stages', '2-decompose.ts'),
    size_layout:      join(__dirname, 'stages', '3-size-layout.ts'),
    bom_cost:         join(__dirname, 'stages', '4-bom-cost.ts'),
    suppliers:        join(__dirname, 'stages', '5-suppliers.ts'),
    review:           join(__dirname, 'stages', '6-review.ts'),
  }

  const filePath = stageFileMap[stage]
  if (filePath && existsSync(filePath)) {
    try {
      const src = readFileSync(filePath, 'utf-8')
      // Return the first 4000 chars of the file as context for suggestion generation
      return src.slice(0, 4000)
    } catch {
      // fall through
    }
  }

  // training_data has no separate stage file worth iterating
  return `[No prompt source file found for stage "${stage}". Suggestions will be based on judge feedback only.]`
}

// ─── LLM + JSON helpers (same pattern as existing RL iterate files) ────────────

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
  return json.choices?.[0]?.message?.content || ''
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

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { stage, iterations, briefFiles, label, outputDir } = parseArgs()

  console.log(`\n[stage-rl] === Stage RL Iterate ===`)
  console.log(`[stage-rl] Stage:      ${stage}`)
  console.log(`[stage-rl] Iterations: ${iterations}`)
  console.log(`[stage-rl] Briefs:     ${briefFiles.length} files`)
  console.log(`[stage-rl] Label:      ${label}`)
  console.log(`[stage-rl] Output:     ${outputDir}`)
  console.log(`[stage-rl] Primary council section: ${STAGE_TO_COUNCIL_SECTION[stage]?.[0]}`)

  mkdirSync(outputDir, { recursive: true })

  // Load brief texts up front
  const briefs: Array<{ slug: string; text: string }> = []
  for (const filePath of briefFiles) {
    if (!existsSync(filePath)) {
      console.error(`[stage-rl] Brief file not found: ${filePath}`)
      process.exit(1)
    }
    const text = readFileSync(filePath, 'utf-8')
    const slug = filePath.split('/').pop()?.replace(/\.md$/, '') || filePath
    briefs.push({ slug, text })
  }

  console.log(`[stage-rl] Briefs loaded: ${briefs.map(b => b.slug).join(', ')}`)

  // Load the current stage prompt (for suggestion generation)
  const currentPrompt = await loadCurrentPrompt(stage)

  // RL loop history — one entry per iteration
  const history: Array<{
    iteration: number
    briefScores: Array<{ briefSlug: string; score: number; reasons: string[]; allSections: any[] }>
    meanScore: number
    suggestions: Array<{ what: string; reasoning: string }>
    promptContext: string   // snapshot of what prompt was used this iteration
  }> = []

  let bestIterIdx = 0
  let bestMean = -Infinity

  for (let iter = 1; iter <= iterations; iter++) {
    console.log(`\n[stage-rl] === Iteration ${iter}/${iterations} ===`)
    const iterDir = join(outputDir, `iter-${iter}`)
    mkdirSync(iterDir, { recursive: true })

    const briefScores: Array<{ briefSlug: string; score: number; reasons: string[]; allSections: any[] }> = []

    // Run all briefs in parallel (respecting the project's concurrency pattern —
    // existing scripts use 3 parallel processes; we use Promise.allSettled with
    // the full set since each brief is an independent pipeline run).
    //
    // Concurrency cap: max 3 simultaneous pipeline runs to avoid OpenRouter rate
    // limits. Matches the existing scripts/brief-rl-loop.sh pattern.
    const CONCURRENCY = 3
    for (let i = 0; i < briefs.length; i += CONCURRENCY) {
      const batch = briefs.slice(i, i + CONCURRENCY)
      console.log(`\n[stage-rl] Brief batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(briefs.length / CONCURRENCY)}: ${batch.map(b => b.slug).join(', ')}`)

      const batchResults = await Promise.allSettled(
        batch.map(async (brief) => {
          const state = await runPipelineUpToStage(brief.text, stage, brief.slug)
          if (!state) {
            console.warn(`  [${brief.slug}] Pipeline failed — excluding from iteration mean`)
            return { briefSlug: brief.slug, score: -1, reasons: ['Pipeline failed'], allSections: [] }
          }

          const { primary, allSections } = await scoreState(state, stage)
          const primarySection = STAGE_TO_COUNCIL_SECTION[stage]?.[0] || stage
          const sectionData = allSections.find((s: any) => s.section === primarySection)
          const reasons: string[] = sectionData?.overall_reasons || []

          console.log(`  [${brief.slug}] ${primarySection}: ${primary >= 0 ? `${primary}/10` : 'FAILED'}`)

          // Write per-brief state snapshot
          const stateSnapshot = {
            briefSlug: brief.slug,
            stage,
            primarySection,
            score: primary,
            reasons,
            allSections,
          }
          writeFileSync(
            join(iterDir, `${brief.slug}.json`),
            JSON.stringify(stateSnapshot, null, 2),
          )

          return { briefSlug: brief.slug, score: primary, reasons, allSections }
        }),
      )

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          briefScores.push(result.value)
        } else {
          console.error(`  Brief failed with exception: ${result.reason}`)
        }
      }
    }

    // Compute mean over scored briefs (exclude -1 sentinels)
    const scored = briefScores.filter(s => s.score >= 0)
    const meanScore =
      scored.length > 0
        ? scored.reduce((acc, s) => acc + s.score, 0) / scored.length
        : -1

    console.log(
      `\n[stage-rl] Iteration ${iter} mean: ${meanScore >= 0 ? meanScore.toFixed(2) : 'N/A'}/10 ` +
      `(${scored.length}/${briefScores.length} briefs scored)`,
    )

    if (meanScore > bestMean) {
      bestMean = meanScore
      bestIterIdx = iter - 1 // 0-based index into history
    }

    // Propose prompt improvements for next iteration
    const suggestions = await proposeSuggestions(
      stage,
      currentPrompt,
      briefScores,
      iter,
    )

    if (suggestions.length > 0) {
      console.log(`[stage-rl] Suggestions for next iteration:`)
      for (const s of suggestions) {
        console.log(`  - ${s.what}`)
      }
    } else {
      console.log(`[stage-rl] No suggestions generated.`)
    }

    const iterEntry = {
      iteration: iter,
      briefScores,
      meanScore,
      suggestions,
      promptContext: currentPrompt.slice(0, 500),
    }
    history.push(iterEntry)

    // Write per-iteration summary
    writeFileSync(join(iterDir, 'summary.json'), JSON.stringify(iterEntry, null, 2))

    // Early exit if target reached
    if (meanScore >= 8.0) {
      console.log(`\n[stage-rl] Target 8/10 reached at iteration ${iter}. Stopping early.`)
      break
    }
  }

  // ── Write top-level summary.json ──────────────────────────────────────────
  const summary = {
    label,
    stage,
    iterations: history.length,
    briefCount: briefs.length,
    bestIteration: history[bestIterIdx]?.iteration ?? 1,
    bestMeanScore: bestMean >= 0 ? parseFloat(bestMean.toFixed(3)) : null,
    history: history.map(h => ({
      iteration: h.iteration,
      meanScore: h.meanScore >= 0 ? parseFloat(h.meanScore.toFixed(3)) : null,
      scoredBriefs: h.briefScores.filter(s => s.score >= 0).length,
      totalBriefs: h.briefScores.length,
      briefScores: h.briefScores.map(s => ({ slug: s.briefSlug, score: s.score })),
    })),
  }
  writeFileSync(join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2))

  // ── Write BEST.md ──────────────────────────────────────────────────────────
  const bestIter = history[bestIterIdx]
  const bestScored = bestIter?.briefScores.filter(s => s.score >= 0) || []
  const worstBriefs = [...bestScored].sort((a, b) => a.score - b.score).slice(0, 3)
  const bestBriefs = [...bestScored].sort((a, b) => b.score - a.score).slice(0, 3)

  const allReasons = [
    ...new Set(bestScored.flatMap(s => s.reasons)),
  ].slice(0, 8)

  const bestMd = `# Stage RL — Best Iteration Report

**Stage:** ${stage}
**Label:** ${label}
**Best Iteration:** ${bestIter?.iteration ?? 'N/A'} of ${history.length}
**Best Mean Score:** ${bestMean >= 0 ? bestMean.toFixed(2) : 'N/A'}/10 (${bestScored.length} briefs scored)
**Primary Council Section:** ${STAGE_TO_COUNCIL_SECTION[stage]?.[0]}

## Score Delta Across Iterations

| Iteration | Mean | Briefs Scored |
|---|---|---|
${history.map(h => `| ${h.iteration} | ${h.meanScore >= 0 ? h.meanScore.toFixed(2) : 'N/A'}/10 | ${h.briefScores.filter(s => s.score >= 0).length}/${h.briefScores.length} |`).join('\n')}

## Per-Brief Scores (Best Iteration)

| Brief | Score |
|---|---|
${bestScored
  .sort((a, b) => a.briefSlug.localeCompare(b.briefSlug))
  .map(s => `| ${s.briefSlug} | ${s.score}/10 |`)
  .join('\n')}

## Top-Scoring Briefs
${bestBriefs.map(s => `- **${s.briefSlug}**: ${s.score}/10`).join('\n')}

## Worst-Scoring Briefs (Highest RL Priority)
${worstBriefs.map(s => `- **${s.briefSlug}**: ${s.score}/10`).join('\n')}

## Judge Feedback (Best Iteration)
${allReasons.map(r => `- ${r}`).join('\n')}

## Suggestions Generated in Final Iteration
${(bestIter?.suggestions || []).map(s => `- **${s.what}**: ${s.reasoning}`).join('\n') || '_None_'}

## Prompt Source File
\`${join(__dirname, 'stages', `*${stage}*`)}\`

## Output Directory
\`${outputDir}\`
`

  writeFileSync(join(outputDir, 'BEST.md'), bestMd)

  console.log(`\n[stage-rl] === Complete ===`)
  console.log(`[stage-rl] Best iteration: ${bestIter?.iteration ?? 'N/A'} (mean ${bestMean >= 0 ? bestMean.toFixed(2) : 'N/A'}/10)`)
  console.log(`[stage-rl] Summary:  ${join(outputDir, 'summary.json')}`)
  console.log(`[stage-rl] Best:     ${join(outputDir, 'BEST.md')}`)
}

main().catch(err => {
  console.error('[stage-rl] Fatal:', err)
  process.exit(1)
})
