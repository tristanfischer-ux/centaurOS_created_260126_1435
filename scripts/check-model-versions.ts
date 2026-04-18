/**
 * @file check-model-versions.ts — Weekly LLM model-version monitor.
 *
 * @description Queries Anthropic / Google / OpenAI `/models` endpoints, diffs
 * the returned model IDs against our central manifest in src/lib/ai/models.ts,
 * and writes a GitHub-flavoured Markdown report to stdout. The wrapping
 * workflow turns that report into a GitHub issue when drift is detected.
 *
 * @usage
 *   tsx scripts/check-model-versions.ts
 *
 *   Outputs:
 *     - Exit 0 and prints "No drift detected." when every manifest alias
 *       is already pointing at the newest model in its family.
 *     - Exit 0 and prints a Markdown summary when newer models exist. The
 *       workflow picks this up and opens an issue.
 *     - Exit 1 on API failures so the workflow surfaces the error.
 *
 * @security Needs ANTHROPIC_API_KEY and optionally GOOGLE_API_KEY / OPENAI_API_KEY
 * in the workflow environment. Read-only operations only.
 */

import { MODEL_METADATA } from "../src/lib/ai/models"

type Drift = {
  alias: string
  provider: string
  family: string
  currentId: string
  currentVersion: readonly [number, number]
  newestId: string
  newestVersion: readonly [number, number]
}

async function fetchAnthropicModels(): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing")

  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  })
  if (!res.ok) throw new Error(`Anthropic /models → ${res.status}`)
  const json = (await res.json()) as { data?: Array<{ id?: string }> }
  return (json.data ?? []).map((m) => m.id ?? "").filter(Boolean)
}

async function fetchOpenAIModels(): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return [] // soft-fail — OpenAI check is optional
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) return []
  const json = (await res.json()) as { data?: Array<{ id?: string }> }
  return (json.data ?? []).map((m) => m.id ?? "").filter(Boolean)
}

