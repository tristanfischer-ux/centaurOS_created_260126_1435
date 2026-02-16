/**
 * @file harness-gap-case.ts
 *
 * @description Generates a harness case test file from a production regression
 * description. Implements the incident memory loop:
 *
 *   production regression → harness gap issue → case added → SLA tracked
 *
 * This ensures one-off fixes become permanent regression tests.
 *
 * @example
 *   # Generate a harness case from a description
 *   npx tsx scripts/harness-gap-case.ts \
 *     --feature "billing" \
 *     --description "Stripe webhook fails silently on duplicate events" \
 *     --severity critical
 *
 *   # With an incident reference
 *   npx tsx scripts/harness-gap-case.ts \
 *     --feature "auth" \
 *     --description "RLS policy allows cross-foundry data read" \
 *     --severity critical \
 *     --incident "INC-2026-02-15"
 *
 * @dependencies harness-contract.json (for caseDirectory and naming convention)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import path from 'path'

interface HarnessContract {
  harnessGapPolicy: {
    slaDays: number
    issueLabel: string
    caseDirectory: string
    namingConvention: string
  }
}

interface CaseOptions {
  feature: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  incident?: string
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
 * Converts a description into a kebab-case slug.
 *
 * @param text - Human-readable description
 * @returns Kebab-case slug suitable for filenames
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/-$/, '')
}

/**
 * Generates the test file content for a harness gap case.
 *
 * @param options - Case configuration
 * @param contract - Parsed harness contract
 * @returns Generated test file content
 */
function generateCaseContent(options: CaseOptions, contract: HarnessContract): string {
  const now = new Date().toISOString().split('T')[0]
  const slaDate = new Date(Date.now() + contract.harnessGapPolicy.slaDays * 86400000)
    .toISOString()
    .split('T')[0]

  return `/**
 * @file Harness Gap Case: ${options.description}
 *
 * @description Regression test generated from a production incident.
 * This test ensures the issue does not recur.
 *
 * Feature: ${options.feature}
 * Severity: ${options.severity}
 * Created: ${now}
 * SLA: ${slaDate} (${contract.harnessGapPolicy.slaDays} days to implement)
 * ${options.incident ? `Incident: ${options.incident}` : 'Incident: (none referenced)'}
 *
 * @see harness-contract.json harnessGapPolicy
 *
 * Instructions:
 * 1. Replace the placeholder test below with actual regression assertions
 * 2. Ensure the test fails WITHOUT the fix (proves it catches the bug)
 * 3. Ensure the test passes WITH the fix
 * 4. Remove the .todo() marker once implemented
 */

describe('Harness Gap: ${options.feature} — ${options.description}', () => {
  /**
   * TODO: Implement this regression test.
   *
   * What happened:
   *   ${options.description}
   *
   * What to assert:
   *   - [ ] The specific condition that caused the regression
   *   - [ ] Edge cases around the fix
   *   - [ ] Related invariants that should hold
   *
   * Severity: ${options.severity}
   * SLA deadline: ${slaDate}
   */
  it.todo('should prevent: ${options.description}')

  // Uncomment and implement when ready:
  //
  // it('should prevent: ${options.description}', async () => {
  //   // Arrange: set up the condition that triggered the regression
  //
  //   // Act: perform the operation that previously failed
  //
  //   // Assert: verify the correct behavior
  //   expect(true).toBe(true) // Replace with real assertions
  // })
})
`
}

/**
 * Generates the filename for a harness gap case.
 *
 * @param feature - Feature area
 * @param description - Bug description
 * @param contract - Parsed harness contract
 * @returns Filename (without path)
 */
function generateFilename(
  feature: string,
  description: string,
  contract: HarnessContract,
): string {
  const slug = slugify(description)
  return contract.harnessGapPolicy.namingConvention
    .replace('{feature}', feature.toLowerCase())
    .replace('{description}', slug)
}

// ── CLI Entry Point ──────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2)

  let feature = ''
  let description = ''
  let severity: CaseOptions['severity'] = 'high'
  let incident: string | undefined

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--feature':
        feature = args[++i] || ''
        break
      case '--description':
        description = args[++i] || ''
        break
      case '--severity':
        severity = (args[++i] as CaseOptions['severity']) || 'high'
        break
      case '--incident':
        incident = args[++i]
        break
    }
  }

  if (!feature || !description) {
    console.error('Usage: npx tsx scripts/harness-gap-case.ts')
    console.error('  --feature <name>       Feature area (e.g., "billing", "auth", "rls")')
    console.error('  --description <text>   What went wrong in production')
    console.error('  --severity <level>     critical | high | medium | low (default: high)')
    console.error('  --incident <ref>       Optional incident reference (e.g., INC-2026-02-15)')
    process.exit(1)
  }

  const contract = loadContract()
  const filename = generateFilename(feature, description, contract)
  const filePath = path.resolve(process.cwd(), contract.harnessGapPolicy.caseDirectory, filename)

  if (existsSync(filePath)) {
    console.error(`[HarnessGap] File already exists: ${filePath}`)
    console.error('[HarnessGap] Choose a different description or edit the existing file.')
    process.exit(1)
  }

  const content = generateCaseContent({ feature, description, severity, incident }, contract)
  writeFileSync(filePath, content, 'utf-8')

  const slaDate = new Date(Date.now() + contract.harnessGapPolicy.slaDays * 86400000)
    .toISOString()
    .split('T')[0]

  console.log('')
  console.log(`[HarnessGap] Case generated:`)
  console.log(`  File: ${path.relative(process.cwd(), filePath)}`)
  console.log(`  Feature: ${feature}`)
  console.log(`  Severity: ${severity}`)
  console.log(`  SLA: ${slaDate}`)
  if (incident) {
    console.log(`  Incident: ${incident}`)
  }
  console.log('')
  console.log('Next steps:')
  console.log('  1. Open the file and implement the regression test')
  console.log('  2. Verify it fails without the fix, passes with it')
  console.log('  3. Remove the .todo() marker')
  console.log(`  4. Complete before ${slaDate}`)
  console.log('')
}

main()
