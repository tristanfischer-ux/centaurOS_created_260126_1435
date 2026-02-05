import { 
  Target, 
  CheckSquare, 
  Users, 
  Inbox, 
  ShoppingCart, 
  Map,
  GanttChart,
  Rocket,
  TrendingUp,
  Clock,
  MessageSquare
} from 'lucide-react'
import type { PageHelpContent } from '../help-content'

/**
 * Help content for Objectives page
 * Strategic goal management and OKR tracking
 */
export const objectivesHelp: PageHelpContent = {
  title: 'Strategic Objectives',
  description: 'Create and track measurable goals that drive your organization forward. Use the OKR framework to align your team and measure what matters.',
  sections: [
    {
      title: 'What You Can Do Here',
      icon: Target,
      items: [
        'Create strategic objectives with clear success metrics',
        'Break down objectives into actionable tasks',
        'Track progress across your entire team',
        'Organize objectives into a hierarchy',
        'Monitor completion status and timelines',
      ],
    },
    {
      title: 'Key Concepts',
      icon: Rocket,
      items: [
        'Objective: A measurable goal with a clear deadline (e.g., "Launch new product by Q3")',
        'Tasks: Specific work items that contribute to completing an objective',
        'Progress: Automatically calculated based on completed tasks',
        'Status: Active, Completed, or On Hold objectives',
      ],
    },
    {
      title: 'Best Practices',
      icon: TrendingUp,
      items: [
        'Start with 3-5 strategic objectives per quarter',
        'Make objectives specific and measurable',
        'Assign clear owners to each objective',
        'Break objectives into bite-sized tasks (1-3 days each)',
        'Review progress weekly with your team',
      ],
    },
  ],
  keyboardShortcuts: [
    { key: 'N', description: 'Create new objective' },
    { key: '/', description: 'Focus search' },
    { key: '?', description: 'Show this help' },
  ],
  proTips: [
    'Use AI assistance to brainstorm objectives aligned with your vision',
    'Link related objectives to create a strategy map',
    'Set due dates 30-90 days out for best results',
    'Celebrate wins when objectives are completed!',
  ],
}

/**
 * Help content for Tasks page
 * Task management and workflow tracking
 */
export const tasksHelp: PageHelpContent = {
  title: 'Task Management',
  description: 'Organize, assign, and track work across your team. Keep everyone aligned on priorities and deadlines.',
  sections: [
    {
      title: 'What You Can Do Here',
      icon: CheckSquare,
      items: [
        'Create tasks and assign them to team members',
        'Set priorities, due dates, and dependencies',
        'Track task status from To Do to Done',
        'Add notes, comments, and attachments',
        'Filter and sort tasks by any criteria',
        'Bulk edit multiple tasks at once',
      ],
    },
    {
      title: 'Task Lifecycle',
      icon: Clock,
      items: [
        'To Do: Task is ready to be started',
        'In Progress: Someone is actively working on it',
        'In Review: Work is done, awaiting approval',
        'Completed: Task is finished and verified',
        'Blocked: Task cannot proceed due to a dependency',
      ],
    },
    {
      title: 'Collaboration Features',
      icon: MessageSquare,
      items: [
        '@mention team members in comments to notify them',
        'Attach files and screenshots directly to tasks',
        'Use #tags to categorize tasks',
        'Link tasks to objectives to show impact',
        'Set dependencies to manage task order',
      ],
    },
  ],
  keyboardShortcuts: [
    { key: 'N', description: 'Create new task' },
    { key: '/', description: 'Focus search' },
    { key: 'E', description: 'Edit selected task' },
    { key: '?', description: 'Show this help' },
  ],
  proTips: [
    'Keep tasks small (1-3 days) for better tracking',
    'Use consistent naming: start with a verb ("Design landing page")',
    'Add estimates to help with capacity planning',
    'Review blocked tasks daily to unblock your team',
    'Use filters to create custom views (e.g., "My urgent tasks")',
  ],
}

/**
 * Help content for Team page
 * Team member management and roles
 */
