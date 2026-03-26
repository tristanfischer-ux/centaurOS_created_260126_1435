/**
 * @file specialist-config.ts
 *
 * @description Override loading and merge logic for specialist definitions.
 * Allows surface-level tweaks (taglines, names, descriptions) without modifying
 * the TypeScript source or requiring a code deploy.
 *
 * Current source: SPECIALIST_OVERRIDES environment variable (JSON string).
 * Future: per-foundry customization from a Supabase `specialist_config` table.
 *
 * @example
 * SPECIALIST_OVERRIDES='{"strategist":{"tagline":"Your custom tagline"}}'
 *
 * @related
 * - Specialists data: src/app/(platform)/agents/specialists-data.ts (sole consumer)
 */

import type { Specialist } from "@/lib/agents/specialists-config"
import type { SpecialistId } from "@/lib/agents/specialists-config"

/**
 * A partial override for one or more specialists.
 * Each key is a SpecialistId; each value is a shallow patch (any subset of Specialist fields).
 *
 * Note: `personality` must be provided in full if overriding it — shallow merge
 * replaces the whole object rather than deep-merging individual personality fields.
 */
export type SpecialistOverrides = Partial<Record<SpecialistId, Partial<Specialist>>>

/**
 * Loads specialist overrides from the SPECIALIST_OVERRIDES environment variable.
 *
 * @description Parses the env var as JSON. Silently returns empty overrides on
 * parse failure or missing env var — the application always falls back to the
 * TypeScript-defined base definitions.
 *
 * @returns Parsed overrides map (may be empty)
 */
export function loadSpecialistOverrides(): SpecialistOverrides {
    const raw = process.env.SPECIALIST_OVERRIDES
    if (!raw) return {}
    try {
        return JSON.parse(raw) as SpecialistOverrides
    } catch (err) {
        console.warn('[specialist-config] Failed to parse SPECIALIST_OVERRIDES:', err instanceof Error ? err.message : err)
        return {}
    }
}

/**
 * Applies overrides to a specialist roster via shallow merge.
 *
 * @description For each specialist with an override entry, spreads the override
 * fields onto the base definition. Fields not mentioned in the override keep
 * their base values.
 *
 * @param specialists - The base specialist roster (TypeScript source of truth)
 * @param overrides - Partial overrides to apply
 * @returns New array with overrides applied (base array unchanged)
 */
export function applyOverrides(
    specialists: Specialist[],
    overrides: SpecialistOverrides,
): Specialist[] {
    return specialists.map(specialist => {
        const override = overrides[specialist.id]
        if (!override) return specialist
        return { ...specialist, ...override }
    })
}
