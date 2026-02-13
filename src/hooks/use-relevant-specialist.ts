/**
 * @file use-relevant-specialist.ts
 *
 * @description Hook that maps context (objective title, task description,
 * pillar name, etc.) to the most relevant specialist using keyword matching.
 *
 * Returns the specialist ID and name so the caller can pre-select
 * in AskSpecialistButton or SpecialistPicker.
 */

import { useMemo } from 'react'

// ─── Domain-to-specialist mapping ────────────────────────────────────────────

interface DomainRule {
  /** Specialist ID from specialists-data.ts */
  specialistId: string
  /** Human-readable specialist name */
  specialistName: string
  /** Keywords that signal this domain (lowercase) */
  keywords: string[]
}

const DOMAIN_RULES: DomainRule[] = [
  {
    specialistId: 'product-lead',
    specialistName: 'Priya',
    keywords: [
      'product', 'feature', 'roadmap', 'mvp', 'prd', 'user story', 'ux',
      'ui', 'design', 'prototype', 'sprint', 'backlog', 'engineering',
      'development', 'technical', 'spec', 'build', 'ship', 'launch',
      'iteration', 'beta', 'release', 'scope',
    ],
  },
  {
    specialistId: 'growth-marketer',
    specialistName: 'Mia',
    keywords: [
      'marketing', 'brand', 'growth', 'acquisition', 'content', 'seo',
      'social media', 'campaign', 'email', 'newsletter', 'ads', 'funnel',
      'landing page', 'awareness', 'pr', 'press', 'blog', 'viral',
      'channel', 'audience', 'engagement', 'influencer', 'organic',
    ],
  },
  {
    specialistId: 'sales-lead',
    specialistName: 'Nate',
    keywords: [
      'sales', 'revenue', 'pipeline', 'deal', 'close', 'prospect',
      'outreach', 'cold email', 'proposal', 'pricing', 'quota', 'crm',
      'customer', 'client', 'contract', 'negotiation', 'demo', 'pitch',
      'conversion', 'upsell', 'churn', 'retention', 'renewal',
    ],
  },
  {
    specialistId: 'finance-lead',
    specialistName: 'Eli',
    keywords: [
      'finance', 'budget', 'runway', 'p&l', 'cost', 'revenue model',
      'cash flow', 'burn rate', 'financial', 'accounting', 'tax',
      'expense', 'profit', 'margin', 'forecast', 'projection', 'unit economics',
      'payroll', 'invoice', 'billing',
    ],
  },
  {
    specialistId: 'hiring-team',
    specialistName: 'Harper',
    keywords: [
      'hire', 'hiring', 'recruit', 'team', 'culture', 'onboard',
      'onboarding', 'job description', 'jd', 'talent', 'hr',
      'human resources', 'compensation', 'benefits', 'headcount',
      'interview', 'performance review', 'people', 'org chart',
      'remote', 'workplace',
    ],
  },
  {
    specialistId: 'legal-counsel',
    specialistName: 'Leo',
    keywords: [
      'legal', 'compliance', 'contract', 'ip', 'intellectual property',
      'patent', 'trademark', 'terms of service', 'privacy policy',
      'gdpr', 'regulation', 'liability', 'nda', 'agreement', 'license',
      'corporate', 'governance', 'risk', 'audit',
    ],
  },
  {
    specialistId: 'fundraising-advisor',
    specialistName: 'Fiona',
    keywords: [
      'fundraise', 'fundraising', 'investor', 'pitch', 'raise', 'round',
      'seed', 'series a', 'vc', 'venture', 'angel', 'valuation',
      'term sheet', 'cap table', 'dilution', 'deck', 'pitch deck',
      'due diligence', 'equity',
    ],
  },
  {
    specialistId: 'chief-of-staff',
    specialistName: 'Cal',
    keywords: [
      'meeting', 'decision', 'priority',
      'weekly', 'alignment', 'coordination', 'workflow',
      'board meeting', 'stakeholder', 'agenda', 'follow up', 'planning',
    ],
  },
  {
    specialistId: 'forge-ops',
    specialistName: 'Owen',
    keywords: [
      'operations', 'manufacturing', 'supply chain', 'vendor', 'supplier',
      'production', 'fulfillment', 'delivery', 'logistics', 'inventory',
      'quality', 'qc', 'qa', 'process', 'bottleneck', 'throughput',
      'capacity', 'warehouse', 'shipping', 'procurement', 'efficiency',
      'sla', 'lead time', 'batch', 'assembly', 'cad', 'component',
      'forge', 'foundry operations', 'operational',
    ],
  },
]