export const teamHelp: PageHelpContent = {
  title: 'Your Team',
  description: 'Manage team members, roles, and capacity. Build a balanced team of humans and AI agents working together.',
  sections: [
    {
      title: 'What You Can Do Here',
      icon: Users,
      items: [
        'View all team members and their roles',
        'See current capacity and workload',
        'Add new team members or AI agents',
        'Assign roles: Founder, Executive, Apprentice, AI Agent',
        'Track team availability and time zones',
      ],
    },
    {
      title: 'Understanding Roles',
      icon: Target,
      items: [
        'Founder: Full platform access, strategic decision-making',
        'Executive: Manage objectives, tasks, and team members',
        'Apprentice: Execute tasks, learn from the team',
        'AI Agent: Automated assistants for specific workflows',
      ],
    },
    {
      title: 'Team Best Practices',
      icon: TrendingUp,
      items: [
        'Balance your team: mix of strategy, execution, and support',
        'Clearly define who owns each area of work',
        'Regular check-ins prevent bottlenecks',
        'Use AI agents for repetitive or research-heavy work',
      ],
    },
  ],
  keyboardShortcuts: [
    { key: 'N', description: 'Invite new team member' },
    { key: '/', description: 'Search team members' },
    { key: '?', description: 'Show this help' },
  ],
  proTips: [
    'Start small: 3-5 people can accomplish a lot',
    'AI agents are most effective when given specific, repeatable tasks',
    'Set up team rituals: daily standups, weekly reviews',
    'Celebrate team wins publicly to build momentum',
  ],
}

/**
 * Help content for Home/Inbox page
 * Activity feed and daily workflow
 */
export const homeHelp: PageHelpContent = {
  title: 'Your Workspace',
  description: 'Your command center for daily work. See what needs your attention, catch up on updates, and stay connected with your team.',
  sections: [
    {
      title: 'What You Can Do Here',
      icon: Inbox,
      items: [
        'See all activity across your objectives and tasks',
        'Respond to @mentions and comments',
        'Review and approve work from your team',
        'Check your daily priorities and deadlines',
        'Catch up on messages and notifications',
      ],
    },
    {
      title: 'Activity Feed',
      icon: Clock,
      items: [
        'Task updates: assignments, status changes, completions',
        'Comments and mentions: when someone needs your input',
        'Objective progress: milestones and achievements',
        'System events: new team members, approvals',
      ],
    },
    {
      title: 'Daily Workflow',
      icon: CheckSquare,
      items: [
        'Start your day here to see what needs attention',
        'Clear mentions and notifications first',
        'Review blocked tasks that need unblocking',
        'Check upcoming deadlines in the next 3 days',
        'Reply to comments and approve work promptly',
      ],
    },
  ],
  keyboardShortcuts: [
    { key: '/', description: 'Search across everything' },
    { key: 'R', description: 'Mark all as read' },
    { key: '?', description: 'Show this help' },
  ],
  proTips: [
    'Check your inbox morning and afternoon for best responsiveness',
    'Use filters to focus on high-priority items only',
    'Snooze notifications for tasks you will handle later',
    'Keep your inbox clear - respond or delegate quickly',
  ],
}

/**
 * Help content for Marketplace page
 * Finding experts and services
 */
export const marketplaceHelp: PageHelpContent = {
  title: 'Marketplace',
  description: 'Find experts, suppliers, and services to accelerate your work. Book discovery calls, request quotes, and hire specialized talent.',
  sections: [
    {
      title: 'What You Can Do Here',
      icon: ShoppingCart,
      items: [
        'Browse verified experts in design, engineering, and more',
        'Search for suppliers offering hardware and materials',
        'Read reviews and case studies from past clients',
        'Book free discovery calls with providers',
        'Request custom quotes for your specific needs',
        'Hire directly through the platform',
      ],
    },
    {
      title: 'Provider Types',
      icon: Users,
      items: [
        'Experts: Consultants, designers, engineers, strategists',
        'Suppliers: Hardware, materials, components',
        'Services: Marketing, manufacturing, logistics',
        'AI Services: Specialized automation and intelligence',
      ],
    },
    {
      title: 'Finding the Right Match',
      icon: Target,
      items: [
        'Use filters to narrow by category, price, and availability',
        'Read full profiles, portfolios, and certifications',
        'Check response time and past project completion rate',
        'Book a discovery call before committing (it is free!)',
        'Request quotes from 2-3 providers to compare',
      ],
    },
  ],
  keyboardShortcuts: [
    { key: '/', description: 'Search marketplace' },
    { key: 'F', description: 'Open filters' },
    { key: '?', description: 'Show this help' },
  ],
  proTips: [
    'Discovery calls are free - use them to vet providers thoroughly',
    'Be specific in your RFQ to get accurate quotes',
    'Check certifications for technical or regulated work',
    'Providers with fast response times are usually more reliable',
    'Save interesting listings to compare later',
  ],
}

