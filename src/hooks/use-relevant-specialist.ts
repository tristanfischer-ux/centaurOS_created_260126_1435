/**
 * @file use-relevant-specialist.ts
 *
 * @description Hook that maps context (objective title, task description,
 * pillar name, etc.) to the most relevant specialist using weighted keyword
 * matching with bigram support and negative keyword suppression.
 *
 * Returns the specialist ID and name so the caller can pre-select
 * in AskSpecialistButton or SpecialistPicker.
 */

import { useMemo } from 'react'

import type { SpecialistId } from "@/lib/agents/specialists-config"

// ─── Domain-to-specialist mapping ────────────────────────────────────────────

interface DomainRule {
  /** Specialist ID from specialists-data.ts */
  specialistId: SpecialistId
  /** Human-readable specialist name */
  specialistName: string
  /** Primary keywords score 3x — core domain terms */
  primaryKeywords: string[]
  /** Secondary keywords score 1x — adjacent/overlapping terms */
  secondaryKeywords: string[]
  /** Bigrams (two-word phrases) score 5x — highly specific to this domain */
  bigrams: string[]
  /** If ANY of these keywords appear, suppress this specialist's score by 50% */
  negativeKeywords: string[]
}

const DOMAIN_RULES: DomainRule[] = [
  {
    specialistId: 'cto',
    specialistName: 'Max',
    primaryKeywords: [
      'technology', 'tech stack', 'architecture', 'infrastructure', 'software',
      'scalability', 'platform', 'microservices', 'cloud', 'devops',
      'technical debt', 'system design', 'database', 'api', 'backend',
      'frontend', 'full stack', 'digital transformation',
    ],
    secondaryKeywords: [
      'aws', 'azure', 'gcp', 'ci cd', 'refactor', 'programming', 'code',
      'engineering decisions', 'tech strategy', 'first principles', 'optimize',
    ],
    bigrams: [
      'tech stack', 'system design', 'make vs buy', 'buy vs build',
      'technical debt', 'digital transformation', 'first principles',
    ],
    negativeKeywords: ['hire', 'recruit', 'onboard', 'compensation'],
  },
  {
    specialistId: 'vp-engineering',
    specialistName: 'Jian',
    primaryKeywords: [
      'engineering', 'velocity', 'sprint', 'scrum', 'agile', 'deployment',
      'code review', 'testing', 'engineering manager', 'tech lead',
      'incident', 'on call',
    ],
    secondaryKeywords: [
      'developer', 'team', 'deploy', 'ci cd', 'quality', 'unit test',
      'integration test', 'build', 'ship', 'lead time', 'mttf', 'mttr',
    ],
    bigrams: [
      'code review', 'engineering velocity', 'sprint planning',
      'tech lead', 'engineering manager', 'unit test', 'integration test',
    ],
    negativeKeywords: ['marketing', 'sales', 'fundraise'],
  },
  {
    specialistId: 'vp-manufacturing',
    specialistName: 'Fang',
    primaryKeywords: [
      'manufacturing', 'production', 'factory', 'dfm', 'yield', 'tooling',
      'mold', 'injection', 'casting', 'cnc', 'assembly', 'bom',
      'oem', 'throughput', 'material', 'alloy', 'resin', 'filament',
    ],
    secondaryKeywords: [
      'quality', 'qc', 'qa', 'tolerance', 'supplier', 'vendor',
      'contract manufacturer', 'cm', 'capacity', 'operations',
      'bottleneck', 'process', 'efficiency', 'pilot', 'scale up',
      'pla', 'abs', 'petg', 'nylon', 'aluminum', 'titanium',
      'stainless', 'carbon fiber', 'composite', 'polymer', 'plastic',
      'metal', 'printable', 'machinable',
    ],
    bigrams: [
      'design for manufacturing', 'bill of materials', 'first article',
      'contract manufacturer', 'production planning', 'scale up',
      'manufacturing engineer', 'material selection', '3d print',
      'additive manufacturing', 'surface finish',
    ],
    negativeKeywords: ['marketing', 'sales', 'fundraise', 'legal'],
  },
  {
    specialistId: 'vp-supply-chain',
    specialistName: 'Chase',
    primaryKeywords: [
      'supply chain', 'procurement', 'sourcing', 'logistics', 'inventory',
      'fulfillment', 'shipping', 'freight', 'import', 'export',
      'tariff', 'duty',
    ],
    secondaryKeywords: [
      'vendor', 'supplier', 'lead time', 'stock', 'procure', 'purchase',
      'negotiate', 'cost', 'pricing', 'dual source', 'backup', 'contingency',
      'materials', 'raw material', 'component', 'parts',
    ],
    bigrams: [
      'supply chain', 'lead time', 'dual source', 'raw material',
    ],
    negativeKeywords: ['marketing', 'sales', 'fundraise', 'legal'],
  },
  {
    specialistId: 'product-lead',
    specialistName: 'Priya',
    primaryKeywords: [
      'product', 'roadmap', 'mvp', 'prd', 'user story', 'ux', 'ui',
      'prototype', 'backlog', 'launch', 'iteration', 'beta', 'release',
    ],
    secondaryKeywords: [
      'feature', 'design', 'sprint', 'engineering', 'development',
      'technical', 'spec', 'build', 'ship', 'scope',
    ],
    bigrams: [
      'user story', 'product roadmap', 'feature request', 'user experience',
    ],
    negativeKeywords: ['hire', 'recruit', 'fundraise', 'legal'],
  },
  {
    specialistId: 'growth-marketer',
    specialistName: 'Mia',
    primaryKeywords: [
      'marketing', 'brand', 'growth', 'acquisition', 'content', 'seo',
      'social media', 'campaign', 'ads', 'funnel', 'awareness', 'pr',
      'press', 'viral', 'engagement', 'influencer',
    ],
    secondaryKeywords: [
      'email', 'newsletter', 'landing page', 'blog', 'channel',
      'audience', 'organic',
    ],
    bigrams: [
      'social media', 'landing page', 'content marketing',
      'growth strategy', 'brand awareness',
    ],
    negativeKeywords: ['legal', 'compliance', 'manufacturing'],
  },
  {
    specialistId: 'sales-lead',
    specialistName: 'Sal',
    primaryKeywords: [
      'sales', 'revenue', 'pipeline', 'deal', 'close', 'prospect',
      'outreach', 'proposal', 'quota', 'crm', 'negotiation',
      'conversion', 'upsell', 'churn', 'retention',
    ],
    secondaryKeywords: [
      'cold email', 'pricing', 'customer', 'client', 'contract',
      'demo', 'pitch', 'renewal',
    ],
    bigrams: [
      'sales pipeline', 'cold email', 'sales strategy', 'deal close',
    ],
    negativeKeywords: ['hire', 'legal', 'manufacturing'],
  },
  {
    specialistId: 'finance-lead',
    specialistName: 'Finn',
    primaryKeywords: [
      'finance', 'budget', 'runway', 'p&l', 'revenue model', 'cash flow',
      'burn rate', 'financial', 'accounting', 'tax', 'profit', 'margin',
      'forecast', 'unit economics',
    ],
    secondaryKeywords: [
      'cost', 'expense', 'projection', 'payroll', 'invoice', 'billing',
    ],
    bigrams: [
      'burn rate', 'cash flow', 'unit economics', 'revenue model',
      'financial model',
    ],
    negativeKeywords: ['hire', 'marketing', 'manufacturing'],
  },
  {
    specialistId: 'hiring-team',
    specialistName: 'Harper',
    primaryKeywords: [
      'hire', 'hiring', 'recruit', 'onboard', 'onboarding', 'talent',
      'hr', 'human resources', 'compensation', 'benefits', 'headcount',
      'interview', 'performance review',
    ],
    secondaryKeywords: [
      'team', 'culture', 'job description', 'jd', 'people', 'org chart',
      'remote', 'workplace',
    ],
    bigrams: [
      'job description', 'performance review', 'human resources',
      'org chart', 'hiring plan',
    ],
    // INTENT: When domain-specific nouns accompany "hire", the domain specialist
    // is likely more relevant (e.g., "hire a manufacturing engineer" → Fang).
    negativeKeywords: [
      'manufacturing', 'engineering', 'supply chain', 'finance',
      'legal', 'marketing', 'sales',
    ],
  },
  {
    specialistId: 'legal-counsel',
    specialistName: 'Leo',
    primaryKeywords: [
      'legal', 'compliance', 'contract', 'ip', 'intellectual property',
      'patent', 'trademark', 'privacy policy', 'gdpr', 'regulation',
      'liability', 'nda', 'agreement', 'license', 'governance',
    ],
    secondaryKeywords: [
      'terms of service', 'corporate', 'risk', 'audit',
    ],
    bigrams: [
      'intellectual property', 'privacy policy', 'terms of service',
    ],
    negativeKeywords: ['marketing', 'sales', 'manufacturing'],
  },
  {
    specialistId: 'fundraising-advisor',
    specialistName: 'Fiona',
    primaryKeywords: [
      'fundraise', 'fundraising', 'investor', 'raise', 'round', 'seed',
      'series a', 'vc', 'venture', 'angel', 'valuation', 'term sheet',
      'cap table', 'dilution', 'equity', 'due diligence',
    ],
    secondaryKeywords: [
      'pitch', 'deck', 'pitch deck',
    ],
    bigrams: [
      'pitch deck', 'term sheet', 'cap table', 'due diligence',
      'series a', 'venture capital',
    ],
    negativeKeywords: ['manufacturing', 'engineering', 'legal'],
  },
  {
    specialistId: 'chief-of-staff',
    specialistName: 'Cal',
    primaryKeywords: [
      'meeting', 'decision', 'priority', 'alignment', 'coordination',
      'workflow', 'board meeting', 'stakeholder', 'agenda',
    ],
    secondaryKeywords: [
      'weekly', 'follow up', 'planning',
    ],
    bigrams: [
      'board meeting', 'decision making',
    ],
    negativeKeywords: [],
  },
  {
    specialistId: 'strategist',
    specialistName: 'Sage',
    primaryKeywords: [
      'strategy', 'vision', 'mission', 'pivot', 'moat', 'positioning',
      'competitive', 'market entry', 'go to market', 'gtm', 'business model',
      'okr', 'north star', 'strategic', 'long term', 'differentiation',
    ],
    secondaryKeywords: [
      'focus', 'tradeoff', 'priority', 'alignment', 'direction',
      'competitive advantage', 'value proposition',
    ],
    bigrams: [
      'go to market', 'business model', 'market entry', 'competitive advantage',
      'value proposition', 'north star', 'strategic plan',
    ],
    negativeKeywords: ['manufacturing', 'engineering', 'legal', 'hire'],
  },
]