async function fetchGoogleModels(): Promise<string[]> {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) return []
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
  )
  if (!res.ok) return []
  const json = (await res.json()) as { models?: Array<{ name?: string }> }
  // Google returns "models/<id>" — strip the prefix.
  return (json.models ?? []).map((m) => (m.name ?? "").replace(/^models\//, "")).filter(Boolean)
}

/** Parse trailing version tuple from a model ID in a known family.
 *  Handles: claude-opus-4-7, claude-haiku-4-5-20251001, gemini-3.1-pro-preview,
 *  gpt-5.4, deepseek-v4. Returns null when the ID doesn't match the family. */
function extractVersion(family: string, id: string): [number, number] | null {
  if (!id.startsWith(family)) return null

  // Anthropic: family-<major>-<minor>[-...]   e.g. claude-opus-4-7 / claude-haiku-4-5-20251001
  const anthropicMatch = id.match(new RegExp(`^${family}-(\\d+)-(\\d+)`))
  if (anthropicMatch) return [Number(anthropicMatch[1]), Number(anthropicMatch[2])]

  // Google/OpenAI: family-<major>.<minor>[-...]   e.g. gemini-3.1-pro-preview / gpt-5.4
  const dotMatch = id.match(new RegExp(`^${family}-?(\\d+)\\.(\\d+)`))
  if (dotMatch) return [Number(dotMatch[1]), Number(dotMatch[2])]

  // DeepSeek: family<major>   e.g. deepseek-v4
  const bareMatch = id.match(new RegExp(`^${family}(\\d+)$`))
  if (bareMatch) return [Number(bareMatch[1]), 0]

  return null
}

function compareVersions(
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  if (a[0] !== b[0]) return a[0] - b[0]
  return a[1] - b[1]
}

function detectDrift(providerModels: Record<string, string[]>): Drift[] {
  const drifts: Drift[] = []
  for (const [alias, meta] of Object.entries(MODEL_METADATA)) {
    const candidates = providerModels[meta.provider] ?? []
    let newestId = alias
    let newestVersion = meta.version

    for (const candidate of candidates) {
      const v = extractVersion(meta.family, candidate)
      if (!v) continue
      if (compareVersions(v, newestVersion) > 0) {
        newestId = candidate
        newestVersion = v
      }
    }

    if (newestId !== alias) {
      drifts.push({
        alias,
        provider: meta.provider,
        family: meta.family,
        currentId: alias,
        currentVersion: meta.version,
        newestId,
        newestVersion,
      })
    }
  }
  return drifts
}

function renderReport(drifts: Drift[]): string {
  if (drifts.length === 0) {
    return `# LLM version check — no drift\n\nEvery alias in \`src/lib/ai/models.ts\` points at the newest model in its family.\n`
  }

  const lines: string[] = []
  lines.push(`# LLM version check — ${drifts.length} newer model${drifts.length === 1 ? "" : "s"} available`)
  lines.push("")
  lines.push("The following aliases in `src/lib/ai/models.ts` are now behind their provider's latest release.")
  lines.push("")
  lines.push("| Provider | Family | Current | Newest |")
  lines.push("|---|---|---|---|")
  for (const d of drifts) {
    lines.push(
      `| ${d.provider} | ${d.family} | \`${d.currentId}\` (${d.currentVersion.join(".")}) | \`${d.newestId}\` (${d.newestVersion.join(".")}) |`,
    )
  }
  lines.push("")
  lines.push("## How to roll forward")
  lines.push("")
  lines.push("1. Bump the alias in `src/lib/ai/models.ts` (e.g. `opus: \"claude-opus-4-8\"`).")
  lines.push("2. Update the matching entry in `MODEL_METADATA` with the new `version` tuple.")
  lines.push("3. Run a targeted grep for any hardcoded old-version strings that bypass the manifest:")
  lines.push("")
  lines.push("   ```sh")
  for (const d of drifts) {
    lines.push(`   rg -l '${d.currentId}' src/`)
  }
  lines.push("   ```")
  lines.push("")
  lines.push("4. For **specialist-tier** model promotions (EXECUTION_MODEL_MAP in sweep-orchestrator.ts), run the benchmark suite BEFORE committing — see CLAUDE.md \"Specialist Configuration Protocol\". Composite must not drop below the April 5 2026 baseline minus 0.2 on any specialist; voice floor 4.0.")
  lines.push("5. For infrastructure tiers (CAD Lab defaults, direct API calls, fallbacks), skip benchmarks — they're deterministic.")
  lines.push("6. Commit + push.")
  lines.push("")
  lines.push("## Scope reminder")
  lines.push("")
  lines.push("This automation NEVER auto-upgrades. The manifest is the source of truth; the monitor just surfaces drift.")
  lines.push("")
  lines.push("_Generated by `.github/workflows/check-model-versions.yml` via `scripts/check-model-versions.ts`._")
  return lines.join("\n")
}

async function main(): Promise<void> {
  const [anthropic, openai, google] = await Promise.all([
    fetchAnthropicModels().catch((e) => {
      console.error(`Anthropic models fetch failed: ${e.message}`)
      throw e
    }),
    fetchOpenAIModels(),
    fetchGoogleModels(),
  ])

  const drifts = detectDrift({
    anthropic,
    openai,
    google,
    // DeepSeek has no public models endpoint we can hit without authenticating
    // against their compatibility API; leave it as a manual update.
    deepseek: [],
  })

  const report = renderReport(drifts)
  process.stdout.write(report)
  // Write boolean signal to stderr for workflow to read via grep on stdout.
  if (drifts.length > 0) {
    process.stderr.write(`\nDRIFT_DETECTED=true\n`)
  } else {
    process.stderr.write(`\nDRIFT_DETECTED=false\n`)
  }
}

main().catch((e) => {
  console.error(`check-model-versions failed: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
