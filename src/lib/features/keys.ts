/**
 * Feature flag keys — one constant per flag, one union type for validation.
 *
 * Flags are stored per-user in `profiles.feature_flags jsonb`. Absent key
 * evaluates as false. See src/lib/features/flags.ts for read helpers.
 *
 * Not to be confused with src/lib/features/registry.ts which tracks the
 * "New" badge + nav visibility for shipped features — different concept.
 */

export const FLAG_NEW_FORGE_EXPERIENCE = 'new_forge_experience'
export const FLAG_NEW_PRODUCTS_EXPERIENCE = 'new_products_experience'
export const FLAG_NEW_PLAN_EXPERIENCE = 'new_plan_experience'
export const FLAG_NEW_MONEY_EXPERIENCE = 'new_money_experience'

export type FeatureFlagKey =
  | typeof FLAG_NEW_FORGE_EXPERIENCE
  | typeof FLAG_NEW_PRODUCTS_EXPERIENCE
  | typeof FLAG_NEW_PLAN_EXPERIENCE
  | typeof FLAG_NEW_MONEY_EXPERIENCE

export const ALL_FLAG_KEYS: readonly FeatureFlagKey[] = [
  FLAG_NEW_FORGE_EXPERIENCE,
  FLAG_NEW_PRODUCTS_EXPERIENCE,
  FLAG_NEW_PLAN_EXPERIENCE,
  FLAG_NEW_MONEY_EXPERIENCE,
] as const

export function isFeatureFlagKey(value: string): value is FeatureFlagKey {
  return (ALL_FLAG_KEYS as readonly string[]).includes(value)
}
