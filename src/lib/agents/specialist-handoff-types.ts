/**
 * @file specialist-handoff-types.ts
 *
 * @description Shared types for specialist handoff trails. Extracted from
 * the now-deleted advisor-panel-context so components that render the
 * BriefSpecialistDialog can describe a multi-specialist handoff breadcrumb
 * without depending on any UI provider.
 */

/** Entry in the handoff trail breadcrumb */
export interface HandoffTrailEntry {
  specialistId: string
  name: string
}
