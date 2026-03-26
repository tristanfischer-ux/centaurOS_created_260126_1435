import type { CommandContext, CommandResult, ParsedCommand } from './types'
import { parseSlashCommand, validateCommandArgs } from './parser'
import { getCommand } from './registry'

/**
 * Execute a slash command
 */
export async function executeCommand(
  input: string,
  context: CommandContext
): Promise<CommandResult> {
  // Parse the command
  const parsed = parseSlashCommand(input)
  
  if (!parsed) {
    return {
      type: 'error',
      error: 'Invalid command format. Commands must start with /'
    }
  }
  
  if (!parsed.isValid || !parsed.definition) {
    return {
      type: 'error',
      error: `Unknown command: /${parsed.command}. Type / to see available commands.`
    }
  }
  
  const command = parsed.definition
  
  // Check role requirements
  if (command.requiredRoles && command.requiredRoles.length > 0) {
    // DECISION: Role-based command permissions deferred — all commands currently accessible
  }
  
  // Validate arguments
  const validation = validateCommandArgs(command, parsed.args)
  if (!validation.valid) {
    return {
      type: 'error',
      error: validation.error || 'Invalid arguments'
    }
  }
  
  try {
    // Execute the command
    const result = await command.execute(parsed.args, context)
    
    // Show success feedback for action results
    if (result.type === 'action' && result.message && context.toast) {
      context.toast.success(result.message)
    }
    
    // Show error feedback
    if (result.type === 'error' && result.error && context.toast) {
      context.toast.error(result.error)
    }
    
    // Handle navigation
    if (result.type === 'navigate' && result.path && context.router) {
      context.router.push(result.path)
    }
    
    return result
  } catch (error) {
    console.error('Command execution error:', error)
    return {
      type: 'error',
      error: error instanceof Error ? error.message : 'Command failed to execute'
    }
  }
}

/**
 * Check if input should be executed as a command
 */
export function shouldExecuteAsCommand(input: string): boolean {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return false
  
  const parsed = parseSlashCommand(trimmed)
  return parsed?.isValid ?? false
}

/**
 * Get help text for a command
 */
export function getCommandHelp(commandName: string): string | null {
  const command = getCommand(commandName)
  if (!command) return null
  
  let help = `**/${command.name}**\n${command.description}\n\nUsage: ${command.usage}`
  
  if (command.args && command.args.length > 0) {
    help += '\n\nArguments:'
    for (const arg of command.args) {
      const required = arg.required ? '(required)' : '(optional)'
      help += `\n  • ${arg.name} ${required}: ${arg.description}`
    }
  }
  
  if (command.aliases && command.aliases.length > 0) {
    help += `\n\nAliases: ${command.aliases.map(a => `/${a}`).join(', ')}`
  }
  
  return help
}

/**
 * Create a simple message result
 */
export function messageResult(content: string): CommandResult {
  return { type: 'message', content }
}

/**
 * Create an action result with success message
 */
export function actionResult(message: string, data?: Record<string, unknown>): CommandResult {
  return { type: 'action', message, data }
}

/**
 * Create a navigation result
 */
export function navigateResult(path: string): CommandResult {
  return { type: 'navigate', path }
}

/**
 * Create an error result
 */
export function errorResult(error: string): CommandResult {
  return { type: 'error', error }
}
