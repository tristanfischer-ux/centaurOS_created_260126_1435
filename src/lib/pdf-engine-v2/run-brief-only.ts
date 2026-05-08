/**
 * run-brief-only.ts — Mini-pipeline that runs only stages 0→1→0.5
 * and outputs the Brief section text for fast RL iteration.
 * 
 * Usage: npx tsx src/lib/pdf-engine-v2/run-brief-only.ts --brief "brief text" --output /path/to/dir
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  const args = process.argv.slice(2)
  const briefIdx = args.indexOf('--brief')
  const outputIdx = args.indexOf('--output')
  
  if (briefIdx === -1 || outputIdx === -1) {
    console.error('Usage: npx tsx src/lib/pdf-engine-v2/run-brief-only.ts --brief "text" --output /path')
    process.exit(1)
  }
  
  const briefText = args[briefIdx + 1]
  const outputDir = args[outputIdx + 1]
  mkdirSync(outputDir, { recursive: true })
  
  console.log('[brief-only] Starting mini-pipeline...')
  console.log(`[brief-only] Brief length: ${briefText.length} chars`)
  
  // Stage 0: Training data dump (1 model only — fast)
  console.log('[brief-only] Stage 0: Training data (1 model)...')
  const { runTrainingDataDump } = await import(join(__dirname, 'stages/0-training-data'))
  const trainingResult = await runTrainingDataDump(briefText)
  const trainingDossier = trainingResult.ok ? trainingResult.data?.dossier || '' : ''
  console.log(`[brief-only] Training data: ${trainingDossier.length} chars`)
  
  // Stage 1: Research
  console.log('[brief-only] Stage 1: Research...')
  const { runResearch } = await import(join(__dirname, 'stages/1-research'))
  const researchResult = await runResearch(briefText, trainingDossier)
  if (!researchResult.ok) {
    console.error('[brief-only] Research failed:', researchResult.error)
    process.exit(1)
  }
  console.log(`[brief-only] Research: ${researchResult.data?.report?.length || 0} chars`)
  
  // Stage 0.5: Brief expansion
  console.log('[brief-only] Stage 0.5: Brief expansion...')
  const { runBriefExpansion } = await import(join(__dirname, 'stages/0.5-brief-expansion'))
  const classification = { productClass: 'unknown', confidence: 'LOW' as const, technologyDomains: [] }
  const expansionResult = await runBriefExpansion(briefText, classification.productClass, classification)
  console.log(`[brief-only] Expansion: ${expansionResult.ok ? 'ok' : 'failed'}`)
  
  // Build Brief section text using the 5-section council template
  const briefSection = buildBriefSection(briefText, researchResult.data, expansionResult.ok ? expansionResult.data : null)
  writeFileSync(join(outputDir, 'brief-section.txt'), briefSection)
  console.log(`[brief-only] Brief section: ${briefSection.length} chars`)
  
  // Save research data for analysis
  writeFileSync(join(outputDir, 'research.json'), JSON.stringify(researchResult.data, null, 2))
  
  console.log('[brief-only] Done.')
}

/**
 * Build the Brief section using the 5-section template that scores 8/10:
 * 1. Project Purpose (1 sentence, quantifiable)
 * 2. Core Objectives (3-5 bullets, testable)
 * 3. Key Requirements & Constraints (two columns)
 * 4. Scope Boundaries (in/out)
 * 5. Success Criteria (numeric)
 */
function buildBriefSection(
  originalBrief: string,
  research: any,
  expansion: any
): string {
  const sections: string[] = []
  const brief = research?.designBrief || {}
  
  // Title
  const projectName = brief.mission || brief.useCase || originalBrief.split('\n')[0].replace(/^#\s*/, '').slice(0, 80)
  sections.push(`# Project Brief: ${projectName}\n`)
  
  // 1. Project Purpose — 1 sentence, quantifiable
  sections.push('## 1. Project Purpose\n')
  const purpose = brief.mission || brief.useCase || extractFirstSentence(originalBrief)
  sections.push(purpose)
  sections.push('')
  
  // 2. Core Objectives — 3-5 bullets, testable
  sections.push('## 2. Core Objectives\n')
  const objectives = extractObjectives(brief, originalBrief)
  for (const obj of objectives) {
    sections.push(`- ${obj}`)
  }
  sections.push('')
  
  // 3. Key Requirements & Constraints — two columns
  sections.push('## 3. Key Requirements & Constraints\n')
  sections.push('### Requirements')
  const requirements = extractRequirements(brief, research)
  for (const req of requirements) {
    sections.push(`- ${req}`)
  }
  sections.push('')
  sections.push('### Constraints')
  const constraints = extractConstraints(brief, originalBrief)
  for (const c of constraints) {
    sections.push(`- ${c}`)
  }
  sections.push('')
  
  // 4. Scope Boundaries
  sections.push('## 4. Scope Boundaries\n')
  sections.push('**In scope:** ' + (brief.targetProcess || 'Full engineering design and manufacturing planning'))
  sections.push('**Out of scope:** Detailed structural FEA, certification testing, production tooling design')
  sections.push('')
  
  // 5. Success Criteria
  sections.push('## 5. Success Criteria\n')
  const criteria = extractSuccessCriteria(brief, originalBrief)
  for (const c of criteria) {
    sections.push(`- ${c}`)
  }
  sections.push('')
  
  // Appendix: Research Sources
  if (research?.sources?.length > 0) {
    sections.push('## Appendix: Research Sources\n')
    for (const s of research.sources.slice(0, 8)) {
      sections.push(`- ${s.title}${s.url ? ` (${s.url})` : ''}`)
    }
    sections.push('')
  }
  
  // Appendix: Applicable Standards
  if (research?.standardCodes?.length > 0) {
    sections.push('## Appendix: Applicable Standards\n')
    for (const code of research.standardCodes.slice(0, 10)) {
      sections.push(`- ${code}`)
    }
    sections.push('')
  }
  
  // Appendix: Inferred Assumptions
  if (expansion?.inferredAssumptions?.length > 0) {
    sections.push('## Appendix: Engine-Inferred Assumptions\n')
    sections.push('Field | Inferred Value | Confidence | Reasoning')
    sections.push('--- | --- | --- | ---')
    for (const a of expansion.inferredAssumptions) {
      sections.push(`${a.field} | ${a.value} | ${a.confidence} | ${a.reasoning}`)
    }
    sections.push('')
  }
  
  return sections.join('\n')
}

function extractFirstSentence(text: string): string {
  const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('#'))
  return lines[0]?.slice(0, 200) || 'Engineering design project'
}

