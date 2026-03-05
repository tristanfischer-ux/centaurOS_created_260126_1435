/**
 * @file types.ts
 *
 * @description Type definitions for the Document Writer skill system.
 * Skills are structured prompt templates that guide Claude Opus 4.6 to
 * generate full business documents (competitive analyses, SOPs, etc.).
 *
 * @related
 * - src/lib/document-skills/index.ts — Skill registry
 * - src/app/api/reports/generate-document/route.ts — SSE generation endpoint
 * - src/app/(platform)/reports/page.tsx — UI integration
 */

// ========================
// Data Source Types
// ========================

/** Auto-populated data sources that can be injected into skill prompts. */
export type AutoDataSource =
  | 'company-profile'
  | 'objectives'
  | 'financials'
  | 'team'
  | 'sales-pipeline'
  | 'engineering'
  | 'blockers'

// ========================
// Tone & Length
// ========================

export type DocumentTone = 'professional' | 'executive' | 'technical' | 'conversational'

export type DocumentLength = 'brief' | 'standard' | 'comprehensive'

/** Word ranges for each length preset. */
export const WORD_RANGES: Record<DocumentLength, { min: number; max: number }> = {
  brief: { min: 800, max: 1500 },
  standard: { min: 2000, max: 4000 },
  comprehensive: { min: 4000, max: 6000 },
}

// ========================
// Skill Categories
// ========================

export type SkillCategory = 'strategy' | 'operations' | 'compliance' | 'people'

export const SKILL_CATEGORY_META: Record<SkillCategory, { label: string; description: string }> = {
  strategy: { label: 'Strategy & Growth', description: 'Market analysis, business planning, competitive intelligence' },
  operations: { label: 'Operations', description: 'SOPs, vendor assessments, market research' },
  compliance: { label: 'Compliance & Risk', description: 'Audit preparation, regulatory assessments' },
  people: { label: 'People & Finance', description: 'Investor updates, hiring plans, team communications' },
}

// ========================
// Skill Definition
// ========================

export interface DocumentSkill {
  id: string
  title: string
  description: string
  category: SkillCategory
  icon: string
  systemPrompt: string
  inputLabel: string
  inputHint: string
  autoDataSources: AutoDataSource[]
  wordRange: { min: number; max: number }
  defaultTone: DocumentTone
  tags: string[]
}

// ========================
// Guided Questions
// ========================

export interface DocumentQuestion {
  id: string
  question: string
  hint: string
  required: boolean
}

// ========================
// Generation Request / Result
// ========================

export interface GenerateDocumentRequest {
  skillId: string
  userContext: string
  tone: DocumentTone
  length: DocumentLength
  includeAutoData: boolean
  questionAnswers?: Record<string, string>
}

export interface SkillDocumentResult {
  id: string
  skillId: string
  title: string
  content: string
  wordCount: number
  generatedAt: string
  foundryId: string
  foundryName: string
  tone: DocumentTone
  tokensUsed: number
}
