/**
 * @file lib/manufacturing/learning-tracks.ts
 *
 * @description Curated multi-technique learning sequences for hardware founders.
 * Tracks are static — Tristan curates them by editing this file directly.
 * No admin interface is needed: each track is a JSON-defined sequence of
 * technique slugs drawn from the manufacturing techniques catalogue.
 *
 * UI: /the-forge-v2/projects/[id]/techniques shows saved techniques.
 *     /learn (Inspiration tab) shows the track list and per-track progress.
 *
 * Progress is derived client-side by checking which slugs in a track the
 * user has already saved to any project.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LearningTrack {
  /** URL-safe identifier, e.g. "hardware-founder-essentials" */
  id: string
  /** Display name */
  title: string
  /** One sentence describing what this track covers */
  description: string
  /** Ordered list of technique slugs from the techniques catalogue */
  techniqueIds: string[]
  /**
   * Whether this track is surfaced as the default recommendation for
   * first-time users who have not yet started a track.
   */
  isDefault: boolean
  /** Rough time investment, e.g. "45 minutes" */
  estimatedTime: string
}

// ---------------------------------------------------------------------------
// Track catalogue
// ---------------------------------------------------------------------------

/**
 * All curated learning tracks.
 *
 * Each entry must reference technique slugs that exist in
 * src/lib/manufacturing-techniques/data.ts. Orphaned slugs render
 * gracefully as "Technique not found" — the track still works.
 */
export const LEARNING_TRACKS: LearningTrack[] = [
  {
    id: 'hardware-founder-essentials',
    title: 'Hardware Founder Essentials',
    description:
      'The five manufacturing processes every hardware founder needs to understand before they talk to a contract manufacturer.',
    techniqueIds: [
      'fdm',               // additive manufacturing — fused deposition modelling
      'cnc-milling',       // subtractive — computer numerical control milling
      'injection-moulding', // forming — injection moulding for volume parts
      'sheet-metal',       // forming — sheet metal fabrication
      'pcb-fabrication',   // electronics — printed circuit board fabrication
    ],
    isDefault: true,
    estimatedTime: '45 minutes',
  },
]

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Return the default-recommended track, or the first track if none is
 * explicitly marked as default.
 */
export function getDefaultTrack(): LearningTrack {
  return LEARNING_TRACKS.find(t => t.isDefault) ?? LEARNING_TRACKS[0]
}

/**
 * Find a track by its identifier.
 *
 * @param id - The track identifier
 * @returns The matching track or undefined
 */
export function getTrackById(id: string): LearningTrack | undefined {
  return LEARNING_TRACKS.find(t => t.id === id)
}

/**
 * Compute how many techniques in a track the user has already saved.
 *
 * @param track - The learning track
 * @param savedTechniqueIds - Set of technique IDs the user has saved
 * @returns Object with completedCount, totalCount, and percentComplete
 */
export function computeTrackProgress(
  track: LearningTrack,
  savedTechniqueIds: Set<string>,
): { completedCount: number; totalCount: number; percentComplete: number } {
  const totalCount = track.techniqueIds.length
  const completedCount = track.techniqueIds.filter(id => savedTechniqueIds.has(id)).length
  const percentComplete = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100)
  return { completedCount, totalCount, percentComplete }
}