function extractObjectives(brief: any, originalBrief: string): string[] {
  const objectives: string[] = []
  
  if (brief.mission) objectives.push(brief.mission)
  if (brief.useCase && brief.useCase !== brief.mission) objectives.push(brief.useCase)
  
  // Extract from constraints
  if (brief.constraints?.unitCostCeilingGbp) {
    objectives.push(`Achieve unit cost ≤ £${brief.constraints.unitCostCeilingGbp}`)
  }
  if (brief.constraints?.maxMassKg) {
    objectives.push(`Stay within ${brief.constraints.maxMassKg} kg mass budget`)
  }
  if (brief.quantityTarget) {
    objectives.push(`Scale to ${brief.quantityTarget} production volume`)
  }
  
  // Ensure at least 3
  if (objectives.length < 3) {
    objectives.push('Meet all regulatory and safety requirements for target jurisdiction')
    objectives.push('Design for manufacturing at stated production volume')
  }
  
  return objectives.slice(0, 5)
}

function extractRequirements(brief: any, research: any): string[] {
  const reqs: string[] = []
  
  if (brief.targetProcess) reqs.push(`Manufacturing process: ${brief.targetProcess}`)
  if (brief.targetMaterial) reqs.push(`Primary material: ${brief.targetMaterial}`)
  if (brief.toleranceTarget) reqs.push(`Tolerance: ${brief.toleranceTarget}`)
  
  // From research standards
  if (research?.standardCodes?.length > 0) {
    for (const code of research.standardCodes.slice(0, 5)) {
      reqs.push(`Compliance: ${code}`)
    }
  }
  
  // Ensure at least 3
  if (reqs.length < 3) {
    reqs.push('CE/UKCA marking for target market')
    reqs.push('Design for assembly with standard tooling')
  }
  
  return reqs.slice(0, 8)
}

function extractConstraints(brief: any, originalBrief: string): string[] {
  const constraints: string[] = []
  
  if (brief.constraints?.unitCostCeilingGbp) {
    constraints.push(`Unit cost ceiling: £${brief.constraints.unitCostCeilingGbp}`)
  }
  if (brief.constraints?.maxMassKg) {
    constraints.push(`Maximum mass: ${brief.constraints.maxMassKg} kg`)
  }
  if (brief.constraints?.batchSize || brief.quantityTarget) {
    constraints.push(`Production volume: ${brief.constraints?.batchSize || brief.quantityTarget}`)
  }
  if (brief.constraints?.jurisdiction) {
    constraints.push(`Jurisdiction: ${brief.constraints.jurisdiction}`)
  }
  
  // Extract from original brief text
  const lower = originalBrief.toLowerCase()
  if (lower.match(/\d+\s*mm/)) {
    const dims = originalBrief.match(/[\d,]+\s*×\s*[\d,]+\s*×\s*[\d,]+\s*mm/)
    if (dims) constraints.push(`Envelope: ${dims[0]}`)
  }
  if (lower.match(/-?\d+\s*°?c.*ambient/)) {
    const temp = originalBrief.match(/-?\d+\s*(?:to|-)\s*\+?\d+\s*°?c/i)
    if (temp) constraints.push(`Operating temperature: ${temp[0]}`)
  }
  
  return constraints.slice(0, 6)
}

function extractSuccessCriteria(brief: any, originalBrief: string): string[] {
  const criteria: string[] = []
  
  if (brief.constraints?.unitCostCeilingGbp) {
    criteria.push(`Unit cost at or below £${brief.constraints.unitCostCeilingGbp} at stated production volume`)
  }
  if (brief.constraints?.maxMassKg) {
    criteria.push(`Total mass ≤ ${brief.constraints.maxMassKg} kg`)
  }
  criteria.push('All regulatory certifications obtained for target jurisdiction')
  criteria.push('Prototype passes functional testing against stated performance requirements')
  
  return criteria.slice(0, 4)
}

main().catch(err => {
  console.error('[brief-only] Fatal:', err.message)
  process.exit(1)
})