/** Default specialist when no domain keywords match */
const DEFAULT_SPECIALIST = {
  specialistId: 'strategist',
  specialistName: 'Sam',
} as const

// ─── Scoring logic ───────────────────────────────────────────────────────────

/**
 * Scores how well text matches a set of keywords.
 * Returns the number of keyword matches found.
 */
function scoreKeywords(text: string, keywords: string[]): number {
  const lower = text.toLowerCase()
  let score = 0
  for (const kw of keywords) {
    if (lower.includes(kw)) {
      score += 1
    }
  }
  return score
}

// ─── Hook ────────────────────────────────────────────────────────────────────

interface RelevantSpecialistResult {
  /** The recommended specialist ID */
  specialistId: string
  /** The recommended specialist's human name */
  specialistName: string
  /** Whether this is the default (no strong signal) */
  isDefault: boolean
}

/**
 * Returns the most relevant specialist based on text content.
 *
 * @param title - The title of the entity (objective, task, pillar)
 * @param description - Optional description for additional signal
 * @param pillarTitle - Optional parent pillar/strategy title for additional signal
 * @returns The best-matching specialist ID and name
 *
 * @example
 * const { specialistId, specialistName } = useRelevantSpecialist(
 *   'Increase Q3 revenue by 40%',
 *   'Build outbound sales pipeline and close enterprise deals'
 * )
 * // Returns { specialistId: 'sales-lead', specialistName: 'Nate', isDefault: false }
 */
export function useRelevantSpecialist(
  title: string,
  description?: string | null,
  pillarTitle?: string | null,
): RelevantSpecialistResult {
  return useMemo(() => {
    // Combine all available text for scoring
    const combined = [title, description ?? '', pillarTitle ?? ''].join(' ')

    if (!combined.trim()) {
      return { ...DEFAULT_SPECIALIST, isDefault: true }
    }

    let bestScore = 0
    let bestRule: DomainRule | null = null

    for (const rule of DOMAIN_RULES) {
      const score = scoreKeywords(combined, rule.keywords)
      if (score > bestScore) {
        bestScore = score
        bestRule = rule
      }
    }

    if (bestRule && bestScore >= 1) {
      return {
        specialistId: bestRule.specialistId,
        specialistName: bestRule.specialistName,
        isDefault: false,
      }
    }

    return { ...DEFAULT_SPECIALIST, isDefault: true }
  }, [title, description, pillarTitle])
}

/**
 * Non-hook version for use in non-component contexts (e.g., server components,
 * utility functions). Same logic as the hook but without memoization.
 */
export function getRelevantSpecialist(
  title: string,
  description?: string | null,
  pillarTitle?: string | null,
): RelevantSpecialistResult {
  const combined = [title, description ?? '', pillarTitle ?? ''].join(' ')

  if (!combined.trim()) {
    return { ...DEFAULT_SPECIALIST, isDefault: true }
  }

  let bestScore = 0
  let bestRule: DomainRule | null = null

  for (const rule of DOMAIN_RULES) {
    const score = scoreKeywords(combined, rule.keywords)
    if (score > bestScore) {
      bestScore = score
      bestRule = rule
    }
  }

  if (bestRule && bestScore >= 1) {
    return {
      specialistId: bestRule.specialistId,
      specialistName: bestRule.specialistName,
      isDefault: false,
    }
  }

  return { ...DEFAULT_SPECIALIST, isDefault: true }
}
