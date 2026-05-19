import type { ProductClass } from '../schema/types'

const CLASS_KEYWORDS: Array<{ productClass: ProductClass; tokens: string[] }> = [
  { productClass: 'energy_storage', tokens: ['bess', 'battery energy storage', 'mwh', 'lfp', 'pcs', 'grid storage'] },
  { productClass: 'vertical_farm', tokens: ['vertical farm', 'leafy', 'lettuce', 'grow light', 'fertigation', 'hydroponic'] },
  { productClass: 'drone', tokens: ['drone', 'uav', 'quadcopter', 'flight controller', 'propeller', 'cinematography'] },
  { productClass: 'heat_pump', tokens: ['heat pump', 'compressor', 'refrigerant', 'cop', 'monobloc'] },
  { productClass: 'ev_charger', tokens: ['ev charger', 'ccs2', 'ocpp', 'iso 15118', 'dc fast'] },
  { productClass: 'bioreactor', tokens: ['bioreactor', 'mammalian', 'single-use', 'sparger', 'peristaltic'] },
  { productClass: 'auv', tokens: ['auv', 'underwater', 'pressure hull', 'thruster', 'dvl'] },
  { productClass: 'edge_ai', tokens: ['edge ai', 'inference', 'gpu', '1u', 'rack-mount'] },
  { productClass: 'haps', tokens: ['haps', 'high-altitude pseudo-satellite', 'stratospheric', 'solar-electric', 'pseudo-satellite'] },
  { productClass: 'cgm', tokens: ['continuous glucose', 'cgm', 'wearable patch', 'glucose monitor'] },
]

export interface ClassificationResult {
  productClass: ProductClass
  confidence: 'high' | 'medium' | 'low'
  scores: Partial<Record<ProductClass, number>>
}

export function classifyBrief(briefText: string, override?: ProductClass): ClassificationResult {
  if (override && override !== 'unknown') {
    return { productClass: override, confidence: 'high', scores: { [override]: 999 } }
  }
  const lower = briefText.toLowerCase()
  const scores: Partial<Record<ProductClass, number>> = {}
  for (const candidate of CLASS_KEYWORDS) {
    let score = 0
    for (const token of candidate.tokens) {
      if (lower.includes(token)) score += token.includes(' ') ? 3 : 1
    }
    if (score > 0) scores[candidate.productClass] = score
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1])
  const winner = ranked[0]?.[0] as ProductClass | undefined
  const topScore = ranked[0]?.[1] ?? 0
  const nextScore = ranked[1]?.[1] ?? 0
  if (!winner) return { productClass: 'unknown', confidence: 'low', scores }
  const confidence = topScore >= 5 && topScore >= nextScore + 2 ? 'high' : topScore >= 2 ? 'medium' : 'low'
  return { productClass: winner, confidence, scores }
}
