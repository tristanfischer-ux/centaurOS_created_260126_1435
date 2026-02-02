/**
 * Search operator parser for advanced message search
 * Supports operators like: is:starred, from:@user, in:#channel, has:link, etc.
 */

export interface SearchOperator {
  type: 'is' | 'from' | 'in' | 'has' | 'before' | 'after' | 'on'
  value: string
}

export interface ParsedSearch {
  query: string // The text search query
  operators: SearchOperator[]
  raw: string // The original search string
}

/**
 * Parse a search query with operators
 * 
 * Examples:
 * - "is:starred project update" → query: "project update", operators: [{ type: 'is', value: 'starred' }]
 * - "from:@john has:link budget" → query: "budget", operators: [{ type: 'from', value: '@john' }, { type: 'has', value: 'link' }]
 * - "in:#general on:2024-01-15" → query: "", operators: [{ type: 'in', value: '#general' }, { type: 'on', value: '2024-01-15' }]
 */
export function parseSearchQuery(searchString: string): ParsedSearch {
  const operators: SearchOperator[] = []
  let remainingText = searchString

  // Regex to match operators: operator:value
  // Matches things like is:starred, from:@user, in:#channel, has:link
  const operatorRegex = /(\w+):([^\s]+)/g
  
  let match: RegExpExecArray | null
  while ((match = operatorRegex.exec(searchString)) !== null) {
    const [fullMatch, operatorType, operatorValue] = match
    
    // Validate operator type
    const validTypes = ['is', 'from', 'in', 'has', 'before', 'after', 'on']
    if (validTypes.includes(operatorType)) {
      operators.push({
        type: operatorType as SearchOperator['type'],
        value: operatorValue,
      })
      
      // Remove operator from remaining text
      remainingText = remainingText.replace(fullMatch, '')
    }
  }
  
  // Clean up remaining text (remove extra spaces)
  const query = remainingText.trim().replace(/\s+/g, ' ')
  
  return {
    query,
    operators,
    raw: searchString,
  }
}

/**
 * Build SQL filters for Supabase query based on search operators
 */
export interface SearchFilters {
  isStarred?: boolean
  isPinned?: boolean
  fromUserId?: string
  conversationId?: string
  hasLink?: boolean
  hasFile?: boolean
  beforeDate?: Date
  afterDate?: Date
  onDate?: Date
}

/**
 * Convert parsed operators to SQL filters
 * Note: User ID and conversation ID lookups need to be done separately
 */
export function operatorsToFilters(operators: SearchOperator[]): SearchFilters {
  const filters: SearchFilters = {}
  
  for (const op of operators) {
    switch (op.type) {
      case 'is':
        if (op.value === 'starred') {
          filters.isStarred = true
        } else if (op.value === 'pinned') {
          filters.isPinned = true
        }
        break
        
      case 'has':
        if (op.value === 'link') {
          filters.hasLink = true
        } else if (op.value === 'file' || op.value === 'attachment') {
          filters.hasFile = true
        }
        break
        
      case 'from':
        // Value might be @username or user ID
        // Caller needs to resolve username to ID
        filters.fromUserId = op.value.startsWith('@') 
          ? op.value.slice(1) // Remove @ prefix, caller will resolve
          : op.value
        break
        
      case 'in':
        // Value might be #channel-name or conversation ID
        // Caller needs to resolve channel name to ID
        filters.conversationId = op.value.startsWith('#')
          ? op.value.slice(1) // Remove # prefix, caller will resolve
          : op.value
        break
        
      case 'before':
        try {
          filters.beforeDate = new Date(op.value)
        } catch (e) {
          console.warn('Invalid date for before:', op.value)
        }
        break
        
      case 'after':
        try {
          filters.afterDate = new Date(op.value)
        } catch (e) {
          console.warn('Invalid date for after:', op.value)
        }
        break
        
      case 'on':
        try {
          const date = new Date(op.value)
          // Set to start of day
          date.setHours(0, 0, 0, 0)
          filters.onDate = date
        } catch (e) {
          console.warn('Invalid date for on:', op.value)
        }
        break
    }
  }
  
  return filters
}

/**
 * Get suggestions for operator values based on type
 */
export function getOperatorSuggestions(operatorType: string): string[] {
  switch (operatorType) {
    case 'is':
      return ['starred', 'pinned', 'unread']
    case 'has':
      return ['link', 'file', 'attachment', 'reaction']
    case 'from':
      return ['@'] // Followed by username autocomplete
    case 'in':
      return ['#'] // Followed by channel autocomplete
    default:
      return []
  }
}

/**
 * Validate operator combination (some combinations don't make sense)
 */
export function validateOperators(operators: SearchOperator[]): { valid: boolean; error?: string } {
  // Check for duplicate operator types
  const types = operators.map(op => op.type)
  const uniqueTypes = new Set(types)
  
  if (types.length !== uniqueTypes.size) {
    return { 
      valid: false, 
      error: 'Duplicate operators are not allowed' 
    }
  }
  
  // Check for conflicting date operators
  const hasOn = operators.some(op => op.type === 'on')
  const hasBeforeOrAfter = operators.some(op => op.type === 'before' || op.type === 'after')
  
  if (hasOn && hasBeforeOrAfter) {
    return {
      valid: false,
      error: 'Cannot use "on:" with "before:" or "after:"'
    }
  }
  
  return { valid: true }
}

/**
 * Format operator for display (e.g., for search chips)
 */
export function formatOperator(operator: SearchOperator): string {
  switch (operator.type) {
    case 'is':
      return `Is: ${operator.value}`
    case 'from':
      return `From: ${operator.value}`
    case 'in':
      return `In: ${operator.value}`
    case 'has':
      return `Has: ${operator.value}`
    case 'before':
      return `Before: ${operator.value}`
    case 'after':
      return `After: ${operator.value}`
    case 'on':
      return `On: ${operator.value}`
    default:
      return `${operator.type}:${operator.value}`
  }
}

/**
 * Example usage:
 * 
 * const parsed = parseSearchQuery("is:starred from:@john project update")
 * // Result:
 * // {
 * //   query: "project update",
 * //   operators: [
 * //     { type: 'is', value: 'starred' },
 * //     { type: 'from', value: '@john' }
 * //   ],
 * //   raw: "is:starred from:@john project update"
 * // }
 * 
 * const filters = operatorsToFilters(parsed.operators)
 * // Result:
 * // {
 * //   isStarred: true,
 * //   fromUserId: 'john' // (needs to be resolved to actual user ID)
 * // }
 * 
 * // Then in your query:
 * let query = supabase.from('messages').select('*')
 * 
 * if (filters.isStarred) {
 *   query = query.in('id', starredMessageIds)
 * }
 * 
 * if (filters.fromUserId) {
 *   query = query.eq('sender_id', resolvedUserId)
 * }
 * 
 * if (parsed.query) {
 *   query = query.textSearch('content', parsed.query)
 * }
 */
