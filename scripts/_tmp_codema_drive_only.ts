/**
 * SURGICAL ship-dir patch — drive-train reconcile + valve-nest prune ONLY.
 * Does NOT run applyUniversalContractSizing (that re-minted the BoM and
 * destroyed ISA valve tags on codema-ship 2026-07-09). Not for commit.
 */
import { readFileSync, writeFileSync } from 'fs'
import {
  reconcileDriveTrainRatings,
  explodeEquipmentSubAssemblies,
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

// explode with maxDepth=0 effectively via prune-only: call explode once so the
// valve-nest prune at the top of explodeEquipmentSubAssemblies runs, then
// reconcile drives. explode is idempotent for already-exploded parents.
const pruned = explodeEquipmentSubAssemblies(mods as never[], quantities, 3, pinned)
const drive = reconcileDriveTrainRatings(mods as never[], quantities, pinned)

if (state.moduleDecomposition?.modules) state.moduleDecomposition.modules = mods
else state.modules = mods
writeFileSync(path, JSON.stringify(state))

// prove nursery
let nursery = 0
let nested = 0
for (const m of mods as any[]) for (const sm of m.sub_modules ?? []) for (const w of sm.words ?? []) {
  const cid = String(w.content_character?.character_id ?? w.id ?? '')
  if (/nursery_fertigation.*__drive_motor$/i.test(cid)) {
    const rp = (w.modifier_characters ?? []).find((mc: any) => mc.kind === 'rating_primary')
    nursery = parseFloat(String(rp?.value)) || 0
  }
  if (/valve__drive_motor/i.test(cid)) nested++
}
console.log(JSON.stringify({ prunedAdded: pruned, drive, nurseryMotorKw: nursery, nestedValveDrives: nested }, null, 2))
