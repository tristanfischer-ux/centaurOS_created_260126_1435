/**
 * @file types.ts
 *
 * @description Type definitions for the ForgeOS Knowledge Vault — an organizational
 * second brain that accumulates interconnected knowledge from specialist conversations.
 *
 * The vault stores atomic knowledge notes linked by explicit connections, forming
 * a traversable knowledge graph per foundry.
 */

// ─── Note Types ──────────────────────────────────────────────────────

/**
 * The classification of a knowledge note. Determines how it's displayed,
 * prioritized, and queried.
 */
export type KnowledgeNoteType =
  | 'claim'       // A factual assertion about the business or market
  | 'decision'    // A choice that was made (with rationale)
  | 'insight'     // An analytical finding or synthesis
  | 'fact'        // A verified piece of information
  | 'preference'  // A user or organizational preference
  | 'lesson'      // Something learned from experience
  | 'observation' // A pattern or trend noticed

/**
 * Display metadata for note types — icon, label, color token.
 */
export const NOTE_TYPE_META = {
  claim:       { label: 'Claim',       icon: 'quote',           color: 'bg-status-info-light text-status-info-dark' },
  decision:    { label: 'Decision',    icon: 'gavel',           color: 'bg-status-warning-light text-status-warning-dark' },
  insight:     { label: 'Insight',     icon: 'lightbulb',       color: 'bg-chart-5/10 text-chart-5' },
  fact:        { label: 'Fact',        icon: 'check-circle-2',  color: 'bg-status-success-light text-status-success-dark' },
  preference:  { label: 'Preference',  icon: 'heart',           color: 'bg-chart-6/10 text-chart-6' },
  lesson:      { label: 'Lesson',      icon: 'graduation-cap',  color: 'bg-orange-50 text-international-orange' },
  observation: { label: 'Observation', icon: 'eye',             color: 'bg-muted text-muted-foreground' },
} as const satisfies Record<KnowledgeNoteType, { label: string; icon: string; color: string }>

// ─── Link Relationship Types ─────────────────────────────────────────

/**
 * The semantic relationship between two linked knowledge notes.
 */
export type KnowledgeLinkRelationship =
  | 'related'      // Generic connection
  | 'supports'     // Source supports/evidences target
  | 'contradicts'  // Source contradicts target
  | 'extends'      // Source builds on target
  | 'supersedes'   // Source replaces target
  | 'caused_by'    // Source was caused by target
  | 'led_to'       // Source led to target outcome

export const LINK_RELATIONSHIP_META = {
  related:     { label: 'Related to',     icon: 'link' },
  supports:    { label: 'Supports',       icon: 'thumbs-up' },
  contradicts: { label: 'Contradicts',    icon: 'x-circle' },
  extends:     { label: 'Extends',        icon: 'arrow-right' },
  supersedes:  { label: 'Supersedes',     icon: 'replace' },
  caused_by:   { label: 'Caused by',      icon: 'corner-down-left' },
  led_to:      { label: 'Led to',         icon: 'corner-down-right' },
} as const satisfies Record<KnowledgeLinkRelationship, { label: string; icon: string }>

// ─── Discovery Source ────────────────────────────────────────────────

/** How a link between notes was discovered */
export type LinkDiscoverySource = 'system' | 'user' | 'specialist'

// ─── Knowledge Note ──────────────────────────────────────────────────

/** A single atomic knowledge entry in the vault */
export interface KnowledgeNote {
  id: string
  foundry_id: string
  domain_id: string | null

  /** Short, descriptive title */
  title: string
  /** Full content of the note */
  content: string
  /** One-line summary for progressive disclosure — agents read this before opening */
  description: string

  /** Classification */
  note_type: KnowledgeNoteType

  /** Which specialist created this note (null if user-created) */
  source_specialist: string | null
  /** The memory thread this was extracted from */
  source_thread_id: string | null
  /** The specific message this was extracted from */
  source_message_id: string | null
  /** Confidence score (0-1) — how certain the extraction was */
  confidence: number

  /** Freeform tags for additional categorization */
  tags: string[]

  /** User curation flags */
  is_pinned: boolean
  is_archived: boolean
  is_verified: boolean
  verified_by: string | null
  verified_at: string | null

  /** Staleness tracking */
  is_stale: boolean
  stale_at: string | null
  staleness_window_days: number | null

  /** System metadata */
  extraction_metadata: Record<string, unknown>
  link_count: number
  view_count: number

  created_at: string
  updated_at: string
}

/** Lightweight note reference for lists and search results */
export interface KnowledgeNoteSummary {
  id: string
  title: string
  description: string
  note_type: KnowledgeNoteType
  source_specialist: string | null
  tags: string[]
  is_pinned: boolean
  is_verified: boolean
  is_stale: boolean
  stale_at: string | null
  staleness_window_days: number | null
  link_count: number
  confidence: number
  domain_id: string | null
  created_at: string
  updated_at: string
}

// ─── Knowledge Link ──────────────────────────────────────────────────

/** A connection between two knowledge notes */
export interface KnowledgeLink {
  id: string
  foundry_id: string
  source_note_id: string
  target_note_id: string
  relationship: KnowledgeLinkRelationship
  description: string
  discovered_by: LinkDiscoverySource
  created_at: string
}

