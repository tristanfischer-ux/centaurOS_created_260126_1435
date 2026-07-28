/**
 * @file Re-stamp package_family PCB generator rows with verified catalogue identities.
 * @description Twin pipelines frozen before a curated candidate / KiCad-symbol fix
 * keep resolutionTier=package_family even when resolveVerifiedComponentIdentity
 * would now return mpn_symbol_footprint. This re-applies the SOURCE resolver to
 * every weak on-board row — never invents MPNs, never relaxes FAB-READY.
 *
 * Run: npx tsx scripts/repair-pcb-verified-identities.ts <run-dir> [--preserve-footprints]
 *
 * GOTCHA: without --preserve-footprints, verified lands (e.g. TO-220) overwrite
 * the generator footprint strings and break KiCad designator matching against
 * an already-placed positions.csv. Prefer --preserve-footprints on frozen
 * twins; re-run scripts/run-pcb-solo.ts for honest land re-layout.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { classifyFunction } from '../src/lib/pdf-engine-v2/lib/pcb/atopile-generator'
import { resolveVerifiedComponentIdentity } from '../src/lib/pdf-engine-v2/lib/pcb/pcb-verified-candidates'
import { lookupCached } from '../src/lib/pdf-engine-v2/lib/distributors/db-only-cascade'

const KICAD_ROOT = '/Applications/KiCad/KiCad.app/Contents'
const ROOTS = {
  symbolsRoot: join(KICAD_ROOT, 'SharedSupport/symbols'),
  footprintsRoot: join(KICAD_ROOT, 'SharedSupport/footprints'),
}

const WEAK = new Set(['package_family', 'function_class', 'unresolved', ''])

interface GenComp {
  instanceName?: string
  nameHuman?: string
  characterId?: string
  manufacturer?: string | null
  partNumber?: string | null
  footprint?: { library?: string; footprint?: string }
  resolutionTier?: string
  quantityInDesign?: number
}

/**
 * @description Promote weak generator components via curated verified identity.
 * @param runDir Chain output directory with state.json
 * @returns Counts of examined / promoted / still-weak
 */
export function repairPcbVerifiedIdentities(
  runDir: string,
  opts: { preserveFootprints?: boolean } = {},
): {
  examined: number
  promoted: number
  stillWeak: string[]
} {
  const preserveFootprints = opts.preserveFootprints === true
  const statePath = join(runDir, 'state.json')
  const state = JSON.parse(readFileSync(statePath, 'utf8')) as Record<string, unknown>
  const pcb = (state.pcb ?? {}) as Record<string, unknown>
  const pipeline = (pcb.pipeline ?? {}) as Record<string, unknown>
  const generator = (pipeline.generator ?? {}) as Record<string, unknown>
  const comps = (generator.components ?? []) as GenComp[]
  if (!Array.isArray(comps) || comps.length === 0) {
    throw new Error(`no pcb.pipeline.generator.components in ${statePath}`)
  }

  let examined = 0
  let promoted = 0
  const stillWeak: string[] = []

  for (const c of comps) {
    const tier = String(c.resolutionTier ?? '')
    if (!WEAK.has(tier)) continue
    examined += 1
    const characterId = String(c.characterId ?? '')
    const functionClass = classifyFunction(characterId)
    if (!functionClass) {
      stillWeak.push(characterId || String(c.instanceName ?? '?'))
      continue
    }
    const identity = resolveVerifiedComponentIdentity(
      {
        wordId: String(c.instanceName ?? characterId),
        nameHuman: String(c.nameHuman ?? characterId),
        characterId,
        functionClass,
        requiredRatings: {},
      },
      lookupCached,
      ROOTS,
    )
    if ('status' in identity) {
      stillWeak.push(`${characterId}: ${identity.reason}`)
      continue
    }
    c.manufacturer = identity.manufacturer
    c.partNumber = identity.partNumber
    if (preserveFootprints) {
      // Board already placed — keep land, catalogue MPN is still fab-tier.
      c.resolutionTier = 'mpn_package'
    } else {
      c.footprint = {
        library: identity.footprint.library,
        footprint: identity.footprint.footprint,
      }
      c.resolutionTier = 'mpn_symbol_footprint'
    }
    promoted += 1
  }

  generator.components = comps
  pipeline.generator = generator
  pcb.pipeline = pipeline
  state.pcb = pcb
  writeFileSync(statePath, JSON.stringify(state, null, 2))

  const sidePath = join(runDir, 'pcb-stage-result.json')
  if (existsSync(sidePath)) {
    const side = JSON.parse(readFileSync(sidePath, 'utf8')) as Record<string, unknown>
    const sidePipe = (side.pipeline ?? side) as Record<string, unknown>
    const sideGen = (sidePipe.generator ?? {}) as Record<string, unknown>
    if (Array.isArray(sideGen.components)) {
      sideGen.components = comps
      sidePipe.generator = sideGen
      if (side.pipeline) side.pipeline = sidePipe
      writeFileSync(sidePath, JSON.stringify(side, null, 2))
    }
  }

  console.info('[repair-pcb-verified-identities]', {
    runDir,
    examined,
    promoted,
    stillWeak: stillWeak.length,
    samples: stillWeak.slice(0, 8),
  })
  return { examined, promoted, stillWeak }
}

if (require.main === module) {
  const runDir = process.argv[2]
  if (!runDir) {
    console.error(
      'Usage: npx tsx scripts/repair-pcb-verified-identities.ts <run-dir> [--preserve-footprints]',
    )
    process.exit(2)
  }
  const preserveFootprints = process.argv.includes('--preserve-footprints')
  const r = repairPcbVerifiedIdentities(runDir, { preserveFootprints })
  if (r.stillWeak.length > 0) {
    console.warn(`[repair-pcb-verified-identities] ${r.stillWeak.length} still weak`)
  }
}
