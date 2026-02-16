/**
 * @file Harness Contract Consistency Test
 *
 * @description Validates the harness-contract.json file is structurally correct,
 * internally consistent, and covers the expected risk tiers. This test ensures
 * the harness engineering infrastructure itself doesn't drift or break.
 *
 * @security The harness contract determines what checks are enforced on PRs.
 * A broken or incomplete contract could allow unsafe merges.
 */

import { readFileSync, existsSync } from 'fs'
import path from 'path'

const CONTRACT_PATH = path.resolve(process.cwd(), 'harness-contract.json')

interface TierRule {
  description: string
  paths: string[]
}

interface MergePolicy {
  requiredChecks: string[]
  requiresHumanReview: boolean
  minimumReviewers: number
  evidenceRequirements: string[]
}

interface DocsDriftRule {
  trigger: string
  requires: string[]
  message: string
}

interface HarnessContract {
  version: string
  description: string
  riskTierRules: Record<string, TierRule>
  mergePolicy: Record<string, MergePolicy>
  docsDriftRules: {
    description: string
    rules: DocsDriftRule[]
  }
  harnessGapPolicy: {
    slaDays: number
    issueLabel: string
    caseDirectory: string
    namingConvention: string
  }
  browserEvidence: {
    requiredFlows: Array<{
      name: string
      entrypoint: string
      persona: string
    }>
  }
}

/** Expected risk tiers in severity order */
const EXPECTED_TIERS = ['critical', 'high', 'medium', 'low']

/** Checks that must appear in at least one tier's requirements */
const EXPECTED_CHECK_TYPES = [
  'risk-policy-gate',
  'baseline-typecheck',
  'lint',
]

