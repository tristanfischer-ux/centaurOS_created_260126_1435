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
import { evaluatePcbGate } from '../../src/lib/pdf-engine-v2/lib/pcb/pcb-gate'
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

  const w = (pipelineResult.boardSizeMm as { w?: number } | undefined)?.w
  // INTENT (Poseidon 2026-07-16): optical LED daughterboards stay ≤40 mm; actuation
  // drive boards (MCU + stepper) legitimately need the [50,250] plant floor.
  // GOTCHA (OpenFlexure 0101): MCU + photodiode control board is 50 mm and has
  // no "stepper" token on-board (motors are off-board COTS) — still not a 40 mm
  // LED daughterboard. MCU / LQFP / motor-controller → 120 mm cap.
  const onBoardBlob = genResult.components
    .map((c) => `${c.instanceName} ${c.nameHuman} ${c.characterId} ${c.footprint?.footprint ?? ''}`)
    .join(' ')
  const productClass = String(
    ((state.moduleDecomposition as { product_class?: string } | undefined)?.product_class)
      || ((state.orchestratorContract as { product_class?: string } | undefined)?.product_class)
      || '',
  ).toLowerCase()
  const isActuationOrControl = /\b(?:stepper|microstep|h[_ -]?bridge|lead[_ -]?screw|motor[_ -]?driver|microcontroller|mcu|lqfp|motor[_ -]?controller)\b/i.test(
    onBoardBlob,
  ) || /lab[_ -]?microscope|openflexure|thermocycler|ninjapcr|syringe[_ -]?pump|poseidon|potentiostat|rodeostat|benchtop[_ -]?bioreactor|pioreactor|opendrop|digital[_ -]?microfluid/.test(
    productClass,
  )
  const maxSideMm = isActuationOrControl ? 120 : 40
  if (typeof w === 'number' && w > maxSideMm) {
    console.error(
      `[sync-instrument-pcb] FAIL: board ${w} mm exceeds ${maxSideMm} mm ` +
        `${isActuationOrControl ? 'actuation/control' : 'instrument'} cap`,
    )
    process.exit(2)
  }

  const record = {
    ...pipelineResult,
    compactSourceBoardCapMm: maxSideMm,
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
  // INTENT (OpenFlexure 0101): heal path must flip canAuthor after a real
  // pipeline complete — Excel PCB tab was still reading toolchain_discovery
  // from the failed chain probe even though disk had Gerbers + DRC=0.
  if (pipelineResult.ok && pipelineResult.stageReached === 'complete') {
    pcb.canAuthor = true
    pcb.canRoute = true
    pcb.canVerifyAndExport = true
  }
  state.pcb = pcb
  // INTENT (OpenFlexure 0101): chain-time pcbGate stays stale after a heal sync
  // (still fires on toolchain_discovery). Re-evaluate from the patched pcb so
  // Verification / Quality sheets read the post-heal clean_board verdict.
  // Safe boundary assertion: this script reconstructs the serializable PcbStageResult
  // fields above; Record<string, unknown> is only the JSON mutation handle. (evaluatePcbGate
  // only reads disposition / pipeline.ok / isPcbBearing — not a full stage rebuild.)
  const gate = evaluatePcbGate(pcb as unknown as Parameters<typeof evaluatePcbGate>[0])
  state.pcbGate = {
    ...gate,
    mode: 'shadow',
  }
  writeFileSync(statePath, JSON.stringify(state, null, 2))

  const srcPcb = join(tmpOut, 'pcb')
  const dstPcb = join(runDir, 'pcb')
  if (existsSync(srcPcb)) {
    cpSync(srcPcb, dstPcb, { recursive: true })
  }

  if (genResult.components.length > 12) {
    console.warn(
      `[sync-instrument-pcb] WARN: ${genResult.components.length} on-board parts — ` +
        'gold LED board is LED+R+JST class; host scrub may have missed words',
    )
  }
  console.log(
    `[sync-instrument-pcb] OK — board ${JSON.stringify(pipelineResult.boardSizeMm)} · ` +
      `cap=${maxSideMm}mm · generator.components=${genResult.components.length}`,
  )
}

main()
