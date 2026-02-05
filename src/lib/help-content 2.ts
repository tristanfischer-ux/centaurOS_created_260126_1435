import type { LucideIcon } from 'lucide-react'
import type { ButtonProps } from '@/components/ui/button'

/**
 * Page Help Content System
 * 
 * @description Centralized help content for all platform pages.
 * Each page gets contextual help explaining features, keyboard shortcuts,
 * and best practices.
 * 
 * @see src/components/ui/page-help-button.tsx - Component that displays this content
 */

export interface HelpSection {
  /** Section title */
  title: string
  /** Optional icon for section (Lucide icon component) */
  icon?: LucideIcon
  /** Section content (text or JSX) */
  content: string | React.ReactNode
  /** Optional bullet point items */
  items?: string[]
}

export interface KeyboardShortcut {
  /** Keyboard key(s) to press */
  key: string
  /** What the shortcut does */
  description: string
}

export interface QuickAction {
  /** Action button label */
  label: string
  /** Optional icon for button */
  icon?: LucideIcon
  /** Button variant */
  variant?: ButtonProps['variant']
  /** Function to call when clicked */
  onClick: () => void
}

export interface PageHelpContent {
  /** Page title for help dialog */
  title: string
  /** Brief description (1-2 sentences) */
  description: string
  /** Main help content sections */
  sections: HelpSection[]
  /** Optional keyboard shortcuts */
  keyboardShortcuts?: KeyboardShortcut[]
  /** Optional quick action buttons */
  quickActions?: QuickAction[]
  /** Optional pro tips */
  proTips?: string[]
}

/**
 * Page keys for help content lookup
 * Each key corresponds to a platform page route
 */
export type PageKey =
  // Core workflow
  | 'objectives'
  | 'tasks'
  | 'team'
  | 'home'
  // Discovery & resources
  | 'marketplace'
  | 'blueprints'
  | 'timeline'
  // Communication
  | 'messages'
  | 'advisory'
  // Orders & RFQs
  | 'orders'
  | 'rfq'
  // Provider Portal
  | 'provider-portal'
  | 'provider-listing'
  | 'provider-orders'
  | 'provider-analytics'
  // Settings
  | 'settings'

/**
 * Help content registry
 * Maps page keys to their help content
 */
const helpContentRegistry: Partial<Record<PageKey, PageHelpContent>> = {}

// Import and register page help content
import {
  objectivesHelp,
  tasksHelp,
  teamHelp,
  homeHelp,
  marketplaceHelp,
  blueprintsHelp,
  timelineHelp,
} from './help-content/pages'

// Register all page help content
helpContentRegistry['objectives'] = objectivesHelp
helpContentRegistry['tasks'] = tasksHelp
helpContentRegistry['team'] = teamHelp
helpContentRegistry['home'] = homeHelp
helpContentRegistry['marketplace'] = marketplaceHelp
helpContentRegistry['blueprints'] = blueprintsHelp
helpContentRegistry['timeline'] = timelineHelp

/**
 * Get help content for a specific page
 * 
 * @param pageKey - Page identifier
 * @returns Help content for the page, or undefined if not available
 */
export function getPageHelpContent(pageKey: PageKey): PageHelpContent | undefined {
  return helpContentRegistry[pageKey]
}

/**
 * Register help content for a page
 * Used to add help content from individual page modules
 * 
 * @param pageKey - Page identifier
 * @param content - Help content for the page
 */
export function registerPageHelpContent(
  pageKey: PageKey,
  content: PageHelpContent
): void {
  helpContentRegistry[pageKey] = content
}

// Export empty registry for now - will be populated with page-specific content
export { helpContentRegistry }
