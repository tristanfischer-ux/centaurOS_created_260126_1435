import type { LucideIcon } from 'lucide-react'

/**
 * Command categories for grouping in autocomplete UI
 */
export type CommandCategory =
  | 'messaging'    // /shrug, /giphy, /msg, /mute, /archive
  | 'status'       // /status, /dnd, /away, /active
  | 'navigation'   // /goto, /search, /open
  | 'utility'      // /remind, /todo
  | 'project'      // Custom project commands like /standup, /jira

/**
 * Result types determine what happens after command execution
 */
export type CommandResultType =
  | 'message'      // Send as a message to the conversation
  | 'action'       // Perform an action (no message sent)
  | 'navigate'     // Navigate to a different page
  | 'error'        // Show error toast

/**
 * Context passed to command execution
 */
export interface CommandContext {
  // Current conversation (if in messaging)
  conversationId?: string
  // Current user
  userId: string
  // Current foundry
  foundryId: string
  // Router for navigation commands
  router?: {
    push: (path: string) => void
  }
  // Toast for feedback
  toast?: {
    success: (message: string, options?: { description?: string }) => void
    error: (message: string, options?: { description?: string }) => void
    info: (message: string, options?: { description?: string }) => void
  }
}

/**
 * Result returned from command execution
 */
export interface CommandResult {
  type: CommandResultType
  // For 'message' type - the content to send
  content?: string
  // For 'navigate' type - the path to navigate to
  path?: string
  // For 'error' type - the error message
  error?: string
  // For 'action' type - success message
  message?: string
  // Additional data for complex results
  data?: Record<string, unknown>
}

/**
 * Argument definition for command help/autocomplete
 */
export interface CommandArgument {
  name: string
  description: string
  required: boolean
  // For autocomplete
  options?: string[] | ((partial: string, context: CommandContext) => Promise<string[]>)
}

/**
 * Slash command definition
 */
export interface SlashCommand {
  // Command name without slash (e.g., "remind" for /remind)
  name: string
  // Short description for autocomplete list
  description: string
  // Full usage string (e.g., "/remind [time] [message]")
  usage: string
  // Icon for UI
  icon: LucideIcon
  // Category for grouping
  category: CommandCategory
  // Command arguments
  args?: CommandArgument[]
  // Execute the command
  execute: (args: string[], context: CommandContext) => Promise<CommandResult>
  // Optional autocomplete for arguments
  autocomplete?: (partial: string, context: CommandContext) => Promise<string[]>
  // Required roles (empty = all users)
  requiredRoles?: string[]
  // Aliases (e.g., /dnd can also be /donotdisturb)
  aliases?: string[]
}

/**
 * Parsed command from user input
 */
export interface ParsedCommand {
  // Command name (without slash)
  command: string
  // Arguments (split by whitespace)
  args: string[]
  // Original raw input
  raw: string
  // Whether this is a valid registered command
  isValid: boolean
  // Matched command definition (if valid)
  definition?: SlashCommand
}

/**
 * Command autocomplete suggestion
 */
export interface CommandSuggestion {
  // The command definition
  command: SlashCommand
  // Relevance score (for sorting)
  score: number
  // Matched text (for highlighting)
  matchedText?: string
}

/**
 * Custom command stored in database
 */
export interface CustomSlashCommand {
  id: string
  foundry_id: string
  name: string
  description: string
  usage: string | null
  icon: string
  action_type: 'webhook' | 'create_task' | 'navigate' | 'message'
  action_config: Record<string, unknown>
  enabled: boolean
  required_roles: string[] | null
  created_at: string
}
