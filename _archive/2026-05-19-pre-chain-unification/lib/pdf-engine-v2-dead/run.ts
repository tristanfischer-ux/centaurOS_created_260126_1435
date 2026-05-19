#!/usr/bin/env npx tsx
/**
 * @file run.ts — CLI entry point for the one-shot PDF engine v2
 *
 * Usage:
 *   npx tsx src/lib/pdf-engine-v2/run.ts <project-id>
 *   npx tsx src/lib/pdf-engine-v2/run.ts --brief "A compact BESS for residential..."
 *
 * Reads from Supabase if project-id is provided, or uses --brief text directly.
 * Writes the PDF to stdout (base64) and progress to stderr.
 */

// Load env vars from .env.local + ~/.claude/secrets/distributor-apis.env if not already set.
// Piece 1D.1 2026-05-12: distributor API credentials (MOUSER_API_KEY, DIGIKEY_CLIENT_ID,
// DIGIKEY_CLIENT_SECRET, FARNELL_API_KEY) live OUTSIDE the repo at
// ~/.claude/secrets/distributor-apis.env. Without loading them, Stage 4b resolution
// falls back to grade_d_table — V10-legacy stats showed 93/101 leaves as grade_d,
// 0 verified_by_distributor — directly impacting §6 BoM scores.
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { homedir } from 'os'

const envFilesToLoad = [
  resolve(process.cwd(), '.env.local'),
  resolve(homedir(), '.claude/secrets/distributor-apis.env'),
  // 2026-05-13: Tavily search API for Stage 13 (Assembly Partner Discovery) +
  // Stage 7 plausibility-grounding fallback. Free tier: 1k searches/month.
  resolve(homedir(), '.claude/secrets/tavily.env'),
]

for (const envPath of envFilesToLoad) {
  try {
    const envContent = readFileSync(envPath, 'utf-8')
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=')
        const value = valueParts.join('=').replace(/^["']|["']$/g, '')
        if (!process.env[key]) {
          process.env[key] = value
        }
      }
    }
  } catch {
    // env file not found — continue with existing env
  }
}