describe('Harness Contract Consistency', () => {
  let contract: HarnessContract

  beforeAll(() => {
    expect(existsSync(CONTRACT_PATH)).toBe(true)
    const raw = readFileSync(CONTRACT_PATH, 'utf-8')
    contract = JSON.parse(raw)
  })

  describe('structural integrity', () => {
    it('has a version string', () => {
      expect(contract.version).toBeTruthy()
      expect(typeof contract.version).toBe('string')
    })

    it('has a description', () => {
      expect(contract.description).toBeTruthy()
    })

    it('has all expected risk tiers defined', () => {
      for (const tier of EXPECTED_TIERS) {
        expect(contract.riskTierRules).toHaveProperty(tier)
        expect(contract.mergePolicy).toHaveProperty(tier)
      }
    })

    it('has no unexpected risk tiers', () => {
      const tierKeys = Object.keys(contract.riskTierRules)
      for (const key of tierKeys) {
        expect(EXPECTED_TIERS).toContain(key)
      }
    })
  })

  describe('risk tier rules', () => {
    it('every tier has a description and at least one path pattern', () => {
      for (const tier of EXPECTED_TIERS) {
        const rule = contract.riskTierRules[tier]
        expect(rule.description).toBeTruthy()
        expect(rule.paths.length).toBeGreaterThan(0)
      }
    })

    it('low tier has a catch-all pattern', () => {
      const lowPaths = contract.riskTierRules.low.paths
      const hasCatchAll = lowPaths.some(
        (p) => p === '**' || p === '**/*',
      )
      expect(hasCatchAll).toBe(true)
    })

    it('critical tier includes auth and billing paths', () => {
      const criticalPaths = contract.riskTierRules.critical.paths
      const pathString = criticalPaths.join(' ')

      expect(pathString).toContain('auth')
      expect(pathString).toContain('billing')
    })

    it('critical tier includes database migrations', () => {
      const criticalPaths = contract.riskTierRules.critical.paths
      const hasMigrations = criticalPaths.some((p) => p.includes('migrations'))
      expect(hasMigrations).toBe(true)
    })
  })

  describe('merge policy', () => {
    it('all tiers include risk-policy-gate as a required check', () => {
      for (const tier of EXPECTED_TIERS) {
        const policy = contract.mergePolicy[tier]
        expect(policy.requiredChecks).toContain('risk-policy-gate')
      }
    })

    it('higher tiers require more checks than lower tiers', () => {
      const criticalChecks = contract.mergePolicy.critical.requiredChecks.length
      const highChecks = contract.mergePolicy.high.requiredChecks.length
      const mediumChecks = contract.mergePolicy.medium.requiredChecks.length
      const lowChecks = contract.mergePolicy.low.requiredChecks.length

      expect(criticalChecks).toBeGreaterThanOrEqual(highChecks)
      expect(highChecks).toBeGreaterThanOrEqual(mediumChecks)
      expect(mediumChecks).toBeGreaterThanOrEqual(lowChecks)
    })

    it('critical tier requires human review', () => {
      expect(contract.mergePolicy.critical.requiresHumanReview).toBe(true)
    })

    it('all expected check types appear in at least one tier', () => {
      const allChecks = new Set(
        EXPECTED_TIERS.flatMap(
          (tier) => contract.mergePolicy[tier].requiredChecks,
        ),
      )

      for (const check of EXPECTED_CHECK_TYPES) {
        expect(allChecks.has(check)).toBe(true)
      }
    })

    it('merge policy fields are properly typed', () => {
      for (const tier of EXPECTED_TIERS) {
        const policy = contract.mergePolicy[tier]
        expect(Array.isArray(policy.requiredChecks)).toBe(true)
        expect(typeof policy.requiresHumanReview).toBe('boolean')
        expect(typeof policy.minimumReviewers).toBe('number')
        expect(Array.isArray(policy.evidenceRequirements)).toBe(true)
      }
    })
  })

  describe('docs drift rules', () => {
    it('has at least one drift rule defined', () => {
      expect(contract.docsDriftRules.rules.length).toBeGreaterThan(0)
    })

    it('every drift rule has trigger, requires, and message', () => {
      for (const rule of contract.docsDriftRules.rules) {
        expect(rule.trigger).toBeTruthy()
        expect(rule.requires.length).toBeGreaterThan(0)
        expect(rule.message).toBeTruthy()
      }
    })

    it('harness-contract.json has a self-referencing drift rule', () => {
      const contractRule = contract.docsDriftRules.rules.find(
        (r) => r.trigger === 'harness-contract.json',
      )
      expect(contractRule).toBeDefined()
    })
  })

  describe('harness gap policy', () => {
    it('has a reasonable SLA', () => {
      expect(contract.harnessGapPolicy.slaDays).toBeGreaterThan(0)
      expect(contract.harnessGapPolicy.slaDays).toBeLessThanOrEqual(14)
    })

    it('has a valid case directory', () => {
      expect(contract.harnessGapPolicy.caseDirectory).toBeTruthy()
      expect(
        existsSync(path.resolve(process.cwd(), contract.harnessGapPolicy.caseDirectory)),
      ).toBe(true)
    })

    it('has a naming convention with feature and description placeholders', () => {
      const convention = contract.harnessGapPolicy.namingConvention
      expect(convention).toContain('{feature}')
      expect(convention).toContain('{description}')
      expect(convention).toContain('.test.ts')
    })
  })

  describe('browser evidence', () => {
    it('has at least one required flow', () => {
      expect(contract.browserEvidence.requiredFlows.length).toBeGreaterThan(0)
    })

    it('every flow has name, entrypoint, and persona', () => {
      for (const flow of contract.browserEvidence.requiredFlows) {
        expect(flow.name).toBeTruthy()
        expect(flow.entrypoint).toMatch(/^\//)
        expect(flow.persona).toBeTruthy()
      }
    })

    it('covers Founder and Executive personas at minimum', () => {
      const personas = contract.browserEvidence.requiredFlows.map(
        (f) => f.persona,
      )
      expect(personas).toContain('Founder')
      expect(personas).toContain('Executive')
    })
  })

  describe('cross-referencing', () => {
    it('merge policy tiers match risk tier rules exactly', () => {
      const riskTiers = new Set(Object.keys(contract.riskTierRules))
      const policyTiers = new Set(Object.keys(contract.mergePolicy))

      expect(riskTiers).toEqual(policyTiers)
    })
  })
})
