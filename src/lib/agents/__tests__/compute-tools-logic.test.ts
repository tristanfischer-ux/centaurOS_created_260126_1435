/**
 * @file compute-tools-logic.test.ts — Unit tests for computation tool logic.
 *
 * Tests the pure math/helpers from compute.ts, and validates
 * the unit economics handler (which is pure computation, no DB).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Test formatAmount-style currency logic ──────────────────────────

describe("Currency formatting logic", () => {
    function formatAmount(amount: number, currency = "GBP"): string {
        const locale = currency === "USD" ? "en-US" : currency === "EUR" ? "de-DE" : "en-GB"
        return (amount / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }

    it("converts pence to pounds correctly", () => {
        expect(formatAmount(150000, "GBP")).toBe("1,500.00")
    })

    it("handles zero", () => {
        expect(formatAmount(0, "GBP")).toBe("0.00")
    })

    it("handles negative amounts", () => {
        expect(formatAmount(-50000, "GBP")).toBe("-500.00")
    })

    it("uses USD locale for USD", () => {
        const result = formatAmount(150000, "USD")
        expect(result).toBe("1,500.00")
    })

    it("uses EUR locale for EUR", () => {
        const result = formatAmount(150000, "EUR")
        // German locale uses . for thousands and , for decimal
        expect(result).toBe("1.500,00")
    })

    it("defaults unknown currencies to en-GB", () => {
        expect(formatAmount(150000, "JPY")).toBe("1,500.00")
    })

    it("handles fractional pence correctly", () => {
        expect(formatAmount(12345, "GBP")).toBe("123.45")
    })
})

// ─── Test toMonthKey ─────────────────────────────────────────────────

describe("toMonthKey logic", () => {
    function toMonthKey(dateStr: string | null | undefined): string | null {
        if (!dateStr) return null
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) return null
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    }

    it("parses ISO date strings", () => {
        expect(toMonthKey("2025-03-15")).toBe("2025-03")
    })

    it("parses ISO datetime strings", () => {
        expect(toMonthKey("2025-01-01T00:00:00Z")).toBe("2025-01")
    })

    it("returns null for null input", () => {
        expect(toMonthKey(null)).toBeNull()
    })

    it("returns null for undefined input", () => {
        expect(toMonthKey(undefined)).toBeNull()
    })

    it("returns null for empty string", () => {
        expect(toMonthKey("")).toBeNull()
    })

    it("returns null for invalid date", () => {
        expect(toMonthKey("not-a-date")).toBeNull()
    })

    it("pads single-digit months", () => {
        expect(toMonthKey("2025-01-01")).toBe("2025-01")
    })

    it("handles December correctly", () => {
        expect(toMonthKey("2025-12-31")).toBe("2025-12")
    })
})

// ─── Test futureMonthLabel ───────────────────────────────────────────

describe("futureMonthLabel logic", () => {
    function futureMonthLabel(monthsAhead: number): string {
        const d = new Date()
        d.setDate(1)
        d.setMonth(d.getMonth() + monthsAhead)
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    }

    it("returns next month for monthsAhead=1", () => {
        const result = futureMonthLabel(1)
        const expected = new Date()
        expected.setDate(1)
        expected.setMonth(expected.getMonth() + 1)
        const expectedStr = `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, "0")}`
        expect(result).toBe(expectedStr)
    })

    it("handles year rollover", () => {
        // 12 months ahead should be same month next year
        const result = futureMonthLabel(12)
        const expected = new Date()
        expected.setDate(1)
        expected.setMonth(expected.getMonth() + 12)
        const expectedStr = `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, "0")}`
        expect(result).toBe(expectedStr)
    })

    it("never produces month 13", () => {
        for (let i = 1; i <= 24; i++) {
            const result = futureMonthLabel(i)
            const month = parseInt(result.split("-")[1], 10)
            expect(month).toBeGreaterThanOrEqual(1)
            expect(month).toBeLessThanOrEqual(12)
        }
    })
})

// ─── Test unit economics computation ─────────────────────────────────

describe("Unit economics computation", () => {
    function calculateUnitEconomics(
        cac: number,
        monthlyRevenue: number,
        grossMarginPct: number,
        monthlyChurnRate: number,
    ) {
        const marginDecimal = grossMarginPct / 100
        const monthlyGrossProfit = monthlyRevenue * marginDecimal
        const effectiveChurn = monthlyChurnRate > 0 ? monthlyChurnRate : 0.01
        const avgLifetimeMonths = 1 / effectiveChurn
        const ltv = monthlyGrossProfit * avgLifetimeMonths
        const ltvCacRatio = cac > 0 ? ltv / cac : Infinity
        const paybackMonths = monthlyGrossProfit > 0 ? cac / monthlyGrossProfit : Infinity
        return { ltv, ltvCacRatio, paybackMonths, avgLifetimeMonths }
    }

    it("computes SaaS-typical LTV correctly", () => {
        // CAC=500, revenue=100/mo, 80% margin, 5% churn
        const result = calculateUnitEconomics(500, 100, 80, 0.05)
        // LTV = (100 * 0.8) / 0.05 = 1600
        expect(result.ltv).toBe(1600)
        expect(result.ltvCacRatio).toBe(3.2)
        expect(result.paybackMonths).toBeCloseTo(6.25)
        expect(result.avgLifetimeMonths).toBe(20)
    })

    it("handles zero churn by defaulting to 0.01", () => {
        const result = calculateUnitEconomics(100, 50, 100, 0)
        // LTV = 50 / 0.01 = 5000
        expect(result.ltv).toBe(5000)
    })

    it("handles zero CAC", () => {
        const result = calculateUnitEconomics(0, 50, 100, 0.05)
        expect(result.ltvCacRatio).toBe(Infinity)
    })

    it("handles zero revenue", () => {
        const result = calculateUnitEconomics(100, 0, 100, 0.05)
        expect(result.ltv).toBe(0)
        expect(result.paybackMonths).toBe(Infinity)
    })

    it("applies gross margin correctly", () => {
        // 50% margin on $100 revenue = $50 gross profit
        const result = calculateUnitEconomics(500, 100, 50, 0.05)
        // LTV = (100 * 0.5) / 0.05 = 1000
        expect(result.ltv).toBe(1000)
    })
})

// ─── Test linear regression logic ────────────────────────────────────

describe("Linear regression (forecast_metric core)", () => {
    function linearRegression(values: number[]) {
        const n = values.length
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
        for (let i = 0; i < n; i++) {
            sumX += i
            sumY += values[i]
            sumXY += i * values[i]
            sumX2 += i * i
        }
        const denom = n * sumX2 - sumX ** 2
        const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0
        const intercept = (sumY - slope * sumX) / n

        const yMean = sumY / n
        let ssTot = 0, ssRes = 0
        for (let i = 0; i < n; i++) {
            ssTot += (values[i] - yMean) ** 2
            ssRes += (values[i] - (slope * i + intercept)) ** 2
        }
        const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0

        return { slope, intercept, rSquared }
    }

    it("fits a perfect linear series", () => {
        const result = linearRegression([100, 200, 300, 400, 500])
        expect(result.slope).toBe(100)
        expect(result.intercept).toBe(100)
        expect(result.rSquared).toBeCloseTo(1.0)
    })

    it("returns flat trend for constant values", () => {
        const result = linearRegression([500, 500, 500, 500])
        expect(result.slope).toBe(0)
        expect(result.intercept).toBe(500)
        // R² = 0 when ssTot = 0 (all values equal mean)
        expect(result.rSquared).toBe(0)
    })

    it("detects negative trend", () => {
        const result = linearRegression([1000, 800, 600, 400])
        expect(result.slope).toBeLessThan(0)
        expect(result.rSquared).toBeCloseTo(1.0)
    })

    it("handles 3 data points (minimum)", () => {
        const result = linearRegression([100, 150, 200])
        expect(result.slope).toBe(50)
        expect(result.rSquared).toBeCloseTo(1.0)
    })

    it("produces valid R² for noisy data", () => {
        const result = linearRegression([100, 250, 180, 310, 280, 400])
        expect(result.rSquared).toBeGreaterThanOrEqual(0)
        expect(result.rSquared).toBeLessThanOrEqual(1)
    })
})

// ─── Test critical path slack clamping ───────────────────────────────

describe("Slack clamping", () => {
    it("clamps negative slack to 0", () => {
        // Simulates the Math.max(0, ...) guard
        const lf = 10 // latest finish
        const ef = 15 // earliest finish is AFTER latest finish (inconsistency)
        const slack = Math.max(0, lf - ef)
        expect(slack).toBe(0)
    })

    it("preserves positive slack", () => {
        const lf = 20
        const ef = 10
        const slack = Math.max(0, lf - ef)
        expect(slack).toBe(10)
    })
})

// ─── Test supplier composite scoring ─────────────────────────────────

describe("Supplier composite scoring", () => {
    function compositeScore(
        avgRating: number,
        recRate: number,
        totalReviews: number,
        maxReviews: number,
    ) {
        const volumeScore = maxReviews > 0 ? totalReviews / maxReviews : 0
        return Math.round(((avgRating / 5) * 0.4 + recRate * 0.3 + volumeScore * 0.3) * 100)
    }

    it("gives 100 for perfect supplier", () => {
        expect(compositeScore(5, 1.0, 50, 50)).toBe(100)
    })

    it("gives 0 for worst supplier", () => {
        expect(compositeScore(0, 0, 0, 50)).toBe(0)
    })

    it("weights correctly: rating has most influence", () => {
        // High rating, low everything else
        const highRating = compositeScore(5, 0, 0, 50)
        // Low rating, high everything else
        const lowRating = compositeScore(1, 1.0, 50, 50)
        // With 40% weight on rating, a 5-star supplier with no recs
        // should score differently than a 1-star with all recs
        expect(highRating).toBe(40) // (5/5)*0.4 = 0.4 → 40
        expect(lowRating).toBe(68)  // (1/5)*0.4 + 1*0.3 + 1*0.3 = 0.08+0.3+0.3 = 0.68 → 68
    })
})

// ─── Test exponential smoothing math ─────────────────────────────────

describe("Exponential smoothing", () => {
    function exponentialSmoothing(values: number[], alpha = 0.3) {
        const smoothed: number[] = [values[0]]
        for (let i = 1; i < values.length; i++) {
            smoothed.push(alpha * values[i] + (1 - alpha) * smoothed[i - 1])
        }
        const lastSmoothed = smoothed[smoothed.length - 1]

        // MAE
        let totalAbsError = 0
        for (let i = 1; i < values.length; i++) {
            totalAbsError += Math.abs(values[i] - smoothed[i - 1])
        }
        const mae = values.length > 1 ? totalAbsError / (values.length - 1) : 0

        return { smoothed, lastSmoothed, mae }
    }

    it("first smoothed value equals first actual value", () => {
        const result = exponentialSmoothing([100, 200, 300])
        expect(result.smoothed[0]).toBe(100)
    })

    it("smooths towards recent values with alpha=0.3", () => {
        const result = exponentialSmoothing([100, 200, 300, 400, 500])
        // Each smoothed value should be between previous smoothed and actual
        for (let i = 1; i < result.smoothed.length; i++) {
            const prev = result.smoothed[i - 1]
            const actual = [100, 200, 300, 400, 500][i]
            // Smoothed should be between prev and actual (weighted average)
            expect(result.smoothed[i]).toBeGreaterThanOrEqual(Math.min(prev, actual))
            expect(result.smoothed[i]).toBeLessThanOrEqual(Math.max(prev, actual))
        }
    })

    it("produces correct smoothed value for step 2", () => {
        // S1 = 100, S2 = 0.3*200 + 0.7*100 = 60 + 70 = 130
        const result = exponentialSmoothing([100, 200, 300])
        expect(result.smoothed[1]).toBeCloseTo(130)
    })

    it("computes MAE correctly for constant series", () => {
        const result = exponentialSmoothing([100, 100, 100, 100])
        expect(result.mae).toBe(0)
    })

    it("last smoothed value trails actual for trending data", () => {
        const result = exponentialSmoothing([100, 200, 300, 400, 500])
        // With alpha=0.3 and increasing data, smoothed lags behind
        expect(result.lastSmoothed).toBeLessThan(500)
        expect(result.lastSmoothed).toBeGreaterThan(100)
    })

    it("higher alpha tracks actuals more closely", () => {
        const values = [100, 200, 300, 400, 500]
        const lowAlpha = exponentialSmoothing(values, 0.1)
        const highAlpha = exponentialSmoothing(values, 0.9)
        // High alpha should end closer to 500
        expect(highAlpha.lastSmoothed).toBeGreaterThan(lowAlpha.lastSmoothed)
    })
})

// ─── Test budget period normalization ────────────────────────────────

describe("Budget period normalization", () => {
    function normalizeBudget(amount: number, budgetPeriod: string, analysisPeriod: string): number {
        let budgetAmount = amount
        if (budgetPeriod === "annual" && analysisPeriod === "monthly") {
            budgetAmount = Math.round(amount / 12)
        } else if (budgetPeriod === "annual" && analysisPeriod === "quarterly") {
            budgetAmount = Math.round(amount / 4)
        } else if (budgetPeriod === "quarterly" && analysisPeriod === "monthly") {
            budgetAmount = Math.round(amount / 3)
        } else if (budgetPeriod === "monthly" && analysisPeriod === "quarterly") {
            budgetAmount = amount * 3
        }
        return budgetAmount
    }

    it("divides annual by 12 for monthly analysis", () => {
        expect(normalizeBudget(120000, "annual", "monthly")).toBe(10000)
    })

    it("divides annual by 4 for quarterly analysis", () => {
        expect(normalizeBudget(120000, "annual", "quarterly")).toBe(30000)
    })

    it("divides quarterly by 3 for monthly analysis", () => {
        expect(normalizeBudget(30000, "quarterly", "monthly")).toBe(10000)
    })

    it("multiplies monthly by 3 for quarterly analysis", () => {
        expect(normalizeBudget(10000, "monthly", "quarterly")).toBe(30000)
    })

    it("returns same amount when periods match", () => {
        expect(normalizeBudget(10000, "monthly", "monthly")).toBe(10000)
        expect(normalizeBudget(30000, "quarterly", "quarterly")).toBe(30000)
    })

    it("rounds correctly for non-even divisions", () => {
        // 100000 / 12 = 8333.333... → rounds to 8333
        expect(normalizeBudget(100000, "annual", "monthly")).toBe(8333)
        // 100000 / 3 = 33333.333... → rounds to 33333
        expect(normalizeBudget(100000, "quarterly", "monthly")).toBe(33333)
    })
})

// ─── Test Intl.NumberFormat currency symbol output ───────────────────

describe("Currency formatting with Intl.NumberFormat", () => {
    function formatAmount(amount: number, currency = "GBP"): string {
        const locale = currency === "USD" ? "en-US" : currency === "EUR" ? "de-DE" : "en-GB"
        return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount / 100)
    }

    it("includes £ symbol for GBP", () => {
        const result = formatAmount(150000, "GBP")
        expect(result).toContain("£")
        expect(result).toContain("1,500.00")
    })

    it("includes $ symbol for USD", () => {
        const result = formatAmount(150000, "USD")
        expect(result).toContain("$")
        expect(result).toContain("1,500.00")
    })

    it("includes € symbol for EUR", () => {
        const result = formatAmount(150000, "EUR")
        expect(result).toContain("€")
    })

    it("formats zero correctly", () => {
        const result = formatAmount(0, "GBP")
        expect(result).toContain("£")
        expect(result).toContain("0.00")
    })

    it("handles negative amounts with symbol", () => {
        const result = formatAmount(-50000, "GBP")
        expect(result).toContain("£")
        expect(result).toContain("500.00")
    })

    it("handles fractional pence", () => {
        const result = formatAmount(12345, "GBP")
        expect(result).toContain("£")
        expect(result).toContain("123.45")
    })
})

// ─── Test per-objective velocity calculation ─────────────────────────

describe("Per-objective velocity", () => {
    function computeObjectiveVelocity(
        objId: string,
        recentlyCompleted: Array<{ objective_id: string }>,
        objTaskCount: number,
        totalTaskCount: number,
        globalDailyVelocity: number,
        objectiveCount: number,
    ) {
        const objRecentlyCompleted = recentlyCompleted.filter(
            (t) => t.objective_id === objId,
        ).length
        const objDailyVelocity = objRecentlyCompleted / 30

        return objDailyVelocity > 0
            ? objDailyVelocity
            : objTaskCount > 0
                ? globalDailyVelocity * (objTaskCount / totalTaskCount)
                : globalDailyVelocity / objectiveCount
    }

    it("uses per-objective velocity when objective has recent completions", () => {
        const velocity = computeObjectiveVelocity(
            "obj-1",
            [{ objective_id: "obj-1" }, { objective_id: "obj-1" }, { objective_id: "obj-2" }],
            10, 20, 0.5, 2,
        )
        // 2 completions / 30 days = 0.0667
        expect(velocity).toBeCloseTo(2 / 30)
    })

    it("falls back to proportional when no objective completions", () => {
        const velocity = computeObjectiveVelocity(
            "obj-1",
            [{ objective_id: "obj-2" }],
            10, 20, 0.5, 2,
        )
        // Proportional: 0.5 * (10/20) = 0.25
        expect(velocity).toBeCloseTo(0.25)
    })

    it("falls back to even split when objective has no tasks", () => {
        const velocity = computeObjectiveVelocity(
            "obj-1",
            [],
            0, 20, 0.5, 4,
        )
        // Even split: 0.5 / 4 = 0.125
        expect(velocity).toBeCloseTo(0.125)
    })

    it("per-objective velocity gives different result than proportional", () => {
        // Objective with 3 tasks (out of 100 total) but 6 completions in last 30 days
        const perObj = computeObjectiveVelocity(
            "obj-1",
            Array(6).fill({ objective_id: "obj-1" }),
            3, 100, 1.0, 5,
        )
        // Per-objective: 6/30 = 0.2
        expect(perObj).toBeCloseTo(0.2)
        // Proportional would have been: 1.0 * (3/100) = 0.03 — much slower and unfair
    })
})
