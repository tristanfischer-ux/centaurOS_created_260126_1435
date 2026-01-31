/**
 * Feature Registry - Tracks all features, their release dates, and visibility status
 * 
 * This is the single source of truth for:
 * - What features exist in the platform
 * - When they were added
 * - Whether they should show a "New" badge
 * - Whether they are visible in navigation or hidden
 */

export interface Feature {
    id: string
    name: string
    description: string
    route?: string // The route/URL for this feature (if applicable)
    releasedAt: Date
    category: FeatureCategory
    status: FeatureStatus
    isVisibleInNav: boolean // Whether this feature appears in main navigation
    changelog?: string // Detailed changelog entry
}

export type FeatureCategory = 
    | 'core'           // Core platform features (tasks, objectives, etc.)
    | 'marketplace'    // Marketplace features
    | 'integration'    // Third-party integrations
    | 'admin'          // Admin panel features
    | 'analytics'      // Analytics and reporting
    | 'communication'  // Messaging, notifications, etc.
    | 'provider'       // Provider-specific features
    | 'buyer'          // Buyer-specific features
    | 'strategic'      // Strategic planning features

export type FeatureStatus = 
    | 'stable'         // Production-ready, fully tested
    | 'beta'           // Available but still being refined
    | 'alpha'          // Early access, may have issues
    | 'hidden'         // Coded but intentionally hidden from UI
    | 'deprecated'     // Being phased out

// How long a feature should be considered "new" (in days)
export const NEW_FEATURE_THRESHOLD_DAYS = 14

/**
 * Master feature registry - Add new features here
 * Features are sorted by release date (newest first) in the changelog
 */
