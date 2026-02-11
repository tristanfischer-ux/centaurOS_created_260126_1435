/**
 * @file guild-constants.ts
 *
 * @description Shared constants for Guild event components including
 * event type configuration with icons and badge styles.
 */

import {
    Calendar,
    Zap,
    Presentation,
    GraduationCap,
    Handshake,
} from "lucide-react"

/**
 * Configuration for each event type including display label, icon, and badge styling.
 *
 * @description Used across FeaturedEventHero, EventsSection, and event detail pages
 * to ensure consistent event type presentation.
 */
export const EVENT_TYPE_CONFIG: Record<string, { label: string; icon: typeof Calendar; className: string }> = {
    speed_networking: {
        label: 'Speed Networking',
        icon: Zap,
        className: 'bg-chart-5/10 text-chart-5 border-chart-5/20'
    },
    workshop: {
        label: 'Workshop',
        icon: Presentation,
        className: 'bg-status-info-light text-status-info border-status-info/20'
    },
    career_fair: {
        label: 'Career Fair',
        icon: GraduationCap,
        className: 'bg-status-success-light text-status-success border-status-success/20'
    },
    meetup: {
        label: 'Meetup',
        icon: Handshake,
        className: 'bg-muted text-muted-foreground border'
    },
    summit: {
        label: 'Summit',
        icon: Calendar,
        className: 'bg-status-warning-light text-status-warning-dark border-status-warning/20'
    },
}
