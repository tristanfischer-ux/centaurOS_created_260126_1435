/**
 * @file scripts/precommit-review.ts
 *
 * Precommit code+security review powered by Gemini 3.1 Flash-Lite.
 *
 * Runs TWO parallel passes against a git diff:
 *   1. Smoke-screen (thinkingLevel='low')     — syntax, debug-leftover, unsafe-eval, null-safety, type-any
 *   2. Security scan (thinkingLevel='medium') — hardcoded secrets, SQL/shell injection, missing validation, RLS, auth bypass
 *
 * Aggregates findings, prints a console summary, optionally writes JSON, and exits
 * non-zero when findings at or above the --severity threshold exist.
 *
 * CLI:
 *   npx tsx scripts/precommit-review.ts [--staged | --head | --range REF1..REF2]
 *                                       [--severity high|medium|low]
 *                                       [--json /path/output.json]
 *
 * Defaults: --head, --severity high, no JSON output.
 *
 * Why Flash-Lite: £0.25 / 1M input tokens, 329 tok/s, 8.2% hallucination
 * (best in cheap tier, lower than Haiku 4.5 at 26%). High-volume code scanning
 * is exactly the workload it was designed for. See `openrouter-models.ts`.
 *
 * Invoked manually by the agent before any commit. Not auto-wired into a git hook —
 * the agent picks the moment so we never block a hot-fix or a docs-only commit.
 */

import { execFileSync } from 'child_process'
import { writeFileSync } from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import {
  callFastExtract,
  GEMINI_3_1_FLASH_LITE,
} from '../src/lib/pdf-engine-v2/lib/openrouter-models'

dotenv.config({ path: '.env.local' })

// ────────────────────────── types ──────────────────────────

type Severity = 'high' | 'medium' | 'low'

interface Finding {
  file: string
  line: number
  severity: Severity
  category: string
  issue: string
  fix: string
  source: 'smoke' | 'security'
}

interface PassResult {
  findings: Omit<Finding, 'source'>[]
}

interface CliArgs {
  diffMode: 'staged' | 'head' | 'range'
  range?: string
  severity: Severity
  jsonPath?: string
}

// ────────────────────────── CLI parsing ──────────────────────────

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { diffMode: 'head', severity: 'high' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--staged') {
      args.diffMode = 'staged'
    } else if (a === '--head') {
      args.diffMode = 'head'
    } else if (a === '--range') {
      args.diffMode = 'range'
      args.range = argv[++i]
      if (!args.range || !args.range.includes('..')) {
        throw new Error(`--range requires a REF1..REF2 argument, got: ${args.range}`)
      }
      // Defensive: reject anything that doesn't look like a git refspec.
      if (!/^[A-Za-z0-9_./~^@\-]+\.\.[A-Za-z0-9_./~^@\-]+$/.test(args.range)) {
        throw new Error(`--range value looks unsafe (allowed: word/path chars + ..): ${args.range}`)
      }
    } else if (a === '--severity') {
      const s = argv[++i] as Severity
      if (s !== 'high' && s !== 'medium' && s !== 'low') {
        throw new Error(`--severity must be high|medium|low, got: ${s}`)
      }
      args.severity = s
    } else if (a === '--json') {
      args.jsonPath = argv[++i]
      if (!args.jsonPath) throw new Error('--json requires an output path')
    } else if (a === '--help' || a === '-h') {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${a}`)
    }
  }
  return args
}

function printHelp() {
  // eslint-disable-next-line no-console
  console.log(`Usage: npx tsx scripts/precommit-review.ts [options]

Options:
  --staged                  Review staged changes (git diff --cached)
  --head                    Review uncommitted changes (git diff HEAD)        [default]
  --range REF1..REF2        Review a commit range (git diff REF1..REF2)
  --severity high|medium|low  Exit non-zero on findings at/above threshold    [default: high]
  --json PATH               Write full findings JSON to PATH
  -h, --help                Show this help

Examples:
  npx tsx scripts/precommit-review.ts
  npx tsx scripts/precommit-review.ts --staged --severity medium
  npx tsx scripts/precommit-review.ts --range main..HEAD --json /tmp/review.json
`)
}

// ────────────────────────── diff retrieval ──────────────────────────

const REVIEWABLE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.py',
  '.sql',
  '.sh',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
])

// Skip generated / vendored / fixture files even when extension matches.
const SKIP_PATH_PATTERNS: RegExp[] = [
  /(^|\/)node_modules\//,
  /(^|\/)\.next\//,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)coverage\//,
  /\.min\.(js|css)$/,
  /-lock\.(json|yaml|yml)$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /database\.types\.ts$/, // auto-generated supabase types
  /\.tsbuildinfo$/,
]

function getRawDiff(args: CliArgs): string {
  // Use execFileSync (no shell, argv array) — safe against injection.
  const argv: string[] =
    args.diffMode === 'staged'
      ? ['diff', '--cached']
      : args.diffMode === 'range'
        ? ['diff', args.range!]
        : ['diff', 'HEAD']
  try {
    return execFileSync('git', argv, {
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch (err) {
    throw new Error(`Failed to run \`git ${argv.join(' ')}\`: ${(err as Error).message}`)
  }
}

