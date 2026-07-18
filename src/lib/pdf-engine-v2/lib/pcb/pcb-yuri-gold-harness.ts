import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'

import { generateAtopileProject } from './atopile-generator'
import { derivePcbArchitecture } from './pcb-architecture'

import type {
  PcbArchitecturePlan,
  PcbBoardPlan,
  PcbSystemDisposition,
} from './pcb-architecture'

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
        boardShape: boardPlan.shape,
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
