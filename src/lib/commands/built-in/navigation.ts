import { 
  Navigation, 
  Search, 
  LayoutDashboard, 
  CheckSquare, 
  Target, 
  Users, 
  Store,
  Settings,
  Calendar,
  Home,
  Lightbulb,
  Bell,
  Flame,
} from 'lucide-react'
import type { SlashCommand, CommandResult } from '../types'
import { navigateResult, errorResult } from '../executor'

/**
 * /goto - Navigate to a page or entity
 */
export const gotoCommand: SlashCommand = {
  name: 'goto',
  description: 'Navigate to a page or item',
  usage: '/goto [destination]',
  icon: Navigation,
  category: 'navigation',
  aliases: ['go', 'open'],
  args: [
    {
      name: 'destination',
      description: 'Page or item to navigate to',
      required: true,
      options: ['dashboard', 'tasks', 'objectives', 'team', 'marketplace', 'settings', 'messages', 'timeline']
    }
  ],
  execute: async (args: string[]): Promise<CommandResult> => {
    const destination = args[0]?.toLowerCase()
    
    if (!destination) {
      return errorResult('Usage: /goto [page] - Try: dashboard, tasks, objectives, team, marketplace')
    }
    
    // Map common aliases and shortcuts
    const routes: Record<string, string> = {
      'dashboard': '/updates',
      'dash': '/updates',
      'd': '/updates',
      'home': '/updates',
      'h': '/updates',
      'inbox': '/updates',
      'tasks': '/new-tasks',
      't': '/new-tasks',
      'objectives': '/new-objectives',
      'obj': '/new-objectives',
      'o': '/new-objectives',
      'team': '/team',
      'roster': '/team',
      'r': '/team',
      'marketplace': '/marketplace',
      'market': '/marketplace',
      'm': '/marketplace',
      'settings': '/settings',
      's': '/settings',
      'messages': '/updates',
      'msg': '/updates',
      'updates': '/updates',
      'timeline': '/timeline',
      'tl': '/timeline',
      'playbooks': '/playbooks',
      'inspiration': '/playbooks',
      'ideas': '/playbooks',
      'blueprints': '/playbooks',
      'learn': '/learn',
      'forge': '/the-forge',
      'xray': '/the-forge',
      'x-ray': '/the-forge',
      'product-xray': '/the-forge',
      'agents': '/agents',
      'strategy': '/canvas',
      'canvas': '/canvas',
      'guild': '/guild',
      'workshop': '/workshop',
      'plan': '/plan',
    }
    
    const path = routes[destination]
    
    if (!path) {
      return errorResult(`Unknown destination: ${destination}. Try: dashboard, tasks, objectives, team, marketplace`)
    }
    
    return navigateResult(path)
  }
}

/**
 * /search - Search messages/conversations with advanced operators
 * 
 * Supports operators:
 * - is:starred, is:pinned, is:unread
 * - from:@username, from:me
 * - has:link, has:file, has:reaction, has:thread
 * - before:date, after:date
 * 
 * @example
 * /search is:starred from:@john important
 * /search has:link before:2024-01-01
 * /search is:pinned urgent
 */
export const searchCommand: SlashCommand = {
  name: 'search',
  description: 'Search messages with advanced operators (is:, from:, has:, before:, after:)',
  usage: '/search [operators] [keywords]',
  icon: Search,
  category: 'navigation',
  args: [
    {
      name: 'query',
      description: 'Search query with operators: is:starred, from:@user, has:link, before:date, after:date',
      required: false
    }
  ],
  execute: async (args: string[]): Promise<CommandResult> => {
    const query = args.join(' ')
    
    // Navigate to messages with search param
    // The search will be processed by the search service
    if (query) {
      return navigateResult(`/messages?search=${encodeURIComponent(query)}`)
    }
    
    // Open search without query - just focus the search
    return navigateResult('/messages?focus=search')
  }
}

/**
 * Quick navigation shortcuts
 */
export const dashboardCommand: SlashCommand = {
  name: 'dashboard',
  description: 'Go to Updates',
  usage: '/dashboard',
  icon: LayoutDashboard,
  category: 'navigation',
  aliases: ['dash'],
  execute: async (): Promise<CommandResult> => {
    return navigateResult('/updates')
  }
}

export const tasksCommand: SlashCommand = {
  name: 'tasks',
  description: 'Go to Tasks',
  usage: '/tasks',
  icon: CheckSquare,
  category: 'navigation',
  execute: async (): Promise<CommandResult> => {
    return navigateResult('/new-tasks')
  }
}

export const objectivesCommand: SlashCommand = {
  name: 'objectives',
  description: 'Go to Objectives',
  usage: '/objectives',
  icon: Target,
  category: 'navigation',
  aliases: ['obj'],
  execute: async (): Promise<CommandResult> => {
    return navigateResult('/new-objectives')
  }
}

export const teamCommand: SlashCommand = {
  name: 'team',
  description: 'Go to Team Roster',
  usage: '/team',
  icon: Users,
  category: 'navigation',
  aliases: ['roster'],
  execute: async (): Promise<CommandResult> => {
    return navigateResult('/team')
  }
}

export const marketplaceCommand: SlashCommand = {
  name: 'marketplace',
  description: 'Go to Marketplace',
  usage: '/marketplace',
  icon: Store,
  category: 'navigation',
  aliases: ['market'],
  execute: async (): Promise<CommandResult> => {
    return navigateResult('/marketplace')
  }
}

export const settingsCommand: SlashCommand = {
  name: 'settings',
  description: 'Go to Settings',
  usage: '/settings',
  icon: Settings,
  category: 'navigation',
  execute: async (): Promise<CommandResult> => {
    return navigateResult('/settings')
  }
}

export const homeCommand: SlashCommand = {
  name: 'home',
  description: 'Go to Home',
  usage: '/home',
  icon: Home,
  category: 'navigation',
  execute: async (): Promise<CommandResult> => {
    return navigateResult('/updates')
  }
}

export const updatesCommand: SlashCommand = {
  name: 'updates',
  description: 'Go to Updates',
  usage: '/updates',
  icon: Bell,
  category: 'navigation',
  aliases: ['inbox', 'messages'],
  execute: async (): Promise<CommandResult> => {
    return navigateResult('/updates')
  }
}

export const timelineCommand: SlashCommand = {
  name: 'timeline',
  description: 'Go to Timeline',
  usage: '/timeline',
  icon: Calendar,
  category: 'navigation',
  execute: async (): Promise<CommandResult> => {
    return navigateResult('/timeline')
  }
}

export const playbooksCommand: SlashCommand = {
  name: 'playbooks',
  description: 'Go to Playbooks - find pre-built plans and objective packs',
  usage: '/playbooks',
  icon: Lightbulb,
  category: 'navigation',
  aliases: ['inspiration', 'ideas'],
  execute: async (): Promise<CommandResult> => {
    return navigateResult('/playbooks')
  }
}

export const forgeCommand: SlashCommand = {
  name: 'forge',
  description: 'Go to The Forge - scan an idea into a product dossier',
  usage: '/forge',
  icon: Flame,
  category: 'navigation',
  aliases: ['xray', 'product-xray'],
  execute: async (): Promise<CommandResult> => {
    return navigateResult('/the-forge')
  }
}

// Export all navigation commands
export const navigationCommands: SlashCommand[] = [
  gotoCommand,
  searchCommand,
  dashboardCommand,
  tasksCommand,
  objectivesCommand,
  teamCommand,
  marketplaceCommand,
  settingsCommand,
  homeCommand,
  updatesCommand,
  timelineCommand,
  playbooksCommand,
  forgeCommand,
]
