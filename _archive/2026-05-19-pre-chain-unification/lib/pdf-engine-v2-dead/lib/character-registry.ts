/**
 * @file lib/character-registry.ts — Supabase-backed character_registry helper.
 *
 * The radical-resolution stage (stages/4b-radical-resolution.ts) used to be
 * driven exclusively by two in-code tables — MPN_HINTS_BY_CHARACTER and
 * OEM_CATALOG_BY_CHARACTER. Wave 1 Piece 4 (migration 2026-05-13) added a
 * persistent character_registry table that is the new source of truth for
 *   character_id → (mpn_hints, manufacturer, vendor_catalog_part_type,
 *                   unit_price_gbp, source_grade, confidence_score)
 * across pipeline runs and product classes.
 *
 * This module is a thin typed wrapper around the supabase client used in
 * stages/4b. It exposes three operations:
 *
 *   - getCharacterFromRegistry(characterId, productClass)
 *       → single-row lookup, returns null on miss.
 *   - getCharactersFromRegistry(characterIds, productClass)
 *       → bulk lookup (one round trip via `.in('character_id', [...])`),
 *         returns a Map keyed by character_id. Stage 4b uses this at the
 *         top of runRadicalResolution to avoid N+1 queries against the
 *         registry for every leaf in the radical tree.
 *   - writeCharacterToRegistry(row)
 *       → upsert. On conflict (character_id is the unique key) the
 *         product_class is array-appended to product_classes instead of
 *         overwriting the existing row. Fire-and-forget from the caller;
 *         errors are logged but never thrown.
 *
 * The Supabase client is the engine-scoped getSupabase() (service-role when
 * SUPABASE_SERVICE_ROLE_KEY is present in the environment).
 *
 * IMPORTANT: numeric columns (unit_price_gbp, confidence_score) come back as
 * STRINGS from PostgREST.  We coerce them with Number(...) on read. nulls
 * are preserved.
 */

import { getSupabase } from '../supabase-client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CharacterRegistrySourceGrade =
  | 'verified'
  | 'priced'
  | 'canonical'
  | 'plausible'
  | 'unverified'

export interface CharacterRegistryRow {
  character_id: string
  mpn_hints: string[]
  manufacturer: string | null
  vendor_catalog_part_type: string | null
  unit_price_gbp: number | null
  unit_price_source: string | null
  source_url: string | null
  source_grade: CharacterRegistrySourceGrade
  confidence_score: number | null
  product_classes: string[]
}

/** Subset of columns we read from the table. */
const REGISTRY_SELECT_COLUMNS =
  'character_id, mpn_hints, manufacturer, vendor_catalog_part_type, ' +
  'unit_price_gbp, unit_price_source, source_url, source_grade, ' +
  'confidence_score, product_classes'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * PostgREST returns `numeric` columns as strings (preserves precision).
 * We coerce to number, with null passthrough.
 */
function coerceNumeric(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/** Coerce mpn_hints jsonb → string[]. Anything weird → []. */
function coerceMpnHints(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0)
}

function coerceProductClasses(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0)
}

function isValidSourceGrade(value: unknown): value is CharacterRegistrySourceGrade {
  return (
    value === 'verified' ||
    value === 'priced' ||
    value === 'canonical' ||
    value === 'plausible' ||
    value === 'unverified'
  )
}

