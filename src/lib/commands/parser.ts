import type { ParsedCommand, SlashCommand } from './types'
import { getCommand } from './registry'

/**
 * Parse a slash command from input text
 */
export function parseSlashCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim()
  
  // Must start with /
  if (!trimmed.startsWith('/')) return null
  
  // Extract command and args
  const parts = trimmed.slice(1).split(/\s+/)
  const command = parts[0]?.toLowerCase() || ''
  const args = parts.slice(1)
  
  if (!command) return null
  
  // Look up command definition
  const definition = getCommand(command)
  
  return {
    command,
    args,
    raw: input,
    isValid: !!definition,
    definition
  }
}

/**
 * Check if cursor is in a slash command context
 * Returns the partial command being typed, or null if not in command context
 */
export function getCommandAtCursor(
  text: string,
  cursorPosition: number
): { command: string; start: number; end: number } | null {
  // Look backwards from cursor for /
  let start = cursorPosition - 1
  
  // Skip any characters that are part of the command (alphanumeric, -, _)
  while (start >= 0 && /[a-zA-Z0-9_-]/.test(text[start])) {
    start--
  }
  
  // Check if we hit a /
  if (start < 0 || text[start] !== '/') return null
  
  // Make sure / is at start of input or after whitespace/newline
  if (start > 0 && !/[\s\n]/.test(text[start - 1])) return null
  
  // Extract the partial command (without the /)
  const command = text.slice(start + 1, cursorPosition).toLowerCase()
  
  return {
    command,
    start,
    end: cursorPosition
  }
}

/**
 * Check if input is a complete command ready to execute
 * A command is complete if it starts with / and has at least the command name
 */
export function isCompleteCommand(input: string): boolean {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return false
  
  const parts = trimmed.slice(1).split(/\s+/)
  const command = parts[0]?.toLowerCase()
  
  return !!command && !!getCommand(command)
}

/**
 * Extract the command name from input (for quick checks)
 */
export function extractCommandName(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return null
  
  const match = trimmed.match(/^\/([a-zA-Z0-9_-]+)/)
  return match?.[1]?.toLowerCase() || null
}

/**
 * Parse time duration string (e.g., "30m", "2h", "1d")
 * Used by /remind and similar commands
 */
export function parseTimeDuration(input: string): number | null {
  const match = input.match(/^(\d+)([smhd])$/i)
  if (!match) return null
  
  const value = parseInt(match[1], 10)
  const unit = match[2].toLowerCase()
  
  const multipliers: Record<string, number> = {
    's': 1000,           // seconds
    'm': 60 * 1000,      // minutes
    'h': 60 * 60 * 1000, // hours
    'd': 24 * 60 * 60 * 1000 // days
  }
  
  return value * (multipliers[unit] || 0)
}

/**
 * Parse natural language time (e.g., "in 30 minutes", "tomorrow", "at 3pm")
 * Returns timestamp or null if not parseable
 */
export function parseNaturalTime(input: string): Date | null {
  const now = new Date()
  const lower = input.toLowerCase().trim()
  
  // "in X minutes/hours"
  const inMatch = lower.match(/^in\s+(\d+)\s*(min(?:ute)?s?|hours?|h|m)$/i)
  if (inMatch) {
    const value = parseInt(inMatch[1], 10)
    const unit = inMatch[2].toLowerCase()
    const ms = unit.startsWith('h') 
      ? value * 60 * 60 * 1000 
      : value * 60 * 1000
    return new Date(now.getTime() + ms)
  }
  
  // "tomorrow"
  if (lower === 'tomorrow') {
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(9, 0, 0, 0) // Default to 9am
    return tomorrow
  }
  
  // Duration format "30m", "2h"
  const duration = parseTimeDuration(lower)
  if (duration) {
    return new Date(now.getTime() + duration)
  }
  
  return null
}

/**
 * Validate command arguments against definition
 */
export function validateCommandArgs(
  command: SlashCommand,
  args: string[]
): { valid: boolean; error?: string } {
  if (!command.args) return { valid: true }
  
  const requiredArgs = command.args.filter(a => a.required)
  
  if (args.length < requiredArgs.length) {
    const missing = requiredArgs.slice(args.length)
    return {
      valid: false,
      error: `Missing required argument: ${missing.map(a => a.name).join(', ')}`
    }
  }
  
  return { valid: true }
}

/**
 * Format command usage for display
 */
export function formatCommandUsage(command: SlashCommand): string {
  if (command.usage) return command.usage
  
  if (!command.args || command.args.length === 0) {
    return `/${command.name}`
  }
  
  const argsStr = command.args
    .map(a => a.required ? `<${a.name}>` : `[${a.name}]`)
    .join(' ')
  
  return `/${command.name} ${argsStr}`
}
