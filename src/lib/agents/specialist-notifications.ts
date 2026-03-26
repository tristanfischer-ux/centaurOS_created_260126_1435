/**
 * @file specialist-notifications.ts
 *
 * @description Transforms generic notifications into specialist-voiced
 * messages. Instead of "Task overdue: Review Q2 financials", Finn says:
 * "The Q2 financials review is overdue. The board meeting is in 3 days —
 * this should be priority #1."
 *
 * @related
 * - Notifications: src/actions/notifications.ts
 * - Specialists: src/app/(platform)/agents/specialists-data.ts
 * - Daily Pulse: src/lib/reports/daily-pulse.ts
 */

import { getSpecialistById } from '@/lib/agents/specialists-config'
import type { SpecialistId } from '@/lib/agents/specialists-config'

// ─── Types ──────────────────────────────────────────────────────────

export interface VoicedNotification {
    /** The specialist who "owns" this notification */
    specialistId: SpecialistId
    /** The specialist's name */
    specialistName: string
    /** The notification message in the specialist's voice */
    message: string
    /** Priority level */
    priority: 'urgent' | 'high' | 'normal' | 'low'
}

// ─── Notification Type to Specialist Mapping ────────────────────────

const NOTIFICATION_SPECIALIST_MAP: Record<string, SpecialistId> = {
    // Task notifications
    'task_assigned': 'chief-of-staff',
    'task_completed': 'chief-of-staff',
    'task_overdue': 'chief-of-staff',
    'task_amended': 'chief-of-staff',

    // Objective notifications
    'objective_at_risk': 'strategist',
    'objective_completed': 'strategist',
    'objective_stalled': 'strategist',

    // Financial notifications
    'runway_warning': 'finance-lead',
    'budget_exceeded': 'finance-lead',
    'payment_received': 'finance-lead',
    'invoice_overdue': 'finance-lead',

    // Team notifications
    'team_capacity_high': 'hiring-team',
    'new_hire_onboarding': 'hiring-team',

    // Legal notifications
    'contract_expiring': 'legal-counsel',
    'compliance_due': 'legal-counsel',

    // Sales notifications
    'deal_won': 'sales-lead',
    'deal_lost': 'sales-lead',
    'pipeline_update': 'sales-lead',

    // Marketing notifications
    'campaign_results': 'growth-marketer',

    // Manufacturing notifications
    'production_issue': 'vp-manufacturing',
    'supplier_delay': 'vp-supply-chain',

    // Product notifications
    'feature_shipped': 'product-lead',
    'user_feedback': 'product-lead',

    // Engineering notifications
    'deployment_failed': 'vp-engineering',
    'velocity_change': 'vp-engineering',

    // CTO notifications
    'architecture_decision': 'cto',
    'tech_debt_flagged': 'cto',
    'security_alert': 'cto',

    // Fundraising notifications
    'funding_milestone': 'fundraising-advisor',
    'investor_meeting': 'fundraising-advisor',
    'pitch_update': 'fundraising-advisor',
}

/**
 * Transforms a generic notification into a specialist-voiced message.
 *
 * @description Maps the notification type to the owning specialist, then
 * builds a message in that specialist's voice using type-specific templates.
 * Falls back to the Chief of Staff for unmapped notification types.
 *
 * @param notificationType - The notification type (e.g. 'task_overdue', 'deal_won')
 * @param title - The notification title or subject
 * @param details - Additional details or context for the notification
 * @returns A voiced notification from the relevant specialist
 */
export function voiceNotification(
    notificationType: string,
    title: string,
    details?: string,
): VoicedNotification {
    const specialistId = NOTIFICATION_SPECIALIST_MAP[notificationType] ?? 'chief-of-staff'
    const specialist = getSpecialistById(specialistId)

    if (!specialist) {
        return {
            specialistId: 'chief-of-staff',
            specialistName: 'Cal',
            message: title,
            priority: 'normal',
        }
    }

    // Build a message in the specialist's voice
    const voicedMessage = buildVoicedMessage(specialist.name, notificationType, title, details)

    return {
        specialistId,
        specialistName: specialist.name,
        message: voicedMessage,
        priority: getPriority(notificationType),
    }
}

/**
 * Builds a notification message in the specialist's voice using
 * type-specific templates.
 */
