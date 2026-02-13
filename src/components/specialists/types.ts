/**
 * @file types.ts
 *
 * @description Shared types for the contextual specialist system.
 * These types enable specialists to be surfaced throughout the app
 * with pre-loaded context about the current page, objective, task, or pillar.
 */

// ─── Context Types ───────────────────────────────────────────────────────────

/** The domain context that determines which specialist is most relevant */
export type SpecialistContextType = 'strategy' | 'objective' | 'task' | 'pillar' | 'general'

/** Lightweight task summary for context serialization */
export interface ContextTask {
  title: string
  status: string
}

/** Lightweight objective summary for context serialization */
export interface ContextObjective {
  title: string
  health?: string
  progress?: number
}

/** Metadata that enriches the specialist conversation context */
export interface ContextMetadata {
  health?: string
  progress?: number
  status?: string
  riskLevel?: string
  tasks?: ContextTask[]
  pillarTitle?: string
  objectives?: ContextObjective[]
  /** Company purpose statement, if available */
  purposeSummary?: string
  /** Additional free-form context */
  notes?: string
}

/**
 * Context object passed to the specialist system.
 * Gets serialized into a readable handoff string for the BriefSpecialistDialog.
 */
export interface SpecialistContext {
  /** What kind of entity this context is about */
  type: SpecialistContextType
  /** Title of the entity (objective name, task name, pillar name, etc.) */
  title: string
  /** Description or summary of the entity */
  description?: string
  /** Rich metadata for deeper context */
  metadata?: ContextMetadata
}

// ─── Visual Variants ─────────────────────────────────────────────────────────

/** How the AskSpecialistButton renders */
export type SpecialistButtonVariant = 'button' | 'chip' | 'icon'

// ─── Context Serializer ──────────────────────────────────────────────────────

/**
 * Serializes a SpecialistContext into a human-readable string
 * suitable for the BriefSpecialistDialog's handoffContext prop.
 *
 * @param context - The specialist context to serialize
 * @returns A formatted markdown string the specialist can parse
 */
export function serializeContext(context: SpecialistContext): string {
  const lines: string[] = []

  // Header
  const typeLabel = context.type.charAt(0).toUpperCase() + context.type.slice(1)
  lines.push(`## Discussing: ${context.title}`)
  lines.push(`**Context type:** ${typeLabel}`)

  // Description
  if (context.description) {
    lines.push('')
    lines.push(`**Description:** ${context.description}`)
  }

  // Metadata
  if (context.metadata) {
    const m = context.metadata

    if (m.health) {
      lines.push(`**Health:** ${m.health}`)
    }
    if (m.progress != null) {
      lines.push(`**Progress:** ${m.progress}%`)
    }
    if (m.status) {
      lines.push(`**Status:** ${m.status}`)
    }
    if (m.riskLevel) {
      lines.push(`**Risk level:** ${m.riskLevel}`)
    }
    if (m.pillarTitle) {
      lines.push(`**Strategic pillar:** ${m.pillarTitle}`)
    }
    if (m.purposeSummary) {
      lines.push('')
      lines.push(`**Company purpose:** ${m.purposeSummary}`)
    }

    // Tasks summary
    if (m.tasks && m.tasks.length > 0) {
      lines.push('')
      lines.push('**Tasks:**')
      for (const task of m.tasks.slice(0, 15)) {
        lines.push(`- ${task.title} (${task.status})`)
      }
      if (m.tasks.length > 15) {
        lines.push(`- ...and ${m.tasks.length - 15} more`)
      }
    }

    // Objectives summary
    if (m.objectives && m.objectives.length > 0) {
      lines.push('')
      lines.push('**Objectives:**')
      for (const obj of m.objectives.slice(0, 10)) {
        const parts = [obj.title]
        if (obj.health) parts.push(`health: ${obj.health}`)
        if (obj.progress != null) parts.push(`${obj.progress}%`)
        lines.push(`- ${parts.join(' — ')}`)
      }
      if (m.objectives.length > 10) {
        lines.push(`- ...and ${m.objectives.length - 10} more`)
      }
    }

    if (m.notes) {
      lines.push('')
      lines.push(`**Additional context:** ${m.notes}`)
    }
  }

  lines.push('')
  lines.push('The user would like your input on this. Please reference the specific details above in your response.')

  return lines.join('\n')
}
