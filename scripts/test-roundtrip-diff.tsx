#!/usr/bin/env npx tsx
/**
 * Test 1 (GLM's proposal, 2026-05-15) — round-trip diff test.
 *
 * Pass a 30-field hardware-component JSON through 5 LLMs in sequence
 * (Gemini 3.1 Pro → Grok 4.3 → GLM-5.1 → Haiku 4.5 → Flash-Lite). Each LLM
 * is told: "you are stage N of 5 in a hardware design pipeline; pass this JSON
 * forward preserving every field exactly; output ONLY JSON."
 *
 * Then diff the final output vs the original input. Count:
 *   - fields dropped
 *   - fields with type shifts
 *   - fields with value shifts
 *
 * GLM's prediction: ≥ 8 of 30 fields drop or type-shift.
 */
import { readFileSync, writeFileSync } from 'fs'

const apiKey = process.env.OPENROUTER_API_KEY
if (!apiKey) { console.error('OPENROUTER_API_KEY missing'); process.exit(1) }

const INPUT = {
  component_id: 'bess_cell_string_main',
  name_human: 'primary cell string',
  manufacturer: 'CATL',
  part_number: 'EnerC-306',
  material: 'LFP cathode / graphite anode',
  form_factor: 'prismatic',
  voltage_nominal_v: 3.2,
  capacity_ah: 306,
  energy_kwh: 0.98,
  mass_kg: 5.3,
  dimensions_mm: '174x72x207',
  operating_temp_min_c: -20,
  operating_temp_max_c: 60,
  ip_rating: 'IP67',
  regulatory_iec_62619: 'compliant',
  regulatory_un_38_3: 'certified',
  regulatory_rohs: 'yes',
  ce_marked: true,
  ukca_marked: true,
  cycle_life_at_80pct: 6000,
  round_trip_efficiency_pct: 96.5,
  self_discharge_pct_per_month: 1.5,
  warranty_years: 10,
  lead_time_weeks: 14,
  unit_cost_gbp: 82,
  supplier_country: 'China',
  datasheet_url: 'https://catl.com/en/products/cell/enerc-306.html',
  datasheet_rev: 'Rev 3.2',
  datasheet_date: '2025-08-14',
  evidence_grade: 'verified',
}

const STAGES = [
  { name: 'STAGE 1: Generator (Gemini 3.1 Pro)', model: 'google/gemini-3.1-pro-preview' },
  { name: 'STAGE 2: R1 (Grok 4.3)',              model: 'x-ai/grok-4.3' },
  { name: 'STAGE 3: R2 (GLM-5.1)',               model: 'z-ai/glm-5.1' },
  { name: 'STAGE 4: R3 (Haiku 4.5)',             model: 'anthropic/claude-haiku-4.5' },
  { name: 'STAGE 5: R4 (Flash-Lite)',            model: 'google/gemini-3.1-flash-lite' },
]

async function callStage(stageName: string, model: string, currentJson: any, stageIdx: number): Promise<any> {
  const system = `You are stage ${stageIdx + 1} of 5 in a hardware design pipeline.
You receive a component JSON object from the previous stage. Your job is to PASS IT FORWARD with every field PRESERVED EXACTLY. Do not drop fields. Do not change types. Do not change values. You may NOT add new fields. Return ONLY the JSON object, no preamble, no markdown fences, no commentary.`
  const user = `Component JSON from previous stage:\n${JSON.stringify(currentJson, null, 2)}\n\nReturn the SAME JSON, all fields preserved exactly.`
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, temperature: 0, max_tokens: 4000,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(`${stageName} HTTP ${r.status}: ${t.slice(0, 400)}`)
  }
  const json = await r.json() as any
  const raw = (json.choices?.[0]?.message?.content ?? '').trim()
  const cleaned = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
  try { return JSON.parse(cleaned) }
  catch (err) {
    console.error(`[${stageName}] JSON parse failure; raw output:`)
    console.error(raw.slice(0, 1000))
    throw err
  }
}

