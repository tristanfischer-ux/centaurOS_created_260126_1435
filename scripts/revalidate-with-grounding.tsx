#!/usr/bin/env npx tsx
// Re-run the 30-part sample through the NEW grounded verifyPart and compare
// against the ground-truth labels we captured before the fix.

import { readFileSync, writeFileSync } from 'fs'
import { verifyPart, type PartVerification } from '../src/lib/pdf-engine-v2/radical/part-verification'

const OR_KEY = (() => {
  const env = readFileSync('/Users/tristanfischer/.claude/secrets/openrouter.env', 'utf8')
  return env.match(/OPENROUTER_API_KEY=(.+)/)?.[1].trim() ?? ''
})()

async function main() {
  const groundTruth: any[] = JSON.parse(readFileSync('/Users/tristanfischer/Downloads/bess-iter/iter-62-ground-truth-test.json', 'utf8'))
  console.log(`Re-verifying ${groundTruth.length} parts through grounded Flash-Lite...\n`)

  const results: any[] = []
  for (let i = 0; i < groundTruth.length; i += 5) {
    const batch = groundTruth.slice(i, i + 5)
    const batchResults = await Promise.all(batch.map(async (g: any) => {
      const candidate = {
        manufacturer: g.manufacturer,
        part_number: g.part_number,
        module: g.module,
        sub_module_id: g.sub_module_id,
        word_id: g.word_id ?? 'unknown',
        word_name: g.word_id ?? 'unknown',
      }
      const v: PartVerification | null = await verifyPart(candidate as any, OR_KEY)
      return {
        cls: g.cls,
        manufacturer: g.manufacturer,
        part_number: g.part_number,
        ground_truth: g.ground_truth,
        gt_confidence: g.gt_confidence,
        engine_old: { bucket: g.bucket, confidence: g.engine_confidence },
        engine_new: v ? { status: v.status, confidence: v.confidence, reasoning: v.reasoning } : { status: 'error', confidence: '-', reasoning: 'verify call failed' },
      }
    }))
    results.push(...batchResults)
    console.error(`  ${i + batch.length}/${groundTruth.length} done`)
  }

  console.log('\n=== Old (no-grounding) vs New (grounded) vs Ground-truth ===\n')
  console.log('CLS              MFR / PART_NUMBER                          GT        OLD-bucket   NEW-status (conf)   NEW-reasoning')
  console.log('-'.repeat(170))
  for (const r of results) {
    const mfrPn = `${r.manufacturer} / ${r.part_number}`.slice(0, 45)
    const oldBucket = r.engine_old.bucket
    const newStatus = `${r.engine_new.status} (${r.engine_new.confidence})`
    const flip = (oldBucket === 'verified' && r.ground_truth === 'fake') || (oldBucket === 'stripped' && r.ground_truth === 'real') ? ' ⚠' : ''
    const fixed = (
      (oldBucket === 'stripped' && r.ground_truth === 'real' && r.engine_new.status === 'verified') ||
      (oldBucket === 'verified' && r.ground_truth === 'fake' && r.engine_new.status === 'unverified')
    ) ? ' ✓FIXED' : ''
    console.log(`  ${r.cls.padEnd(15)} ${mfrPn.padEnd(45)} ${r.ground_truth.padEnd(9)} ${oldBucket.padEnd(12)} ${newStatus.padEnd(20)} ${r.engine_new.reasoning.slice(0, 50)}${flip}${fixed}`)
  }

  // Metrics
  const newCounts: any = { verified: { real: 0, fake: 0, ambiguous: 0 }, unverified: { real: 0, fake: 0, ambiguous: 0 }, uncertain: { real: 0, fake: 0, ambiguous: 0 }, error: { real: 0, fake: 0, ambiguous: 0 } }
  for (const r of results) {
    const ns = r.engine_new.status as string
    const gt = r.ground_truth as string
    if (newCounts[ns] && (gt in newCounts[ns])) newCounts[ns][gt]++
  }

  console.log('\n=== NEW (grounded) confusion matrix ===')
  console.log('Engine          →  Ground-truth says:')
  console.log('                   real  fake  ambig')
  for (const b of ['verified', 'unverified', 'uncertain', 'error']) {
    console.log(`  ${b.padEnd(15)} ${String(newCounts[b].real).padStart(4)} ${String(newCounts[b].fake).padStart(5)} ${String(newCounts[b].ambiguous).padStart(6)}`)
  }

  const v = newCounts.verified
  const u = newCounts.unverified
  console.log('\n=== Precision before vs after ===')
  console.log('                BEFORE      AFTER')
  console.log(`  Verify        87%         ${((v.real / (v.real + v.fake + 0.001)) * 100).toFixed(0)}% (${v.real}/${v.real + v.fake})`)
  console.log(`  Strip         40%         ${((u.fake / (u.real + u.fake + 0.001)) * 100).toFixed(0)}% (${u.fake}/${u.real + u.fake})`)

  writeFileSync('/Users/tristanfischer/Downloads/bess-iter/iter-62-grounded-revalidation.json', JSON.stringify(results, null, 2))
  console.log('\nFull results: /Users/tristanfischer/Downloads/bess-iter/iter-62-grounded-revalidation.json')
}

main().catch(e => { console.error(e); process.exit(1) })
