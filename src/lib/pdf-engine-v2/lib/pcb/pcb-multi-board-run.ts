/**
 * @file Per-board atopile + pipeline orchestration for bespoke PCB designs.
 * @description FUNDAMENTAL FIX: derivePcbArchitecture already plans N KiCad
 * boards (e.g. wet_lab_hat / od_optics / wet_actuation) but the chain used to
 * flatMap every requiredWordId into ONE generateAtopileProject call and set
 * multiBoardMerged=true forever. That made placement fail (pad soup) and Gate38
 * fire even when honesty was the only thing working. This module emits one
 * project dir per requiresKiCadDeliverable board and aggregates fitness/pipeline.
 */

import { resolve } from 'node:path'

import {
  generateAtopileProject,
  type GenerateAtopileProjectResult,
} from './atopile-generator'
import {
  derivePcbArchitecture,
  type PcbArchitecturePlan,
  type PcbBoardPlan,
} from './pcb-architecture'
import { deriveImplementedChannelCounts } from './pcb-channel-evidence'
import {
  evaluatePcbDesignFitness,
  type PcbDesignFitnessResult,
} from './pcb-design-fitness'
import type { PcbPipelineResult } from './pcb-pipeline'
import type { PcbPipelineRecord } from './pcb-stage'

export interface BoardPipelineRun {
  boardId: string
  role: string
  projectDir: string
  generator: GenerateAtopileProjectResult
  pipeline: PcbPipelineResult
  record: PcbPipelineRecord
}

export interface MultiBoardPcbRunResult {
  architecture: PcbArchitecturePlan
  /** Always false when this runner emits one project per KiCad board. */
  multiBoardMerged: false
  boardPipelines: BoardPipelineRun[]
  /** Aggregate: ok only if every required board pipeline is ok. */
  pipeline: PcbPipelineRecord
  designFitness: PcbDesignFitnessResult
  /** Design-evidence channel counts — firmware contracts must use this, not requiredCount. */
  implementedChannels: Record<string, number>
  /** Union of components across boards — for firmware proof / Excel MPN backfill. */
  allComponents: GenerateAtopileProjectResult['components']
  allUnresolved: GenerateAtopileProjectResult['unresolved']
  allFunctionReqs: GenerateAtopileProjectResult['functionRequirements']
  kicadBoardCount: number
}