/**
 * Help content for Blueprints page
 * Organizational capability mapping
 */
export const blueprintsHelp: PageHelpContent = {
  title: 'Capability Blueprints',
  description: 'Map your organizational capabilities. Identify gaps, plan your growth, and build a complete picture of what your team can do.',
  sections: [
    {
      title: 'What You Can Do Here',
      icon: Map,
      items: [
        'Visualize all capabilities your organization needs',
        'Mark which capabilities you have vs. need',
        'Explore dependencies between capabilities',
        'Get AI recommendations for your next capability',
        'Plan your capability roadmap quarter by quarter',
      ],
    },
    {
      title: 'Understanding Blueprints',
      icon: Target,
      items: [
        'Capability: A skill or function your team can perform',
        'Covered: You have this capability in-house',
        'Gap: You need this capability but do not have it yet',
        'Tech Tree: Shows how capabilities unlock others',
        'Prerequisites: Capabilities you need before you can build others',
      ],
    },
    {
      title: 'Strategic Planning',
      icon: TrendingUp,
      items: [
        'Start with your core product or service capabilities',
        'Identify critical gaps blocking your roadmap',
        'Fill gaps through hiring, training, or marketplace',
        'Build foundational capabilities before advanced ones',
        'Review your blueprint quarterly as you grow',
      ],
    },
  ],
  keyboardShortcuts: [
    { key: '/', description: 'Search capabilities' },
    { key: 'F', description: 'Filter by coverage' },
    { key: '?', description: 'Show this help' },
  ],
  proTips: [
    'Use the tech tree view to see capability dependencies',
    'Mark aspirational capabilities to plan future hiring',
    'Link blueprints to objectives to show strategic alignment',
    'Identify common patterns across successful organizations',
  ],
}

/**
 * Help content for Timeline page
 * Gantt chart and project scheduling
 */
export const timelineHelp: PageHelpContent = {
  title: 'Timeline View',
  description: 'Visualize your work over time. See dependencies, identify bottlenecks, and keep projects on track with Gantt chart visualization.',
  sections: [
    {
      title: 'What You Can Do Here',
      icon: GanttChart,
      items: [
        'See all tasks and objectives on a calendar timeline',
        'Drag tasks to reschedule dates visually',
        'View dependencies between tasks',
        'Identify resource conflicts and over-allocation',
        'Zoom in/out from daily to quarterly views',
        'Export timeline as image for presentations',
      ],
    },
    {
      title: 'Timeline Features',
      icon: Clock,
      items: [
        'Color coding: tasks colored by assignee or status',
        'Milestones: key dates marked on the timeline',
        'Dependencies: arrows showing task relationships',
        'Critical path: the sequence of tasks that determines project end date',
        'Today line: current date reference',
      ],
    },
    {
      title: 'Project Planning Tips',
      icon: Target,
      items: [
        'Start with milestones, then fill in tasks backwards',
        'Look for tasks that can run in parallel',
        'Add buffer time for unknowns (15-20% extra)',
        'Watch for team members with too many tasks at once',
        'Update actual dates as work progresses',
      ],
    },
  ],
  keyboardShortcuts: [
    { key: '+', description: 'Zoom in' },
    { key: '-', description: 'Zoom out' },
    { key: 'T', description: 'Jump to today' },
    { key: '?', description: 'Show this help' },
  ],
  proTips: [
    'Group related tasks into "swim lanes" by team or objective',
    'Use the critical path to identify where delays hurt most',
    'Weekly timeline reviews prevent surprises',
    'Drag tasks to reschedule - dates update automatically',
    'Export timeline before stakeholder meetings',
  ],
}