export const FEATURE_REGISTRY: Feature[] = [
    // === January 2026 Features ===
    {
        id: 'telegram-bot',
        name: 'Telegram Bot Integration',
        description: 'Create objectives and tasks directly from Telegram using voice or text messages',
        route: '/settings',
        releasedAt: new Date('2026-01-31'),
        category: 'integration',
        status: 'stable',
        isVisibleInNav: true,
        changelog: 'Added Telegram bot integration. Link your Telegram account in Settings to create objectives via voice or text messages. AI-powered parsing automatically structures your input into objectives with tasks, dates, and assignees.'
    },
    {
        id: 'extended-descriptions',
        name: 'Extended Objective Descriptions',
        description: 'Rich markdown descriptions for objectives with detailed context and planning',
        route: '/objectives',
        releasedAt: new Date('2026-01-31'),
        category: 'core',
        status: 'stable',
        isVisibleInNav: true,
        changelog: 'Objectives now support extended descriptions with markdown formatting. Add detailed context, acceptance criteria, and planning notes to your strategic goals.'
    },
    {
        id: 'security-hardening',
        name: 'Security Hardening',
        description: 'Enhanced security measures including rate limiting and audit logging',
        releasedAt: new Date('2026-01-31'),
        category: 'admin',
        status: 'stable',
        isVisibleInNav: false,
        changelog: 'Applied security hardening across the platform including improved rate limiting, secure webhook handling, and enhanced audit logging.'
    },
    {
        id: 'retainers',
        name: 'Retainer Management',
        description: 'Manage ongoing service retainers with providers',
        route: '/retainers',
        releasedAt: new Date('2026-01-25'),
        category: 'marketplace',
        status: 'stable',
        isVisibleInNav: true,
        changelog: 'Added retainer management for ongoing service relationships. Track hours, manage timesheets, and handle recurring payments with your service providers.'
    },
    {
        id: 'advisory',
        name: 'Advisory & Q&A',
        description: 'Ask questions and get expert guidance from the community',
        route: '/advisory',
        releasedAt: new Date('2026-01-20'),
        category: 'communication',
        status: 'stable',
        isVisibleInNav: true,
        changelog: 'Introduced the Advisory section for community Q&A. Post questions, get expert answers, and share knowledge with other centaurs.'
    },
    {
        id: 'apprenticeship',
        name: 'Apprenticeship Program',
        description: 'On-the-job training tracking and apprentice management',
        route: '/apprenticeship',
        releasedAt: new Date('2026-01-15'),
        category: 'core',
        status: 'stable',
        isVisibleInNav: true,
        changelog: 'Launched the Apprenticeship program for tracking on-the-job training. Manage apprentice progress, competencies, and milestones.'
    },
    {
        id: 'org-blueprint',
        name: 'Org Blueprint',
        description: 'Business function coverage and gap analysis',
        route: '/org-blueprint',
        releasedAt: new Date('2026-01-10'),
        category: 'strategic',
        status: 'stable',
        isVisibleInNav: true,
        changelog: 'Added Org Blueprint for visualizing business function coverage. Identify gaps in your organization and find the right resources to fill them.'
    },
    {
        id: 'timeline',
        name: 'Timeline / Gantt View',
        description: 'Gantt chart visualization of tasks and objectives',
        route: '/timeline',
        releasedAt: new Date('2026-01-05'),
        category: 'core',
        status: 'stable',
        isVisibleInNav: true,
        changelog: 'Added timeline view with Gantt chart visualization. See all your tasks and objectives plotted over time with dependencies and milestones.'
    },
    
    // === Hidden/Undiscovered Features ===
    {
        id: 'admin-analytics',
        name: 'Platform Analytics',
        description: 'Advanced analytics dashboard for platform administrators',
        route: '/admin/analytics',
        releasedAt: new Date('2026-01-15'),
        category: 'admin',
        status: 'hidden',
        isVisibleInNav: false,
        changelog: 'Platform analytics dashboard with user engagement metrics, revenue tracking, and growth trends.'
    },
    {
        id: 'admin-gdpr',
        name: 'GDPR Request Management',
        description: 'Handle data export and deletion requests for GDPR compliance',
        route: '/admin/gdpr',
        releasedAt: new Date('2026-01-10'),
        category: 'admin',
        status: 'hidden',
        isVisibleInNav: false,
        changelog: 'GDPR compliance tools for handling data subject access requests (DSARs), data exports, and right-to-be-forgotten requests.'
    },
    {
        id: 'admin-migration',
        name: 'User Migration Tools',
        description: 'Tools for migrating users from legacy systems',
        route: '/admin/migration',
        releasedAt: new Date('2026-01-10'),
        category: 'admin',
        status: 'hidden',
        isVisibleInNav: false,
        changelog: 'Migration tools for onboarding users from external systems with data import and account linking.'
    },
    {
        id: 'admin-settings',
        name: 'Admin Settings',
        description: 'Platform-wide configuration and settings',
        route: '/admin/settings',
        releasedAt: new Date('2026-01-05'),
        category: 'admin',
        status: 'hidden',
        isVisibleInNav: false,
        changelog: 'Admin configuration panel for platform-wide settings, feature flags, and system configuration.'
    },
    {
        id: 'buyer-dashboard',
        name: 'Buyer Dashboard',
        description: 'Dedicated dashboard for marketplace buyers',
        route: '/buyer',
        releasedAt: new Date('2026-01-10'),
        category: 'buyer',
        status: 'hidden',
        isVisibleInNav: false,
        changelog: 'Buyer-focused dashboard showing active orders, spending analytics, and recommended providers.'
    },
    {
        id: 'buyer-analytics',
        name: 'Buyer Analytics',
        description: 'Analytics and insights for marketplace buyers',
        route: '/buyer/analytics',
        releasedAt: new Date('2026-01-10'),
        category: 'buyer',
        status: 'hidden',
        isVisibleInNav: false,
        changelog: 'Analytics dashboard for buyers showing spending trends, provider performance, and ROI metrics.'
    },
    {
        id: 'orders-management',
        name: 'Orders Management',
        description: 'View and manage marketplace orders',
        route: '/my-orders',
        releasedAt: new Date('2026-01-10'),
        category: 'marketplace',
        status: 'hidden',
        isVisibleInNav: false,
        changelog: 'Orders management page for viewing order history, tracking active orders, and managing deliverables.'
    },
    {
        id: 'provider-portal',
        name: 'Provider Portal',
        description: 'Dashboard for marketplace service providers',
        route: '/provider-portal',
        releasedAt: new Date('2026-01-01'),
        category: 'provider',
        status: 'stable',
        isVisibleInNav: false, // Has its own layout, accessed from marketplace
        changelog: 'Full-featured provider portal for managing listings, orders, availability, and earnings.'
    },
    
    // === December 2025 (Foundational) ===
    {
        id: 'marketplace',
        name: 'Marketplace',
        description: 'Browse and hire vetted service providers',
        route: '/marketplace',
        releasedAt: new Date('2025-12-20'),
        category: 'marketplace',
        status: 'stable',
        isVisibleInNav: true,
        changelog: 'Launched the Centaur Marketplace. Browse, compare, and hire vetted service providers with AI-powered matching.'
    },
    {
        id: 'objectives',
        name: 'Objectives',
        description: 'Set and track high-level strategic goals',
        route: '/objectives',
        releasedAt: new Date('2025-12-15'),
        category: 'core',
        status: 'stable',
        isVisibleInNav: true,
        changelog: 'OKR-style objectives with progress tracking, task linking, and team alignment.'
    },
    {
        id: 'tasks',
        name: 'Tasks',
        description: 'Manage and assign actionable work items',
        route: '/tasks',
        releasedAt: new Date('2025-12-10'),
        category: 'core',
        status: 'stable',
        isVisibleInNav: true,
        changelog: 'Task management with assignments, priorities, due dates, and threaded discussions.'
    },
    {
        id: 'team',
        name: 'Team',
        description: 'Manage team members and roles',
        route: '/team',
        releasedAt: new Date('2025-12-10'),
        category: 'core',
        status: 'stable',
        isVisibleInNav: true,
        changelog: 'Team directory with role management, capacity tracking, and skill tagging.'
    },
    {
        id: 'today',
        name: 'Today View',
        description: 'Daily focus dashboard with AI-powered briefing',
        route: '/today',
        releasedAt: new Date('2025-12-05'),
        category: 'core',
        status: 'stable',
        isVisibleInNav: true,
        changelog: 'Daily focus view with AI-generated briefings, action items, and schedule overview.'
    },
]

