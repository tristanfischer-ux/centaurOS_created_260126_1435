/**
 * @file specialist-helpers.ts
 *
 * @description Shared mocks, selectors, and utilities for Specialist E2E tests.
 * All specialist tests mock /api/agents/execute and /api/agents/council for
 * deterministic, fast runs without AI provider dependency.
 */

import type { Page } from '@playwright/test'
import path from 'path'

const authDir = path.join(__dirname, '..', '.playwright/auth')
export const FOUNDER_STORAGE = path.join(authDir, 'founder.json')

/** Recommended specialists (show "Start here" badge): Sage, Max, Priya, Cal, Finn */
export const RECOMMENDED_SPECIALIST_NAMES = ['Sage', 'Max', 'Priya', 'Cal', 'Finn'] as const

/** All 13 specialist display names for landing page count */
export const ALL_SPECIALIST_NAMES = [
  'Sage',
  'Max',
  'Jian',
  'Fang',
  'Chase',
  'Priya',
  'Mia',
  'Sal',
  'Cal',
  'Finn',
  'Fiona',
  'Harper',
  'Leo',
] as const

export interface MockChatOptions {
  /** Response text (can include PROPOSED_ACTIONS comment and NEXT_SPECIALIST) */
  responseText?: string
  /** Optional proposed actions JSON for PROPOSED_ACTIONS comment */
  proposedActions?: Array<{
    type: 'objective' | 'task'
    title: string
    description?: string
    objectiveTitle?: string
  }>
  /** Optional next specialist suggestion: NEXT_SPECIALIST: id | reason */
  nextSpecialistId?: string
  nextSpecialistReason?: string
  /** Split response into multiple SSE chunks for streaming effect */
  chunked?: boolean
}

/**
 * Build SSE stream body for /api/agents/execute (text modality).
 * Format: data: {"text": "chunk"}\n\n ... data: [DONE]\n\n
 */
export function buildExecuteSSEStream(options: MockChatOptions = {}): string {
  const {
    responseText = "Here's my take. Let me know if you want to go deeper.",
    proposedActions,
    nextSpecialistId,
    nextSpecialistReason,
    chunked = false,
  } = options

  let fullText = responseText
  if (proposedActions && proposedActions.length > 0) {
    const comment = `\n\n<!-- PROPOSED_ACTIONS\n${JSON.stringify(proposedActions)}\n-->`
    fullText = fullText + comment
  }
  if (nextSpecialistId && nextSpecialistReason) {
    fullText = fullText + `\n\nNEXT_SPECIALIST: ${nextSpecialistId} | ${nextSpecialistReason}`
  }

  if (!chunked) {
    return `data: ${JSON.stringify({ text: fullText })}\n\ndata: [DONE]\n\n`
  }

  const words = fullText.split(/(\s+)/)
  const chunks: string[] = []
  let current = ''
  for (const w of words) {
    current += w
    if (current.length >= 20) {
      chunks.push(current)
      current = ''
    }
  }
  if (current) chunks.push(current)
  const lines = chunks.map((c) => `data: ${JSON.stringify({ text: c })}\n\n`).join('') + 'data: [DONE]\n\n'
  return lines
}

/**
 * Mock /api/agents/execute to return a configurable SSE stream.
 */
export async function mockSpecialistChat(page: Page, options: MockChatOptions = {}): Promise<void> {
  await page.route('**/api/agents/execute**', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
      body: buildExecuteSSEStream(options),
    })
  })
}

/**
 * Default proposed actions for tests (objectives + tasks).
 */
export const DEFAULT_PROPOSED_ACTIONS = [
  { type: 'objective' as const, title: 'Launch Q2 product update', description: 'Ship the redesigned onboarding flow' },
  {
    type: 'task' as const,
    title: 'Draft onboarding copy',
    description: 'Write the 5-step flow',
    objectiveTitle: 'Launch Q2 product update',
  },
]

export interface MockCouncilOptions {
  topic?: string
  specialists?: Array<{ id: string; name: string; title: string }>
  executiveSummary?: string
  positions?: Array<{ specialist: string; specialist_id: string; key_position: string; conviction: 'high' | 'medium' | 'low' }>
  tensions?: Array<{ between: string[]; description: string }>
  consensus?: string[]
  recommendations?: string[]
  decisionOptions?: Array<{ option: string; supporters: string[]; rationale: string }>
}

/**
 * Build full council API response (JSON).
 */
