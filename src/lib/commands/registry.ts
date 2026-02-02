import type { SlashCommand, CommandSuggestion, CommandCategory } from './types'

// Global command registry
const commandRegistry = new Map<string, SlashCommand>()

// Alias to command mapping
const aliasRegistry = new Map<string, string>()

/**
 * Register a command in the global registry
 */
export function registerCommand(command: SlashCommand): void {
  const name = command.name.toLowerCase()
  commandRegistry.set(name, command)
  
  // Register aliases
  if (command.aliases) {
    for (const alias of command.aliases) {
      aliasRegistry.set(alias.toLowerCase(), name)
    }
  }
}

/**
 * Unregister a command
 */
export function unregisterCommand(name: string): void {
  const command = commandRegistry.get(name.toLowerCase())
  if (command) {
    // Remove aliases
    if (command.aliases) {
      for (const alias of command.aliases) {
        aliasRegistry.delete(alias.toLowerCase())
      }
    }
    commandRegistry.delete(name.toLowerCase())
  }
}

/**
 * Get a command by name or alias
 */
export function getCommand(nameOrAlias: string): SlashCommand | undefined {
  const lower = nameOrAlias.toLowerCase()
  
  // Direct lookup
  const direct = commandRegistry.get(lower)
  if (direct) return direct
  
  // Check alias
  const actualName = aliasRegistry.get(lower)
  if (actualName) {
    return commandRegistry.get(actualName)
  }
  
  return undefined
}

/**
 * Get all registered commands
 */
export function getAllCommands(): SlashCommand[] {
  return Array.from(commandRegistry.values())
}

/**
 * Get commands by category
 */
export function getCommandsByCategory(category: CommandCategory): SlashCommand[] {
  return getAllCommands().filter(cmd => cmd.category === category)
}

/**
 * Search commands by partial name
 * Returns suggestions sorted by relevance
 */
export function searchCommands(
  partial: string,
  options: {
    limit?: number
    userRole?: string
    category?: CommandCategory
  } = {}
): CommandSuggestion[] {
  const { limit = 10, userRole, category } = options
  const search = partial.toLowerCase()
  
  const suggestions: CommandSuggestion[] = []
  
  for (const command of commandRegistry.values()) {
    // Filter by category if specified
    if (category && command.category !== category) continue
    
    // Filter by role if command requires specific roles
    if (command.requiredRoles && command.requiredRoles.length > 0) {
      if (!userRole || !command.requiredRoles.includes(userRole)) continue
    }
    
    // Calculate match score
    let score = 0
    let matchedText = ''
    
    // Exact match = highest score
    if (command.name === search) {
      score = 100
      matchedText = command.name
    }
    // Starts with = high score
    else if (command.name.startsWith(search)) {
      score = 80 + (search.length / command.name.length) * 10
      matchedText = command.name.slice(0, search.length)
    }
    // Contains = medium score
    else if (command.name.includes(search)) {
      score = 50 + (search.length / command.name.length) * 10
      const idx = command.name.indexOf(search)
      matchedText = command.name.slice(idx, idx + search.length)
    }
    // Check aliases
    else if (command.aliases) {
      for (const alias of command.aliases) {
        if (alias.startsWith(search)) {
          score = 70 + (search.length / alias.length) * 10
          matchedText = alias.slice(0, search.length)
          break
        }
        if (alias.includes(search)) {
          score = 40 + (search.length / alias.length) * 10
          const idx = alias.indexOf(search)
          matchedText = alias.slice(idx, idx + search.length)
          break
        }
      }
    }
    // Check description (fuzzy)
    else if (command.description.toLowerCase().includes(search)) {
      score = 20
    }
    
    if (score > 0) {
      suggestions.push({ command, score, matchedText })
    }
  }
  
  // Sort by score descending
  suggestions.sort((a, b) => b.score - a.score)
  
  return suggestions.slice(0, limit)
}

/**
 * Get frequently used commands (could be extended with usage tracking)
 */
export function getFrequentCommands(limit = 5): SlashCommand[] {
  // For now, return some sensible defaults
  const frequent = ['status', 'remind', 'shrug', 'dnd', 'task']
  const result: SlashCommand[] = []
  
  for (const name of frequent) {
    const cmd = commandRegistry.get(name)
    if (cmd) result.push(cmd)
    if (result.length >= limit) break
  }
  
  return result
}

/**
 * Clear the registry (useful for testing)
 */
export function clearRegistry(): void {
  commandRegistry.clear()
  aliasRegistry.clear()
}

/**
 * Get registry stats
 */
export function getRegistryStats(): {
  totalCommands: number
  byCategory: Record<CommandCategory, number>
} {
  const byCategory: Record<CommandCategory, number> = {
    messaging: 0,
    status: 0,
    navigation: 0,
    utility: 0,
    project: 0
  }
  
  for (const cmd of commandRegistry.values()) {
    byCategory[cmd.category]++
  }
  
  return {
    totalCommands: commandRegistry.size,
    byCategory
  }
}
