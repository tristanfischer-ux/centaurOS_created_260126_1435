import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'

import { generateAtopileProject } from './atopile-generator'
import { derivePcbArchitecture } from './pcb-architecture'
import { runPcbPipeline } from './pcb-pipeline'

import type {
  PcbArchitecturePlan,
  PcbBoardPlan,
  PcbSystemDisposition,
  PcbWordAssignment,
} from './pcb-architecture'
import type {
  AtopileFunctionRequirementRecord,
  ResolutionTier,
} from './atopile-generator'
import type { PcbPipelineOptions, PcbPipelineResult } from './pcb-pipeline'

interface ExpectedChannelRequirement {
  role: string
  count: number
}

interface ExpectedBoard {
  role: string
  shapeFamily: string
  channelRequirements: ExpectedChannelRequirement[]
}

interface YuriGoldExpectation {
  product: string
  runDirectory: string
  expectedDisposition: PcbSystemDisposition
  expectedBoards: ExpectedBoard[]
}

export type YuriGoldFailureCode =
  | 'disposition_mismatch'
  | 'board_role_mismatch'
  | 'board_shape_mismatch'
  | 'channel_requirement_mismatch'
  | 'unassigned_electronic_roles'
  | 'empty_board_scope'
  | 'missing_expected_board'
  | 'unresolved_components'
  | 'board_scope_reclassified_off_board'
  | 'empty_generated_project'

export interface YuriGeneratedBoardResult {
  boardId: string
  role: string
  componentCount: number
  unresolvedWordIds: string[]
  offBoardWordIds: string[]
  functionRequirements: AtopileFunctionRequirementRecord[]
  usedTemporaryDirectory: boolean
}

export interface YuriGoldProductResult {
  product: string
  statePath: string
  expectedDisposition: PcbSystemDisposition
  observedDisposition: PcbSystemDisposition
  expectedBoardRoles: string[]
  observedBoardRoles: string[]
  observedShapes: Record<string, string>
  observedChannelRequirements: Record<string, ExpectedChannelRequirement[]>
  observedBoardScopes: Record<string, string[]>
  observedAssignments: Record<string, PcbWordAssignment['placement']>
  generatedProjectCount: number
  generatedBoards: YuriGeneratedBoardResult[]
  routingArtifactsFound: string[]
  unassignedWordIds: string[]
  failureCodes: YuriGoldFailureCode[]
  failureDetails: string[]
}

export interface YuriGoldVerificationReport {
  schema: 'pcb-yuri-gold-verification/v1'
  products: YuriGoldProductResult[]
}

export interface VerifyYuriGoldStatesOptions {
  fixturePath: string
  sourceOutRoot: string
}

export interface VerifyYuriGoldPipelinesOptions extends VerifyYuriGoldStatesOptions {
  outputRoot?: string
  pipelineOptions?: PcbPipelineOptions
  runPipeline?: (
    atoProjectDir: string,
    runDir: string,
    options?: PcbPipelineOptions,
  ) => PcbPipelineResult
}

export interface YuriPipelineBoardResult {
  boardId: string
  role: string
  requiredWordCount: number
  requiredFunctionCount: number
  generatedComponentCount: number
  unresolvedComponentCount: number
  offBoardComponentCount: number
  verifiedIdentityCount: number
  unresolvedIdentityCount: number
  unverifiedMpnCount: number
  resolutionTierCounts: Partial<Record<ResolutionTier, number>>
  identitySources: string[]
  identityBlockers: Array<{
    wordId: string
    characterId: string
    reason: string
  }>
  functionRequirements: AtopileFunctionRequirementRecord[]
  engineeringFindings: string[]
  projectDir: string
  runDir: string
  pipelineOk: boolean
  stageReached: string
  routed: boolean
  drcRan: boolean
  drcViolations: number | null
  unroutedAfterFreerouting: number | null
  boardSizeMm: { w: number; h: number } | null
  pipelineComponentCount: number | null
  netCount: number | null
  errors: string[]
}

export interface YuriPipelineProductResult {
  product: string
  statePath: string
  disposition: PcbSystemDisposition
  requiredBoardCount: number
  unassignedWordIds: string[]
  architectureFailureCodes: YuriGoldFailureCode[]
  architectureFailureDetails: string[]
  boards: YuriPipelineBoardResult[]
}

