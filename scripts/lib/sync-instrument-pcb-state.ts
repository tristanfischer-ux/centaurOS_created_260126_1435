/**
 * INTENT: After a surgical LED-daughterboard regen, state.pcb.pipeline.generator
 * can still list the old motherboard components (24) while disk has a 3-part /
 * 25 mm board — Excel PCB tab then scores designators 0/24 and floors the dossier.
 *
 * FLOW: generateAtopileProject → runPcbPipeline → write state.pcb.pipeline
 *       (same record shape as serial-design-chain-v2 Phase D).
 *
 * Usage: npx tsx scripts/lib/sync-instrument-pcb-state.ts <run-dir>
 */
import { cpSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

import { generateAtopileProject } from '../../src/lib/pdf-engine-v2/lib/pcb/atopile-generator'
import { runPcbPipeline } from '../../src/lib/pdf-engine-v2/lib/pcb/pcb-pipeline'

function main(): void {
  const runDirArg = process.argv[2]
  if (!runDirArg) {
    console.error('usage: sync-instrument-pcb-state.ts <run-dir>')
    process.exit(1)
  }
  const runDir = resolve(runDirArg)
  const statePath = join(runDir, 'state.json')
  const state = JSON.parse(readFileSync(statePath, 'utf8')) as Record<string, unknown>
  const pcbProjectDir = join(runDir, 'pcb-project')

  const genResult = generateAtopileProject(state, pcbProjectDir)
  console.log(
    `[sync-instrument-pcb] atopile: ${genResult.components.length} on-board, ` +
      `${genResult.offBoard.length} off-board, outline → ${genResult.boardOutlinePath}`,
  )

  const tmpOut = join('/tmp', `pcb-sync-${Date.now()}`)
  const pipelineResult = runPcbPipeline(pcbProjectDir, tmpOut)
  console.log(
    `[sync-instrument-pcb] pipeline ok=${pipelineResult.ok} ` +
      `board=${JSON.stringify(pipelineResult.boardSizeMm)} ` +
      `stage=${pipelineResult.stageReached}`,
  )

  const record = {
    ...pipelineResult,
    compactSourceBoardCapMm: 40,
    generator: {
      componentCount: genResult.components.length,
      netCount: genResult.nets.length,
      offBoardCount: genResult.offBoard.length,
      offBoard: genResult.offBoard,
      unresolvedCount: genResult.unresolved.length,
      unresolved: genResult.unresolved,
      components: genResult.components.map((c) => ({
        instanceName: c.instanceName,
        wordId: c.wordId,
        nameHuman: c.nameHuman,
        characterId: c.characterId,
        manufacturer: c.manufacturer,
        partNumber: c.partNumber,
        footprint: c.footprint
          ? { library: c.footprint.library, footprint: c.footprint.footprint }
          : null,
        resolutionTier: c.resolutionTier,
        quantityInDesign: c.quantityInDesign,
      })),
    },
  }

  const pcb = (state.pcb as Record<string, unknown> | undefined) ?? {}
  pcb.pipeline = record
  state.pcb = pcb
  writeFileSync(statePath, JSON.stringify(state, null, 2))

  const srcPcb = join(tmpOut, 'pcb')
  const dstPcb = join(runDir, 'pcb')
  if (existsSync(srcPcb)) {
    cpSync(srcPcb, dstPcb, { recursive: true })
  }

  const w = (pipelineResult.boardSizeMm as { w?: number } | undefined)?.w
  // INTENT (Poseidon 2026-07-16): optical LED daughterboards stay ≤40 mm; actuation
  // drive boards (MCU + stepper) legitimately need the [50,250] plant floor.
  const onBoardBlob = genResult.components
    .map((c) => `${c.instanceName} ${c.nameHuman} ${c.characterId}`)
    .join(' ')
  const isActuationDrive = /\b(?:stepper|microstep|h[_ -]?bridge|lead[_ -]?screw|motor[_ -]?driver)\b/i.test(
    onBoardBlob,
  )
  const maxSideMm = isActuationDrive ? 120 : 40
  if (typeof w === 'number' && w > maxSideMm) {
    console.error(
      `[sync-instrument-pcb] FAIL: board ${w} mm exceeds ${maxSideMm} mm ` +
        `${isActuationDrive ? 'actuation-drive' : 'instrument'} cap`,
    )
    process.exit(2)
  }
  if (genResult.components.length > 12) {
    console.warn(
      `[sync-instrument-pcb] WARN: ${genResult.components.length} on-board parts — ` +
        'gold LED board is LED+R+JST class; host scrub may have missed words',
    )
  }
  console.log(
    `[sync-instrument-pcb] OK — board ${JSON.stringify(pipelineResult.boardSizeMm)} · ` +
      `generator.components=${genResult.components.length}`,
  )
}

main()
