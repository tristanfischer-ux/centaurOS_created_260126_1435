import type { ProductDossier, ProvenanceRef, SectionIssue } from '../schema/types'
import { validateDossier } from '../sections/contracts'
import { hasBlockers } from '../schema/issues'

export interface DossierPatch {
  op: 'add' | 'replace' | 'remove'
  path: string
  value?: unknown
  reason: string
  evidence?: ProvenanceRef[]
}

export interface PatchApplyResult {
  dossier: ProductDossier
  accepted: DossierPatch[]
  rejected: Array<{ patch: DossierPatch; issues: SectionIssue[] }>
}

export function applyReviewedPatches(dossier: ProductDossier, patches: DossierPatch[]): PatchApplyResult {
  let next = structuredClone(dossier)
  const accepted: DossierPatch[] = []
  const rejected: Array<{ patch: DossierPatch; issues: SectionIssue[] }> = []

  for (const patch of patches) {
    const candidate = applyPatch(next, patch)
    const issues = validateDossier(candidate)
    if (hasBlockers(issues)) {
      rejected.push({ patch, issues })
    } else {
      next = candidate
      accepted.push(patch)
    }
  }

  return { dossier: next, accepted, rejected }
}

function applyPatch(dossier: ProductDossier, patch: DossierPatch): ProductDossier {
  const copy = structuredClone(dossier) as unknown as Record<string, unknown>
  const parts = patch.path.replace(/^\//, '').split('/').filter(Boolean)
  if (parts.length === 0) return dossier
  let cursor: Record<string, unknown> | unknown[] = copy
  for (const part of parts.slice(0, -1)) {
    const key = arrayKey(part)
    const next = Array.isArray(cursor) ? cursor[key as number] : cursor[key as string]
    if (typeof next !== 'object' || next === null) return dossier
    cursor = next as Record<string, unknown> | unknown[]
  }
  const leaf = arrayKey(parts[parts.length - 1])
  if (patch.op === 'remove') {
    if (Array.isArray(cursor) && typeof leaf === 'number') cursor.splice(leaf, 1)
    else delete (cursor as Record<string, unknown>)[leaf as string]
  } else {
    if (Array.isArray(cursor) && typeof leaf === 'number') cursor[leaf] = patch.value
    else (cursor as Record<string, unknown>)[leaf as string] = patch.value
  }
  return copy as unknown as ProductDossier
}

function arrayKey(value: string): string | number {
  return /^\d+$/.test(value) ? Number(value) : value
}