export interface YuriPipelineVerificationReport {
  schema: 'pcb-yuri-pipeline-verification/v1'
  outputRoot: string
  products: YuriPipelineProductResult[]
  summary: {
    products: number
    requiredBoards: number
    pipelineOkBoards: number
    failedBoards: number
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readState(statePath: string): Record<string, unknown> {
  if (!existsSync(statePath)) {
    throw new Error(`[PcbYuriGoldHarness] Accepted state is missing: ${statePath}`)
  }
  const parsed: unknown = JSON.parse(readFileSync(statePath, 'utf8'))
  if (!isRecord(parsed)) {
    throw new Error(`[PcbYuriGoldHarness] Accepted state is not a JSON object: ${statePath}`)
  }
  return parsed
}

function readExpectations(fixturePath: string): YuriGoldExpectation[] {
  const parsed: unknown = JSON.parse(readFileSync(fixturePath, 'utf8'))
  if (!Array.isArray(parsed) || parsed.length !== 7) {
    throw new Error('[PcbYuriGoldHarness] Gold fixture must describe exactly seven products')
  }
  for (const item of parsed) {
    if (
      !isRecord(item) ||
      typeof item.product !== 'string' ||
      typeof item.runDirectory !== 'string' ||
      typeof item.expectedDisposition !== 'string' ||
      !Array.isArray(item.expectedBoards)
    ) {
      throw new Error('[PcbYuriGoldHarness] Gold fixture contains an invalid product record')
    }
  }
  // Safe assertion: the structural fields consumed below were checked above;
  // nested board fields remain fixture-owned, read-only test data.
  return parsed as YuriGoldExpectation[]
}

function normalizedChannels(
  requirements: Array<{ role: string; count: number }>,
): ExpectedChannelRequirement[] {
  return [...requirements].sort((left, right) =>
    left.role.localeCompare(right.role) || left.count - right.count)
}

function channelsMatch(
  expected: ExpectedChannelRequirement[],
  observed: ExpectedChannelRequirement[],
): boolean {
  return JSON.stringify(normalizedChannels(expected)) === JSON.stringify(normalizedChannels(observed))
}

function addFailure(
  codes: Set<YuriGoldFailureCode>,
  details: string[],
  code: YuriGoldFailureCode,
  detail: string,
): void {
  codes.add(code)
  details.push(detail)
}

function listRoutingArtifacts(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) return listRoutingArtifacts(entryPath)
    return /\.(?:kicad_pcb|kicad_sch|gbr|drl)$/i.test(entry.name) ? [entryPath] : []
  })
}

function comparePlanToGold(
  expectation: YuriGoldExpectation,
  plan: PcbArchitecturePlan,
  codes: Set<YuriGoldFailureCode>,
  details: string[],
): void {
  if (plan.systemDisposition !== expectation.expectedDisposition) {
    addFailure(
      codes,
      details,
      'disposition_mismatch',
      `expected ${expectation.expectedDisposition}; observed ${plan.systemDisposition}`,
    )
  }

  const expectedRoles = expectation.expectedBoards.map((board) => board.role)
  const observedRoles = plan.boards.map((board) => board.role)
  if (JSON.stringify(expectedRoles) !== JSON.stringify(observedRoles)) {
    addFailure(
      codes,
      details,
      'board_role_mismatch',
      `expected roles ${expectedRoles.join(', ') || 'none'}; observed ${observedRoles.join(', ') || 'none'}`,
    )
  }

  for (const expectedBoard of expectation.expectedBoards) {
    const observedBoard = plan.boards.find((board) => board.role === expectedBoard.role)
    if (!observedBoard) {
      addFailure(codes, details, 'missing_expected_board', `missing board role ${expectedBoard.role}`)
      continue
    }
    if (observedBoard.shape.shapeFamily !== expectedBoard.shapeFamily) {
      addFailure(
        codes,
        details,
        'board_shape_mismatch',
        `${expectedBoard.role} expected ${expectedBoard.shapeFamily}; observed ${observedBoard.shape.shapeFamily}`,
      )
    }
    if (!channelsMatch(expectedBoard.channelRequirements, observedBoard.channelRequirements)) {
      addFailure(
        codes,
        details,
        'channel_requirement_mismatch',
        `${expectedBoard.role} expected ${JSON.stringify(normalizedChannels(expectedBoard.channelRequirements))}; observed ${JSON.stringify(normalizedChannels(observedBoard.channelRequirements))}`,
      )
    }
    if (
      observedBoard.requiredWordIds.length === 0 &&
      observedBoard.channelRequirements.length === 0
    ) {
      addFailure(
        codes,
        details,
        'empty_board_scope',
        `${expectedBoard.role} has neither assigned electronic roles nor contract-derived channels`,
      )
    }
  }

  if (plan.unassignedWordIds.length > 0) {
    addFailure(
      codes,
      details,
      'unassigned_electronic_roles',
      `unassigned roles: ${plan.unassignedWordIds.join(', ')}`,
    )
  }
}