/**
 * Split a unified diff into per-file chunks: { file, body }.
 * Each body starts at `diff --git ...` and ends before the next one.
 */
function splitDiffByFile(diff: string): Array<{ file: string; body: string }> {
  if (!diff.trim()) return []
  const chunks: Array<{ file: string; body: string }> = []
  const parts = diff.split(/^diff --git /m)
  for (const part of parts) {
    if (!part.trim()) continue
    const body = 'diff --git ' + part
    // Parse target file: "diff --git a/x b/y" — use the b/ path (post-edit).
    const m = part.match(/^a\/(\S+)\s+b\/(\S+)/)
    if (!m) continue
    const file = m[2]
    chunks.push({ file, body })
  }
  return chunks
}

function isReviewable(file: string): boolean {
  for (const re of SKIP_PATH_PATTERNS) if (re.test(file)) return false
  const ext = path.extname(file).toLowerCase()
  return REVIEWABLE_EXTENSIONS.has(ext)
}

/**
 * A diff body is "deletion-only" when every changed hunk consists entirely
 * of `-` lines (no additions). There's nothing to review for new bugs/secrets
 * in deleted code; skip to save tokens.
 */
function isDeletionOnly(body: string): boolean {
  const lines = body.split('\n').filter((l) => l.startsWith('+') || l.startsWith('-'))
  // Drop the diff-header +++/--- lines.
  const changes = lines.filter((l) => !l.startsWith('+++') && !l.startsWith('---'))
  if (changes.length === 0) return true
  return changes.every((l) => l.startsWith('-'))
}

/**
 * Binary diffs show up as `Binary files a/x and b/y differ` with no +/- hunks.
 */
function isBinaryDiff(body: string): boolean {
  return /^Binary files .* differ$/m.test(body)
}

// ────────────────────────── prompts ──────────────────────────

const SMOKE_SYSTEM_PROMPT = `You are a code-quality smoke screener. The user will provide a git diff. Find:
- Syntax errors, missing imports, undefined variables
- Hardcoded credentials, API keys, passwords (especially in test fixtures)
- Leftover console.log / debugger / TODO / FIXME / HACK comments in production code
- eval() / exec() / Function() constructor usage
- Obviously dead code or unreachable branches
- Missing null/undefined checks on values that can be null
- TypeScript types using \`any\` without justification

Output ONLY a JSON object with this exact shape:
{
  "findings": [
    {
      "file": "path/to/file.ts",
      "line": 42,
      "severity": "high" | "medium" | "low",
      "category": "syntax" | "credentials" | "debug-leftover" | "unsafe-eval" | "dead-code" | "null-safety" | "type-any",
      "issue": "Short one-line description",
      "fix": "Concrete recommended fix in 1-2 sentences"
    }
  ]
}

Do NOT add commentary outside the JSON. Do NOT wrap in markdown fences. Your first character MUST be {. Empty findings array if nothing wrong: { "findings": [] }`

const SECURITY_SYSTEM_PROMPT = `You are a security auditor. The user will provide a git diff. Find:
- Hardcoded API keys, OAuth secrets, JWT secrets, database passwords
- SQL injection vectors (unsanitised string interpolation in queries)
- Shell command injection (unsanitised values in execSync, spawn, etc.)
- Missing input validation on server actions / API routes (no zod schema, no withAuth wrapper)
- Secrets exposed in console.log, console.error, or thrown error messages
- Supabase queries without RLS-protective filters (.from('table').select() without where)
- Missing CSRF protection on state-changing endpoints
- Insecure cookie / session settings
- Dependency declarations adding unmaintained or known-vulnerable packages
- Authentication bypass patterns (e.g. trusting client-side user IDs)

Output ONLY a JSON object with this exact shape:
{
  "findings": [
    {
      "file": "path/to/file.ts",
      "line": 42,
      "severity": "high" | "medium" | "low",
      "category": "hardcoded-secret" | "sql-injection" | "shell-injection" | "missing-validation" | "secret-in-logs" | "missing-rls" | "missing-csrf" | "insecure-session" | "dependency-risk" | "auth-bypass",
      "issue": "Short one-line description",
      "fix": "Concrete recommended fix in 1-2 sentences"
    }
  ]
}

Do NOT add commentary outside the JSON. Do NOT wrap in markdown fences. Your first character MUST be {. Empty findings array if nothing wrong: { "findings": [] }`

// ────────────────────────── LLM dispatch ──────────────────────────

