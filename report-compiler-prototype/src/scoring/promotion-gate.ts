export interface PromotionInput {
  cellLiftAtEight: number
  regressionsFromPassing: number
  liftToNoiseRatio: number
  universalityProbesPassed: number
}

export interface PromotionVerdict {
  promote: boolean
  reasons: string[]
}

export function evaluatePromotion(input: PromotionInput): PromotionVerdict {
  const reasons: string[] = []
  if (input.cellLiftAtEight < 10) reasons.push(`cell lift is ${input.cellLiftAtEight}, needs >=10`)
  if (input.regressionsFromPassing > 2) reasons.push(`${input.regressionsFromPassing} regressions, max 2`)
  if (input.liftToNoiseRatio < 3) reasons.push(`lift/noise is ${input.liftToNoiseRatio}, needs >=3`)
  if (input.universalityProbesPassed < 4) reasons.push(`${input.universalityProbesPassed}/5 universality probes passed, needs >=4`)
  return { promote: reasons.length === 0, reasons }
}