/**
 * Check if a feature should display a "New" badge
 */
export function isFeatureNew(feature: Feature): boolean {
    const now = new Date()
    const daysSinceRelease = (now.getTime() - feature.releasedAt.getTime()) / (1000 * 60 * 60 * 24)
    return daysSinceRelease <= NEW_FEATURE_THRESHOLD_DAYS && feature.status !== 'hidden'
}

/**
 * Check if a route should display a "New" badge
 */
export function isRouteNew(route: string): boolean {
    const feature = FEATURE_REGISTRY.find(f => f.route === route)
    return feature ? isFeatureNew(feature) : false
}

/**
 * Get feature by route
 */
export function getFeatureByRoute(route: string): Feature | undefined {
    return FEATURE_REGISTRY.find(f => f.route === route)
}

/**
 * Get feature by ID
 */
export function getFeatureById(id: string): Feature | undefined {
    return FEATURE_REGISTRY.find(f => f.id === id)
}

/**
 * Get all new features (for changelog/about page)
 */
export function getNewFeatures(): Feature[] {
    return FEATURE_REGISTRY.filter(f => isFeatureNew(f))
}

/**
 * Get all hidden features
 */
export function getHiddenFeatures(): Feature[] {
    return FEATURE_REGISTRY.filter(f => f.status === 'hidden' || !f.isVisibleInNav)
}

/**
 * Get features by category
 */
export function getFeaturesByCategory(category: FeatureCategory): Feature[] {
    return FEATURE_REGISTRY.filter(f => f.category === category)
}

/**
 * Get features sorted by release date (newest first)
 */
export function getFeaturesByReleaseDate(): Feature[] {
    return [...FEATURE_REGISTRY].sort((a, b) => b.releasedAt.getTime() - a.releasedAt.getTime())
}

/**
 * Get all visible features (in navigation)
 */
export function getVisibleFeatures(): Feature[] {
    return FEATURE_REGISTRY.filter(f => f.isVisibleInNav && f.status !== 'hidden')
}

/**
 * Format release date for display
 */
export function formatReleaseDate(date: Date): string {
    return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    })
}