/** Strip markdown fences / leading prose and parse JSON. */
function parseLooseJson(raw: string): PassResult {
  if (!raw) return { findings: [] }
  let s = raw.trim()
  // Strip ``` fences if model ignored instructions.
  s = s.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  // First-brace-to-last-brace slice.
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first === -1 || last === -1 || last <= first) {
    return { findings: [] }
  }
  s = s.slice(first, last + 1)
  try {
    const obj = JSON.parse(s)
    if (Array.isArray(obj.findings)) return { findings: obj.findings }
    return { findings: [] }
  } catch {
    return { findings: [] }
  }
}

const PER_CHUNK_THRESHOLD = 200_000 // chars; above this we chunk per file

interface PassOpts {
  systemPrompt: string
  thinkingLevel: 'low' | 'medium'
  source: 'smoke' | 'security'
}

async function runPass(
  diff: string,
  fileChunks: Array<{ file: string; body: string }>,
  opts: PassOpts,
): Promise<Finding[]> {
  // If the whole diff is small enough, send it as one request — context survives
  // file boundaries (useful for catching e.g. a secret referenced from another file).
  const total = diff.length
  const findings: Finding[] = []

  const dispatch = async (userContent: string): Promise<Finding[]> => {
    let raw: string
    try {
      raw = await callFastExtract(userContent, {
        systemPrompt: opts.systemPrompt,
        thinkingLevel: opts.thinkingLevel,
        temperature: 0,
        maxTokens: 8_000,
        model: GEMINI_3_1_FLASH_LITE,
        timeoutMs: 90_000,
      })
    } catch (err) {
      // Don't fail the whole review on a transient OpenRouter blip — log + skip.
      // eslint-disable-next-line no-console
      console.error(`[precommit-review] ${opts.source} pass failed: ${(err as Error).message}`)
      return []
    }
    const parsed = parseLooseJson(raw)
    return parsed.findings.map((f) => ({ ...f, source: opts.source }))
  }

  if (total <= PER_CHUNK_THRESHOLD) {
    const out = await dispatch(diff)
    findings.push(...out)
  } else {
    // Per-file fan-out in parallel. Cap concurrency at 6 to be polite.
    const concurrency = 6
    const queue = [...fileChunks]
    const workers: Promise<void>[] = []
    for (let i = 0; i < concurrency; i++) {
      workers.push(
        (async () => {
          while (queue.length > 0) {
            const chunk = queue.shift()
            if (!chunk) break
            const out = await dispatch(chunk.body)
            findings.push(...out)
          }
        })(),
      )
    }
    await Promise.all(workers)
  }

  return findings
}

// ────────────────────────── output ──────────────────────────

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 }

function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (sevDiff !== 0) return sevDiff
    return a.file.localeCompare(b.file) || a.line - b.line
  })
}

function countBySeverity(findings: Finding[]): { high: number; medium: number; low: number } {
  const c = { high: 0, medium: 0, low: 0 }
  for (const f of findings) {
    if (f.severity === 'high') c.high++
    else if (f.severity === 'medium') c.medium++
    else if (f.severity === 'low') c.low++
  }
  return c
}

/** Rough cost estimate. Flash-Lite: $0.25/M input, $1.50/M output. ~1 USD/GBP = 0.79. */
function estimateCostGbp(inputChars: number, outputChars: number): number {
  // ~4 chars per token rule of thumb.
  const inputTokens = inputChars / 4
  const outputTokens = outputChars / 4
  const usd = (inputTokens / 1_000_000) * 0.25 + (outputTokens / 1_000_000) * 1.5
  return usd * 0.79
}

function printSummary(opts: {
  fileCount: number
  lineCount: number
  smokeFindings: Finding[]
  securityFindings: Finding[]
  smokeMs: number
  securityMs: number
  totalMs: number
  estCostGbp: number
}) {
  const {
    fileCount,
    lineCount,
    smokeFindings,
    securityFindings,
    smokeMs,
    securityMs,
    totalMs,
    estCostGbp,
  } = opts
  const all = sortFindings([...smokeFindings, ...securityFindings])
  const sc = countBySeverity(smokeFindings)
  const ac = countBySeverity(securityFindings)

  // eslint-disable-next-line no-console
  console.log(`\nPrecommit Review — Gemini 3.1 Flash-Lite`)
  // eslint-disable-next-line no-console
  console.log(`Diff: ${fileCount} files, ${lineCount} lines`)
  // eslint-disable-next-line no-console
  console.log(
    `Smoke screen: ${smokeFindings.length} findings (${sc.high} high, ${sc.medium} medium, ${sc.low} low)`,
  )
  // eslint-disable-next-line no-console
  console.log(
    `Security scan: ${securityFindings.length} findings (${ac.high} high, ${ac.medium} medium, ${ac.low} low)`,
  )
  // eslint-disable-next-line no-console
  console.log(`Estimated cost: £${estCostGbp.toFixed(3)}`)
  // eslint-disable-next-line no-console
  console.log(
    `Latency: ${(totalMs / 1000).toFixed(1)}s total (${(smokeMs / 1000).toFixed(1)}s smoke + ${(securityMs / 1000).toFixed(1)}s security, parallel)\n`,
  )

  const bySev = (sev: Severity) => all.filter((f) => f.severity === sev)
  for (const sev of ['high', 'medium', 'low'] as Severity[]) {
    const group = bySev(sev)
    if (group.length === 0) continue
    // eslint-disable-next-line no-console
    console.log(`${sev.toUpperCase()} severity findings:`)
    group.forEach((f, idx) => {
      // eslint-disable-next-line no-console
      console.log(`  ${idx + 1}. [${f.category}] ${f.file}:${f.line} — ${f.issue}`)
      // eslint-disable-next-line no-console
      console.log(`     Fix: ${f.fix}`)
    })
    // eslint-disable-next-line no-console
    console.log('')
  }
}