export function buildCouncilResponse(options: MockCouncilOptions = {}): Record<string, unknown> {
  const {
    topic = 'Should we hire a VP of Sales?',
    specialists = [
      { id: 'chief-of-staff', name: 'Cal', title: 'Chief of Staff' },
      { id: 'strategist', name: 'Sage', title: 'Strategy' },
      { id: 'sales-lead', name: 'Sal', title: 'Sales' },
    ],
    executiveSummary = 'The council debated timing and scope. Consensus: hire when pipeline supports it.',
    positions = [
      { specialist: 'Sage', specialist_id: 'strategist', key_position: 'Hire when GTM is clear', conviction: 'high' as const },
      { specialist: 'Sal', specialist_id: 'sales-lead', key_position: 'Need sales leadership now', conviction: 'high' as const },
      { specialist: 'Cal', specialist_id: 'chief-of-staff', key_position: 'Sequence after product-market fit', conviction: 'medium' as const },
    ],
    tensions = [{ between: ['Sage', 'Sal'], description: 'Disagree on timing of hire' }],
    consensus = ['Sales leadership is important', 'Pipeline must support the role'],
    recommendations = ['Define pipeline targets first', 'Hire within 90 days if targets met'],
    decisionOptions = [
      { option: 'Hire VP Sales now', supporters: ['Sal'], rationale: 'Accelerate pipeline' },
      { option: 'Wait 90 days', supporters: ['Sage', 'Cal'], rationale: 'Validate GTM first' },
    ],
  } = options

  const debate = [
    { specialistId: 'strategist', specialistName: 'Sage', specialistTitle: 'Strategy', round: 1, content: 'Strategy view: align hire with GTM.' },
    { specialistId: 'sales-lead', specialistName: 'Sal', specialistTitle: 'Sales', round: 1, content: 'Sales view: we need leadership now.' },
    { specialistId: 'chief-of-staff', specialistName: 'Cal', specialistTitle: 'Chief of Staff', round: 1, content: 'Ops view: sequence after PMF.' },
  ]

  return {
    topic,
    specialists,
    debate,
    report: {
      executive_summary: executiveSummary,
      positions,
      tensions,
      consensus,
      recommendations,
      decision_options: decisionOptions,
    },
  }
}

/**
 * Mock /api/agents/council to return a configurable JSON response.
 */
export async function mockCouncilDebate(page: Page, options: MockCouncilOptions = {}): Promise<void> {
  await page.route('**/api/agents/council**', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildCouncilResponse(options)),
    })
  })
}

/**
 * Skip test if page was redirected to login (auth state invalid).
 */
export async function skipIfUnauthenticated(page: Page): Promise<boolean> {
  if (page.url().includes('/login')) {
    return true
  }
  return false
}

/**
 * Navigate to /agents and open the specialist dialog by clicking the card with the given name.
 * Assumes landing is already loaded; if not, call page.goto('/agents') first.
 */
export async function openSpecialistDialogByName(page: Page, specialistName: string): Promise<void> {
  const card = page.getByRole('button', { name: new RegExp(`Brief ${specialistName},`) })
  await card.first().scrollIntoViewIfNeeded()
  await card.first().click()
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 })
}

/**
 * Get the open specialist dialog (role=dialog).
 */
export function getSpecialistDialog(page: Page) {
  return page.locator('[role="dialog"]')
}

/**
 * Get the chat textarea inside the dialog (id="brief-text" or role=textbox).
 */
export function getChatTextarea(page: Page) {
  const dialog = getSpecialistDialog(page)
  return dialog.locator('#brief-text').or(dialog.locator('textarea')).first()
}

/**
 * Get the Send brief button.
 */
export function getSendBriefButton(page: Page) {
  return page.getByRole('button', { name: /send brief/i })
}

/**
 * Fill the chat textarea and send the message.
 */
export async function sendMessage(page: Page, text: string): Promise<void> {
  const dialog = getSpecialistDialog(page)
  const textarea = getChatTextarea(page)
  await textarea.fill(text)
  await getSendBriefButton(page).click()
}

/**
 * Wait for streaming to complete (no guaranteed event; use timeout).
 */
export async function waitForStreamComplete(page: Page, ms = 4000): Promise<void> {
  await page.waitForTimeout(ms)
}

/**
 * Unmock execute so real API could be used (e.g. for optional live tests).
 */
export async function unmockSpecialistChat(page: Page): Promise<void> {
  await page.unroute('**/api/agents/execute**')
}

export async function unmockCouncil(page: Page): Promise<void> {
  await page.unroute('**/api/agents/council**')
}