function buildVoicedMessage(
    name: string,
    type: string,
    title: string,
    details?: string,
): string {
    const detailSuffix = details ? ` ${details}` : ''

    // Type-specific voice templates
    const templates: Record<string, string> = {
        'task_overdue': `${name}: "${title}" is overdue.${detailSuffix} Let's get this back on track.`,
        'task_assigned': `${name}: New task for you — "${title}".${detailSuffix}`,
        'task_completed': `${name}: "${title}" is done. Nice work.${detailSuffix}`,
        'objective_at_risk': `${name}: I'm flagging "${title}" — it's at risk.${detailSuffix} We should talk about this.`,
        'objective_completed': `${name}: "${title}" is complete. That's a real milestone.${detailSuffix}`,
        'objective_stalled': `${name}: "${title}" hasn't moved in a while.${detailSuffix} Want to discuss what's blocking it?`,
        'runway_warning': `${name}: Runway alert — ${title}.${detailSuffix} We need to look at the numbers.`,
        'budget_exceeded': `${name}: Budget exceeded — ${title}.${detailSuffix} Let me show you where the overrun is.`,
        'deal_won': `${name}: CLOSED! ${title}.${detailSuffix} Let's update the pipeline.`,
        'deal_lost': `${name}: We lost "${title}".${detailSuffix} Let's debrief and learn from this.`,
        'production_issue': `${name}: Production alert — ${title}.${detailSuffix} I'm looking into it.`,
        'supplier_delay': `${name}: Supplier delay on "${title}".${detailSuffix} I'm checking backup options.`,
        'contract_expiring': `${name}: Contract expiring — "${title}".${detailSuffix} Let's review before it lapses.`,
        'team_capacity_high': `${name}: Team capacity is high — ${title}.${detailSuffix} We should discuss priorities or hiring.`,
        'architecture_decision': `${name}: Architecture decision needed — "${title}".${detailSuffix} What's the simplest solution that works?`,
        'tech_debt_flagged': `${name}: Tech debt alert — "${title}".${detailSuffix} This is slowing us down. Let's decide: fix now or accept it.`,
        'security_alert': `${name}: Security issue — ${title}.${detailSuffix} This needs attention before we ship anything else.`,
        'funding_milestone': `${name}: Funding milestone — "${title}".${detailSuffix} Let's make sure the narrative is sharp.`,
        'investor_meeting': `${name}: Investor meeting coming up — "${title}".${detailSuffix} Let's prep the story and the numbers.`,
        'pitch_update': `${name}: Pitch materials need updating — "${title}".${detailSuffix} The story has evolved since the last version.`,
    }

    return templates[type] ?? `${name}: ${title}${detailSuffix}`
}

/**
 * Determines notification priority based on type.
 *
 * @param type - The notification type
 * @returns Priority level: urgent, high, normal, or low
 */
function getPriority(type: string): 'urgent' | 'high' | 'normal' | 'low' {
    const urgentTypes = ['runway_warning', 'production_issue', 'deployment_failed', 'security_alert']
    const highTypes = ['task_overdue', 'objective_at_risk', 'budget_exceeded', 'supplier_delay', 'contract_expiring', 'tech_debt_flagged', 'investor_meeting']
    const lowTypes = ['task_completed', 'objective_completed', 'feature_shipped', 'pitch_update']

    if (urgentTypes.includes(type)) return 'urgent'
    if (highTypes.includes(type)) return 'high'
    if (lowTypes.includes(type)) return 'low'
    return 'normal'
}

/**
 * Gets the specialist attribution for a Daily Pulse insight.
 *
 * @description Analyzes the insight content to determine which specialist
 * would naturally own it, then returns an attributed string with the
 * specialist's name prefixed.
 *
 * @param insightType - The type of insight (celebration, warning, suggestion)
 * @param content - The insight content text
 * @returns Object with the specialist ID and the attributed insight string
 */
export function attributeInsight(
    insightType: 'celebration' | 'warning' | 'suggestion',
    content: string,
): { specialistId: SpecialistId; attributed: string } {
    // Determine which specialist would naturally own this insight
    let specialistId: SpecialistId = 'chief-of-staff'

    const lowerContent = content.toLowerCase()
    if (lowerContent.includes('revenue') || lowerContent.includes('runway') || lowerContent.includes('budget')) {
        specialistId = 'finance-lead'
    } else if (lowerContent.includes('hire') || lowerContent.includes('team') || lowerContent.includes('capacity')) {
        specialistId = 'hiring-team'
    } else if (lowerContent.includes('strategy') || lowerContent.includes('competitive') || lowerContent.includes('market')) {
        specialistId = 'strategist'
    } else if (lowerContent.includes('ship') || lowerContent.includes('deploy') || lowerContent.includes('velocity')) {
        specialistId = 'vp-engineering'
    } else if (lowerContent.includes('production') || lowerContent.includes('manufacturing') || lowerContent.includes('factory')) {
        specialistId = 'vp-manufacturing'
    } else if (lowerContent.includes('pipeline') || lowerContent.includes('deal') || lowerContent.includes('sales')) {
        specialistId = 'sales-lead'
    } else if (lowerContent.includes('legal') || lowerContent.includes('contract') || lowerContent.includes('compliance')) {
        specialistId = 'legal-counsel'
    } else if (lowerContent.includes('architecture') || lowerContent.includes('tech debt') || lowerContent.includes('security') || lowerContent.includes('infrastructure')) {
        specialistId = 'cto'
    } else if (lowerContent.includes('fundrais') || lowerContent.includes('investor') || lowerContent.includes('pitch') || lowerContent.includes('raise')) {
        specialistId = 'fundraising-advisor'
    }

    const specialist = getSpecialistById(specialistId)
    const name = specialist?.name ?? 'Cal'

    return {
        specialistId,
        attributed: `${name} flagged: ${content}`,
    }
}
