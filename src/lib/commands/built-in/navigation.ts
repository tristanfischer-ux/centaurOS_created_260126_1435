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
  Home
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
      'dashboard': '/dashboard',
      'dash': '/dashboard',
      'd': '/dashboard',
      'home': '/home',
      'h': '/home',
      'inbox': '/home',
      'tasks': '/tasks',
      't': '/tasks',
      'objectives': '/objectives',
      'obj': '/objectives',
      'o': '/objectives',
      'team': '/team',
      'roster': '/team',
      'r': '/team',
      'marketplace': '/marketplace',
      'market': '/marketplace',
      'm': '/marketplace',
      'settings': '/settings',
      's': '/settings',
      'messages': '/home',
      'msg': '/home',
      'timeline': '/timeline',
      'tl': '/timeline'
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
  description: 'Go to Dashboard',
  usage: '/dashboard',
  icon: LayoutDashboard,
  category: 'navigation',
  aliases: ['dash'],
  execute: async (): Promise<CommandResult> => {
    return navigateResult('/dashboard')
  }
}

export const tasksCommand: SlashCommand = {
  name: 'tasks',
  description: 'Go to Tasks',
  usage: '/tasks',
  icon: CheckSquare,
  category: 'navigation',
  execute: async (): Promise<CommandResult> => {
    return navigateResult('/tasks')
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
    return navigateResult('/objectives')
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
  aliases: ['inbox', 'messages'],
  execute: async (): Promise<CommandResult> => {
    return navigateResult('/home')
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
  timelineCommand
]
