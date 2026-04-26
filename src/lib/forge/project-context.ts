/**
 * @file project-context.ts — Project profile canonicalisation + hashing.
 *
 * @description The supplier-match generator caches its output per
 * (project, supplier, project-context) triple. The third leg is a deterministic
 * hash of the project's bill of materials and constraints used in the prompt.
 * When any of those fields change, the hash changes and the cache misses,
 * forcing a regeneration. When nothing meaningful changes, the cache hits and
 * saves the LLM round-trip — this is what keeps the £20/month Starter and
 * £10/100 add-on margins workable.
 *
 * Pure functions only. No DB calls, no side effects, no `"use server"`.
 *
 * @audit RED-TEAM-PIVOT-PLAN spec 6f, Phase G mirror for /the-forge-v2
 * suppliers, 2026-04-25.
 *
 * @related src/lib/investors/foundry-context.ts — twin canonicalisation
 * for the investor side. Same hash discipline, different field set.
 */

import { createHash } from 'crypto'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * One row of the project's bill of materials, as it contributes to the
 * context hash. We deliberately avoid the full per-part record (which carries
 * unstable AI estimates and per-render churn) — only the structural facts
 * that drive supplier-fit reasoning.
 */
export interface ProjectContextBomRow {
  /** Display name of the part or sub-assembly. */
  name?: string | null
  /** Primary material / process if known (e.g. "stainless steel sheet"). */
  material?: string | null
  /** Quantity per unit (integer). */
  quantity?: number | null
}

/**
 * Canonical, prompt-ready snapshot of a CAD-lab project's brief and
 * constraints. Every field is optional — partial projects still hash cleanly
 * to a different key than fuller projects, which is the desired behaviour
 * (more context => different LLM output => cache miss is correct).
 */
export interface ProjectContextInput {
  /** The project's product subject — usually a paragraph. */
  subject?: string | null
  /** Target industry / sector for the product. */
  targetIndustry?: string | null
  /** One-paragraph mission or product thesis. */
  mission?: string | null
  /** Description of the target customer or buyer. */
  targetCustomers?: string | null
  /** Why-now framing, market trigger, or timing rationale. */
  whyNow?: string | null
  /** Regulatory environment hint (e.g. "United Kingdom Conformity Assessed mark required"). */
  regulatoryHint?: string | null
  /**
   * Summary view of the project's bill of materials. Capped at 30 rows
   * inside the canonicaliser so an oversized BOM doesn't bloat the prompt.
   */
  bomRows?: ProjectContextBomRow[] | null
  /** Number of design modules currently in the project. */
  moduleCount?: number | null
  /** Per-unit cost ceiling in pence (£1.55 -> 155). Null if not set. */
  costCeilingPence?: number | null
}

