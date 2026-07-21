/**
 * @file PCB-only solo runner — no full chain bake required.
 * @description Loads an existing state.json, runs architecture + per-board
 * atopile + KiCad pipeline, writes a SIGHT summary. Used by the Cursor PCB
 * lane to prove fixes without waiting on Terminal's organoid bake.
 *
 * Usage:
 *   npx tsx scripts/run-pcb-solo.ts <state.json> <outDir>
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
  const summary = {
    sourceState: resolve(statePath),
    multiBoardMerged: multi.multiBoardMerged,
    kicadBoardCount: multi.kicadBoardCount,
    designFitness: multi.designFitness,
    pipeline: {
      ok: multi.pipeline.ok,
      stageReached: multi.pipeline.stageReached,
      routed: multi.pipeline.routed,
      errors: multi.pipeline.errors,
      boardSizeMm: multi.pipeline.boardSizeMm,
      iterationsRun: multi.pipeline.iterationsRun,
    },
    architecture: {
      systemDisposition: multi.architecture.systemDisposition,
      boards: multi.architecture.boards.map((b) => ({
        boardId: b.boardId,
        role: b.role,
        requiredWordIds: b.requiredWordIds,
        channelRequirements: b.channelRequirements,
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
    `- aggregate pipeline.ok: **${summary.pipeline.ok}** (stage=${summary.pipeline.stageReached})`,
    '',
    '## Boards',
  ]
  for (const b of summary.boards) {
    lines.push(
      '',
      `### ${b.boardId} (\`${b.role}\`)`,
      `- components: ${b.componentCount}, unresolved: ${b.unresolvedCount}`,
      `- pipeline.ok=${b.pipelineOk} stage=${b.stageReached} routed=${b.routed} iters=${b.iterationsRun ?? '—'}`,
      `- size: ${b.boardSizeMm ? `${b.boardSizeMm.w}×${b.boardSizeMm.h} mm` : '—'}`,
    )
    if (b.unresolved.length > 0) {
      lines.push(`- unresolved: ${b.unresolved.join(', ')}`)
    }
    if (b.errors.length > 0) {
      lines.push(`- errors:`)
      for (const e of b.errors.slice(0, 8)) lines.push(`  - ${e}`)
    }
    for (const c of b.components) {
      lines.push(`  - ${c.wordId}: ${c.partNumber ?? 'no-mpn'} (${c.functionClass}/${c.resolutionTier})`)
    }
  }
  lines.push('', '## Fitness findings')
  for (const f of summary.designFitness.findings) {
    lines.push(`- [${f.severity ?? '?'}] ${f.code ?? ''}: ${f.message ?? ''}`)
  }
  writeFileSync(resolve(outDir, 'pcb-solo-sight.md'), `${lines.join('\n')}\n`)

  console.error(`[pcb-solo] wrote ${resolve(outDir, 'pcb-solo-summary.json')}`)
  console.error(`[pcb-solo] wrote ${resolve(outDir, 'pcb-solo-sight.md')}`)
  console.error(
    `[pcb-solo] DONE fitness.ok=${summary.designFitness.ok} pipeline.ok=${summary.pipeline.ok} boards=${summary.kicadBoardCount}`,
  )
  process.exit(summary.pipeline.ok && summary.designFitness.ok ? 0 : 3)
}

main()