/** Normalise a raw PostgREST row into our typed shape. */
function normaliseRow(raw: Record<string, unknown>): CharacterRegistryRow | null {
  const characterId = raw.character_id
  if (typeof characterId !== 'string' || characterId.length === 0) return null

  const sourceGrade = raw.source_grade
  if (!isValidSourceGrade(sourceGrade)) return null

  return {
    character_id: characterId,
    mpn_hints: coerceMpnHints(raw.mpn_hints),
    manufacturer: typeof raw.manufacturer === 'string' ? raw.manufacturer : null,
    vendor_catalog_part_type:
      typeof raw.vendor_catalog_part_type === 'string' ? raw.vendor_catalog_part_type : null,
    unit_price_gbp: coerceNumeric(raw.unit_price_gbp),
    unit_price_source: typeof raw.unit_price_source === 'string' ? raw.unit_price_source : null,
    source_url: typeof raw.source_url === 'string' ? raw.source_url : null,
    source_grade: sourceGrade,
    confidence_score: coerceNumeric(raw.confidence_score),
    product_classes: coerceProductClasses(raw.product_classes),
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Lookup by exact character_id. Returns null on miss OR Supabase error
 * (errors logged but never thrown — registry miss is a normal fall-through
 * path in stages/4b).
 *
 * `productClass` is not used as a filter today: the registry is keyed only
 * by character_id (UNIQUE constraint). The product class is stored on the
 * row in product_classes[] and used by writeCharacterToRegistry to
 * array-append on conflict. We keep the parameter in the signature so the
 * call sites read symmetrically with `getCharactersFromRegistry` and so we
 * can add product-class scoping later without changing the call sites.
 */
export async function getCharacterFromRegistry(
  characterId: string,
  productClass: string, // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<CharacterRegistryRow | null> {
  if (!characterId) return null
  const sb = getSupabase()
  try {
    const { data, error } = await sb
      .from('character_registry')
      .select(REGISTRY_SELECT_COLUMNS)
      .eq('character_id', characterId)
      .maybeSingle()
    if (error) {
      console.warn(
        `[character-registry] lookup failed for "${characterId}": ${error.message}`,
      )
      return null
    }
    if (!data) return null
    return normaliseRow(data as unknown as Record<string, unknown>)
  } catch (err) {
    console.warn(
      `[character-registry] lookup threw for "${characterId}": ${(err as Error).message}`,
    )
    return null
  }
}

/**
 * Bulk lookup for many characterIds in a single round-trip.
 * Returns a Map keyed by character_id; misses are simply absent from the map.
 *
 * Empty input → empty map (no round trip).
 *
 * `productClass` is unused as a filter — see note on getCharacterFromRegistry.
 */
export async function getCharactersFromRegistry(
  characterIds: string[],
  productClass: string, // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<Map<string, CharacterRegistryRow>> {
  const out = new Map<string, CharacterRegistryRow>()
  if (!characterIds || characterIds.length === 0) return out

  // De-dupe + drop empties — PostgREST `.in()` chokes on huge or duplicate
  // arrays.
  const unique = Array.from(new Set(characterIds.filter(id => typeof id === 'string' && id.length > 0)))
  if (unique.length === 0) return out

  const sb = getSupabase()
  try {
    const { data, error } = await sb
      .from('character_registry')
      .select(REGISTRY_SELECT_COLUMNS)
      .in('character_id', unique)
    if (error) {
      console.warn(
        `[character-registry] bulk lookup failed (${unique.length} ids): ${error.message}`,
      )
      return out
    }
    for (const raw of (data ?? []) as unknown as Record<string, unknown>[]) {
      const row = normaliseRow(raw)
      if (row) out.set(row.character_id, row)
    }
    return out
  } catch (err) {
    console.warn(
      `[character-registry] bulk lookup threw (${unique.length} ids): ${(err as Error).message}`,
    )
    return out
  }
}

/**
 * Phase C (2026-05-15): fetch top-N registry rows for a given product class,
 * ordered by source_grade strength (verified > priced > canonical > plausible >
 * unverified) and confidence_score. Used by serial-design-chain-v2 to pre-seed
 * reviewer prompts with known components for the target product class so
 * reviewers prefer matching existing parts over inventing new ones.
 *
 * Empty registry for a class → empty array (graceful degradation: reviewers
 * just skip the KNOWN_COMPONENTS block when no seed data is available).
 */
export async function getRegistryByProductClass(
  productClass: string,
  limit = 60,
): Promise<CharacterRegistryRow[]> {
  if (!productClass) return []
  const sb = getSupabase()
  try {
    const { data, error } = await sb
      .from('character_registry')
      .select(REGISTRY_SELECT_COLUMNS)
      .contains('product_classes', [productClass])
      // PostgREST .order() lets us sort by source_grade ENUM directly — Supabase
      // returns enum strings in alphabetical order which is NOT our priority
      // order; we'll sort client-side after fetching. Fetch a larger buffer
      // and slice after ranking.
      .limit(Math.max(limit * 2, 100))
    if (error) {
      console.warn(`[character-registry] product_class lookup failed (${productClass}): ${error.message}`)
      return []
    }
    const rows: CharacterRegistryRow[] = []
    for (const raw of (data ?? []) as unknown as Record<string, unknown>[]) {
      const row = normaliseRow(raw)
      if (row) rows.push(row)
    }
    // Rank by source_grade strength + confidence_score
    const gradeRank: Record<CharacterRegistrySourceGrade, number> = {
      verified: 5, priced: 4, canonical: 3, plausible: 2, unverified: 1,
    }
    rows.sort((a, b) => {
      const ga = gradeRank[a.source_grade] ?? 0
      const gb = gradeRank[b.source_grade] ?? 0
      if (ga !== gb) return gb - ga
      const ca = a.confidence_score ?? 0
      const cb = b.confidence_score ?? 0
      return cb - ca
    })
    return rows.slice(0, limit)
  } catch (err) {
    console.warn(`[character-registry] product_class lookup threw (${productClass}): ${(err as Error).message}`)
    return []
  }
}

/**
 * Upsert a discovery into the registry.
 *
 * On conflict (character_id is UNIQUE):
 *   - product_class is APPENDED to the existing product_classes array
 *     (de-duped) — we never shrink the array.
 *   - other columns are updated to the supplied values WHEN the supplied
 *     value is non-null. Existing non-null values are kept when the new
 *     row carries null for that column (Supabase merging via COALESCE).
 *   - last_verified_at is bumped to now() whenever source_grade is
 *     'verified' or 'priced' (i.e. we have positive distributor /
 *     vendor-catalog evidence).
 *
 * This is implemented as a single RPC-free pattern using
 *   .upsert(..., { onConflict: 'character_id', ignoreDuplicates: false })
 * followed by a server-side product_classes array-merge handled in plain
 * SQL via a CTE. Because the supabase-js client doesn't support
 * INSERT … ON CONFLICT DO UPDATE with array-append in one call, we use the
 * two-step pattern: SELECT existing → write merged row.
 *
 * Errors are logged and swallowed; the caller wraps this in
 * Promise.allSettled.
 */
export async function writeCharacterToRegistry(
  row: Omit<CharacterRegistryRow, 'product_classes'> & { product_class: string },
): Promise<void> {
  if (!row.character_id) return
  if (!row.product_class) return

  const sb = getSupabase()
  try {
    // 1. Fetch existing row to merge product_classes + preserve stronger evidence.
    const { data: existing, error: selErr } = await sb
      .from('character_registry')
      .select('product_classes, source_grade, confidence_score, mpn_hints, unit_price_gbp')
      .eq('character_id', row.character_id)
      .maybeSingle()

    if (selErr) {
      console.warn(
        `[character-registry] write pre-select failed for "${row.character_id}": ${selErr.message}`,
      )
      // continue — fall through to a best-effort insert
    }

    const existingClasses = Array.isArray((existing as { product_classes?: unknown } | null)?.product_classes)
      ? ((existing as { product_classes: unknown[] }).product_classes.filter(
          (v): v is string => typeof v === 'string',
        ))
      : []
    const mergedClasses = Array.from(new Set([...existingClasses, row.product_class]))

    // Stamp last_verified_at only for strong evidence grades.
    const stampVerified = row.source_grade === 'verified' || row.source_grade === 'priced'

    // 2. Upsert with onConflict; numeric fields converted back to strings is
    //    unnecessary — supabase-js handles JS numbers fine.
    const payload: Record<string, unknown> = {
      character_id: row.character_id,
      mpn_hints: row.mpn_hints,
      manufacturer: row.manufacturer,
      vendor_catalog_part_type: row.vendor_catalog_part_type,
      unit_price_gbp: row.unit_price_gbp,
      unit_price_source: row.unit_price_source,
      source_url: row.source_url,
      source_grade: row.source_grade,
      confidence_score: row.confidence_score,
      product_classes: mergedClasses,
    }
    if (stampVerified) {
      payload.last_verified_at = new Date().toISOString()
    }

    const { error: upErr } = await sb
      .from('character_registry')
      .upsert(payload, { onConflict: 'character_id', ignoreDuplicates: false })

    if (upErr) {
      console.warn(
        `[character-registry] upsert failed for "${row.character_id}": ${upErr.message}`,
      )
    }
  } catch (err) {
    console.warn(
      `[character-registry] write threw for "${row.character_id}": ${(err as Error).message}`,
    )
  }
}
