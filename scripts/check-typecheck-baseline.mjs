#!/usr/bin/env node

/**
 * TypeScript baseline gate.
 *
 * @description
 * Runs the repository-wide TypeScript compiler and enforces a "no new errors"
 * policy against a committed baseline file. This allows CI to fail on
 * regressions while pre-existing type debt is burned down incrementally.
 *
 * Usage:
 *   node scripts/check-typecheck-baseline.mjs          # validate against baseline
 *   node scripts/check-typecheck-baseline.mjs --update # refresh baseline from current output
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const BASELINE_PATH = path.resolve(process.cwd(), 'scripts/typecheck-baseline.json')
const UPDATE_MODE = process.argv.includes('--update')

const FILE_ERROR_REGEX = /^(.*)\((\d+),(\d+)\): error TS(\d+): (.*)$/
const GLOBAL_ERROR_REGEX = /^error TS(\d+): (.*)$/

/**
 * @description Normalizes compiler diagnostics to reduce message-shape churn.
 * @param {string} code - TypeScript diagnostic code (without TS prefix).
 * @param {string} message - Raw diagnostic message.
 * @returns {string} Normalized message signature.
 */
function normalizeDiagnosticMessage(code, message) {
  const compact = message.replace(/\s+/g, ' ').trim()

  if (
    compact.startsWith('Argument of type')
    && compact.includes(' is not assignable to parameter of type ')
  ) {
    return 'Argument of type is not assignable to parameter of type.'
  }

  if (
    compact.startsWith('Type ')
    && compact.includes(' is not assignable to type ')
  ) {
    return 'Type is not assignable to type.'
  }

  if (code === '2339') {
    const propertyMatch = compact.match(/^Property '([^']+)' does not exist on type .+$/)
    if (propertyMatch) {
      return `Property '${propertyMatch[1]}' does not exist on type.`
    }
  }

  if (code === '2367') {
    return 'This comparison appears to be unintentional because compared types have no overlap.'
  }

  return compact
    .replace(/"[^"]{30,}"/g, '"__TYPE__"')
    .replace(/'[^']{30,}'/g, "'__TYPE__'")
}

/**
 * @description Converts tsc output into stable error signatures.
 * @param {string} rawOutput - Raw stdout/stderr from TypeScript compiler.
 * @returns {string[]} Sorted, unique error signatures.
 */
function parseTypecheckErrors(rawOutput) {
  const signatures = new Set()
  const lines = rawOutput.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || !trimmed.includes('error TS')) {
      continue
    }

    const fileMatch = trimmed.match(FILE_ERROR_REGEX)
    if (fileMatch) {
      const [, rawFilePath, , , code, message] = fileMatch
      const normalizedPath = rawFilePath.replace(/\\/g, '/')
      const normalizedMessage = normalizeDiagnosticMessage(code, message)
      signatures.add(`${normalizedPath}|TS${code}|${normalizedMessage}`)
      continue
    }

    const globalMatch = trimmed.match(GLOBAL_ERROR_REGEX)
    if (globalMatch) {
      const [, code, message] = globalMatch
      const normalizedMessage = normalizeDiagnosticMessage(code, message)
      signatures.add(`__global__|TS${code}|${normalizedMessage}`)
    }
  }

  return [...signatures].sort((a, b) => a.localeCompare(b))
}

/**
 * @description Executes TypeScript compiler and captures its output.
 * @returns {{ output: string, exitCode: number }}
 */
function runTypecheck() {
  const result = spawnSync('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
  })

  if (result.error) {
    console.error('[TypecheckBaseline] Failed to execute TypeScript compiler:', result.error.message)
    process.exit(2)
  }

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  return {
    output,
    exitCode: typeof result.status === 'number' ? result.status : 1,
  }
}

const { output, exitCode } = runTypecheck()
const currentErrors = parseTypecheckErrors(output)

if (UPDATE_MODE) {
  const baselinePayload = {
    errors: currentErrors,
  }

  writeFileSync(BASELINE_PATH, `${JSON.stringify(baselinePayload, null, 2)}\n`, 'utf-8')
  console.log(
    `[TypecheckBaseline] Updated ${path.relative(process.cwd(), BASELINE_PATH)} with ${currentErrors.length} error signatures.`,
  )
  process.exit(exitCode === 0 || exitCode === 1 ? 0 : exitCode)
}

let baselineErrors

try {
  const baselineRaw = readFileSync(BASELINE_PATH, 'utf-8')
  const parsed = JSON.parse(baselineRaw)
  baselineErrors = Array.isArray(parsed.errors) ? parsed.errors : []
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown baseline read error'
  console.error(`[TypecheckBaseline] Could not read baseline file at ${BASELINE_PATH}: ${message}`)
  console.error('[TypecheckBaseline] Run `npm run typecheck:baseline:update` to create the baseline.')
  process.exit(2)
}

const baselineSet = new Set(baselineErrors)
const currentSet = new Set(currentErrors)

const newErrors = currentErrors.filter((entry) => !baselineSet.has(entry))
const resolvedErrors = baselineErrors.filter((entry) => !currentSet.has(entry))

if (newErrors.length > 0) {
  console.error('[TypecheckBaseline] New TypeScript errors detected (baseline regression).')
  console.error(`[TypecheckBaseline] New errors: ${newErrors.length}`)
  console.error('')
  for (const entry of newErrors.slice(0, 25)) {
    console.error(`  + ${entry}`)
  }
  if (newErrors.length > 25) {
    console.error(`  ... and ${newErrors.length - 25} more`)
  }
  process.exit(1)
}

if (resolvedErrors.length > 0) {
  console.log(`[TypecheckBaseline] TypeScript debt reduced by ${resolvedErrors.length} signatures.`)
  console.log('[TypecheckBaseline] Run `npm run typecheck:baseline:update` to refresh the baseline.')
}

console.log(
  `[TypecheckBaseline] Passed with ${currentErrors.length} signatures (no new errors vs baseline).`,
)

process.exit(0)
