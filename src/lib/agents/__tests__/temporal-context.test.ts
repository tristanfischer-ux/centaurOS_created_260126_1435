/**
 * @file temporal-context.test.ts
 *
 * @description Tests for the temporal awareness module.
 * Verifies time-of-day, day-of-week, and quarter classification,
 * milestone detection, and behavioral guidance generation.
 */

import { buildTemporalContext, compileTemporalPrompt } from '../temporal-context'

describe('buildTemporalContext', () => {
    // ─── Time of Day ─────────────────────────────────────────────────────
    describe('time of day classification', () => {
        it('classifies 6am as early-morning', () => {
            const date = new Date(2026, 1, 15, 6, 0) // Feb 15, 6:00 AM
            const ctx = buildTemporalContext(date)
            expect(ctx.timeOfDay).toBe('early-morning')
        })

        it('classifies 10am as morning', () => {
            const date = new Date(2026, 1, 15, 10, 0) // Feb 15, 10:00 AM
            const ctx = buildTemporalContext(date)
            expect(ctx.timeOfDay).toBe('morning')
        })

        it('classifies 2pm as afternoon', () => {
            const date = new Date(2026, 1, 15, 14, 0) // Feb 15, 2:00 PM
            const ctx = buildTemporalContext(date)
            expect(ctx.timeOfDay).toBe('afternoon')
        })

        it('classifies 8pm as evening', () => {
            const date = new Date(2026, 1, 15, 20, 0) // Feb 15, 8:00 PM
            const ctx = buildTemporalContext(date)
            expect(ctx.timeOfDay).toBe('evening')
        })

        it('classifies 11pm as late-night', () => {
            const date = new Date(2026, 1, 15, 23, 0) // Feb 15, 11:00 PM
            const ctx = buildTemporalContext(date)
            expect(ctx.timeOfDay).toBe('late-night')
        })

        it('classifies 2am as late-night', () => {
            const date = new Date(2026, 1, 15, 2, 0) // Feb 15, 2:00 AM
            const ctx = buildTemporalContext(date)
            expect(ctx.timeOfDay).toBe('late-night')
        })
    })

    // ─── Day of Week ─────────────────────────────────────────────────────
    describe('day of week classification', () => {
        it('classifies Monday as monday', () => {
            const date = new Date(2026, 1, 16, 10, 0) // Feb 16 2026 is Monday
            const ctx = buildTemporalContext(date)
            expect(ctx.dayContext).toBe('monday')
        })

        it('classifies Wednesday as midweek', () => {
            const date = new Date(2026, 1, 18, 10, 0) // Feb 18 2026 is Wednesday
            const ctx = buildTemporalContext(date)
            expect(ctx.dayContext).toBe('midweek')
        })

        it('classifies Friday as friday', () => {
            const date = new Date(2026, 1, 20, 10, 0) // Feb 20 2026 is Friday
            const ctx = buildTemporalContext(date)
            expect(ctx.dayContext).toBe('friday')
        })

        it('classifies Saturday as weekend', () => {
            const date = new Date(2026, 1, 21, 10, 0) // Feb 21 2026 is Saturday
            const ctx = buildTemporalContext(date)
            expect(ctx.dayContext).toBe('weekend')
        })

        it('classifies Sunday as weekend', () => {
            const date = new Date(2026, 1, 15, 10, 0) // Feb 15 2026 is Sunday
            const ctx = buildTemporalContext(date)
            expect(ctx.dayContext).toBe('weekend')
        })
    })

    // ─── Quarter Position ────────────────────────────────────────────────
    describe('quarter position classification', () => {
        it('classifies early January as start of quarter', () => {
            const date = new Date(2026, 0, 10, 10, 0) // Jan 10
            const ctx = buildTemporalContext(date)
            expect(ctx.quarterPosition).toBe('start')
        })

        it('classifies mid-February as middle of quarter', () => {
            const date = new Date(2026, 1, 15, 10, 0) // Feb 15
            const ctx = buildTemporalContext(date)
            expect(ctx.quarterPosition).toBe('middle')
        })

        it('classifies late March as end of quarter', () => {
            const date = new Date(2026, 2, 25, 10, 0) // Mar 25
            const ctx = buildTemporalContext(date)
            expect(ctx.quarterPosition).toBe('end')
        })
    })

    // ─── Behavioral Guidance ─────────────────────────────────────────────
    describe('behavioral guidance', () => {
        it('includes late-night guidance for 11pm', () => {
            const date = new Date(2026, 1, 15, 23, 0)
            const ctx = buildTemporalContext(date)
            expect(ctx.behavioralGuidance).toContain('late')
        })

        it('includes Monday energy for Monday morning', () => {
            const date = new Date(2026, 1, 16, 9, 0) // Monday 9am
            const ctx = buildTemporalContext(date)
            expect(ctx.behavioralGuidance).toContain('Monday')
        })

        it('includes weekend awareness for Saturday', () => {
            const date = new Date(2026, 1, 21, 14, 0) // Saturday 2pm
            const ctx = buildTemporalContext(date)
            expect(ctx.behavioralGuidance).toContain('weekend')
        })

        it('includes end-of-quarter urgency for late March', () => {
            const date = new Date(2026, 2, 28, 10, 0) // Mar 28
            const ctx = buildTemporalContext(date)
            expect(ctx.behavioralGuidance).toContain('quarter')
        })
    })
})

describe('compileTemporalPrompt', () => {
    it('returns prompt block with temporal awareness header', () => {
        const result = compileTemporalPrompt()
        expect(result).toContain('## Temporal Awareness')
    })

    it('includes formatted date', () => {
        const date = new Date(2026, 1, 15, 10, 0)
        const ctx = buildTemporalContext(date)
        const result = compileTemporalPrompt(ctx)
        expect(result).toContain('2026')
    })

    // ─── Milestone Awareness ─────────────────────────────────────────────
    describe('milestone awareness', () => {
        it('detects first week for a brand-new foundry', () => {
            const now = new Date(2026, 1, 15)
            const created = new Date(2026, 1, 12) // 3 days ago
            const result = compileTemporalPrompt(buildTemporalContext(now), created.toISOString())
            expect(result).toContain('first week')
        })

        it('detects 1-month anniversary', () => {
            const now = new Date(2026, 1, 15)
            const created = new Date(2026, 0, 15) // exactly 31 days ago
            const result = compileTemporalPrompt(buildTemporalContext(now), created.toISOString())
            expect(result).toContain('month')
        })

        it('detects 6-month anniversary', () => {
            const now = new Date(2026, 7, 15)
            const created = new Date(2026, 1, 15) // ~182 days ago
            const result = compileTemporalPrompt(buildTemporalContext(now), created.toISOString())
            expect(result).toContain('6')
        })

        it('returns no milestone note for arbitrary dates', () => {
            const now = new Date(2026, 1, 15)
            const created = new Date(2025, 8, 1) // ~167 days ago, no milestone
            const result = compileTemporalPrompt(buildTemporalContext(now), created.toISOString())
            // Should NOT contain milestone keywords for non-milestone dates
            expect(result).not.toContain('first week')
            expect(result).not.toContain('anniversary')
        })

        it('works without foundryCreatedAt', () => {
            const result = compileTemporalPrompt(undefined, null)
            expect(result).toContain('## Temporal Awareness')
            expect(result).not.toContain('first week')
        })
    })
})