function generateExpectedBoardProjects(
  state: Record<string, unknown>,
  expectation: YuriGoldExpectation,
  plan: PcbArchitecturePlan,
  codes: Set<YuriGoldFailureCode>,
  details: string[],
): {
  boards: YuriGeneratedBoardResult[]
  routingArtifacts: string[]
} {
  const boards: YuriGeneratedBoardResult[] = []
  const routingArtifacts: string[] = []

  for (const expectedBoard of expectation.expectedBoards) {
    const boardPlan: PcbBoardPlan | undefined = plan.boards.find(
      (candidate) => candidate.role === expectedBoard.role,
    )
    if (!boardPlan) continue

    const projectDir = mkdtempSync(join(tmpdir(), `pcb-yuri-${expectation.product.toLowerCase()}-`))
    try {
      const generated = generateAtopileProject(state, projectDir, {
        requiredWordIds: boardPlan.requiredWordIds,
        requiredFunctionRoles: boardPlan.channelRequirements.map((requirement) => requirement.role),
        boardShape: boardPlan.shape,
        boardRole: boardPlan.role,
      })
      routingArtifacts.push(...listRoutingArtifacts(projectDir))

      const unresolvedWordIds = generated.unresolved.map((item) => item.wordId)
      const offBoardWordIds = generated.offBoard.map((item) => item.wordId)
      if (generated.components.length === 0) {
        addFailure(
          codes,
          details,
          'empty_generated_project',
          `${expectedBoard.role} has architecture scope but generated no component instances`,
        )
      }
      if (unresolvedWordIds.length > 0) {
        addFailure(
          codes,
          details,
          'unresolved_components',
          `${expectedBoard.role} unresolved generator roles: ${unresolvedWordIds.join(', ')}`,
        )
      }
      if (offBoardWordIds.length > 0) {
        addFailure(
          codes,
          details,
          'board_scope_reclassified_off_board',
          `${expectedBoard.role} planner/generator scope disagreement: ${offBoardWordIds.join(', ')}`,
        )
      }

      boards.push({
        boardId: boardPlan.boardId,
        role: boardPlan.role,
        componentCount: generated.components.length,
        unresolvedWordIds,
        offBoardWordIds,
        functionRequirements: generated.functionRequirements,
        usedTemporaryDirectory: projectDir.startsWith(tmpdir()) &&
          basename(projectDir).startsWith('pcb-yuri-'),
      })
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  }

  return { boards, routingArtifacts }
}

/**
 * @description Verifies the seven frozen Yuri states against gold-derived PCB
 * architecture expectations and dry-generates one scoped Atopile project per
 * expected custom board. It never invokes Atopile, KiCad, routing, or a chain.
 * @param options - Fixture path and read-only accepted-run `out/` root.
 * @returns Product-scoped observed plans, generated-project summaries, and
 * named honest failures.
 * @throws When the fixture or any accepted state is missing or malformed.
 */
export function verifyYuriGoldStates(
  options: VerifyYuriGoldStatesOptions,
): YuriGoldVerificationReport {
  const expectations = readExpectations(options.fixturePath)
  const products = expectations.map((expectation): YuriGoldProductResult => {
    const statePath = join(options.sourceOutRoot, expectation.runDirectory, 'state.json')
    const state = readState(statePath)
    const plan = derivePcbArchitecture(state)
    const failureCodes = new Set<YuriGoldFailureCode>()
    const failureDetails: string[] = []

    comparePlanToGold(expectation, plan, failureCodes, failureDetails)
    const generated = generateExpectedBoardProjects(
      state,
      expectation,
      plan,
      failureCodes,
      failureDetails,
    )

    return {
      product: expectation.product,
      statePath,
      expectedDisposition: expectation.expectedDisposition,
      observedDisposition: plan.systemDisposition,
      expectedBoardRoles: expectation.expectedBoards.map((board) => board.role),
      observedBoardRoles: plan.boards.map((board) => board.role),
      observedShapes: Object.fromEntries(
        plan.boards.map((board) => [board.role, board.shape.shapeFamily]),
      ),
      observedChannelRequirements: Object.fromEntries(
        plan.boards.map((board) => [board.role, normalizedChannels(board.channelRequirements)]),
      ),
      observedBoardScopes: Object.fromEntries(
        plan.boards.map((board) => [board.role, board.requiredWordIds]),
      ),
      observedAssignments: Object.fromEntries(
        plan.assignments.map((assignment) => [
          assignment.wordId,
          assignment.placement,
        ]),
      ),
      generatedProjectCount: generated.boards.length,
      generatedBoards: generated.boards,
      routingArtifactsFound: generated.routingArtifacts,
      unassignedWordIds: plan.unassignedWordIds,
      failureCodes: [...failureCodes],
      failureDetails,
    }
  })

  return {
    schema: 'pcb-yuri-gold-verification/v1',
    products,
  }
}

function safePathSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function pipelineBoardResult(
  boardPlan: PcbBoardPlan,
  projectDir: string,
  runDir: string,
  generated: ReturnType<typeof generateAtopileProject>,
  pipeline: PcbPipelineResult,
): YuriPipelineBoardResult {
  const verifiedIdentityCount = generated.components.filter(
    (component) => component.identityVerified,
  ).length
  const unresolvedIdentityCount = generated.components.length - verifiedIdentityCount
  const unverifiedMpnCount = generated.components.filter(
    (component) => !component.mpnVerified,
  ).length
  const resolutionTierCounts = generated.components.reduce<
    Partial<Record<ResolutionTier, number>>
  >((counts, component) => {
    counts[component.resolutionTier] = (counts[component.resolutionTier] ?? 0) + 1
    return counts
  }, {})
  const identitySources = [...new Set(
    generated.components.flatMap((component) =>
      component.identityVerified && component.identityProvenance
        ? [component.identityProvenance]
        : []),
  )].sort()
  const identityBlockers = generated.components.flatMap((component) =>
    component.identityVerified
      ? []
      : [{
        wordId: component.wordId,
        characterId: component.characterId,
        reason: component.identityBlocker ??
          `no verified manufacturer/MPN identity for ${component.characterId}`,
      }])
  const engineeringFindings: string[] = []
  if (unresolvedIdentityCount > 0) {
    engineeringFindings.push(
      `${unresolvedIdentityCount} generated component(s) lack verified MPN/symbol/pinout identity`,
    )
  }
  if (generated.unresolved.length > 0) {
    engineeringFindings.push(
      `${generated.unresolved.length} required component role(s) remain unresolved`,
    )
  }
  const unresolvedFunctions = generated.functionRequirements.filter(
    (requirement) => requirement.implementation === 'unresolved_board_function',
  )
  if (unresolvedFunctions.length > 0) {
    engineeringFindings.push(
      `${unresolvedFunctions.length} architecture function requirement(s) need real component topology`,
    )
  }
  if (!pipeline.ok) {
    engineeringFindings.push(`pipeline failed at ${pipeline.stageReached}`)
  }
  return {
    boardId: boardPlan.boardId,
    role: boardPlan.role,
    requiredWordCount: boardPlan.requiredWordIds.length,
    requiredFunctionCount: boardPlan.channelRequirements.reduce(
      (total, requirement) => total + requirement.count,
      0,
    ),
    generatedComponentCount: generated.components.length,
    unresolvedComponentCount: generated.unresolved.length,
    offBoardComponentCount: generated.offBoard.length,
    verifiedIdentityCount,
    unresolvedIdentityCount,
    unverifiedMpnCount,
    resolutionTierCounts,
    identitySources,
    identityBlockers,
    functionRequirements: generated.functionRequirements,
    engineeringFindings,
    projectDir,
    runDir,
    pipelineOk: pipeline.ok,
    stageReached: pipeline.stageReached,
    routed: pipeline.routed,
    drcRan: pipeline.drc.ran,
    drcViolations: pipeline.drc.violations,
    unroutedAfterFreerouting: pipeline.unroutedAfterFreerouting ?? null,
    boardSizeMm: pipeline.boardSizeMm ?? null,
    pipelineComponentCount: pipeline.components ?? null,
    netCount: pipeline.nets ?? null,
    errors: pipeline.errors,
  }
}

/**
 * @description Runs the existing Atopile-to-fabrication pipeline independently
 * for every board required by each of the seven accepted Yuri architecture
 * plans. All generated projects and pipeline artifacts remain under one
 * isolated `/tmp` root for direct inspection.
 * @param options - Accepted-state fixture paths, optional `/tmp` output root,
 * pipeline options, and an injectable runner used by unit tests.
 * @returns A per-product/per-board matrix of architecture scope, generator
 * scope, routing, DRC, dimensions, counts, and honest failure details.
 * @throws When fixture/state input is malformed or outputRoot is outside `/tmp`.
 */
export function verifyYuriGoldPipelines(
  options: VerifyYuriGoldPipelinesOptions,
): YuriPipelineVerificationReport {
  const outputRoot = options.outputRoot ?? mkdtempSync('/tmp/pcb-yuri-pipeline-')
  if (outputRoot !== '/tmp' && !outputRoot.startsWith('/tmp/')) {
    throw new Error(`[PcbYuriGoldHarness] Pipeline output must be isolated under /tmp: ${outputRoot}`)
  }
  mkdirSync(outputRoot, { recursive: true })

  const expectations = readExpectations(options.fixturePath)
  const pipelineRunner = options.runPipeline ?? runPcbPipeline
  const products = expectations.map((expectation): YuriPipelineProductResult => {
    const statePath = join(options.sourceOutRoot, expectation.runDirectory, 'state.json')
    const state = readState(statePath)
    const plan = derivePcbArchitecture(state)
    const architectureCodes = new Set<YuriGoldFailureCode>()
    const architectureDetails: string[] = []
    comparePlanToGold(
      expectation,
      plan,
      architectureCodes,
      architectureDetails,
    )

    const boards = plan.boards
      .filter((boardPlan) => boardPlan.requiresKiCadDeliverable)
      .map((boardPlan): YuriPipelineBoardResult => {
        const boardRoot = join(
          outputRoot,
          safePathSegment(expectation.product),
          safePathSegment(boardPlan.boardId),
        )
        const projectDir = join(boardRoot, 'atopile-project')
        const runDir = join(boardRoot, 'pipeline-run')
        mkdirSync(projectDir, { recursive: true })
        mkdirSync(runDir, { recursive: true })
        const generated = generateAtopileProject(state, projectDir, {
          requiredWordIds: boardPlan.requiredWordIds,
          requiredFunctionRoles: boardPlan.channelRequirements.map(
            (requirement) => requirement.role,
          ),
          boardShape: boardPlan.shape,
          boardRole: boardPlan.role,
        })
        const pipeline = pipelineRunner(projectDir, runDir, options.pipelineOptions)
        return pipelineBoardResult(boardPlan, projectDir, runDir, generated, pipeline)
      })

    return {
      product: expectation.product,
      statePath,
      disposition: plan.systemDisposition,
      requiredBoardCount: plan.boards.filter((board) => board.requiresKiCadDeliverable).length,
      unassignedWordIds: plan.unassignedWordIds,
      architectureFailureCodes: [...architectureCodes],
      architectureFailureDetails: architectureDetails,
      boards,
    }
  })
  const boardResults = products.flatMap((product) => product.boards)
  const report: YuriPipelineVerificationReport = {
    schema: 'pcb-yuri-pipeline-verification/v1',
    outputRoot,
    products,
    summary: {
      products: products.length,
      requiredBoards: boardResults.length,
      pipelineOkBoards: boardResults.filter((board) => board.pipelineOk).length,
      failedBoards: boardResults.filter((board) => !board.pipelineOk).length,
    },
  }
  writeFileSync(
    join(outputRoot, 'verification-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  return report
}

if (require.main === module) {
  const [, , fixturePath, sourceOutRoot, requestedOutputRoot] = process.argv
  if (!fixturePath || !sourceOutRoot) {
    console.error(
      'usage: pcb-yuri-gold-harness.ts <gold-expectations.json> <accepted-out-root> [/tmp/output-root]',
    )
    process.exit(1)
  }
  const report = verifyYuriGoldPipelines({
    fixturePath,
    sourceOutRoot,
    outputRoot: requestedOutputRoot,
  })
  console.log(JSON.stringify(report, null, 2))
  process.exit(report.summary.failedBoards === 0 ? 0 : 1)
}
