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

// Load env vars from .env.local if not already set
import { readFileSync } from 'fs'
import { resolve } from 'path'
try {
  const envPath = resolve(process.cwd(), '.env.local')
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
} catch (e) {
  // .env.local not found — continue with existing env
}

import { runPipeline } from './index'
import { getSupabase } from './supabase-client'
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

  const result = await runPipeline(briefText, {
    trainingDataDossier,
    domain,
    ceilingGbp,
    projectId,
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
    // Write PDF to file
    const outputPath = join(process.cwd(), `output-${Date.now()}.pdf`)
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
