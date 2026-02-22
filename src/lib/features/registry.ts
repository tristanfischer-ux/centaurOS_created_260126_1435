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
    section?: FeatureSection // Which sidebar section this feature belongs to
    status: FeatureStatus
    isVisibleInNav: boolean // Whether this feature appears in main navigation
    changelog?: string // Detailed changelog entry
}

export type FeatureSection =
    | 'me'           // Personal pages (My Profile, Updates)
    | 'plan'         // Strategy, Objectives, Tasks
    | 'workshop'     // The Forge, Team, Agents
    | 'marketplace'  // Guild, Apprenticeship, Inspiration, Marketplace, Orders

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
    // === February 2026 Features (Week of Feb 17-20) ===
    {
        id: 'reports',
        name: 'Reports',
        description: 'Generate board packs, investor updates, and branded reports with AI narratives and one-click export',
        route: '/reports',
        releasedAt: new Date('2026-02-20'),
        category: 'analytics',
        section: 'plan',
        status: 'beta',
        isVisibleInNav: true,
        changelog: 'Added Reports — generate professional board packs, investor updates, and custom reports. Features AI-written narratives, infographic view mode, PPTX and DOCX export, scheduled generation, shareable links, and email delivery.'
    },
    {
        id: 'business-plan-intelligence',
        name: 'Business Plan Intelligence',
        description: 'Upload your business plan and get AI analysis with hiring insights and funding readiness',
        route: '/strategy',
        releasedAt: new Date('2026-02-20'),
        category: 'strategic',
        section: 'plan',
        status: 'stable',
        isVisibleInNav: true,
        changelog: 'Added Business Plan Intelligence — upload your business plan and receive detailed AI analysis covering strengths, risks, hiring recommendations, and funding readiness. Powered by Claude Opus 4.6 with deep strategic reasoning.'
    },
    {
        id: 'marketplace-ai-search',
        name: 'Marketplace AI Search',
        description: 'Find the right suppliers and services using natural language — AI interprets what you need',
        route: '/marketplace',
        releasedAt: new Date('2026-02-19'),
        category: 'marketplace',
        section: 'marketplace',
        status: 'stable',
        isVisibleInNav: true,
        changelog: 'Upgraded Marketplace search with AI-powered interpretation. Describe what you need in plain language and the system understands intent, applies smart filters, and falls back to semantic matching. Server-side search with pagination for fast results at any scale.'
    },
    {
        id: 'comms',
        name: 'Comms',
        description: 'Unified communications hub combining your activity feed with direct conversations',
        route: '/updates',
        releasedAt: new Date('2026-02-19'),
        category: 'communication',
        section: 'me',
        status: 'stable',
        isVisibleInNav: true,
        changelog: 'Updates is now Comms — a unified communications hub that merges your activity feed with direct conversations. One place for notes, comments, changes, and messages across all your work.'
    },
    {
        id: 'task-discussions',
        name: 'Task Discussion Threads',
        description: 'Threaded conversations directly inside each task for focused collaboration',
        route: '/new-tasks',
        releasedAt: new Date('2026-02-19'),
        category: 'core',
        section: 'plan',
        status: 'stable',
        isVisibleInNav: true,
        changelog: 'Added discussion threads to task details. Start a conversation, tag teammates, and keep all decisions and context attached to the task itself.'
    },
    {
        id: 'google-apps',
        name: 'Google Apps',
        description: 'Access Google Drive, Docs, and Calendar from inside ForgeOS',
        route: '/google-apps',
        releasedAt: new Date('2026-02-17'),
        category: 'integration',
        section: 'me',
        status: 'stable',
        isVisibleInNav: true,
        changelog: 'Added Google Apps integration — browse Google Drive files, open Google Docs, and view your Google Calendar without leaving ForgeOS. Available in the Me section of the sidebar.'
    },
    {
        id: 'expert-directory',
        name: 'Expert Directory',
        description: 'Public directory of vetted experts — searchable, shareable, and SEO-indexed',
        route: '/experts',
        releasedAt: new Date('2026-02-17'),
        category: 'marketplace',
        status: 'stable',
        isVisibleInNav: false,
        changelog: 'Launched the public Expert Directory at /experts — browse profiles of vetted professionals with detailed bios and specialisations. Each expert has a shareable profile page, and the directory is SEO-indexed for discoverability.'
    },
    {
        id: 'knowledge-vault',
        name: 'Knowledge Vault',
        description: 'Upload documents and let AI extract insights that feed into your specialists and strategy',
        route: '/knowledge',
        releasedAt: new Date('2026-02-16'),
        category: 'core',
        section: 'me',
        status: 'stable',
        isVisibleInNav: true,
        changelog: 'Added Knowledge Vault — upload business documents (pitch decks, reports, research) and AI automatically extracts key insights. Your knowledge feeds directly into specialist conversations and strategic analysis, making your AI team smarter with every document.'
    },
    {
        id: 'specialist-intelligence-upgrade',
        name: 'Specialist AI Upgrade',
        description: 'Your AI specialists now have personality, memory, voice conversations, and emotional intelligence',
        route: '/agents',
        releasedAt: new Date('2026-02-15'),
        category: 'core',
        section: 'workshop',
        status: 'stable',
        isVisibleInNav: true,
        changelog: 'Major upgrade to AI Specialists — each specialist now has a distinct personality, persistent memory across conversations, bidirectional voice chat, emotional intelligence, and cross-specialist awareness. They remember what you discussed last time and build on it.'
    },
    // === February 2026 Features (Week of Feb 7-11) ===
    {
        id: 'the-forge',
        name: 'The Forge',
        description: 'Transform an idea into a complete engineering dossier with architecture diagrams, module breakdowns, and risk analysis',
        route: '/the-forge',
        releasedAt: new Date('2026-02-11'),
        category: 'core',
        section: 'workshop',
        status: 'beta',
        isVisibleInNav: true,
        changelog: 'The Forge — AI-powered product decomposition that transforms an idea into a complete engineering dossier with architecture diagrams, module breakdowns, risk analysis, component libraries, and assembly builders.'
    },
    {
        id: 'canvas',
        name: 'Strategy',
        description: 'Strategy flow visualization, timeline, and visual map of strategic goals',
        route: '/strategy',
        releasedAt: new Date('2026-02-09'),
        category: 'strategic',
        section: 'plan',
        status: 'stable',
        isVisibleInNav: true,
        changelog: 'Added Strategy — a visual workspace for mapping out your goals with flow visualization, timeline, and working backwards from deadlines. Plot objectives and tasks on an interactive timeline with drag-and-drop positioning.'
    },
    {
        id: 'financial-tools',
        name: 'Financial Tools',
        description: 'Money Map and Cost of Delay calculators to make smarter financial decisions',
        route: '/tools/financial',
        releasedAt: new Date('2026-02-08'),
        category: 'analytics',
        status: 'stable',
        isVisibleInNav: true,
        changelog: 'Added Financial Tools combining Money Map (visualize money flows in your business) and Cost of Delay (quantify the cost of postponing decisions). Available under the Financial Tools tab in the sidebar.'
    },
    {
        id: 'manufacturing-techniques',
        name: 'Manufacturing Techniques Explorer',
        description: 'Browse 78+ manufacturing techniques with detailed specs, pros/cons, and direct links to find suppliers or start an RFQ',
        route: '/playbooks',
        releasedAt: new Date('2026-02-07'),
        category: 'core',
        status: 'stable',
        isVisibleInNav: true,
        changelog: 'Added Manufacturing Techniques Explorer — an interactive encyclopedia of modern manufacturing processes. Browse by category, filter by cost/batch size/material, and click through to detailed technique info with CTAs to find suppliers or start an RFQ. Available under the Techniques tab in Inspiration.'
    },
    {
        id: 'strategic-planner',
        name: 'Strategic Planner',
        description: 'Set big goals with deadlines and let AI build the full plan with phases and tasks',
        route: '/strategic-planner',
        releasedAt: new Date('2026-02-05'),
        category: 'strategic',
        status: 'stable',
        isVisibleInNav: true,
        changelog: 'Added Strategic Planner — set ambitious goals with target dates and AI generates a structured plan with milestones, phases, and actionable tasks. Track progress with visual indicators and days-remaining counters.'
    },
    {
        id: 'updates-feed',
        name: 'Updates Feed',
        description: 'Centralized activity feed for notes, comments, and changes across all your work',
        route: '/updates',
        releasedAt: new Date('2026-02-03'),
        category: 'communication',
        status: 'stable',
        isVisibleInNav: true,
        changelog: 'Added Updates — a unified activity feed showing notes, comments, and changes across your tasks and objectives. Filter by type, view threaded conversations, and mark items as read.'
    },
    {
        id: 'agents',
        name: 'Prompt Workflows',
        description: 'Build, chain, and save prompt workflows to automate recurring work',
        route: '/agents',
        releasedAt: new Date('2026-02-01'),
        category: 'core',
        status: 'stable',
        isVisibleInNav: true,
        changelog: 'Added Prompt Workflows (Agents) — create custom prompt chains for recurring tasks. Save workflows, manage API keys, and automate repetitive work with AI-powered automation.'
    },
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
        changelog: 'Added Telegram bot integration. Link your Telegram account in Settings to create objectives via voice or text messages. Smart parsing automatically structures your input into objectives with tasks, dates, and assignees.'
    },
    {
        id: 'extended-descriptions',
        name: 'Extended Objective Descriptions',
        description: 'Rich markdown descriptions for objectives with detailed context and planning',
        route: '/new-objectives',
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
        changelog: 'Introduced the Advisory section for community Q&A. Post questions, get expert answers, and share knowledge with other users.'
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
        route: '/ops/analytics',
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
        status: 'stable',
        isVisibleInNav: true,
        changelog: 'Buyer-focused dashboard showing active orders, spending analytics, and recommended providers.'
    },
    {
        id: 'buyer-analytics',
        name: 'Buyer Analytics',
        description: 'Analytics and insights for marketplace buyers',
        route: '/buyer/analytics',
        releasedAt: new Date('2026-01-10'),
        category: 'buyer',
        status: 'stable',
        isVisibleInNav: false,
        changelog: 'Analytics dashboard for buyers showing spending trends, provider performance, and ROI metrics.'
    },
    {
        id: 'orders-management',
        name: 'Marketplace Orders',
        description: 'View and manage marketplace orders',
        route: '/marketplace-orders',
        releasedAt: new Date('2026-01-10'),
        category: 'marketplace',
        status: 'stable',
        isVisibleInNav: true,
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
        changelog: 'Launched the ForgeOS Marketplace. Browse, compare, and hire vetted service providers with intelligent matching.'
    },
    {
        id: 'objectives',
        name: 'Objectives',
        description: 'Set and track high-level strategic goals',
        route: '/new-objectives',
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
        route: '/new-tasks',
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
        id: 'guild',
        name: 'Guild',
        description: 'Apprentice pool browsing, project assignments, and community events',
        route: '/guild',
        releasedAt: new Date('2026-01-15'),
        category: 'core',
        status: 'stable',
        isVisibleInNav: true,
        changelog: 'The Guild connects executives with apprentices. Browse the apprentice pool, assign apprentices to projects, and attend networking events.'
    },
    {
        id: 'today',
        name: 'Today View',
        description: 'Daily focus dashboard with personalized briefing',
        route: '/today',
        releasedAt: new Date('2025-12-05'),
        category: 'core',
        status: 'deprecated',
        isVisibleInNav: false,
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
 * Check if a route's feature is in beta status
 */
export function isRouteBeta(route: string): boolean {
    const feature = FEATURE_REGISTRY.find(f => f.route === route)
    return feature?.status === 'beta'
}

/**
 * Check if a route's feature is in alpha status
 */
export function isRouteAlpha(route: string): boolean {
    const feature = FEATURE_REGISTRY.find(f => f.route === route)
    return feature?.status === 'alpha'
}

/**
 * Get the feature name for a route (used for feedback context)
 */
export function getFeatureNameByRoute(route: string): string | undefined {
    const feature = FEATURE_REGISTRY.find(f => f.route === route)
    return feature?.name
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
 * Get features by sidebar section
 */
export function getFeaturesBySection(section: FeatureSection): Feature[] {
    return FEATURE_REGISTRY.filter(f => f.section === section && f.status !== 'hidden')
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