export interface ProjectContext {
  /** Canonical newline-delimited "key: value" string used in the LLM prompt. */
  contextString: string
  /** sha256 hex digest of `contextString`. Used as the cache key. */
  contextHash: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalise whitespace + trim. Returns null for empty strings so they don't
 * contribute to the hash.
 */
function normaliseString(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = String(value).replace(/\s+/g, ' ').trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Cap a free-text field so the hash + prompt stay bounded. */
function trimToMax(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  return value.slice(0, maxChars).replace(/\s+\S*$/, '') + '…'
}

/** Cap on bill-of-materials rows that contribute to the hash + prompt. */
const MAX_BOM_ROWS = 30
/** Cap on the project subject in the canonical string. */
const MAX_SUBJECT_CHARS = 1200
/** Cap on mission / customers / why-now / regulatory free-text fields. */
const MAX_FREEFORM_CHARS = 600

/**
 * Sorted-key serialisation. The order is FIXED so any caller passing the
 * same fields in any order produces the same hash. New fields added later
 * MUST be appended to the end — inserting in the middle changes existing
 * hashes and would invalidate the entire cache.
 */
const FIELD_ORDER: Array<keyof ProjectContextInput> = [
  'subject',
  'targetIndustry',
  'mission',
  'targetCustomers',
  'whyNow',
  'regulatoryHint',
  'bomRows',
  'moduleCount',
  'costCeilingPence',
]

const FIELD_LABELS: Record<keyof ProjectContextInput, string> = {
  subject: 'Subject',
  targetIndustry: 'Target industry',
  mission: 'Mission',
  targetCustomers: 'Target customers',
  whyNow: 'Why now',
  regulatoryHint: 'Regulatory context',
  bomRows: 'Bill of materials',
  moduleCount: 'Module count',
  costCeilingPence: 'Cost ceiling per unit (pence)',
}

/**
 * Render a BOM row to a single canonical line. Order of sub-fields is
 * fixed so {name, material, quantity} == {material, name, quantity} hash
 * the same.
 */
function renderBomRow(row: ProjectContextBomRow): string | null {
  const name = normaliseString(row.name)
  const material = normaliseString(row.material)
  const qty = typeof row.quantity === 'number' && Number.isFinite(row.quantity)
    ? Math.max(0, Math.floor(row.quantity))
    : null
  if (!name && !material && qty == null) return null
  const parts: string[] = []
  if (name) parts.push(name)
  if (material) parts.push(`material=${material}`)
  if (qty != null) parts.push(`qty=${qty}`)
  return `  - ${parts.join(' | ')}`
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the canonical context string + sha256 hash from a project profile.
 *
 * @description The string is what gets embedded in the LLM prompt. The hash
 * is what gets stored on the cache row. Two callers with the same meaningful
 * project state will produce the same hash regardless of input field order.
 *
 * Empty / null fields are skipped — they don't contribute to either output.
 * BOM rows are capped at 30 (any more is noise the prompt can't use anyway)
 * and free-text fields are trimmed to fixed character ceilings so a runaway
 * subject doesn't change the hash on every render.
 *
 * @param input - Project profile fields. Any can be omitted.
 * @returns Canonical context string + its sha256 hex digest.
 */
export function buildProjectContext(input: ProjectContextInput): ProjectContext {
  const lines: string[] = []
  for (const key of FIELD_ORDER) {
    const raw = input[key]
    if (raw == null) continue

    if (key === 'bomRows') {
      const rows = (raw as ProjectContextBomRow[] | null) ?? []
      const rendered = rows
        .slice(0, MAX_BOM_ROWS)
        .map(renderBomRow)
        .filter((s): s is string => s != null)
      if (rendered.length > 0) {
        lines.push(`${FIELD_LABELS.bomRows} (${rendered.length} of ${rows.length}):\n${rendered.join('\n')}`)
      }
      continue
    }

    if (key === 'moduleCount') {
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        lines.push(`${FIELD_LABELS.moduleCount}: ${Math.max(0, Math.floor(raw))}`)
      }
      continue
    }

    if (key === 'costCeilingPence') {
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        lines.push(`${FIELD_LABELS.costCeilingPence}: ${Math.max(0, Math.floor(raw))}`)
      }
      continue
    }

    // String fields (subject, targetIndustry, mission, targetCustomers,
    // whyNow, regulatoryHint).
    const normalised = normaliseString(raw as string)
    if (!normalised) continue
    const cap = key === 'subject' ? MAX_SUBJECT_CHARS : MAX_FREEFORM_CHARS
    lines.push(`${FIELD_LABELS[key]}: ${trimToMax(normalised, cap)}`)
  }

  // GOTCHA: Even an empty profile still produces a deterministic hash so
  // the cache key is never undefined.
  const contextString = lines.length > 0 ? lines.join('\n') : '<empty-project-context>'
  const contextHash = createHash('sha256').update(contextString).digest('hex')
  return { contextString, contextHash }
}

/**
 * Determinism check — used in dev/test scripts to prove the same input in
 * different orders hashes identically. Returns true on success, throws on
 * mismatch so the failure is loud (Vitest / tsx runners surface it).
 *
 * @example
 *   import { assertProjectContextDeterminism } from '@/lib/forge/project-context'
 *   assertProjectContextDeterminism()
 */
export function assertProjectContextDeterminism(): boolean {
  const a: ProjectContextInput = {
    subject: 'Premium garden bird feeder, camera + solar + edge inference',
    targetIndustry: 'Consumer hardware',
    mission: 'Beautiful long-life feeder that observes and reports',
    targetCustomers: 'United Kingdom enthusiast gardeners',
    whyNow: 'NPU and solar costs crossed over 2025',
    regulatoryHint: 'United Kingdom Conformity Assessed mark required',
    bomRows: [
      { name: 'Camera and optics', material: null, quantity: 1 },
      { name: 'Body', material: 'ceramic or powder-coated steel', quantity: 1 },
    ],
    moduleCount: 8,
    costCeilingPence: 15500,
  }
  // Same fields, reversed key insertion order.
  const b: ProjectContextInput = {
    costCeilingPence: 15500,
    moduleCount: 8,
    bomRows: [
      { quantity: 1, name: 'Camera and optics', material: null },
      { quantity: 1, material: 'ceramic or powder-coated steel', name: 'Body' },
    ],
    regulatoryHint: 'United Kingdom Conformity Assessed mark required',
    whyNow: 'NPU and solar costs crossed over 2025',
    targetCustomers: 'United Kingdom enthusiast gardeners',
    mission: 'Beautiful long-life feeder that observes and reports',
    targetIndustry: 'Consumer hardware',
    subject: 'Premium garden bird feeder, camera + solar + edge inference',
  }
  const ha = buildProjectContext(a).contextHash
  const hb = buildProjectContext(b).contextHash
  if (ha !== hb) {
    throw new Error(
      `[project-context] Determinism check FAILED: ${ha.slice(0, 12)}… !== ${hb.slice(0, 12)}…`,
    )
  }
  // Different content must hash differently.
  const c: ProjectContextInput = { ...a, moduleCount: 9 }
  const hc = buildProjectContext(c).contextHash
  if (ha === hc) {
    throw new Error('[project-context] Determinism check FAILED: changed input still hashed identically')
  }
  return true
}
