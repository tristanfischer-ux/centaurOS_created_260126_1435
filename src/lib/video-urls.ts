/**
 * @file video-urls.ts
 *
 * @description Centralized registry of all onboarding/help video URLs.
 * Videos are hosted in Supabase Storage (public 'videos' bucket).
 * Thumbnails are served from /public/videos/thumbnails/ via Next.js static.
 *
 * When videos are generated and uploaded to Supabase Storage, update the
 * videoUrl fields below. Until then, they remain undefined and the
 * VideoWalkthrough component shows "Coming Soon".
 */

const SUPABASE_STORAGE_BASE =
  'https://jyarhvinengfyrwgtskq.supabase.co/storage/v1/object/public/videos'

// ─── Video Definitions ──────────────────────────────────────────────

export interface VideoEntry {
  /** Unique slug for this video */
  id: string
  /** Human-readable title */
  title: string
  /** Short description */
  description: string
  /** Target duration label */
  duration: string
  /** Direct video URL (Supabase Storage). Undefined = not yet uploaded. */
  videoUrl?: string
  /** Thumbnail image URL (local static asset) */
  thumbnailUrl: string
}

/**
 * All onboarding/help videos in the system.
 *
 * @description Update `videoUrl` once each video is generated and uploaded
 * to the Supabase Storage `videos` bucket. The VideoWalkthrough component
 * will automatically switch from "Coming Soon" to playable.
 */
export const VIDEOS = {
  platformOverview: {
    id: 'platform-overview',
    title: 'Platform Overview',
    description: 'A tour of ForgeOS and how everything connects',
    duration: '60s',
    videoUrl: undefined as string | undefined, // `${SUPABASE_STORAGE_BASE}/walkthroughs/platform-overview.mp4`
    thumbnailUrl: '/videos/thumbnails/thumb-platform-overview.jpg',
  },
  creatingObjectives: {
    id: 'creating-objectives',
    title: 'Creating Objectives',
    description: 'Turn ideas into actionable objectives with key results',
    duration: '45s',
    videoUrl: undefined as string | undefined, // `${SUPABASE_STORAGE_BASE}/walkthroughs/creating-objectives.mp4`
    thumbnailUrl: '/videos/thumbnails/thumb-creating-objectives.jpg',
  },
  managingTasks: {
    id: 'managing-tasks',
    title: 'Managing Tasks',
    description: 'Organize and complete work efficiently',
    duration: '45s',
    videoUrl: undefined as string | undefined, // `${SUPABASE_STORAGE_BASE}/walkthroughs/managing-tasks.mp4`
    thumbnailUrl: '/videos/thumbnails/thumb-managing-tasks.jpg',
  },
  buildingYourTeam: {
    id: 'building-your-team',
    title: 'Building Your Team',
    description: 'Invite members and assign roles',
    duration: '45s',
    videoUrl: undefined as string | undefined, // `${SUPABASE_STORAGE_BASE}/walkthroughs/building-your-team.mp4`
    thumbnailUrl: '/videos/thumbnails/thumb-building-your-team.jpg',
  },
  marketplace: {
    id: 'marketplace',
    title: 'The Marketplace',
    description: 'Find and hire specialists for your projects',
    duration: '90s',
    videoUrl: undefined as string | undefined, // `${SUPABASE_STORAGE_BASE}/walkthroughs/marketplace.mp4`
    thumbnailUrl: '/videos/thumbnails/thumb-marketplace.jpg',
  },
  theForgeCadLab: {
    id: 'the-forge-cad-lab',
    title: 'The Forge & CAD Lab',
    description: 'Product development from concept to manufacturing',
    duration: '90s',
    videoUrl: undefined as string | undefined, // `${SUPABASE_STORAGE_BASE}/walkthroughs/the-forge-cad-lab.mp4`
    thumbnailUrl: '/videos/thumbnails/thumb-the-forge-cad-lab.jpg',
  },
  strategyDashboard: {
    id: 'strategy-dashboard',
    title: 'Strategy Dashboard',
    description: 'Define pillars, track health, and align objectives',
    duration: '45s',
    videoUrl: undefined as string | undefined, // `${SUPABASE_STORAGE_BASE}/walkthroughs/strategy-dashboard.mp4`
    thumbnailUrl: '/videos/thumbnails/thumb-strategy-dashboard.jpg',
  },
  todayDailyBriefing: {
    id: 'today-daily-briefing',
    title: 'Today — Daily Briefing',
    description: 'Your personalized morning command center',
    duration: '45s',
    videoUrl: undefined as string | undefined, // `${SUPABASE_STORAGE_BASE}/walkthroughs/today-daily-briefing.mp4`
    thumbnailUrl: '/videos/thumbnails/thumb-today-daily-briefing.jpg',
  },
} as const satisfies Record<string, VideoEntry>

/** Ordered list for the Help Center video library */
export const VIDEO_LIBRARY_ORDER: (keyof typeof VIDEOS)[] = [
  'platformOverview',
  'creatingObjectives',
  'managingTasks',
  'buildingYourTeam',
  'marketplace',
  'theForgeCadLab',
]

/** Map page keys to their contextual video */
export const PAGE_VIDEOS: Record<string, VideoEntry> = {
  today: VIDEOS.todayDailyBriefing,
  objectives: VIDEOS.creatingObjectives,
  tasks: VIDEOS.managingTasks,
  team: VIDEOS.buildingYourTeam,
  'the-forge': VIDEOS.theForgeCadLab,
  marketplace: VIDEOS.marketplace,
  strategy: VIDEOS.strategyDashboard,
  messages: VIDEOS.platformOverview, // Messages uses the general overview
}