function diffPayload(orig: any, final: any) {
  const origKeys = Object.keys(orig).sort()
  const finalKeys = Object.keys(final).sort()
  const droppedFields = origKeys.filter(k => !(k in final))
  const addedFields = finalKeys.filter(k => !(k in orig))
  const typeShifts: string[] = []
  const valueShifts: string[] = []
  for (const k of origKeys) {
    if (!(k in final)) continue
    if (typeof orig[k] !== typeof final[k]) typeShifts.push(`${k}: ${typeof orig[k]} → ${typeof final[k]}`)
    else if (JSON.stringify(orig[k]) !== JSON.stringify(final[k])) valueShifts.push(`${k}: ${JSON.stringify(orig[k])} → ${JSON.stringify(final[k])}`)
  }
  return { droppedFields, addedFields, typeShifts, valueShifts }
}

async function main() {
  console.log('=== TEST 1: Round-trip diff (council GLM proposal) ===')
  console.log(`Input: ${Object.keys(INPUT).length} fields\n`)

  let current = INPUT as any
  const perStage = []
  for (let i = 0; i < STAGES.length; i++) {
    const s = STAGES[i]
    process.stderr.write(`[${s.name}] calling ...`)
    const t0 = Date.now()
    try {
      const out = await callStage(s.name, s.model, current, i)
      const dt = ((Date.now() - t0) / 1000).toFixed(1)
      const fieldCount = typeof out === 'object' && out ? Object.keys(out).length : 0
      const d = diffPayload(INPUT, out)
      perStage.push({ stage: s.name, fieldCount, dropped: d.droppedFields.length, added: d.addedFields.length, typeShifts: d.typeShifts.length, valueShifts: d.valueShifts.length, dt })
      process.stderr.write(` done (${dt}s, ${fieldCount} fields)\n`)
      current = out
    } catch (err) {
      console.error(` FAILED: ${(err as Error).message}`)
      throw err
    }
  }

  // Final diff vs original
  const final = current
  const diff = diffPayload(INPUT, final)
  console.log('\n--- Per-stage field counts ---')
  for (const r of perStage) {
    console.log(`  ${r.stage.padEnd(38)} : ${r.fieldCount} fields  dropped=${r.dropped}  added=${r.added}  typeShifts=${r.typeShifts}  valueShifts=${r.valueShifts}  (${r.dt}s)`)
  }
  console.log('\n--- FINAL DIFF (input vs output of stage 5) ---')
  console.log(`Dropped fields (${diff.droppedFields.length} of ${Object.keys(INPUT).length}):`)
  for (const f of diff.droppedFields) console.log(`  - ${f}`)
  console.log(`\nType shifts (${diff.typeShifts.length}):`)
  for (const t of diff.typeShifts) console.log(`  - ${t}`)
  console.log(`\nValue shifts (${diff.valueShifts.length}):`)
  for (const v of diff.valueShifts.slice(0, 20)) console.log(`  - ${v}`)
  console.log(`\nAdded fields (${diff.addedFields.length}):`)
  for (const f of diff.addedFields) console.log(`  + ${f}`)
  console.log()
  const totalDamage = diff.droppedFields.length + diff.typeShifts.length + diff.valueShifts.length
  console.log(`TOTAL FIELD DAMAGE: ${totalDamage} of ${Object.keys(INPUT).length} (${(100*totalDamage/Object.keys(INPUT).length).toFixed(0)}%)`)
  console.log(`GLM prediction (≥ 8 of 30 drop or type-shift): ${totalDamage >= 8 ? 'CONFIRMED' : 'REFUTED'}`)

  // Persist for record
  writeFileSync('/tmp/roundtrip-test-input.json', JSON.stringify(INPUT, null, 2))
  writeFileSync('/tmp/roundtrip-test-final.json', JSON.stringify(final, null, 2))
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
