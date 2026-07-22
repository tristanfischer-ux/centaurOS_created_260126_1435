/**
 * @file PCB-only solo runner — no full chain bake required.
 * @description Loads an existing state.json, runs architecture + per-board
 * atopile + KiCad pipeline + Tier-0 firmware proof, writes a SIGHT summary.
 * Used by the Cursor PCB lane to prove fixes without waiting on Terminal's bake.
 *
 * Usage:
 *   npx tsx scripts/run-pcb-solo.ts <state.json> <outDir>
 *
 * Exit: 0 when pipeline.ok && designFitness.ok && firmwareProof.allOk
 *       3 when any of those axes fail (honest red)
 *       2 toolchain missing
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildFirmwareProofContract } from '../src/lib/pdf-engine-v2/lib/pcb/pcb-firmware-proof-contract'
import {
  probeTier1McuCompile,
  runTier0FirmwareProof,
  runTier2BoardSim,
} from '../src/lib/pdf-engine-v2/lib/pcb/pcb-firmware-proof-runner'
import { deriveFirmwareProofSpecs } from '../src/lib/pdf-engine-v2/lib/pcb/pcb-firmware-proof-spec'
import { runBespokeMultiBoardPcb } from '../src/lib/pdf-engine-v2/lib/pcb/pcb-multi-board-run'
import { runPcbPipeline } from '../src/lib/pdf-engine-v2/lib/pcb/pcb-pipeline'
import { runPcbStage } from '../src/lib/pdf-engine-v2/lib/pcb/pcb-stage'

function main(): void {
  const statePath = process.argv[2]
  const outDirArg = process.argv[3]
  if (!statePath || !outDirArg) {
    console.error('usage: npx tsx scripts/run-pcb-solo.ts <state.json> <outDir>')
    process.exit(1)
  }
  const outDir = resolve(outDirArg)
  mkdirSync(outDir, { recursive: true })

  const state = JSON.parse(readFileSync(statePath, 'utf8')) as Record<string, unknown>
  const stage = runPcbStage(state)
  console.error(
    `[pcb-solo] stage: bearing=${stage.isPcbBearing} disposition=${stage.disposition} ` +
      `canAuthor=${stage.canAuthor}`,
  )

  if (stage.disposition !== 'bespoke') {
    const summary = { stage, skipped: 'not_bespoke' }
    writeFileSync(resolve(outDir, 'pcb-solo-summary.json'), JSON.stringify(summary, null, 2))
    console.error('[pcb-solo] not bespoke — wrote summary and exit 0')
    process.exit(0)
  }
  if (!stage.canAuthor) {
    const summary = { stage, skipped: 'toolchain_missing' }
    writeFileSync(resolve(outDir, 'pcb-solo-summary.json'), JSON.stringify(summary, null, 2))
    console.error('[pcb-solo] canAuthor=false — toolchain missing')
    process.exit(2)
  }

  const multi = runBespokeMultiBoardPcb(state, outDir, runPcbPipeline)
  const architecture = multi.architecture
  const designFitness = multi.designFitness

  // FLOW: same as chain P9b — thin specs → fat contract (implementedChannels) → prove
  const thinSpecs = deriveFirmwareProofSpecs(architecture)
  const proofOutRoot = resolve(outDir, 'firmware-proof')
  const proofResults: Array<{
    target: string
    result: ReturnType<typeof runTier0FirmwareProof>
  }> = []
  // INTENT (fixpack14): Tier-1 compiles the pinmap-bound freestanding project for
  // the first custom_board that has an MCU + buses — never interconnect_only.
  let tier1Buses: Array<{
    bus_id: string
    protocol: 'i2c' | 'uart' | 'swd'
    pins: Record<string, string>
    expected_devices: string[]
  }> = []
  let tier1Target: string | undefined
  let tier1Mcu: string | undefined
  for (const thin of thinSpecs) {
    // INTENT: scope identity checks to THIS board's fitted parts — dumping every
    // board's MPNs into each proof hid empty boards behind the HAT BOM.
    // GOTCHA (fixpack12): MCU must be board-scoped — HAT SAMD21 must not mint
    // pin_contract_complete on od_optics / wet_actuation.
    const boardRun = multi.boardPipelines.find((b) => b.boardId === thin.proofTargetId)
    const boardComponents = boardRun?.generator.components ?? []
    const boardMcu = boardComponents.find((c) =>
      /mcu|microcontroller/i.test(String(c.characterId ?? c.functionClass ?? '')))
    const fat = buildFirmwareProofContract({
      thin,
      designFitnessOk: designFitness.ok === true,
      mcu: boardMcu?.partNumber
        ? { mpn: boardMcu.partNumber, manufacturer: boardMcu.manufacturer ?? undefined }
        : undefined,
      components: boardComponents.map((c) => ({
        wordId: c.wordId,
        refdes: c.instanceName,
        instanceName: c.instanceName,
        mpn: c.partNumber,
        characterId: c.characterId ?? undefined,
        functionClass: c.functionClass ?? undefined,
        manufacturer: c.manufacturer ?? undefined,
      })),
      nets: (boardRun?.generator.nets ?? []).map((n) => ({
        name: n.name,
        kind: n.kind,
        members: n.members,
      })),
      implementedChannels: multi.implementedChannels,
    })
    const fatView = fat as {
      kind?: string
      mcu?: { mpn?: string } | null
      buses?: typeof tier1Buses
    }
    if (
      !tier1Target
      && fatView.kind !== 'interconnect_only'
      && fatView.mcu?.mpn
      && fatView.buses
      && fatView.buses.length > 0
    ) {
      tier1Target = thin.proofTargetId
      tier1Mcu = fatView.mcu.mpn
      tier1Buses = fatView.buses
    }
    const proofOut = resolve(proofOutRoot, thin.proofTargetId)
    const result = designFitness.ok === true
      ? runTier0FirmwareProof(fat, proofOut, process.cwd())
      : { ok: false as const, skipped: true, reason: 'design_fitness_ok_false' }
    proofResults.push({ target: thin.proofTargetId, result })
    console.error(
      `[pcb-solo] firmwareProof ${thin.proofTargetId}: ok=${result.ok}` +
        (result.reason ? ` (${result.reason.slice(0, 120)})` : ''),
    )
  }
  const firmwareAllOk =
    proofResults.length > 0 && proofResults.every((r) => r.result.ok === true)
  const tier1 = probeTier1McuCompile(resolve(proofOutRoot, '_tier1'), {
    proofTargetId: tier1Target,
    mcuMpn: tier1Mcu,
    buses: tier1Buses,
  })
  console.error(
    `[pcb-solo] firmwareTier1: ok=${tier1.ok} skipped=${tier1.skipped}` +
      ` (${tier1.reason.slice(0, 140)})` +
      (tier1Target ? ` target=${tier1Target}` : ''),
  )

  // INTENT (fixpack17): Tier-2 synthetic board sim — firmware against imagined
  // peripherals bound to real nets. Peer I²C devices (TMP1075/ADS…) ride the loom.
  let tier2: ReturnType<typeof runTier2BoardSim> = {
    ok: false,
    skipped: true,
    tier: 'tier2_board_sim',
    reason: 'no custom_board MCU target for board sim',
  }
  if (tier1Target && tier1Mcu && tier1Buses.length > 0) {
    const hostRun = multi.boardPipelines.find((b) => b.boardId === tier1Target)
    const hostComponents = hostRun?.generator.components ?? []
    const peerComponents = multi.boardPipelines
      .filter((b) => b.boardId !== tier1Target)
      .flatMap((b) => b.generator.components)
    const hostThin = thinSpecs.find((t) => t.proofTargetId === tier1Target)
    const fatForSim = hostThin
      ? buildFirmwareProofContract({
          thin: hostThin,
          designFitnessOk: designFitness.ok === true,
          mcu: { mpn: tier1Mcu },
          components: hostComponents.map((c) => ({
            wordId: c.wordId,
            refdes: c.instanceName,
            instanceName: c.instanceName,
            mpn: c.partNumber,
            characterId: c.characterId ?? undefined,
            functionClass: c.functionClass ?? undefined,
            manufacturer: c.manufacturer ?? undefined,
          })),
          nets: (hostRun?.generator.nets ?? []).map((n) => ({
            name: n.name,
            kind: n.kind,
            members: n.members,
          })),
          implementedChannels: multi.implementedChannels,
        })
      : null
    const fatChannels = (fatForSim?.channels ?? []) as Array<{
      role: string
      instances: Array<{ instance_id: string; enable_net?: string; output_net?: string }>
    }>
    // GOTCHA: only host-local channel roles — stir/pump live on HAT; heater/od
    // on peers would unbound against HAT nets if we passed every role.
    const hostRoles = new Set((hostThin?.channels ?? []).map((c) => c.role))
    const simChannels = fatChannels.filter((c) => hostRoles.has(c.role))
    tier2 = runTier2BoardSim({
      outDir: resolve(proofOutRoot, '_tier2'),
      repoRoot: process.cwd(),
      modelInput: {
        proofTargetId: tier1Target,
        kind: 'custom_board',
        mcuMpn: tier1Mcu,
        buses: tier1Buses,
        channels: simChannels,
        nets: (hostRun?.generator.nets ?? []).map((n) => ({
          name: n.name,
          kind: n.kind,
          members: n.members,
        })),
        components: hostComponents.map((c) => ({
          instanceName: c.instanceName,
          functionClass: c.functionClass,
          characterId: c.characterId ?? undefined,
          partNumber: c.partNumber,
          manufacturer: c.manufacturer,
        })),
        peerComponents: peerComponents.map((c) => ({
          instanceName: c.instanceName,
          functionClass: c.functionClass,
          characterId: c.characterId ?? undefined,
          partNumber: c.partNumber,
          manufacturer: c.manufacturer,
        })),
      },
    })
  }
  console.error(
    `[pcb-solo] firmwareTier2: ok=${tier2.ok} skipped=${tier2.skipped}` +
      ` bindErrors=${tier2.bindErrorCount ?? 0}` +
      ` (${tier2.reason.slice(0, 160)})`,
  )

  // DECISION: Tier-2 bind/sim failure fails the firmware axis — Tier-0 theatre
  // alone must not green-light "software works on the imagined board".
  const tier2AxisOk = tier2.skipped === true || tier2.ok === true
  const firmwareAxisOk = firmwareAllOk && tier2AxisOk
  const tierNum = tier2.ok && !tier2.skipped ? 2 as const : tier1.ok ? 1 as const : 0 as const
  const firmwareProof = {
    schema: 'pcb-firmware-proof-stage/v1' as const,
    tier: tierNum,
    results: proofResults,
    allOk: firmwareAxisOk,
    ok: firmwareAxisOk,
    tier1,
    tier2,
  }

  const summary = {
    sourceState: resolve(statePath),
    multiBoardMerged: multi.multiBoardMerged,
    kicadBoardCount: multi.kicadBoardCount,
    designFitness,
    implementedChannels: multi.implementedChannels,
    firmwareProof,
    pipeline: {
      ok: multi.pipeline.ok,
      stageReached: multi.pipeline.stageReached,
      routed: multi.pipeline.routed,
      errors: multi.pipeline.errors,
      boardSizeMm: multi.pipeline.boardSizeMm,
      iterationsRun: multi.pipeline.iterationsRun,
    },
    architecture: {
      systemDisposition: architecture.systemDisposition,
      boards: architecture.boards.map((b) => ({
        boardId: b.boardId,
        role: b.role,
        requiredWordIds: b.requiredWordIds,
        channelRequirements: b.channelRequirements,
        deferredChannelRequirements: b.deferredChannelRequirements ?? [],
      })),
    },
    boards: multi.boardPipelines.map((b) => ({
      boardId: b.boardId,
      role: b.role,
      projectDir: b.projectDir,
      componentCount: b.generator.components.length,
      unresolvedCount: b.generator.unresolved.length,
      unresolved: b.generator.unresolved.map((u) => u.wordId),
      components: b.generator.components.map((c) => ({
        wordId: c.wordId,
        characterId: c.characterId,
        partNumber: c.partNumber,
        functionClass: c.functionClass,
        resolutionTier: c.resolutionTier,
      })),
      pipelineOk: b.pipeline.ok,
      stageReached: b.pipeline.stageReached,
      routed: b.pipeline.routed,
      errors: b.pipeline.errors,
      boardSizeMm: b.pipeline.boardSizeMm,
      iterationsRun: b.pipeline.iterationsRun,
    })),
  }
  writeFileSync(resolve(outDir, 'pcb-solo-summary.json'), JSON.stringify(summary, null, 2))

  const lines = [
    '# PCB solo SIGHT',
    '',
    `- source: \`${summary.sourceState}\``,
    `- multiBoardMerged: **${summary.multiBoardMerged}**`,
    `- kicadBoardCount: **${summary.kicadBoardCount}**`,
    `- designFitness.ok: **${summary.designFitness.ok}**`,
    `- implementedChannels: \`${JSON.stringify(summary.implementedChannels)}\``,
    `- firmwareProof.allOk: **${summary.firmwareProof.allOk}** (tier=${summary.firmwareProof.tier}; not HIL)`,
    `- aggregate pipeline.ok: **${summary.pipeline.ok}** (stage=${summary.pipeline.stageReached})`,
    '',
    '## Boards',
  ]
  for (const b of summary.boards) {
    const archBoard = summary.architecture.boards.find((a) => a.boardId === b.boardId)
    lines.push(
      '',
      `### ${b.boardId} (\`${b.role}\`)`,
      `- components: ${b.componentCount}, unresolved: ${b.unresolvedCount}`,
      `- pipeline.ok=${b.pipelineOk} stage=${b.stageReached} routed=${b.routed} iters=${b.iterationsRun ?? '—'}`,
      `- size: ${b.boardSizeMm ? `${b.boardSizeMm.w}×${b.boardSizeMm.h} mm` : '—'}`,
      `- channelRequirements: ${JSON.stringify(archBoard?.channelRequirements ?? [])}`,
      `- deferredChannels: ${JSON.stringify(archBoard?.deferredChannelRequirements ?? [])}`,
    )
    if (b.unresolved.length > 0) {
      lines.push(`- unresolved: ${b.unresolved.join(', ')}`)
    }
    if (b.errors.length > 0) {
      lines.push(`- pipeline notes:`)
      for (const e of b.errors.slice(0, 8)) lines.push(`  - ${e}`)
    }
    lines.push(`- components:`)
    for (const c of b.components) {
      lines.push(`  - ${c.wordId}: ${c.partNumber ?? 'no-mpn'} (${c.functionClass}/${c.resolutionTier})`)
    }
  }
  lines.push('', '## Fitness findings')
  if (summary.designFitness.findings.length === 0) {
    lines.push('- (none)')
  } else {
    for (const f of summary.designFitness.findings) {
      lines.push(`- [${f.severity ?? '?'}] ${f.code ?? ''}: ${f.message ?? ''}`)
    }
  }
  lines.push('', '## Firmware proof')
  for (const r of summary.firmwareProof.results) {
    lines.push(
      `- ${r.target}: ok=${r.result.ok}` +
        (r.result.skipped ? ' (skipped)' : '') +
        (r.result.reason ? ` — ${r.result.reason.slice(0, 160)}` : ''),
    )
  }
  const t2 = summary.firmwareProof.tier2 as {
    ok?: boolean
    skipped?: boolean
    reason?: string
    bindErrorCount?: number
  } | undefined
  if (t2) {
    lines.push(
      `- tier2_board_sim: ok=${t2.ok} skipped=${t2.skipped} bindErrors=${t2.bindErrorCount ?? 0}` +
        (t2.reason ? ` — ${String(t2.reason).slice(0, 200)}` : ''),
    )
  }
  writeFileSync(resolve(outDir, 'pcb-solo-sight.md'), `${lines.join('\n')}\n`)

  const allGreen =
    summary.pipeline.ok && summary.designFitness.ok && summary.firmwareProof.allOk
  console.error(`[pcb-solo] wrote ${resolve(outDir, 'pcb-solo-summary.json')}`)
  console.error(`[pcb-solo] wrote ${resolve(outDir, 'pcb-solo-sight.md')}`)
  // INTENT (fixpack16): never trust green summary alone — proveCatch against
  // delivered artefacts (designators, pos union, NTC, Tier-1 ELF, HAT 110).
  const prove = spawnSync(
    'python3',
    [
      resolve(process.cwd(), 'scripts/prove-pcb-fix-claims.py'),
      resolve(outDir),
      '--state',
      resolve(statePath),
      '--repo',
      process.cwd(),
    ],
    { encoding: 'utf8' },
  )
  if (prove.stdout) process.stderr.write(prove.stdout)
  if (prove.stderr) process.stderr.write(prove.stderr)
  const proveOk = prove.status === 0
  console.error(
    `[pcb-solo] prove-pcb-fix-claims: ${proveOk ? 'ALL PROVEN' : 'UNPROVEN'} (exit ${prove.status ?? 'n/a'})`,
  )
  console.error(
    `[pcb-solo] DONE fitness.ok=${summary.designFitness.ok} pipeline.ok=${summary.pipeline.ok} ` +
      `firmware.allOk=${summary.firmwareProof.allOk} prove.ok=${proveOk} boards=${summary.kicadBoardCount}`,
  )
  if (!allGreen) process.exit(3)
  if (!proveOk) process.exit(4)
  process.exit(0)
}

main()
