/**
 * @file harness-risk-tier.ts
 *
 * @description Reads the harness contract and classifies a set of changed files
 * into their highest applicable risk tier. Used by CI (risk-policy-gate), the
 * local verify script, and agents to determine what level of scrutiny a change needs.
 *
 * Outputs structured JSON to stdout. Logs human-readable summary to stderr.
 *
 * @example
 *   # Classify unstaged changes
 *   npx tsx scripts/harness-risk-tier.ts
 *
 *   # Classify against a ref
 *   npx tsx scripts/harness-risk-tier.ts --ref main
 *
 *   # Classify explicit file list (used by CI)
 *   npx tsx scripts/harness-risk-tier.ts --files "src/actions/auth.ts,src/components/ui/button.tsx"
 *
 * @dependencies
 * - harness-contract.json (project root)
 * - git (for diff detection)
 *
 * @security This script determines what checks are required. Tampering with the
 * contract or this script could bypass safety gates. Both files should be
 * in the critical tier themselves.
 */

import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import path from 'path'
import { minimatch } from 'minimatch'

/** Risk tier ordered from highest to lowest severity */
const TIER_ORDER = ['critical', 'high', 'medium', 'low'] as const
type RiskTier = (typeof TIER_ORDER)[number]

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

interface HarnessContract {
  version: string
  riskTierRules: Record<RiskTier, TierRule>
  mergePolicy: Record<RiskTier, MergePolicy>
}

interface ClassificationResult {
  /** The highest risk tier across all changed files */
  tier: RiskTier
  /** SHA of the commit being evaluated */
  headSha: string
  /** Total files changed */
  fileCount: number
  /** Files grouped by their individual tier */
  filesByTier: Record<RiskTier, string[]>
  /** Required checks from merge policy for this tier */
  requiredChecks: string[]
  /** Whether human review is required */
  requiresHumanReview: boolean
  /** Evidence requirements */
  evidenceRequirements: string[]
  /** ISO timestamp of classification */
  classifiedAt: string
}

/**
 * Loads and parses the harness contract.
 *
 * @returns Parsed harness contract
 * @throws Error if contract file is missing or malformed
 */
function loadContract(): HarnessContract {
  const contractPath = path.resolve(process.cwd(), 'harness-contract.json')
  try {
    const raw = readFileSync(contractPath, 'utf-8')
    return JSON.parse(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new Error(`[HarnessRiskTier] Failed to load harness-contract.json: ${message}`)
  }
}

/**
 * Gets the current HEAD SHA.
 *
 * @returns Short SHA string
 */
function getHeadSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return 'unknown'
  }
}

/**
 * Gets changed files from git diff.
 *
 * @param ref - Optional ref to diff against (e.g., "main")
 * @returns Array of changed file paths
 */
function getChangedFiles(ref?: string): string[] {
  try {
    let cmd: string
    if (ref) {
      cmd = `git diff --name-only ${ref}...HEAD`
    } else {
      // Unstaged + staged changes (useful for local dev)
      cmd = 'git diff --name-only HEAD'
    }
    const output = execSync(cmd, { encoding: 'utf-8' }).trim()
    if (!output) return []
    return output.split('\n').filter((f) => f.length > 0)
  } catch {
    // Fallback: try diff against nothing (all files staged)
    try {
      const output = execSync('git diff --cached --name-only', { encoding: 'utf-8' }).trim()
      if (!output) return []
      return output.split('\n').filter((f) => f.length > 0)
    } catch {
      return []
    }
  }
}

/**
 * Classifies a single file into its highest applicable risk tier.
 *
 * @param filePath - Relative file path from repo root
 * @param contract - Parsed harness contract
 * @returns The risk tier for this file
 */
function classifyFile(filePath: string, contract: HarnessContract): RiskTier {
  for (const tier of TIER_ORDER) {
    const rule = contract.riskTierRules[tier]
    for (const pattern of rule.paths) {
      if (minimatch(filePath, pattern, { matchBase: false })) {
        return tier
      }
    }
  }
  return 'low'
}

/**
 * Classifies all changed files and computes the overall PR risk tier.
 *
 * @param files - Array of changed file paths
 * @param contract - Parsed harness contract
 * @returns Complete classification result
 */
function classifyChanges(files: string[], contract: HarnessContract): ClassificationResult {
  const filesByTier: Record<RiskTier, string[]> = {
    critical: [],
    high: [],
    medium: [],
    low: [],
  }

  for (const file of files) {
    const tier = classifyFile(file, contract)
    filesByTier[tier].push(file)
  }

  // Highest tier = first tier with any files
  let overallTier: RiskTier = 'low'
  for (const tier of TIER_ORDER) {
    if (filesByTier[tier].length > 0) {
      overallTier = tier
      break
    }
  }

  const policy = contract.mergePolicy[overallTier]

  return {
    tier: overallTier,
    headSha: getHeadSha(),
    fileCount: files.length,
    filesByTier,
    requiredChecks: policy.requiredChecks,
    requiresHumanReview: policy.requiresHumanReview,
    evidenceRequirements: policy.evidenceRequirements,
    classifiedAt: new Date().toISOString(),
  }
}

// ── CLI Entry Point ──────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2)

  let ref: string | undefined
  let explicitFiles: string[] | undefined

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ref' && args[i + 1]) {
      ref = args[i + 1]
      i++
    } else if (args[i] === '--files' && args[i + 1]) {
      explicitFiles = args[i + 1].split(',').map((f) => f.trim()).filter(Boolean)
      i++
    }
  }

  const contract = loadContract()
  const files = explicitFiles ?? getChangedFiles(ref)

  if (files.length === 0) {
    console.error('[HarnessRiskTier] No changed files detected.')
    const result: ClassificationResult = {
      tier: 'low',
      headSha: getHeadSha(),
      fileCount: 0,
      filesByTier: { critical: [], high: [], medium: [], low: [] },
      requiredChecks: contract.mergePolicy.low.requiredChecks,
      requiresHumanReview: false,
      evidenceRequirements: [],
      classifiedAt: new Date().toISOString(),
    }
    console.log(JSON.stringify(result, null, 2))
    return
  }

  const result = classifyChanges(files, contract)

  // Human-readable summary to stderr
  console.error('')
  console.error(`[HarnessRiskTier] Classification for ${result.headSha}`)
  console.error(`  Overall tier: ${result.tier.toUpperCase()}`)
  console.error(`  Files changed: ${result.fileCount}`)
  console.error('')
  for (const tier of TIER_ORDER) {
    const count = result.filesByTier[tier].length
    if (count > 0) {
      console.error(`  ${tier} (${count}):`)
      for (const file of result.filesByTier[tier].slice(0, 10)) {
        console.error(`    - ${file}`)
      }
      if (count > 10) {
        console.error(`    ... and ${count - 10} more`)
      }
    }
  }
  console.error('')
  console.error(`  Required checks: ${result.requiredChecks.join(', ')}`)
  if (result.requiresHumanReview) {
    console.error('  ⚠ HUMAN REVIEW REQUIRED')
  }
  if (result.evidenceRequirements.length > 0) {
    console.error(`  Evidence: ${result.evidenceRequirements.join(', ')}`)
  }
  console.error('')

  // Machine-readable JSON to stdout
  console.log(JSON.stringify(result, null, 2))
}

main()
