/**
 * Slash Commands Module
 * 
 * This module provides a Slack-style slash command system for ForgeOS messaging.
 * 
 * Usage:
 * ```tsx
 * import { executeCommand, searchCommands, getCommand } from '@/lib/commands'
 * 
 * // Execute a command
 * const result = await executeCommand('/shrug hello', context)
 * 
 * // Search for commands (autocomplete)
 * const suggestions = searchCommands('rem', { limit: 5 })
 * 
 * // Check if input is a command
 * import { shouldExecuteAsCommand } from '@/lib/commands'
 * if (shouldExecuteAsCommand(input)) { ... }
 * ```
 */

// Re-export types
export * from './types'

// Re-export parser functions
export { 
  parseSlashCommand, 
  getCommandAtCursor, 
  isCompleteCommand,
  extractCommandName,
  parseTimeDuration,
  parseNaturalTime,
  validateCommandArgs,
  formatCommandUsage
} from './parser'

// Re-export registry functions
export { 
  registerCommand, 
  unregisterCommand, 
  getCommand, 
  getAllCommands,
  getCommandsByCategory,
  searchCommands,
  getFrequentCommands,
  clearRegistry,
  getRegistryStats
} from './registry'

// Re-export executor functions
export { 
  executeCommand, 
  shouldExecuteAsCommand,
  getCommandHelp,
  messageResult,
  actionResult,
  navigateResult,
  errorResult
} from './executor'

// Import built-in commands
import { messagingCommands } from './built-in/messaging'
import { statusCommands } from './built-in/status'
import { navigationCommands } from './built-in/navigation'
import { utilityCommands } from './built-in/utility'
import { projectCommands } from './built-in/project'
import { registerCommand } from './registry'

// Flag to prevent double registration
let initialized = false

/**
 * Initialize all built-in commands
 * This is called automatically when the module is imported
 */
export function initializeCommands(): void {
  if (initialized) return
  
  // Register all built-in commands
  const allCommands = [
    ...messagingCommands,
    ...statusCommands,
    ...navigationCommands,
    ...utilityCommands,
    ...projectCommands
  ]
  
  for (const command of allCommands) {
    registerCommand(command)
  }
  
  initialized = true
}

// Auto-initialize on import
initializeCommands()

/**
 * Re-initialize commands (useful for testing or after clearing registry)
 */
export function reinitializeCommands(): void {
  initialized = false
  initializeCommands()
}
