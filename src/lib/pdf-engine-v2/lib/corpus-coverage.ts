export interface CorpusCoverageReport {
  totalParts: number
  distributorMatches: number   // regime=buy_electronic AND regimeRouterResult.source='distributor'
  fabricatorMatches: number    // regime=make_custom_fab AND suppliers matched
  unmatched: number            // no match from any source
  coveragePercent: number      // 0-100
  breakdown: {
    regime: string
    total: number
    matched: number
  }[]
}

export function computeCorpusCoverage(
  parts: Array<{
    name: string
    regime?: string
    regimeRouterResult?: { source?: string; confidence?: string }
    suppliers?: Array<{ name: string }>
  }>
): CorpusCoverageReport {
  let distributorMatches = 0
  let fabricatorMatches = 0
  let matchedTotal = 0
  let unmatched = 0

  const regimeMap = new Map<string, { total: number; matched: number }>()

  if (!parts || parts.length === 0) {
    return {
      totalParts: 0,
      distributorMatches: 0,
      fabricatorMatches: 0,
      unmatched: 0,
      coveragePercent: 0,
      breakdown: []
    }
  }

  for (const part of parts) {
    const regime = part.regime || 'unknown'
    if (!regimeMap.has(regime)) {
      regimeMap.set(regime, { total: 0, matched: 0 })
    }
    const counts = regimeMap.get(regime)!
    counts.total += 1

    let isMatched = false

    if (regime === 'buy_electronic') {
      if (part.regimeRouterResult?.source === 'distributor') {
        isMatched = true
        distributorMatches += 1
      }
    } else if (regime === 'make_custom_fab') {
      if (part.suppliers && part.suppliers.length > 0) {
        isMatched = true
        fabricatorMatches += 1
      }
    } else {
      if (
        part.regimeRouterResult?.source || 
        (part.suppliers && part.suppliers.length > 0)
      ) {
        isMatched = true
      }
    }

    if (isMatched) {
      counts.matched += 1
      matchedTotal += 1
    } else {
      unmatched += 1
    }
  }

  const breakdown = Array.from(regimeMap.entries()).map(([regime, counts]) => ({
    regime,
    total: counts.total,
    matched: counts.matched
  }))

  return {
    totalParts: parts.length,
    distributorMatches,
    fabricatorMatches,
    unmatched,
    coveragePercent: (matchedTotal / parts.length) * 100,
    breakdown
  }
}
