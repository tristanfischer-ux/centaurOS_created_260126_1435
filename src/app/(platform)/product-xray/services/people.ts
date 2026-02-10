/**
 * @file people.ts — People matching service for X-Ray modules
 *
 * @description Matches X-Ray module expert-question disciplines to:
 * 1. Internal team members (profiles.skills, profiles.expertise_areas)
 * 2. Marketplace People listings (marketplace_listings where category='People')
 *
 * CURRENT STATE: Returns the demo's hardcoded PEOPLE array.
 *
 * TODO: Replace with real queries:
 * 1. Query `profiles` table for foundry team members:
 *    - Match module disciplines to profiles.skills[] and profiles.expertise_areas[]
 *    - Fields available: skills, expertise_areas, role, availability_hours_per_week,
 *      capacity_score, years_experience, industries[]
 *    - Filter out AI_Agent role (human experts only for interviews)
 * 2. Query `marketplace_listings` where category='People':
 *    - Text search on title/description matching discipline keywords
 *    - Use search_vector for full-text search
 *    - Include is_verified status for trust signal
 * 3. Score and rank: internal team first, marketplace people as gap-fill
 *
 * @related
 * - Demo mock: ../demo/ForgeOS_CompanyScan_Demo.tsx (PEOPLE, matchPeopleForNeed)
 * - Team profiles: src/actions/team.ts (getTeamMembers queries)
 * - Marketplace: src/actions/marketplace.ts (listing queries)
 * - Profile fields: profiles table has skills[], expertise_areas[], capacity_score,
 *   availability_hours_per_week, years_experience, industries[]
 */

import { PEOPLE } from "../demo/ForgeOS_CompanyScan_Demo"

import type { PersonListing, ModuleSpec, Discipline } from "../demo/ForgeOS_CompanyScan_Demo"

export interface PersonMatch {
  person: PersonListing
  matchedDiscipline: Discipline
  isInternal: boolean // true = team member, false = marketplace listing
  matchScore: number
}

/**
 * Finds people (team + marketplace) who can answer expert questions for these modules.
 *
 * @param modules - The X-Ray modules containing expert questions
 * @returns Ranked list of people matches grouped by discipline
 *
 * TODO: Accept foundryId to query real team members
 * TODO: Query marketplace_listings with textSearch for gaps
 */
export async function matchPeopleForModules(modules: ModuleSpec[]): Promise<PersonMatch[]> {
  // TODO: Replace with real Supabase queries
  // const { data: teamMembers } = await supabase
  //   .from('profiles')
  //   .select('id, full_name, role, skills, expertise_areas, avatar_url')
  //   .eq('foundry_id', foundryId)
  //   .neq('role', 'AI_Agent')
  //
  // const { data: marketplacePeople } = await supabase
  //   .from('marketplace_listings')
  //   .select('*')
  //   .eq('category', 'People')
  //   .textSearch('search_vector', disciplineKeywords)

  const disciplines = new Set<Discipline>()
  modules.forEach((m) =>
    m.detail.expertQuestions.forEach((q) => disciplines.add(q.discipline))
  )

  // For now, return mock data shaped as PersonMatch
  return PEOPLE.map((p) => ({
    person: p,
    matchedDiscipline: "Process" as Discipline,
    isInternal: false,
    matchScore: 1,
  }))
}