/** Default specialist when no domain keywords match */
const DEFAULT_SPECIALIST = {
  specialistId: 'strategist',
  specialistName: 'Sage',
} as const

// ─── Scoring logic ───────────────────────────────────────────────────────────

const PRIMARY_WEIGHT = 3
const SECONDARY_WEIGHT = 1
const BIGRAM_WEIGHT = 5
const NEGATIVE_PENALTY = 0.5 // multiply score by this if negative keywords found

/**
 * Scores how well text matches a domain rule using weighted keywords,
 * bigram phrases, and negative keyword suppression.
 */
function scoreDomainRule(text: string, rule: DomainRule): number {
  const lower = text.toLowerCase()
  let score = 0

  // Bigrams score highest — they're the most specific signal
  for (const bg of rule.bigrams) {
    if (lower.includes(bg)) {
      score += BIGRAM_WEIGHT
    }
  }

  // Primary keywords — core domain terms
  for (const kw of rule.primaryKeywords) {
    if (lower.includes(kw)) {
      score += PRIMARY_WEIGHT
    }
  }

  // Secondary keywords — adjacent terms
  for (const kw of rule.secondaryKeywords) {
    if (lower.includes(kw)) {
      score += SECONDARY_WEIGHT
    }
  }

  // Negative keyword suppression — if domain-crossing terms appear,
  // this specialist is probably not the right one
  if (score > 0 && rule.negativeKeywords.length > 0) {
    for (const neg of rule.negativeKeywords) {
      if (lower.includes(neg)) {
        score *= NEGATIVE_PENALTY
        break // one penalty is enough
      }
    }
  }

  return score
}

// ─── Hook ────────────────────────────────────────────────────────────────────

interface RelevantSpecialistResult {
  /** The recommended specialist ID */
  specialistId: SpecialistId
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
 *   'Hire a manufacturing engineer',
 *   'Need someone with DFM experience for the factory line'
 * )
 * // Returns { specialistId: 'vp-manufacturing', specialistName: 'Fang', isDefault: false }
 */
export function useRelevantSpecialist(
  title: string,
  description?: string | null,
  pillarTitle?: string | null,
): RelevantSpecialistResult {
  return useMemo(() => {
    return matchSpecialist(title, description, pillarTitle)
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
  return matchSpecialist(title, description, pillarTitle)
}

/** Shared matching logic used by both hook and non-hook variants. */
function matchSpecialist(
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
    const score = scoreDomainRule(combined, rule)
    if (score > bestScore) {
      bestScore = score
      bestRule = rule
    }
  }

  // Minimum score threshold — at least one primary keyword match (3)
  if (bestRule && bestScore >= PRIMARY_WEIGHT) {
    return {
      specialistId: bestRule.specialistId,
      specialistName: bestRule.specialistName,
      isDefault: false,
    }
  }

  return { ...DEFAULT_SPECIALIST, isDefault: true }
}
