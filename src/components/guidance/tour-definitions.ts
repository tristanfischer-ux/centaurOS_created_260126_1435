import type { TourStep } from './feature-tour'

export const TOUR_DEFINITIONS: Record<string, { tourId: string; steps: TourStep[] }> = {
  today: {
    tourId: 'today',
    steps: [
      {
        target: 'today-briefing',
        title: 'Your Morning Briefing',
        body: 'Start each day here. This card summarises what happened overnight, your streak, and key stats at a glance.',
        position: 'bottom',
      },
      {
        target: 'today-focus',
        title: 'Focus Tasks',
        body: 'Your highest-priority tasks for today, surfaced automatically. Knock these out first to stay on track.',
        position: 'bottom',
      },
      {
        target: 'today-insights',
        title: 'AI Team Insights',
        body: 'Your 13 AI specialists continuously analyse your business and surface proactive insights here.',
        position: 'top',
      },
    ],
  },
  objectives: {
    tourId: 'objectives',
    steps: [
      {
        target: 'objectives-create',
        title: 'Create Objectives',
        body: 'Set OKRs and strategic goals here. Link them to a strategy pillar so progress rolls up automatically.',
        position: 'bottom',
      },
      {
        target: 'objectives-health',
        title: 'Health Bar',
        body: 'See your overall objective health at a glance. Click a segment to filter by on-track, at-risk, or off-track.',
        position: 'bottom',
      },
      {
        target: 'objectives-board',
        title: 'Objective Cards',
        body: 'Each card shows health, progress, and linked tasks. Drag cards between strategy sections to re-link them.',
        position: 'bottom',
      },
    ],
  },
  tasks: {
    tourId: 'tasks',
    steps: [
      {
        target: 'tasks-create',
        title: 'Create Tasks',
        body: 'Add new tasks with assignees, due dates, and linked objectives. Press N anywhere for quick add.',
        position: 'bottom',
      },
      {
        target: 'tasks-summary',
        title: 'Smart Summary',
        body: 'Quick filters for due today, overdue, and needs-review tasks. One click to focus on what matters.',
        position: 'bottom',
      },
      {
        target: 'tasks-views',
        title: 'Multiple Views',
        body: 'Switch between Focus, Board, List, and Timeline views. Board view supports drag-and-drop status changes.',
        position: 'bottom',
      },
    ],
  },
  team: {
    tourId: 'team',
    steps: [
      {
        target: 'team-members',
        title: 'Your Team',
        body: 'See all foundry members, their roles, and capacity. Switch between cards, list, and orbital views.',
        position: 'bottom',
      },
      {
        target: 'team-invite',
        title: 'Invite Members',
        body: 'Grow your team by sending email invitations. New members choose their role when they join.',
        position: 'bottom',
      },
    ],
  },
  'the-forge': {
    tourId: 'the-forge',
    steps: [
      {
        target: 'forge-start',
        title: 'Start a Design',
        body: 'Describe your product idea and the AI pipeline handles research, 3D modelling, analysis, and documentation.',
        position: 'bottom',
      },
      {
        target: 'forge-projects',
        title: 'Recent Projects',
        body: 'All your CAD Lab projects appear here. Click any project to resume where you left off.',
        position: 'top',
      },
    ],
  },
  marketplace: {
    tourId: 'marketplace',
    steps: [
      {
        target: 'marketplace-tabs',
        title: 'Browse & Saved',
        body: 'Switch between Browse to discover listings and Saved to see your bookmarked favourites.',
        position: 'bottom',
      },
      {
        target: 'marketplace-toolbar',
        title: 'Search & Filter',
        body: 'Use the toolbar to search, filter by category, and sort listings. Try the AI search for natural-language queries.',
        position: 'bottom',
      },
      {
        target: 'marketplace-grid',
        title: 'Browse Listings',
        body: 'Explore suppliers, products, and services. Save favourites and compare up to four listings side by side.',
        position: 'top',
      },
    ],
  },
  strategy: {
    tourId: 'strategy',
    steps: [
      {
        target: 'strategy-purpose',
        title: 'Company Purpose',
        body: 'Your north star. Define why your company exists so every objective and task aligns with the bigger picture.',
        position: 'bottom',
      },
      {
        target: 'strategy-pillars',
        title: 'Strategic Pillars',
        body: 'Each pillar tracks progress, health, and linked objectives. Click a pillar to drill into its objectives and tasks.',
        position: 'top',
      },
    ],
  },
}
