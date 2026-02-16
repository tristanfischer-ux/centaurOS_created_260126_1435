/**
 * @file harness-docs-drift.ts
 *
 * @description Checks that when control-plane files are changed, their
 * related documentation files are also updated in the same changeset.
 * Rules are defined in harness-contract.json under docsDriftRules.
 *
 * Exits with code 1 if a drift violation is detected.
 *
 * @example
 *   npx tsx scripts/harness-docs-drift.ts --ref main
 *
 * @security Prevents silent drift between workflows, scripts, and policy docs.
 */

import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import path from 'path'
import { minimatch } from 'minimatch'

interface DriftRule {
  trigger: string
  requires: string[]
  message: string
}

interface HarnessContract {
  docsDriftRules: {
    rules: DriftRule[]
  }
}

/**
 * Loads the harness contract.
 *
 * @returns Parsed contract
 */
function loadContract(): HarnessContract {
  const contractPath = path.resolve(process.cwd(), 'harness-contract.json')
  const raw = readFileSync(contractPath, 'utf-8')
  return JSON.parse(raw)
}

/**
 * Gets changed files from git diff.
 *
 * @param ref - Ref to diff against
 * @returns Array of changed file paths
 */
function getChangedFiles(ref?: string): string[] {
  try {
    const cmd = ref ? `git diff --name-only ${ref}...HEAD` : 'git diff --name-only HEAD'
    const output = execSync(cmd, { encoding: 'utf-8' }).trim()
    if (!output) return []
    return output.split('\n').filter((f) => f.length > 0)
  } catch {
    return []
  }
}

/**
 * Checks if a file matches a pattern.
 *
 * @param filePath - File to check
 * @param pattern - Glob or exact path pattern
 * @returns True if the file matches
 */
function fileMatchesPattern(filePath: string, pattern: string): boolean {
  if (pattern.includes('*')) {
    return minimatch(filePath, pattern, { matchBase: false })
  }
  return filePath === pattern
}

function main(): void {
  const args = process.argv.slice(2)
  let ref: string | undefined

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ref' && args[i + 1]) {
      ref = args[i + 1]
      i++
    }
  }

  const contract = loadContract()
  const changedFiles = new Set(getChangedFiles(ref))

  if (changedFiles.size === 0) {
    console.log('[DocsDrift] No changed files. Skipping.')
    process.exit(0)
  }

  const violations: string[] = []

  for (const rule of contract.docsDriftRules.rules) {
    // Check if the trigger file was changed
    const triggerChanged = Array.from(changedFiles).some((f) =>
      fileMatchesPattern(f, rule.trigger),
    )

    if (!triggerChanged) continue

    // Check if all required companion files were also changed
    for (const required of rule.requires) {
      const companionChanged = Array.from(changedFiles).some((f) =>
        fileMatchesPattern(f, required),
      )

      if (!companionChanged) {
        violations.push(
          `${rule.trigger} was changed but ${required} was not.\n  → ${rule.message}`,
        )
      }
    }
  }

  if (violations.length > 0) {
    console.error('')
    console.error('[DocsDrift] Documentation drift detected:')
    console.error('')
    for (const v of violations) {
      console.error(`  ⚠ ${v}`)
      console.error('')
    }
    console.error(
      '[DocsDrift] Update the related files or adjust docsDriftRules in harness-contract.json.',
    )
    console.error('')
    process.exit(1)
  }

  console.log('[DocsDrift] No drift violations. All control-plane changes have matching docs.')
}

main()