function toGeneratorSummary(gen: GenerateAtopileProjectResult): PcbPipelineRecord['generator'] {
  return {
    componentCount: gen.components.length,
    netCount: gen.nets.length,
    offBoardCount: gen.offBoard.length,
    offBoard: gen.offBoard,
    unresolvedCount: gen.unresolved.length,
    unresolved: gen.unresolved,
    components: gen.components.map((c) => ({
      instanceName: c.instanceName,
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
  }
}

/**
 * INTENT: Excel `_pcb_two_axis_assessment` sets gerbers_ok from
 * `state.pcb.pipeline.gerbers.files` only. Per-board runs write Gerbers under
 * `pcb-boards/<id>/pcb/gerbers/` but the aggregate previously dropped them →
 * every organoid multi-board bake scored "no Gerber set" / PCB tab 0 despite
 * full fab packs on disk.
 *
 * @description Union gerber/drill file groups across board pipelines.
 * @param boardPipelines - Per-board pipeline runs
 * @param key - Which file group to aggregate
 * @returns Combined file group, or undefined when no board exported any files
 */
export function aggregatePipelineFileGroup(
  boardPipelines: ReadonlyArray<BoardPipelineRun>,
  key: 'gerbers' | 'drill',
): PcbPipelineResult['gerbers'] {
  const files: string[] = []
  let dir: string | undefined
  for (const b of boardPipelines) {
    const group = b.pipeline[key]
    if (!group || !Array.isArray(group.files) || group.files.length === 0) continue
    if (!dir) dir = group.dir
    for (const f of group.files) {
      if (typeof f === 'string' && f.length > 0) files.push(f)
    }
  }
  if (files.length === 0) return undefined
  return { dir: dir ?? 'pcb-boards', files }
}

/**
 * @description Boards that must receive a KiCad deliverable (filter empty-scope).
 */
export function kicadDeliverableBoards(architecture: PcbArchitecturePlan): PcbBoardPlan[] {
  return architecture.boards.filter(
    (b) => b.requiresKiCadDeliverable && b.requiredWordIds.length > 0,
  )
}

/**
 * @description Run generateAtopileProject + pipeline once per KiCad board.
 * @param state Chain state (mutated only by caller after return).
 * @param outDir Chain out dir; projects land under `pcb-project/<boardId>/` (or
 *   `pcb-project/` when exactly one board — legacy path compat).
 * @param runPipeline Injected pipeline runner (testable).
 */
export function runBespokeMultiBoardPcb(
  state: Record<string, unknown>,
  outDir: string,
  runPipeline: (projectDir: string, chainOutDir: string) => PcbPipelineResult,
): MultiBoardPcbRunResult {
  const architecture = derivePcbArchitecture(state)
  const boards = kicadDeliverableBoards(architecture)
  const useLegacySingleDir = boards.length <= 1
  const boardPipelines: BoardPipelineRun[] = []

  const targets = boards.length > 0
    ? boards
    : [architecture.boards[0]].filter(Boolean)

  for (const board of targets) {
    const projectDir = useLegacySingleDir
      ? resolve(outDir, 'pcb-project')
      : resolve(outDir, 'pcb-project', board.boardId)
    // GOTCHA (2026-07-21 solo): every board used the same runDir/pcb/ and the
    // last board clobbered HAT DRC artefacts — SIGHT looked at wet_actuation.
    const chainOutDir = useLegacySingleDir
      ? outDir
      : resolve(outDir, 'pcb-boards', board.boardId)
    const genResult = generateAtopileProject(state, projectDir, {
      requiredWordIds: board.requiredWordIds.length > 0 ? board.requiredWordIds : undefined,
      boardShape: board.shape,
      boardRole: board.role,
      requiredFunctionRoles: board.channelRequirements.map((r) => r.role),
    })
    const pipelineResult = runPipeline(projectDir, chainOutDir)
    const record: PcbPipelineRecord = {
      ...pipelineResult,
      generator: toGeneratorSummary(genResult),
    }
    boardPipelines.push({
      boardId: board.boardId,
      role: board.role,
      projectDir,
      generator: genResult,
      pipeline: pipelineResult,
      record,
    })
  }

  const allComponents = boardPipelines.flatMap((b) => b.generator.components)
  const allUnresolved = boardPipelines.flatMap((b) => b.generator.unresolved)
  const allFunctionReqs = boardPipelines.flatMap((b) => b.generator.functionRequirements)
  const requiredRoles = [
    ...new Set(
      architecture.boards.flatMap((b) => b.channelRequirements.map((r) => r.role)),
    ),
  ]
  const implementedChannels = deriveImplementedChannelCounts({
    components: allComponents,
    functionRequirements: allFunctionReqs,
    requiredRoles,
  })
  const designFitness = evaluatePcbDesignFitness(architecture, {
    resolvedWordIds: allComponents.map((c) => c.wordId),
    unresolvedWordIds: allUnresolved.map((u) => u.wordId),
    implementedChannels,
  })

  const allPipelinesOk =
    boardPipelines.length > 0 && boardPipelines.every((b) => b.pipeline.ok === true)
  const worstStage = boardPipelines
    .map((b) => b.pipeline.stageReached)
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b)))[0] ?? 'no_boards'
  const aggregateErrors = boardPipelines.flatMap((b) =>
    (b.pipeline.errors ?? []).map((e) => `[${b.boardId}] ${e}`),
  )
  if (!useLegacySingleDir && boards.length > 1) {
    // Intentional: we did NOT merge — surface that in aggregate messaging.
  }

  const primary = boardPipelines[0]
  const gerbers = aggregatePipelineFileGroup(boardPipelines, 'gerbers')
  const drill = aggregatePipelineFileGroup(boardPipelines, 'drill')
  // First board with a pick-and-place path — Excel reads a single pos.path today.
  const pos = boardPipelines.map((b) => b.pipeline.pos).find((p) => p?.path)
  // DECISION: pipeline.ok is TOOLCHAIN hygiene only — designFitness is a separate
  // axis (Gate38 / Excel). Do not AND them here or a fitness gap looks like DRC.
  // GOTCHA: stamp top-level `components` so pcb-gate coverage does not read 0
  // when only generator.componentCount is populated (organoid final9 shape).
  const pipeline: PcbPipelineRecord = {
    ok: allPipelinesOk,
    stageReached: allPipelinesOk ? (primary?.pipeline.stageReached ?? 'done') : String(worstStage),
    routed: boardPipelines.every((b) => b.pipeline.routed === true),
    drc: {
      ran: boardPipelines.some((b) => b.pipeline.drc?.ran === true),
      violations: boardPipelines.reduce(
        (n, b) => n + (typeof b.pipeline.drc?.violations === 'number' ? b.pipeline.drc.violations : 0),
        0,
      ),
    },
    errors: aggregateErrors.length
      ? aggregateErrors
      : (allPipelinesOk
        ? []
        : [`${boardPipelines.filter((b) => !b.pipeline.ok).length}/${boardPipelines.length} board pipeline(s) failed`]),
    components: allComponents.length,
    ...(gerbers ? { gerbers } : {}),
    ...(drill ? { drill } : {}),
    ...(pos ? { pos } : {}),
    generator: primary
      ? toGeneratorSummary({
          ...primary.generator,
          components: allComponents,
          unresolved: allUnresolved,
          offBoard: boardPipelines.flatMap((b) => b.generator.offBoard),
          nets: boardPipelines.flatMap((b) => b.generator.nets),
        })
      : undefined,
  }

  return {
    architecture,
    multiBoardMerged: false,
    boardPipelines,
    pipeline,
    designFitness,
    implementedChannels,
    allComponents,
    allUnresolved,
    allFunctionReqs,
    kicadBoardCount: boards.length,
  }
}
