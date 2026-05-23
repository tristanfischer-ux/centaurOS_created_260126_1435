/**
 * src/lib/pdf-engine-v2/brief-metrics.ts
 *
 * P1-1 (2026-05-23): helpers to read the new multi-metric brief schema.
 *
 * The new field StructuredBriefPerformance.metrics is an OPTIONAL Array<
 * StructuredBriefMetric> where each metric carries a category tag
 * (scale | performance | efficiency | durability | cost) and a canonical
 * snake_case key_metric name.
 *
 * Downstream layers (envelope detector, archetype builder, emitter, cost-
 * stack) should prefer these helpers over reading target_performance.value
 * directly. When the new metrics[] array is empty (parser hasn't migrated
 * for this run, or brief is qualitative-only), the helpers fall back to
 * the legacy single-metric fields so callers never break.
 *
 * Migration pattern for a consumer that today reads:
 *
 *   const v = parsedBrief.constraints.target_performance.value
 *   const u = parsedBrief.constraints.target_performance.unit
 *
 * → becomes:
 *
 *   const scale = getScaleMetric(parsedBrief)
 *   if (scale) { use scale.value + scale.unit + scale.key_metric }
 *
 * Or to find a specific metric:
 *
 *   const cop = findMetric(parsedBrief, 'efficiency', /\bcop\b/i)
 */

import type { StructuredBriefJSON, StructuredBriefMetric } from './types'

/**
 * Returns the highest-confidence "scale" metric (the one that determines
 * product size — kW power, kWh energy, L volume, etc.). Falls back to the
 * legacy target_performance fields when metrics[] is absent or empty.
 *
 * Returns null when no scale metric is available at all.
 */
export function getScaleMetric(parsedBrief: StructuredBriefJSON | null | undefined): StructuredBriefMetric | null {
  const tp = parsedBrief?.constraints?.target_performance
  if (!tp) return null

  const metrics = tp.metrics ?? []
  // Prefer user-stated scale metrics, then inferred scale metrics
  const userScale = metrics.find(m => m.category === 'scale' && m.source === 'user')
  if (userScale) return userScale
  const inferredScale = metrics.find(m => m.category === 'scale' && m.source === 'inferred')
  if (inferredScale) return inferredScale

  // Back-compat fallback: synthesize a metric from the legacy single-metric fields
  if (typeof tp.value === 'number' && typeof tp.unit === 'string' && typeof tp.key_metric === 'string') {
    return {
      key_metric: tp.key_metric,
      value: tp.value,
      unit: tp.unit,
      category: 'scale',
      source: tp.source === 'missing' ? 'inferred' : tp.source,
    }
  }

  return null
}

/**
 * Returns all metrics in the given category. Empty array when metrics[] is
 * absent or no metrics match.
 */
export function getMetricsByCategory(
  parsedBrief: StructuredBriefJSON | null | undefined,
  category: StructuredBriefMetric['category'],
): StructuredBriefMetric[] {
  const metrics = parsedBrief?.constraints?.target_performance?.metrics ?? []
  return metrics.filter(m => m.category === category)
}

/**
 * Finds the first metric matching a key_metric pattern OR a unit pattern,
 * optionally filtered by category. Useful when the consumer knows the
 * canonical name (e.g. "rated_power_kw") OR the unit family (e.g. /kw/i).
 */
export function findMetric(
  parsedBrief: StructuredBriefJSON | null | undefined,
  category: StructuredBriefMetric['category'] | null,
  keyOrUnitPattern: string | RegExp,
): StructuredBriefMetric | null {
  const metrics = parsedBrief?.constraints?.target_performance?.metrics ?? []
  const pat = typeof keyOrUnitPattern === 'string' ? new RegExp(keyOrUnitPattern, 'i') : keyOrUnitPattern
  for (const m of metrics) {
    if (category && m.category !== category) continue
    if (pat.test(m.key_metric) || pat.test(m.unit)) return m
  }
  return null
}

/**
 * Reconcile post-parse: ensures the legacy target_performance.{key_metric,
 * value, unit, source} fields mirror the highest-confidence scale metric
 * when the parser supplied a metrics[] array. Call this once after parsing
 * to keep back-compat consumers (those that still read the legacy fields)
 * aligned with the new typed metrics.
 *
 * Returns the (possibly mutated) parsedBrief for chaining. Mutates in place.
 */
export function reconcileLegacyTargetPerformance(parsedBrief: StructuredBriefJSON): StructuredBriefJSON {
  const tp = parsedBrief?.constraints?.target_performance
  if (!tp || !Array.isArray(tp.metrics) || tp.metrics.length === 0) return parsedBrief
  // Only overwrite legacy fields when they're empty (parser didn't fill them)
  // OR when the metrics[0] scale entry has higher-confidence source than the
  // legacy single-metric field. Don't clobber a user-stated legacy value with
  // an inferred metric.
  const scale = getScaleMetric(parsedBrief)
  if (!scale) return parsedBrief
  const legacyFilled = typeof tp.value === 'number' && typeof tp.unit === 'string'
  if (legacyFilled && tp.source === 'user' && scale.source !== 'user') return parsedBrief
  tp.key_metric = scale.key_metric
  tp.value = scale.value
  tp.unit = scale.unit
  tp.source = scale.source
  return parsedBrief
}
