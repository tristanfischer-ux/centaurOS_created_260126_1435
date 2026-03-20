import { PAGE_VIDEOS } from '@/lib/video-urls'

export interface HelpSection {
  title: string
  description: string
  iconName: string
}

export interface HelpShortcut {
  keys: string[]
  description: string
}

export type HelpTip = string

export interface PageHelpContent {
  title: string
  description: string
  sections: HelpSection[]
  shortcuts: HelpShortcut[]
  tips: HelpTip[]
  videoTitle?: string
  videoDuration?: string
  /** Direct video URL (Supabase Storage or external) */
  videoUrl?: string
  /** Thumbnail image URL for the video */
  thumbnailUrl?: string
  /** Tour ID for the interactive walkthrough (matches tour-definitions.ts) */
  tourId?: string
}

export type PageKey =
  | 'today'
  | 'objectives'
  | 'tasks'
  | 'team'
  | 'the-forge'
  | 'marketplace'
  | 'strategy'
  | 'messages'

const HELP_CONTENT: Record<PageKey, PageHelpContent> = {
  today: {
    title: 'Your Daily Command Center',
    description:
      'Your prioritized view of what matters today. See tasks due today, quick wins, and risks at a glance.',
    tourId: 'today',
    videoUrl: PAGE_VIDEOS.today?.videoUrl,
    thumbnailUrl: PAGE_VIDEOS.today?.thumbnailUrl,
    videoTitle: PAGE_VIDEOS.today?.title,
    videoDuration: PAGE_VIDEOS.today?.duration,
    sections: [
      {
        title: 'Daily Focus',
        description:
          'Your top priorities for the day. Start here each morning to align your actions with what matters most.',
        iconName: 'calendar',
      },
      {
        title: 'Tasks Due Today',
        description:
          'All tasks due today, surfaced in one place. Accept, complete, or snooze to stay on track.',
        iconName: 'check-square',
      },
      {
        title: 'Quick Wins',
        description:
          'Small tasks you can knock out quickly. Perfect for building momentum and clearing the deck.',
        iconName: 'zap',
      },
      {
        title: 'Risk Radar',
        description:
          'Blockers, decisions, and mentions that need your attention. Catch issues before they become problems.',
        iconName: 'alert-triangle',
      },
    ],
    shortcuts: [
      { keys: ['G', 'H'], description: 'Go to Today' },
    ],
    tips: [
      'Use voice capture to add tasks on the go',
      'Check Today first thing each morning for your prioritized action list',
    ],
  },
  objectives: {
    title: 'Strategic Objectives',
    description:
      'Set and track OKRs, goals, and strategic initiatives. Connect tasks to objectives for automatic progress tracking.',
    tourId: 'objectives',
    videoUrl: PAGE_VIDEOS.objectives?.videoUrl,
    thumbnailUrl: PAGE_VIDEOS.objectives?.thumbnailUrl,
    videoTitle: PAGE_VIDEOS.objectives?.title,
    videoDuration: PAGE_VIDEOS.objectives?.duration,
    sections: [
      {
        title: 'OKR Framework',
        description:
          'Objectives and Key Results help you define what success looks like and how to measure it. Set clear, measurable outcomes.',
        iconName: 'target',
      },
      {
        title: 'Creating Objectives',
        description:
          'Define objectives with titles, descriptions, and key results. Link them to tasks to track progress automatically.',
        iconName: 'plus-circle',
      },
      {
        title: 'Tracking Progress',
        description:
          'Monitor progress bars, completion rates, and trends. See how your team is advancing toward each objective.',
        iconName: 'trending-up',
      },
      {
        title: 'Cascading Goals',
        description:
          'Connect objectives to parent goals. Align team objectives with company strategy for a clear line of sight.',
        iconName: 'git-branch',
      },
    ],
    shortcuts: [{ keys: ['N'], description: 'Quick create' }],
    tips: [
      'Start with 1-3 objectives to maintain focus',
      'Link tasks to objectives to track progress automatically',
    ],
  },
  tasks: {
    title: 'Task Management',
    description:
      'Create, assign, and track tasks across your foundry. Use filters, views, and shortcuts to stay organized.',
    tourId: 'tasks',
    videoUrl: PAGE_VIDEOS.tasks?.videoUrl,
    thumbnailUrl: PAGE_VIDEOS.tasks?.thumbnailUrl,
    videoTitle: PAGE_VIDEOS.tasks?.title,
    videoDuration: PAGE_VIDEOS.tasks?.duration,
    sections: [
      {
        title: 'Creating Tasks',
        description:
          'Add tasks with titles, descriptions, due dates, and assignees. Use quick-add for speed, or open the full form for details.',
        iconName: 'plus-circle',
      },
      {
        title: 'Task Workflow',
        description:
          'Tasks move through: Pending → Accepted → In Progress → Done. Team members accept tasks democratically before starting work.',
        iconName: 'arrow-right-circle',
      },
      {
        title: 'Filtering & Views',
        description:
          'Filter by assignee, status, due date, or objective. Switch between list, kanban, and calendar views.',
        iconName: 'filter',
      },
      {
        title: 'Assignments',
        description:
          'Assign tasks to team members. See who is responsible and track workload across the team.',
        iconName: 'users',
      },
    ],
    shortcuts: [
      { keys: ['N'], description: 'Quick add' },
      { keys: ['Enter'], description: 'Open task' },
      { keys: ['⌘', '⇧', 'S'], description: 'Save' },
    ],
    tips: [
      'Use the quick-add shortcut N to create tasks without leaving your current view',
      'Tasks follow a democratic workflow: Pending → Accepted → In Progress → Done',
    ],
  },
  team: {
    title: 'Team & Collaboration',
    description:
      'Manage your foundry members, roles, permissions, and capacity. Invite members and collaborate effectively.',
    tourId: 'team',
    videoUrl: PAGE_VIDEOS.team?.videoUrl,
    thumbnailUrl: PAGE_VIDEOS.team?.thumbnailUrl,
    videoTitle: PAGE_VIDEOS.team?.title,
    videoDuration: PAGE_VIDEOS.team?.duration,
    sections: [
      {
        title: 'Roles & Permissions',
        description:
          'Founders have full control. Executives can approve tasks and manage workflows. Apprentices learn and contribute within their scope.',
        iconName: 'shield',
      },
      {
        title: 'Inviting Members',
        description:
          'Invite team members by email. They receive an invitation to join your foundry and choose their role.',
        iconName: 'user-plus',
      },
      {
        title: 'Capacity Planning',
        description:
          'View team capacity, workload distribution, and availability. Plan assignments to balance the load.',
        iconName: 'bar-chart',
      },
      {
        title: 'Collaboration',
        description:
          'Use @mentions in tasks and messages to notify specific team members. Keep conversations contextual.',
        iconName: 'message-square',
      },
    ],
    shortcuts: [],
    tips: [
      'Founders have full control, Executives can approve tasks, Apprentices are learning',
      'Use @mentions in tasks and messages to notify specific team members',
    ],
  },
  'the-forge': {
    title: 'The Forge',
    description:
      'Product development from concept to manufacturing. Capture ideas, design in CAD Lab, and document everything for production.',
    tourId: 'the-forge',
    videoUrl: PAGE_VIDEOS['the-forge']?.videoUrl,
    thumbnailUrl: PAGE_VIDEOS['the-forge']?.thumbnailUrl,
    videoTitle: PAGE_VIDEOS['the-forge']?.title,
    videoDuration: PAGE_VIDEOS['the-forge']?.duration,
    sections: [
      {
        title: 'Product Concepts',
        description:
          'Capture product ideas and requirements. Define what you want to build before moving into design.',
        iconName: 'lightbulb',
      },
      {
        title: 'CAD Lab',
        description:
          'Create parametric designs with CadQuery. Turn concepts into 3D models, run simulations, and export for manufacturing.',
        iconName: 'flame',
      },
      {
        title: 'Engineering Dossiers',
        description:
          'Document everything needed for manufacturing: specs, BOMs, tolerances, and supplier notes. One source of truth per product.',
        iconName: 'file-text',
      },
      {
        title: 'Supply Chain',
        description:
          'Track suppliers, materials, and logistics. Connect designs to procurement and fulfillment.',
        iconName: 'truck',
      },
    ],
    shortcuts: [],
    tips: [
      'Start with a concept, then use CAD Lab to turn it into parametric design',
      'Engineering dossiers capture everything needed for manufacturing',
    ],
  },
  marketplace: {
    title: 'The Marketplace',
    description:
      'Find experts, services, and resources. Use Smart Search to describe what you need, then save favorites to your stack.',
    tourId: 'marketplace',
    videoUrl: PAGE_VIDEOS.marketplace?.videoUrl,
    thumbnailUrl: PAGE_VIDEOS.marketplace?.thumbnailUrl,
    videoTitle: PAGE_VIDEOS.marketplace?.title,
    videoDuration: PAGE_VIDEOS.marketplace?.duration,
    sections: [
      {
        title: 'Finding Experts',
        description:
          'Browse and search for experts, suppliers, and service providers. Filter by category, expertise, and ratings.',
        iconName: 'search',
      },
      {
        title: 'Smart Search',
        description:
          'Describe what you need in natural language. AI matches your description to the right resources.',
        iconName: 'sparkles',
      },
      {
        title: 'RFQs',
        description:
          'Create Request for Quote to get proposals from multiple suppliers. Compare and select the best fit.',
        iconName: 'file-plus',
      },
      {
        title: 'Booking Services',
        description:
          'Book services directly from the marketplace. Schedule consultations, audits, and engagements.',
        iconName: 'calendar',
      },
    ],
    shortcuts: [{ keys: ['⌘', 'K'], description: 'Search' }],
    tips: [
      'Use Smart Search to describe what you need in natural language',
      'Save resources to your stack for quick access later',
    ],
  },
  strategy: {
    title: 'Strategic Planning',
    description:
      'Define company purpose, strategic pillars, and health metrics. Align objectives and run regular reviews.',
    tourId: 'strategy',
    videoUrl: PAGE_VIDEOS.strategy?.videoUrl,
    thumbnailUrl: PAGE_VIDEOS.strategy?.thumbnailUrl,
    videoTitle: PAGE_VIDEOS.strategy?.title,
    videoDuration: PAGE_VIDEOS.strategy?.duration,
    sections: [
      {
        title: 'Strategic Pillars',
        description:
          'Define the key pillars of your strategy. Each pillar supports your company purpose and guides objective-setting.',
        iconName: 'waypoints',
      },
      {
        title: 'Health Tracking',
        description:
          'Monitor strategic health with leading indicators. Catch drift early with quarterly check-ins.',
        iconName: 'activity',
      },
      {
        title: 'Company Purpose',
        description:
          'Your why. Define why your company exists to align all objectives and decisions.',
        iconName: 'compass',
      },
      {
        title: 'Reviews',
        description:
          'Quarterly strategic reviews to assess progress, adjust priorities, and update the plan.',
        iconName: 'clipboard-list',
      },
    ],
    shortcuts: [],
    tips: [
      'Define your company purpose to align all objectives',
      'Review strategic health quarterly to catch drift early',
    ],
  },
  messages: {
    title: 'Messages',
    description:
      'Team messaging with context. Use @mentions, attach tasks and objectives, and leverage slash commands for quick actions.',
    tourId: 'messages',
    videoUrl: PAGE_VIDEOS.messages?.videoUrl,
    thumbnailUrl: PAGE_VIDEOS.messages?.thumbnailUrl,
    videoTitle: PAGE_VIDEOS.messages?.title,
    videoDuration: PAGE_VIDEOS.messages?.duration,
    sections: [
      {
        title: 'Team Messaging',
        description:
          'Chat with your foundry team. Create channels or threads for different topics and projects.',
        iconName: 'message-square',
      },
      {
        title: 'Mentions',
        description:
          'Use @username to notify specific team members. They get alerted and can jump into the conversation.',
        iconName: 'at-sign',
      },
      {
        title: 'Context Selector',
        description:
          'Attach tasks, objectives, or other context to messages. Keep conversations focused and traceable.',
        iconName: 'layers',
      },
      {
        title: 'Attachments',
        description:
          'Attach files and link to tasks or objectives. Share context without leaving the conversation.',
        iconName: 'paperclip',
      },
    ],
    shortcuts: [{ keys: ['⇧', '⌘', 'M'], description: 'New message' }],
    tips: [
      'Use slash commands for quick actions in messages',
      'Attach context from tasks and objectives to keep conversations focused',
    ],
  },
}

export function getHelpContent(pageKey: PageKey): PageHelpContent | undefined {
  return HELP_CONTENT[pageKey]
}
