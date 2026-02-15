/**
 * @file follow-up-engine.test.ts
 *
 * @description Tests for the follow-up extraction and message generation.
 * Verifies that 🔄 FOLLOW_UP tags are parsed correctly, overdue items
 * are identified, and in-character messages match each specialist.
 */

import {
    extractFollowUps,
    generateFollowUpMessage,
    getOverdueFollowUps,
} from '../follow-up-engine'
import type { FollowUpItem } from '../follow-up-engine'

describe('extractFollowUps', () => {
    it('extracts follow-up items from observation text', () => {
        const text = `Date: 2026-02-15
- 🔴 (10:00) User stated they want to focus on enterprise pricing
- 🔄 (10:15) FOLLOW_UP: User committed to testing $99/mo tier with 20 prospects in 1 week
- 🟡 (10:20) Discussion about competitive landscape`

        const followUps = extractFollowUps(text, 'sales-lead')
        expect(followUps).toHaveLength(1)
        expect(followUps[0].specialistId).toBe('sales-lead')
        expect(followUps[0].commitment).toContain('$99/mo')
        expect(followUps[0].resolved).toBe(false)
    })

    it('extracts multiple follow-ups', () => {
        const text = `Date: 2026-02-15
- 🔄 (09:00) FOLLOW_UP: Founder will review the financial model by Friday
- 🔄 (09:30) FOLLOW_UP: Founder will schedule investor call in 2 weeks`

        const followUps = extractFollowUps(text, 'finance-lead')
        expect(followUps).toHaveLength(2)
    })

    it('returns empty array for text without follow-ups', () => {
        const text = `Date: 2026-02-15
- 🔴 (10:00) User discussed strategy
- 🟡 (10:15) Competitive analysis provided`

        const followUps = extractFollowUps(text, 'strategist')
        expect(followUps).toHaveLength(0)
    })

    it('returns empty array for empty text', () => {
        expect(extractFollowUps('', 'strategist')).toHaveLength(0)
    })

    it('parses "in X days" date references', () => {
        const text = `- 🔄 (10:00) FOLLOW_UP: Will update pricing in 3 days`
        const followUps = extractFollowUps(text, 'sales-lead')
        expect(followUps).toHaveLength(1)

        const dueDate = new Date(followUps[0].followUpDate)
        const now = new Date()
        const diffDays = Math.round((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        expect(diffDays).toBeGreaterThanOrEqual(2)
        expect(diffDays).toBeLessThanOrEqual(4)
    })

    it('parses "in X weeks" date references', () => {
        const text = `- 🔄 (10:00) FOLLOW_UP: Fundraising deck ready in 2 weeks`
        const followUps = extractFollowUps(text, 'fundraising-advisor')
        expect(followUps).toHaveLength(1)

        const dueDate = new Date(followUps[0].followUpDate)
        const now = new Date()
        const diffDays = Math.round((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        expect(diffDays).toBeGreaterThanOrEqual(12)
        expect(diffDays).toBeLessThanOrEqual(16)
    })

    it('defaults to 7 days when no date reference', () => {
        const text = `- 🔄 (10:00) FOLLOW_UP: Will talk to the team about hiring`
        const followUps = extractFollowUps(text, 'hiring-team')
        expect(followUps).toHaveLength(1)

        const dueDate = new Date(followUps[0].followUpDate)
        const now = new Date()
        const diffDays = Math.round((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        expect(diffDays).toBeGreaterThanOrEqual(6)
        expect(diffDays).toBeLessThanOrEqual(8)
    })
})

describe('generateFollowUpMessage', () => {
    it('generates in-character message for strategist', () => {
        const msg = generateFollowUpMessage('strategist', 'review competitive landscape', 7)
        expect(msg).toContain('7 days')
        expect(msg).toContain('competitive landscape')
    })

    it('generates in-character message for sales-lead', () => {
        const msg = generateFollowUpMessage('sales-lead', 'test pricing with 20 prospects', 5)
        expect(msg).toContain('5 days')
        expect(msg).toContain('pricing')
    })

    it('generates in-character message for finance-lead', () => {
        const msg = generateFollowUpMessage('finance-lead', 'update the financial model', 10)
        expect(msg).toContain('10 days')
        expect(msg).toContain('financial')
    })

    it('generates in-character message for cto', () => {
        const msg = generateFollowUpMessage('cto', 'ship the MVP', 3)
        expect(msg).toContain('3 days')
        expect(msg).toContain('ship')
    })

    it('generates generic message for unknown specialist', () => {
        const msg = generateFollowUpMessage('unknown-id', 'do the thing', 5)
        expect(msg).toContain('5 days')
        expect(msg).toContain('do the thing')
    })

    it('truncates long commitments', () => {
        const longCommitment = 'A'.repeat(200)
        const msg = generateFollowUpMessage('strategist', longCommitment, 7)
        expect(msg.length).toBeLessThan(300)
    })
})

describe('getOverdueFollowUps', () => {
    const now = new Date(2026, 1, 15, 12, 0) // Feb 15, noon

    const items: FollowUpItem[] = [
        {
            specialistId: 'sales-lead',
            commitment: 'Test pricing',
            followUpDate: new Date(2026, 1, 10).toISOString(), // 5 days ago — overdue
            context: 'Test pricing',
            resolved: false,
        },
        {
            specialistId: 'strategist',
            commitment: 'Review strategy',
            followUpDate: new Date(2026, 1, 20).toISOString(), // 5 days from now — not due
            context: 'Review strategy',
            resolved: false,
        },
        {
            specialistId: 'finance-lead',
            commitment: 'Update model',
            followUpDate: new Date(2026, 1, 12).toISOString(), // 3 days ago — overdue
            context: 'Update model',
            resolved: true, // but resolved
        },
    ]

    it('returns only overdue, unresolved items', () => {
        const overdue = getOverdueFollowUps(items, now)
        expect(overdue).toHaveLength(1)
        expect(overdue[0].specialistId).toBe('sales-lead')
    })

    it('does not return future items', () => {
        const overdue = getOverdueFollowUps(items, now)
        const ids = overdue.map(i => i.specialistId)
        expect(ids).not.toContain('strategist')
    })

    it('does not return resolved items', () => {
        const overdue = getOverdueFollowUps(items, now)
        const ids = overdue.map(i => i.specialistId)
        expect(ids).not.toContain('finance-lead')
    })

    it('returns empty array when all resolved', () => {
        const resolvedItems = items.map(i => ({ ...i, resolved: true }))
        expect(getOverdueFollowUps(resolvedItems, now)).toHaveLength(0)
    })

    it('returns empty array for empty input', () => {
        expect(getOverdueFollowUps([], now)).toHaveLength(0)
    })
})