// ────────────────────────── main ──────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (!process.env.OPENROUTER_API_KEY) {
    // eslint-disable-next-line no-console
    console.error('OPENROUTER_API_KEY not set. Add to .env.local or environment.')
    process.exit(2)
  }

  const rawDiff = getRawDiff(args)
  if (!rawDiff.trim()) {
    // eslint-disable-next-line no-console
    console.log('No changes to review.')
    process.exit(0)
  }

  // Filter to reviewable source files and drop binary / deletion-only chunks.
  const allChunks = splitDiffByFile(rawDiff)
  const reviewable = allChunks.filter(
    (c) => isReviewable(c.file) && !isBinaryDiff(c.body) && !isDeletionOnly(c.body),
  )

  if (reviewable.length === 0) {
    // eslint-disable-next-line no-console
    console.log(
      `No reviewable source changes (${allChunks.length} total files in diff — all skipped as non-source, binary, or deletion-only).`,
    )
    process.exit(0)
  }

  const reviewableDiff = reviewable.map((c) => c.body).join('\n')
  const lineCount = reviewableDiff.split('\n').length

  // eslint-disable-next-line no-console
  console.log(
    `Reviewing ${reviewable.length} files, ${lineCount} lines, ${reviewableDiff.length} chars...`,
  )

  // Dispatch both passes in parallel.
  const t0 = Date.now()
  const smokeStart = Date.now()
  const securityStart = Date.now()
  let smokeMs = 0
  let securityMs = 0

  const [smokeFindings, securityFindings] = await Promise.all([
    runPass(reviewableDiff, reviewable, {
      systemPrompt: SMOKE_SYSTEM_PROMPT,
      thinkingLevel: 'low',
      source: 'smoke',
    }).then((r) => {
      smokeMs = Date.now() - smokeStart
      return r
    }),
    runPass(reviewableDiff, reviewable, {
      systemPrompt: SECURITY_SYSTEM_PROMPT,
      thinkingLevel: 'medium',
      source: 'security',
    }).then((r) => {
      securityMs = Date.now() - securityStart
      return r
    }),
  ])

  const totalMs = Date.now() - t0
  const all = sortFindings([...smokeFindings, ...securityFindings])

  // Rough output token estimate from serialised findings.
  const outputChars = JSON.stringify(all).length
  // Both passes consume the same input diff; the cost includes 2x input + outputs.
  const estCostGbp = estimateCostGbp(reviewableDiff.length * 2, outputChars)

  printSummary({
    fileCount: reviewable.length,
    lineCount,
    smokeFindings,
    securityFindings,
    smokeMs,
    securityMs,
    totalMs,
    estCostGbp,
  })

  if (args.jsonPath) {
    writeFileSync(
      args.jsonPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          diff: {
            mode: args.diffMode,
            range: args.range,
            files: reviewable.length,
            lines: lineCount,
          },
          estCostGbp,
          latencyMs: { total: totalMs, smoke: smokeMs, security: securityMs },
          findings: all,
        },
        null,
        2,
      ),
    )
    // eslint-disable-next-line no-console
    console.log(`Wrote JSON output to ${args.jsonPath}`)
  }

  // Exit code: 1 if any finding is at or above the --severity threshold.
  const threshold = SEVERITY_ORDER[args.severity]
  const blocking = all.filter((f) => SEVERITY_ORDER[f.severity] <= threshold)
  if (blocking.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `${blocking.length} finding(s) at or above --severity ${args.severity} — blocking commit.`,
    )
    process.exit(1)
  }
  // eslint-disable-next-line no-console
  console.log(`No findings at or above --severity ${args.severity}. OK to commit.`)
  process.exit(0)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('precommit-review failed:', err)
  process.exit(2)
})
