/**
 * @file specialist-domain-map.ts
 *
 * @description Maps specialist IDs to their primary knowledge domains.
 * Used by searchKnowledgeForSpecialist to prioritize domain-relevant notes.
 */

import type { SpecialistId } from '@/lib/agents/specialists-config'

export const SPECIALIST_DOMAIN_SLUGS: Partial<Record<SpecialistId, string[]>> = {
  'strategist': ['strategy'],
  'finance-lead': ['finance'],
  'fundraising-advisor': ['finance'],
  'legal-counsel': ['legal'],
  'cto': ['technology', 'product'],
  'vp-engineering': ['technology'],
  'vp-manufacturing': ['operations', 'technology'],
  'vp-supply-chain': ['operations'],
  'product-lead': ['product', 'strategy'],
  'growth-marketer': ['market', 'strategy'],
  'sales-lead': ['market', 'finance'],
  'chief-of-staff': ['operations', 'team'],
  'hiring-team': ['team'],
}

/**
 * Returns the domain slugs relevant to a specialist.
 *
 * @param specialistId - The specialist to look up
 * @returns Array of domain slugs, or empty array if no mapping exists
 */
export function getSpecialistDomainSlugs(specialistId: string): string[] {
  return SPECIALIST_DOMAIN_SLUGS[specialistId as SpecialistId] ?? []
}
