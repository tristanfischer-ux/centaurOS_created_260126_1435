/**
 * @file scripts/fe-front-run-pcb-pipeline.ts
 * @description Force bespoke PCB disposition for formula_e_front_mgu and run the
 * multi-board atopile → KiCad → Freerouting → Gerber pipeline.
 *
 * INTENT (2026-07-29 JLR red-team): COTS/Gerbers-OOS hand-wave is REJECT for HoT.
 * Usage: npx tsx scripts/fe-front-run-pcb-pipeline.ts <outDir>
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, join } from 'path'
import { derivePcbArchitecture } from '../src/lib/pdf-engine-v2/lib/pcb/pcb-architecture'
import { runPcbStage } from '../src/lib/pdf-engine-v2/lib/pcb/pcb-stage'
import { buildPcbStateHonesty } from '../src/lib/pdf-engine-v2/lib/pcb/pcb-state-honesty'
import { runPcbPipeline } from '../src/lib/pdf-engine-v2/lib/pcb/pcb-pipeline'
import { runBespokeMultiBoardPcb } from '../src/lib/pdf-engine-v2/lib/pcb/pcb-multi-board-run'

import type { PcbStageResult } from '../src/lib/pdf-engine-v2/lib/pcb/pcb-stage'

function stampChannelHonesty(
  state: Record<string, unknown>,
  pcb: PcbStageResult,
): void {
  const architecture = derivePcbArchitecture(state)
  const components = pcb.pipeline?.generator?.components ?? []
  const unresolved = pcb.pipeline?.generator?.unresolved ?? []
  const honesty = buildPcbStateHonesty({
    architecture,
    evidence: {
      resolvedWordIds: components.map((component) =>
        component.instanceName.replace(/__\d+$/, '')),
      unresolvedWordIds: unresolved.map((component) => component.wordId),
      implementedChannels: pcb.implementedChannels ?? {},
    },
    // DECISION: pipeline Gerbers are engineering drafts, not supplier release evidence.
    fabricationReady: false,
    supplierGerbers: 'OPEN',
  })
  pcb.architecture = architecture
  pcb.designFitness = honesty.designFitness
  pcb.implementedChannels = honesty.implemented_channel_counts
  pcb.required_gate_channels = honesty.required_gate_channels
  pcb.implemented_gate_channels = honesty.implemented_gate_channels
  pcb.required_channel_counts = honesty.required_channel_counts
  pcb.implemented_channel_counts = honesty.implemented_channel_counts
  pcb.NOT_FABRICATION_READY = honesty.NOT_FABRICATION_READY
  pcb.supplier_gerbers = honesty.supplier_gerbers
  pcb.fitness_fail_reason = honesty.fitness_fail_reason
}

function main(): void {
  const outDir = resolve(process.argv[2] || '')
  const architectureOnly = process.argv.includes('--architecture-only')
  if (!outDir || !existsSync(join(outDir, 'state.json'))) {
    console.error('Usage: npx tsx scripts/fe-front-run-pcb-pipeline.ts <outDir>')
    process.exit(2)
  }
  const statePath = join(outDir, 'state.json')
  const st = JSON.parse(readFileSync(statePath, 'utf8')) as Record<string, unknown> & {
    pcb?: PcbStageResult
  }
  const stage = architectureOnly && st.pcb ? st.pcb : runPcbStage(st)
  stage.isPcbBearing = true
  stage.disposition = 'bespoke'
  stage.dispositionDetail = {
    disposition: 'bespoke',
    rationale: [
      'jlr_hot_requires_reviewable_boards',
      'gate_driver_and_control_tbd_mpn',
      'bespoke_kiCad_deliverable_required',
    ],
    requiresKiCadDeliverable: true,
    confidence: 'high',
    underlying: {
      disposition: 'bespoke_required',
      reasons: [
        'jlr_hot_requires_reviewable_boards',
        'gate_driver_and_control_tbd_mpn',
      ],
      requiresKiCadDeliverable: true,
      confidence: 'high',
    },
  }
  stage.canAuthor = true
  stage.canRoute = true
  stage.canVerifyAndExport = true
  stage.reasons = [
    ...new Set([...(stage.reasons || []), 'front_fpk_bespoke_forced_for_hot']),
  ]
  st.pcb = stage

  if (architectureOnly) {
    stampChannelHonesty(st, stage)
    writeFileSync(statePath, `${JSON.stringify(st, null, 2)}\n`)
    writeFileSync(join(outDir, 'pcb-stage.json'), `${JSON.stringify(stage, null, 2)}\n`)
    console.log(JSON.stringify({
      mode: 'architecture_only',
      fitnessOk: stage.designFitness?.ok,
      requiredGateChannels: stage.required_gate_channels,
      implementedGateChannels: stage.implemented_gate_channels,
      notFabricationReady: stage.NOT_FABRICATION_READY,
      supplierGerbers: stage.supplier_gerbers,
    }))
    return
  }

  mkdirSync(join(outDir, 'pcb'), { recursive: true })
  try {
    const multi = runBespokeMultiBoardPcb(st, outDir, runPcbPipeline)
    st.pcb.architecture = multi.architecture
    st.pcb.designFitness = multi.designFitness
    st.pcb.pipeline = multi.pipeline
    st.pcb.boardPipelines = multi.boardPipelines.map((b) => ({
      boardId: b.boardId,
      role: b.role,
      projectDir: b.projectDir,
      pipelineOk: b.pipeline.ok,
      stageReached: b.pipeline.stageReached,
      componentCount: b.generator.components.length,
      unresolvedCount: b.generator.unresolved.length,
    }))
    st.pcb.multiBoardMerged = multi.multiBoardMerged
    st.pcb.implementedChannels = multi.implementedChannels
    stampChannelHonesty(st, st.pcb)
    console.log(
      JSON.stringify({
        ok: !!multi.pipeline?.ok,
        boards: st.pcb.boardPipelines?.length ?? 0,
        fitnessOk: multi.designFitness?.ok,
        disposition: st.pcb.disposition,
      }),
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    st.pcb.pipeline = {
      ok: false,
      stageReached: 'exception',
      routed: false,
      drc: { ran: false, violations: 0 },
      errors: [msg],
    }
    console.error('[fe-front-pcb] pipeline exception:', msg)
    console.log(JSON.stringify({ ok: false, error: msg, disposition: st.pcb.disposition }))
  }

  writeFileSync(statePath, `${JSON.stringify(st, null, 2)}\n`)
  writeFileSync(join(outDir, 'pcb-stage.json'), `${JSON.stringify(st.pcb, null, 2)}\n`)
}

main()
