/**
 * @file index.ts
 *
 * @description Skill registry — exports all document skills and lookup helpers.
 *
 * @related
 * - src/lib/document-skills/types.ts — Type definitions
 * - src/app/api/reports/generate-document/route.ts — SSE generation endpoint
 */

import { strategySkills } from './strategy-skills'
import { operationsSkills } from './operations-skills'
import { complianceSkills } from './compliance-skills'
import { peopleSkills } from './people-skills'

import type { DocumentSkill, SkillCategory } from './types'

/** All available document skills, ordered by category. */
export const DOCUMENT_SKILLS: DocumentSkill[] = [
  ...strategySkills,
  ...operationsSkills,
  ...complianceSkills,
  ...peopleSkills,
]

/**
 * Look up a skill by its ID.
 *
 * @param id - The skill identifier (e.g. 'doc-competitive-analysis')
 * @returns The skill definition, or undefined if not found
 */
export function getSkillById(id: string): DocumentSkill | undefined {
  return DOCUMENT_SKILLS.find(s => s.id === id)
}

/**
 * Get all skills for a given category.
 *
 * @param category - The category to filter by
 * @returns Array of skills in that category
 */
export function getSkillsByCategory(category: SkillCategory): DocumentSkill[] {
  return DOCUMENT_SKILLS.filter(s => s.category === category)
}
