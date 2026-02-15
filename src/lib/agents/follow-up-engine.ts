/**
 * @file follow-up-engine.ts
 *
 * @description Tracks commitments and follow-up items from specialist
 * conversations. When the memory observer detects a 🔄 FOLLOW_UP tag,
 * this engine extracts the commitment details and creates a trackable
 * follow-up item. Background sweeps check for overdue follow-ups and
 * generate in-character reminder notifications.
 *
 * This makes specialists feel like colleagues who remember what was
 * discussed and proactively check back: "Last week you said you'd
 * test the $99/mo tier. How'd that go?"
 *
 * @security Uses admin client for background checks (cron context).
 * All data is scoped to foundry via RLS.
 *
 * @related
 * - Observer: src/lib/agent-memory/observer.ts (detects 🔄 FOLLOW_UP)
 * - Sweep notifications: src/lib/agents/sweep-notifications.ts
 * - Specialist definitions: src/app/(platform)/agents/specialists-data.ts
 */

import { getSpecialistById, SPECIALISTS } from "@/app/(platform)/agents/specialists-data"
import type { SpecialistId } from "@/app/(platform)/agents/specialists-data"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FollowUpItem {
    /** Which specialist the commitment was made to */
    specialistId: string
    /** What the founder committed to doing */
    commitment: string
    /** When the follow-up should happen (ISO date string) */
    followUpDate: string
    /** Original conversation context (truncated) */
    context: string
    /** Whether this follow-up has been addressed */
    resolved: boolean
}

// ─── Follow-Up Extraction ───────────────────────────────────────────────────

/**
 * Extracts follow-up items from observation text.
 *
 * @description Scans the observer output for 🔄 FOLLOW_UP tagged entries
 * and parses them into structured follow-up items. These are stored in
 * the specialist's memory thread metadata for later retrieval.
 *
 * @param observationText - The observer's compressed output
 * @param specialistId - Which specialist's conversation this was
 * @returns Array of extracted follow-up items
 */
export function extractFollowUps(
    observationText: string,
    specialistId: string,
): FollowUpItem[] {
    if (!observationText) return []

    const followUps: FollowUpItem[] = []

    // Match 🔄 tagged entries: "🔄 (HH:MM) FOLLOW_UP: [text]"
    const pattern = /🔄\s*\(?\d{1,2}:\d{2}\)?\s*FOLLOW_UP:\s*(.+)/gi
    let match: RegExpExecArray | null

    while ((match = pattern.exec(observationText)) !== null) {
        const text = match[1].trim()

        // Try to extract a date reference
        const dateMatch = text.match(/by\s+(\w+\s+\d{1,2})/i)
            ?? text.match(/in\s+(\d+)\s+(day|week|month)/i)
            ?? text.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month)/i)

        // Estimate follow-up date (default: 7 days from now)
        const followUpDate = new Date()
        const daysRef = text.match(/in\s+(\d+)\s+day/i)
        const weeksRef = text.match(/in\s+(\d+)\s+week/i)
        if (daysRef) {
            followUpDate.setDate(followUpDate.getDate() + parseInt(daysRef[1], 10))
        } else if (weeksRef) {
            followUpDate.setDate(followUpDate.getDate() + parseInt(weeksRef[1], 10) * 7)
        } else {
            // Default: follow up in 7 days
            followUpDate.setDate(followUpDate.getDate() + 7)
        }

        followUps.push({
            specialistId,
            commitment: text,
            followUpDate: followUpDate.toISOString(),
            context: text.slice(0, 200),
            resolved: false,
        })
    }

    return followUps
}

// ─── In-Character Follow-Up Messages ────────────────────────────────────────

/**
 * Generates an in-character follow-up message from a specialist about
 * an overdue commitment.
 *
 * @description Each specialist has their own way of following up.
 * Sam is direct, Eli asks about the numbers, Nate asks about pipeline
 * results. This makes follow-ups feel like a real colleague checking in.
 *
 * @param specialistId - Which specialist is following up
 * @param commitment - What the founder committed to
 * @param daysSince - How many days since the commitment was made
 * @returns In-character follow-up message
 */
export function generateFollowUpMessage(
    specialistId: string,
    commitment: string,
    daysSince: number,
): string {
    const specialist = getSpecialistById(specialistId)
    if (!specialist) {
        return `Quick check-in: you mentioned "${commitment.slice(0, 100)}" about ${daysSince} days ago. Any update?`
    }

    // Specialist-specific follow-up styles
    const followUpStyles: Record<string, (c: string, d: number) => string> = {
        strategist: (c, d) =>
            `We discussed this ${d} days ago: "${c.slice(0, 80)}..." — have you had a chance to move on it? I've been thinking about it and have some additional perspective.`,
        cto: (c, d) =>
            `${d} days since we talked about "${c.slice(0, 80)}..." — did you ship it? If not, what's blocking it? Let's simplify.`,
        "vp-engineering": (c, d) =>
            `Checking in on "${c.slice(0, 80)}..." from ${d} days ago. Where does this sit in the sprint? Let me know if we need to re-prioritize.`,
        "vp-manufacturing": (c, d) =>
            `Following up on "${c.slice(0, 80)}..." — it's been ${d} days. Where are we on the production side? Any supplier updates?`,
        "vp-supply-chain": (c, d) =>
            `Quick supply chain check: "${c.slice(0, 80)}..." — it's been ${d} days. Lead times don't wait. What's the status?`,
        "product-lead": (c, d) =>
            `Circling back on "${c.slice(0, 80)}..." from ${d} days ago. Did you get user feedback? I'd love to hear what you learned.`,
        "growth-marketer": (c, d) =>
            `Hey — "${c.slice(0, 80)}..." was ${d} days ago. Did you run it? If you got any data, I want to see the numbers and iterate.`,
        "sales-lead": (c, d) =>
            `${d} days ago you said you'd "${c.slice(0, 80)}..." — how'd it land? I've got 2 tweaks that could improve the conversion.`,
        "chief-of-staff": (c, d) =>
            `I want to make sure this doesn't slip: "${c.slice(0, 80)}..." — it's been ${d} days. Still on track, or do we need to reprioritize?`,
        "finance-lead": (c, d) =>
            `Following up on the financial side: "${c.slice(0, 80)}..." — ${d} days in. Do we have numbers yet? The model needs updating.`,
        "fundraising-advisor": (c, d) =>
            `Investor timing matters — "${c.slice(0, 80)}..." was ${d} days ago. Where do we stand? The market won't wait.`,
        "hiring-team": (c, d) =>
            `Checking in on the people front: "${c.slice(0, 80)}..." — good candidates move fast, and it's been ${d} days. Any progress?`,
        "legal-counsel": (c, d) =>
            `Legal follow-up: "${c.slice(0, 80)}..." — it's been ${d} days. Time-sensitive legal items don't age well. What's the status?`,
    }

    const generator = followUpStyles[specialistId]
    if (generator) {
        return generator(commitment, daysSince)
    }

    return `Following up on what we discussed ${daysSince} days ago: "${commitment.slice(0, 100)}..." — any update?`
}

/**
 * Checks a list of follow-up items and returns those that are overdue.
 *
 * @param followUps - Array of follow-up items to check
 * @param now - Current date (optional override for testing)
 * @returns Array of overdue follow-up items
 */
export function getOverdueFollowUps(
    followUps: FollowUpItem[],
    now?: Date,
): FollowUpItem[] {
    const currentDate = now ?? new Date()
    return followUps.filter((item) => {
        if (item.resolved) return false
        const dueDate = new Date(item.followUpDate)
        return dueDate <= currentDate
    })
}
