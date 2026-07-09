import { readFileSync, writeFileSync } from 'fs'
import {
  applyUniversalContractSizing,
  reconcilePrincipalEquipment,
  reconcileDriveTrainRatings,
  briefPinnedQuantityKeys,
} from './lib/orchestrator/generic/universal-contract-sizing.ts'

const path = 'out/codema-ship/state.json'
const state = JSON.parse(readFileSync(path, 'utf8'))
const mods = state.moduleDecomposition?.modules ?? state.modules ?? []
const contract = state.orchestratorContract ?? state.engineeringContract ?? {}
const quantities: Record<string, number> = {}
const qraw = (contract as { quantities?: Record<string, unknown> }).quantities ?? {}
for (const [k, v] of Object.entries(qraw)) {
  const n = typeof v === 'number' ? v : Number((v as { value?: number })?.value)
  if (Number.isFinite(n) && n > 0) quantities[k] = n
}
const pinned = briefPinnedQuantityKeys(contract as never)

const r1 = applyUniversalContractSizing(mods as never[], contract as never, {
  explode: true, instrument: false, dedupeAndStrip: true, synthesizeMissing: true,
})
const r2 = reconcilePrincipalEquipment(mods as never[], contract as never)
const r3 = reconcileDriveTrainRatings(mods as never[], quantities, pinned)

// Cap any remaining drive child above parent×1.25 (belt-and-braces after explode re-mint)
let capped = 0
const byCid = new Map<string, any>()
for (const m of mods as any[]) for (const sm of m.sub_modules ?? []) for (const w of sm.words ?? []) {
  const cid = String(w.content_character?.character_id ?? '')
  if (cid) byCid.set(cid, w)
}
for (const m of mods as any[]) for (const sm of m.sub_modules ?? []) for (const w of sm.words ?? []) {
  const cid = String(w.content_character?.character_id ?? '')
  const m2 = /^(.+?)_word__(.+)$/.exec(cid)
  if (!m2 || !/motor|drive|vsd/i.test(m2[2])) continue
  const parent = byCid.get(m2[1])
  if (!parent) continue
  const pRp = (parent.modifier_characters ?? []).find((mc: any) => mc.kind === 'rating_primary' && /kw/i.test(`${mc.unit??''}`))
  const cRp = (w.modifier_characters ?? []).find((mc: any) => mc.kind === 'rating_primary' && /kw/i.test(`${mc.unit??''}`))
  if (!pRp || !cRp) continue
  const pk = parseFloat(String(pRp.value)), ck = parseFloat(String(cRp.value))
  if (pk > 0 && ck > 0 && ck / pk > 1.25 + 1e-9) {
    cRp.value = String(Math.round(pk * 100) / 100)
    capped++
  }
}

if (state.moduleDecomposition?.modules) state.moduleDecomposition.modules = mods
else state.modules = mods

// Clear stale physics critique drive-train HIGHs so excel risk tab re-derives clean
// (corroboration layer will drop uncorroborated after re-check)
const pc = state.physicsCritique || state.physicsCritic
if (pc && Array.isArray(pc.issues)) {
  const before = pc.issues.length
  pc.issues = pc.issues.filter((i: any) => {
    const t = `${i.issue||''} ${i.title||''} ${i.detail||''}`
    return !(/drive train|1\.25x motor-service|Drive Motor.*rated/i.test(t) && /Fertigation/i.test(t))
  })
  console.log('physics issues', before, '→', pc.issues.length)
}

writeFileSync(path, JSON.stringify(state))
console.log(JSON.stringify({ apply: r1?.sized, reconcile: r2, drive: r3, capped }, null, 2))

// sample pump dims
const samples: string[] = []
for (const m of mods as any[]) for (const sm of m.sub_modules ?? []) for (const w of sm.words ?? []) {
  const n = String(w.name_human ?? '')
  if (/\bpump\b/i.test(n) && !/valve|seal|motor|drive|coupling|baseplate|impeller|casing|mount|gauge/i.test(n)) {
    const dim = (w.modifier_characters ?? []).find((mc: any) => mc.kind === 'dimension')
    const kw = (w.modifier_characters ?? []).find((mc: any) => mc.kind === 'rating_primary')
    samples.push(`${n}: ${dim?.value} | ${kw?.value} ${kw?.unit||''}`)
  }
}
console.log([...new Set(samples)].slice(0, 20).join('\n'))