import { runPipeline } from './index'
import { getSupabase } from './supabase-client'
import { runBriefAugmentation } from './stages/-1-brief-augmenter'
import { writeFileSync } from 'fs'
import { join } from 'path'

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.error('Usage:')
    console.error('  npx tsx src/lib/pdf-engine-v2/run.ts <project-id>')
    console.error('  npx tsx src/lib/pdf-engine-v2/run.ts --brief "Your product brief here"')
    process.exit(1)
  }

  let briefText: string
  let projectId: string | undefined
  let trainingDataDossier: string | undefined
  let domain: string | undefined
  let ceilingGbp: number | undefined
  let outputPrefix: string | undefined

  // Strip --output-prefix <value> from args before other parsing
  const outputPrefixIdx = args.indexOf('--output-prefix')
  if (outputPrefixIdx !== -1 && outputPrefixIdx + 1 < args.length) {
    outputPrefix = args[outputPrefixIdx + 1]
    args.splice(outputPrefixIdx, 2)
  }

  if (args[0] === '--brief') {
    briefText = args.slice(1).join(' ')
  } else {
    // Load from Supabase
    projectId = args[0]
    console.error(`[run] Loading project ${projectId} from Supabase...`)

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('cad_lab_projects')
      .select('subject, founder_raw_brief, research, autopilot_state')
      .eq('id', projectId)
      .single()

    if (error || !data) {
      console.error(`[run] Failed to load project: ${error?.message || 'not found'}`)
      process.exit(1)
    }

    briefText = data.founder_raw_brief || data.subject || ''
    if (!briefText) {
      console.error('[run] Project has no brief text (subject or founder_raw_brief)')
      process.exit(1)
    }

    // Extract training data dossier if present
    if (data.research && typeof data.research === 'object') {
      const research = data.research as Record<string, unknown>
      if (typeof research.trainingDataDossier === 'string') {
        trainingDataDossier = research.trainingDataDossier
      }
      if (typeof research.industryDomain === 'string') {
        domain = research.industryDomain
      }
    }

    console.error(`[run] Brief: "${briefText.slice(0, 100)}..."`)
  }

  console.error(`[run] Starting pipeline...`)
  console.error(`[run] Brief length: ${briefText.length} chars`)
  if (domain) console.error(`[run] Domain: ${domain}`)
  if (trainingDataDossier) console.error(`[run] Training data: ${trainingDataDossier.length} chars`)

  // P0a — Brief augmentation. Runs BEFORE Stage 0 brief-generation so sparse
  // founder briefs ("I want a heat pump", "BESS") arrive at Stage 0 carrying
  // class-typical defaults. Never throws — pipeline always continues even
  // if class inference fails. Design: stages/-1-brief-augmenter.ts.
  const augmentation = await runBriefAugmentation(briefText)
  console.error(`[run] P0a brief-augmenter: class=${augmentation.inferredClass}, filled=${augmentation.filled.length} fields, cost=£${augmentation.costGbp.toFixed(4)}, ok=${augmentation.ok}`)
  briefText = augmentation.augmentedBrief

  // Action-log dir (Tristan 2026-05-18, CLAUDE.md "Engine action logs"):
  //
  //   1. `--action-log-dir <path>` overrides everything.
  //   2. Else, `PDF_ENGINE_ACTION_LOG_DIR` env var (set by run-bess-iter.sh
  //      + engine-evidence-bg.sh wrappers).
  //   3. Else, a sibling dir next to the PDF: `<cwd>/<output-base>-actions/`.
  //      Keeps single-shot CLI invocations diagnose-able by default.
  //
  // Pure-additive: an unset value leaves the logger silent.
  let actionLogDir: string | undefined = process.env.PDF_ENGINE_ACTION_LOG_DIR
  const cliActionDirIdx = process.argv.indexOf('--action-log-dir')
  if (cliActionDirIdx !== -1 && cliActionDirIdx + 1 < process.argv.length) {
    actionLogDir = process.argv[cliActionDirIdx + 1]
  }
  if (!actionLogDir) {
    const base = outputPrefix ? `output-${outputPrefix}` : `output-${Date.now()}`
    actionLogDir = join(process.cwd(), `${base}-actions`)
  }
  console.error(`[run] action-log dir: ${actionLogDir}`)

  const result = await runPipeline(briefText, {
    trainingDataDossier,
    domain,
    ceilingGbp,
    projectId,
    actionLogDir,
  })

  // Print summary to stderr
  console.error('\n[run] === Results ===')
  console.error(`[run] OK: ${result.ok}`)
  console.error(`[run] Duration: ${result.totalDurationMs}ms`)
  console.error(`[run] LLM calls: ${result.totalLlmCalls}`)

  for (const stage of result.stages) {
    console.error(`  ${stage.name}: ${stage.ok ? 'OK' : 'FAIL'} (${stage.durationMs}ms)${stage.error ? ` — ${stage.error}` : ''}`)
  }

  if (result.gateResults) {
    console.error('\n[run] Gates:')
    for (const gate of result.gateResults) {
      console.error(`  ${gate.gate}: ${gate.passed ? 'PASS' : 'FAIL'}`)
    }
  }

  if (result.pdf) {
    // Write PDF to file — use outputPrefix if provided for race-safe parallel runs
    const filenameBase = outputPrefix ? `output-${outputPrefix}` : `output-${Date.now()}`
    const outputPath = join(process.cwd(), `${filenameBase}.pdf`)
    const buffer = Buffer.from(result.pdf.base64, 'base64')
    writeFileSync(outputPath, buffer)
    console.error(`\n[run] PDF written to: ${outputPath}`)
    console.error(`[run] Size: ${(result.pdf.sizeBytes / 1024).toFixed(1)} KB`)
  } else {
    console.error('\n[run] No PDF generated.')
  }

  // Output result as JSON to stdout
  const output = {
    ok: result.ok,
    projectId: result.state.projectId,
    stages: result.stages,
    gateResults: result.gateResults,
    totalDurationMs: result.totalDurationMs,
    totalLlmCalls: result.totalLlmCalls,
    pdfFilename: result.pdf?.filename || null,
    pdfSizeBytes: result.pdf?.sizeBytes || null,
  }
  console.log(JSON.stringify(output, null, 2))
}

main().catch(err => {
  console.error('[run] Fatal error:', err)
  process.exit(1)
})