/** A link with the connected note's summary (for displaying connections) */
export interface KnowledgeLinkWithNote extends KnowledgeLink {
  connected_note: KnowledgeNoteSummary
}

// ─── Knowledge Domain (Map of Content) ───────────────────────────────

/** A domain category for organizing notes */
export interface KnowledgeDomain {
  id: string
  foundry_id: string
  name: string
  slug: string
  description: string
  icon: string
  sort_order: number
  note_count: number
  created_at: string
  updated_at: string
}

// ─── Default Domains ─────────────────────────────────────────────────

/**
 * Default domain seeds for new foundries. Created when the user first
 * accesses the Knowledge page.
 */
export const DEFAULT_DOMAINS: Array<{
  name: string
  slug: string
  description: string
  icon: string
  sort_order: number
}> = [
  {
    name: 'Strategy',
    slug: 'strategy',
    description: 'Strategic direction, market positioning, competitive analysis',
    icon: 'waypoints',
    sort_order: 0,
  },
  {
    name: 'Product',
    slug: 'product',
    description: 'Product vision, features, roadmap, user needs',
    icon: 'box',
    sort_order: 1,
  },
  {
    name: 'Finance',
    slug: 'finance',
    description: 'Financial metrics, unit economics, funding, budgets',
    icon: 'coins',
    sort_order: 2,
  },
  {
    name: 'Market',
    slug: 'market',
    description: 'Market research, customer insights, competitor intelligence',
    icon: 'globe',
    sort_order: 3,
  },
  {
    name: 'Operations',
    slug: 'operations',
    description: 'Processes, supply chain, manufacturing, logistics',
    icon: 'settings',
    sort_order: 4,
  },
  {
    name: 'Team',
    slug: 'team',
    description: 'Team structure, hiring, culture, roles',
    icon: 'users',
    sort_order: 5,
  },
  {
    name: 'Technology',
    slug: 'technology',
    description: 'Technical architecture, tools, infrastructure',
    icon: 'cpu',
    sort_order: 6,
  },
  {
    name: 'Legal',
    slug: 'legal',
    description: 'Legal matters, compliance, IP, contracts',
    icon: 'scale',
    sort_order: 7,
  },
]

// ─── Query / Filter Types ────────────────────────────────────────────

/** Filters for querying the knowledge vault */
export interface KnowledgeQueryFilters {
  /** Filter by note type */
  noteTypes?: KnowledgeNoteType[]
  /** Filter by domain */
  domainId?: string
  /** Filter by source specialist */
  specialistId?: string
  /** Filter by tags (any match) */
  tags?: string[]
  /** Full-text search query */
  searchQuery?: string
  /** Show archived notes */
  includeArchived?: boolean
  /** Only show pinned notes */
  pinnedOnly?: boolean
  /** Only show verified notes */
  verifiedOnly?: boolean
  /** Minimum confidence score */
  minConfidence?: number
  /** Hide stale notes from results */
  hideStale?: boolean
}

/** Sort options for knowledge notes */
export type KnowledgeSortBy = 'created_at' | 'updated_at' | 'confidence' | 'link_count' | 'title'
export type KnowledgeSortOrder = 'asc' | 'desc'

/** Paginated query parameters */
export interface KnowledgeQueryParams {
  filters: KnowledgeQueryFilters
  sortBy?: KnowledgeSortBy
  sortOrder?: KnowledgeSortOrder
  page?: number
  pageSize?: number
}

/** Paginated query result */
export interface KnowledgeQueryResult {
  notes: KnowledgeNoteSummary[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

// ─── Vault Statistics ────────────────────────────────────────────────

/** Overview stats for the vault dashboard */
export interface VaultStats {
  totalNotes: number
  totalLinks: number
  notesByType: Record<KnowledgeNoteType, number>
  notesByDomain: Array<{ domain: KnowledgeDomain; count: number }>
  notesBySpecialist: Array<{ specialistId: string; count: number }>
  recentNotes: KnowledgeNoteSummary[]
  pinnedNotes: KnowledgeNoteSummary[]
  verifiedCount: number
  unverifiedCount: number
  staleCount: number
  /** Number of notes created from document uploads (non-empty extraction_metadata) */
  documentsProcessed: number
}

// ─── Extraction Types ────────────────────────────────────────────────

/** Input to the knowledge extraction pipeline */
export interface ExtractionInput {
  /** The specialist conversation to extract from */
  messages: Array<{ role: string; content: string }>
  /** Which specialist produced this conversation */
  specialistId: string
  /** The memory thread ID for provenance tracking */
  threadId: string
  /** The foundry this belongs to */
  foundryId: string
}

/** A single extracted note (before being saved to DB) */
export interface ExtractedNote {
  title: string
  content: string
  description: string
  note_type: KnowledgeNoteType
  confidence: number
  tags: string[]
  /** Suggested domain slug (matched against existing domains) */
  suggested_domain: string | null
  /** IDs of existing notes this should link to */
  suggested_links: Array<{
    note_id: string
    relationship: KnowledgeLinkRelationship
    reason: string
  }>
}

/** Result of the extraction pipeline */
export interface ExtractionResult {
  extracted: ExtractedNote[]
  /** Number of notes actually saved (after deduplication) */
  saved: number
  /** Notes that were skipped as duplicates */
  skipped: number
  /** Any errors during extraction */
  errors: string[]
}
