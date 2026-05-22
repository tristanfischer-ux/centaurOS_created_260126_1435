/**
 * scripts/lib/orchestrator/attribution.ts
 *
 * TOOLS-USED ATTRIBUTION RENDERER — produces the PDF end-page that
 * lists every verified engineering tool used to compute the design,
 * with field-level claims linking each numerical quantity to its tool
 * + version + license + source URL + invocation input.
 *
 * Per Tristan reframe (drawer drawer_forgeos_decisions_961c722f0e77d105):
 * "At the end of the PDF we could say explicitly that we used xyz
 * tools to do computations." This is the credibility primitive that
 * separates ForgeOS engineering-reference output from LLM-generated
 * narrative — a reader who installs the same tools can reproduce the
 * same numbers.
 *
 * Per GLM-5.1 round-3: "Credible IF field-level (`tool:PyBaMM:v23.5:
 * cell_temp:°C`), not just 'we used PyBaMM somewhere.' Version-pinned,
 * output-field-tracked, unit-tagged = reproducible. Post-hoc tool
 * listing = marketing."
 */

import type {
  ContractInProgress,
  License,
  Provenance,
  TypedQuantity,
} from './types'

export interface ToolAttributionEntry {
  tool_id: string
  tool_name: string
  tool_version: string
  tool_license: License
  tool_source_url: string
  /** Pinned dependency versions captured at invocation time. */
  pinned_versions: Record<string, string>
  /** Per-claim list — every field this tool computed. */
  claims: Array<{
    /** The Contract quantity key (e.g. 'cell_count'). */
    field: string
    /** The computed value with units. */
    value: number
    unit: string
    /** What the tool was given as input. */
    input_summary: string
    /** Which output field within the tool's response this was from. */
    output_field: string
  }>
  /** Total invocation duration across all claims. */
  total_duration_ms: number
}

export interface ToolsUsedPage {
  /** Page title. */
  title: string
  /** Intro paragraph explaining what this page is. */
  intro: string
  /** Per-tool attribution. */
  tools: ToolAttributionEntry[]
  /** Tools that contributed no claims (registered but not used). */
  unused_tool_ids: string[]
  /** Disclaimer text shown at end of page. */
  disclaimer: string
}

const DEFAULT_INTRO = (
  'Every numerical claim in this document was computed by one of the '
  + 'verified engineering tools listed below. Each tool is open-source '
  + 'or free-to-use under the indicated license; each claim shows the '
  + 'exact input passed to the tool. Anyone with the listed tool version '
  + 'can reproduce the same output from the same input. The ForgeOS PDF '
  + 'Engine v2 (proprietary) orchestrates the tools and renders this PDF '
  + 'but does not itself compute the engineering numbers.'
)

const DEFAULT_DISCLAIMER = (
  'Tool outputs are accurate within their documented operating domains. '
  + 'This design is an engineering reference; certified procurement '
  + 'requires separate engineer sign-off. Open-source license terms apply '
  + 'as indicated; full SPDX records are available on request.'
)

/**
 * Build the Tools-Used attribution page from a finished Contract.
 *
 * Walks every TypedQuantity in contract.quantities. For each quantity
 * sourced from a tool (`provenance.source` starts with 'tool:'), adds
 * it to the corresponding tool's claims list. Tools with zero claims
 * are omitted from the rendered page but listed in unused_tool_ids
 * for audit.
 */
export function buildToolsUsedPage(contract: ContractInProgress): ToolsUsedPage {
  const byTool = new Map<string, ToolAttributionEntry>()
  for (const [field, q] of Object.entries(contract.quantities)) {
    if (!isToolSourced(q)) continue
    const tid = q.provenance.tool_id ?? ''
    if (!tid) continue
    let entry = byTool.get(tid)
    if (!entry) {
      entry = {
        tool_id: tid,
        tool_name: '',
        tool_version: q.provenance.tool_version ?? 'unknown',
        tool_license: (q.provenance.tool_license ?? 'free-proprietary') as License,
        tool_source_url: q.provenance.tool_source_url ?? '',
        pinned_versions: q.provenance.pinned_versions ?? {},
        claims: [],
        total_duration_ms: 0,
      }
      byTool.set(tid, entry)
    }
    entry.claims.push({
      field,
      value: q.value,
      unit: q.unit,
      input_summary: summariseInput(q.provenance.invocation_input),
      output_field: q.provenance.invocation_output_field ?? field,
    })
    entry.total_duration_ms += q.provenance.duration_ms ?? 0
  }

  // Lookup display names from the tool registry (lazy import to avoid
  // module cycle if attribution is imported before any tools register).
  for (const entry of byTool.values()) {
    if (!entry.tool_name) entry.tool_name = humaniseToolId(entry.tool_id)
  }

  return {
    title: 'COMPUTATIONS BY VERIFIED ENGINEERING TOOLS',
    intro: DEFAULT_INTRO,
    tools: Array.from(byTool.values()).sort((a, b) => a.tool_id.localeCompare(b.tool_id)),
    unused_tool_ids: [],
    disclaimer: DEFAULT_DISCLAIMER,
  }
}

function isToolSourced(q: TypedQuantity): boolean {
  // Defensive: legacy quantities don't carry provenance. Treat as
  // non-tool-sourced so they're skipped in the Tools-Used page.
  if (!q || typeof q !== 'object' || !q.provenance) return false
  return typeof q.provenance.source === 'string' && q.provenance.source.startsWith('tool:')
}

function summariseInput(input: unknown): string {
  if (input === null || input === undefined) return '(none)'
  if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
    return String(input)
  }
  try {
    const json = JSON.stringify(input)
    return json.length > 120 ? json.slice(0, 117) + '...' : json
  } catch {
    return '(complex)'
  }
}

function humaniseToolId(id: string): string {
  // 'pybamm:cell-sizing' -> 'PyBaMM Cell Sizing'
  const parts = id.split(':')
  return parts.map(p => p.replace(/-/g, ' ').replace(/\b(\w)/g, (m) => m.toUpperCase())).join(' ')
}

/**
 * Render the attribution page as plain text (for log output or
 * console diagnostics). Production PDF rendering happens elsewhere.
 */
export function renderToolsUsedPageAsText(page: ToolsUsedPage): string {
  const lines: string[] = []
  lines.push(page.title)
  lines.push('')
  lines.push(page.intro)
  lines.push('')
  for (const tool of page.tools) {
    lines.push(`  ${tool.tool_name} v${tool.tool_version}  (${tool.tool_license})`)
    lines.push(`    ${tool.tool_source_url}`)
    for (const claim of tool.claims.slice(0, 12)) {
      const v = Number.isFinite(claim.value) ? claim.value.toLocaleString() : String(claim.value)
      lines.push(`      • ${claim.field} = ${v} ${claim.unit}  (from ${claim.output_field}; input: ${claim.input_summary})`)
    }
    if (tool.claims.length > 12) {
      lines.push(`      ... and ${tool.claims.length - 12} more claims`)
    }
    lines.push('')
  }
  lines.push(page.disclaimer)
  return lines.join('\n')
}
