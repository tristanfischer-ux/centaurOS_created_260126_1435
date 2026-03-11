/**
 * @file forecast.ts
 *
 * @description Client-side price forecast using linear trend + cosine seasonal model.
 * Fits y = a + b*t on 26-week history, estimates seasonal component from residuals,
 * then projects 26 weeks forward. All values clamped to positive.
 */

export interface PricePoint {
  /** ISO date string (YYYY-MM-DD) for the week start */
  weekStart: string
  /** Price in pence per kg */
  price: number
}

export interface ForecastPoint extends PricePoint {
  /** Whether this point is a forecast (true) or historical (false) */
  isForecast: boolean
}

/**
 * Generate a 26-week price forecast from historical data.
 *
 * @param history - Array of weekly price points (oldest first), ideally 26 weeks
 * @param weeksForward - Number of weeks to forecast (default 26)
 * @returns Combined array of historical + forecast points
 */
export function generateForecast(
  history: PricePoint[],
  weeksForward = 26,
): ForecastPoint[] {
  if (history.length < 4) {
    // DECISION: Need at least 4 points for meaningful trend — return history only
    return history.map((p) => ({ ...p, isForecast: false }))
  }

  const n = history.length
  const prices = history.map((p) => p.price)

  // --- Linear regression: y = a + b*t ---
  let sumT = 0, sumY = 0, sumTY = 0, sumTT = 0
  for (let i = 0; i < n; i++) {
    sumT += i
    sumY += prices[i]
    sumTY += i * prices[i]
    sumTT += i * i
  }
  const b = (n * sumTY - sumT * sumY) / (n * sumTT - sumT * sumT)
  const a = (sumY - b * sumT) / n

  // --- Seasonal component: A * cos(2π(t - φ) / 52) ---
  // Estimate from residuals using least-squares on cos/sin basis
  const PERIOD = 52
  let sumCos = 0, sumSin = 0, sumRC = 0, sumRS = 0
  for (let i = 0; i < n; i++) {
    const residual = prices[i] - (a + b * i)
    const angle = (2 * Math.PI * i) / PERIOD
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    sumCos += c * c
    sumSin += s * s
    sumRC += residual * c
    sumRS += residual * s
  }
  const alphaCos = sumCos > 0 ? sumRC / sumCos : 0
  const alphaSin = sumSin > 0 ? sumRS / sumSin : 0
  const amplitude = Math.sqrt(alphaCos * alphaCos + alphaSin * alphaSin)
  const phase = Math.atan2(alphaSin, alphaCos)

  // --- Build forecast ---
  const result: ForecastPoint[] = history.map((p) => ({
    ...p,
    isForecast: false,
  }))

  const lastDate = new Date(history[n - 1].weekStart)

  for (let i = 1; i <= weeksForward; i++) {
    const t = n - 1 + i
    const trend = a + b * t
    const seasonal = amplitude * Math.cos((2 * Math.PI * t) / PERIOD - phase)
    const predicted = Math.max(0, trend + seasonal) // DECISION: Clamp to positive

    const date = new Date(lastDate)
    date.setDate(date.getDate() + i * 7)

    result.push({
      weekStart: date.toISOString().slice(0, 10),
      price: Math.round(predicted * 100) / 100,
      isForecast: true,
    })
  }

  return result
}
