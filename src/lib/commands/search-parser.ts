/**
 * Search Parser - Parse Slack-style search operators
 * 
 * Supports operators like:
 * - is:starred, is:pinned, is:unread
 * - from:@username, from:me
 * - in:#channel, in:@user
 * - has:link, has:file, has:reaction
 * - before:date, after:date
 * 
 * @example
 * parseSearchQuery('is:starred from:@john has:link important')
 * // Returns: {
 * //   filters: {
 * //     is: ['starred'],
 * //     from: ['@john'],
 * //     has: ['link']
 * //   },
 * //   keywords: ['important']
 * // }
 */

export type SearchOperator = 'is' | 'from' | 'in' | 'has' | 'before' | 'after'

export type IsValue = 'starred' | 'pinned' | 'unread' | 'read'
export type HasValue = 'link' | 'file' | 'reaction' | 'thread'

export interface SearchFilters {
  is?: IsValue[]
  from?: string[] // User mentions or 'me'
  in?: string[] // Channel/conversation names
  has?: HasValue[]
  before?: string // ISO date string
  after?: string // ISO date string
}

export interface ParsedSearch {
  filters: SearchFilters
  keywords: string[] // Non-operator words
  raw: string // Original query
}

const OPERATORS: SearchOperator[] = ['is', 'from', 'in', 'has', 'before', 'after']

/**
 * Parse a search query into filters and keywords
 */
export function parseSearchQuery(query: string): ParsedSearch {
  const filters: SearchFilters = {}
  const keywords: string[] = []
  
  // Regular expression to match operator:value pairs
  const operatorRegex = /(\w+):([^\s]+)/g
  
  let match: RegExpExecArray | null
  const processedIndices: number[] = []
  
  // Extract operator:value pairs
  while ((match = operatorRegex.exec(query)) !== null) {
    const [fullMatch, operator, value] = match
    const startIndex = match.index
    const endIndex = startIndex + fullMatch.length
    
    processedIndices.push(startIndex, endIndex)
    
    if (OPERATORS.includes(operator as SearchOperator)) {
      const op = operator as SearchOperator
      
      switch (op) {
        case 'is':
          if (!filters.is) filters.is = []
          filters.is.push(value as IsValue)
          break
        case 'from':
          if (!filters.from) filters.from = []
          filters.from.push(value)
          break
        case 'in':
          if (!filters.in) filters.in = []
          filters.in.push(value)
          break
        case 'has':
          if (!filters.has) filters.has = []
          filters.has.push(value as HasValue)
          break
        case 'before':
          filters.before = value
          break
        case 'after':
          filters.after = value
          break
      }
    }
  }
  
  // Extract keywords (non-operator words)
  let currentIndex = 0
  while (currentIndex < query.length) {
    // Check if current position is within an operator
    const isInOperator = processedIndices.some((idx, i) => {
      if (i % 2 === 0) { // Start index
        const endIdx = processedIndices[i + 1]
        return currentIndex >= idx && currentIndex < endIdx
      }
      return false
    })
    
    if (isInOperator) {
      // Find the end of this operator
      const nextEnd = processedIndices.find((idx, i) => {
        return i % 2 === 1 && idx > currentIndex
      })
      currentIndex = nextEnd || query.length
    } else {
      // Extract keyword
      const nextOperatorStart = processedIndices.find(idx => idx > currentIndex)
      const end = nextOperatorStart !== undefined ? nextOperatorStart : query.length
      const keyword = query.slice(currentIndex, end).trim()
      
      if (keyword.length > 0) {
        keywords.push(keyword)
      }
      
      currentIndex = end
    }
  }
  
  return {
    filters,
    keywords,
    raw: query,
  }
}

/**
 * Build SQL filter conditions from parsed search
 */
export interface SearchConditions {
  messageIds?: string[] // For starred/pinned filters (requires separate query)
  senderIds?: string[] // For from: filter
  conversationIds?: string[] // For in: filter
  hasFile?: boolean
  hasLink?: boolean
  hasReaction?: boolean
  hasThread?: boolean
  beforeDate?: Date
  afterDate?: Date
  isUnread?: boolean
  keywords?: string[] // For full-text search
}

/**
 * Convert parsed search to SQL-ready conditions
 * 
 * Note: Some filters (starred, pinned) require pre-fetching message IDs
 * from the respective tables before querying messages.
 */
export function buildSearchConditions(
  parsed: ParsedSearch,
  currentUserId: string
): SearchConditions {
  const conditions: SearchConditions = {}
  
  // Handle 'has:' filters
  if (parsed.filters.has) {
    if (parsed.filters.has.includes('file')) {
      conditions.hasFile = true
    }
    if (parsed.filters.has.includes('link')) {
      conditions.hasLink = true
    }
    if (parsed.filters.has.includes('reaction')) {
      conditions.hasReaction = true
    }
    if (parsed.filters.has.includes('thread')) {
      conditions.hasThread = true
    }
  }
  
  // Handle 'before:' and 'after:' date filters
  if (parsed.filters.before) {
    conditions.beforeDate = new Date(parsed.filters.before)
  }
  if (parsed.filters.after) {
    conditions.afterDate = new Date(parsed.filters.after)
  }
  
  // Handle 'from:' filter
  if (parsed.filters.from) {
    conditions.senderIds = parsed.filters.from.map(f => {
      if (f === 'me') return currentUserId
      // Remove @ prefix if present
      return f.startsWith('@') ? f.slice(1) : f
    })
  }
  
  // Handle 'is:' filters
  if (parsed.filters.is) {
    if (parsed.filters.is.includes('unread')) {
      conditions.isUnread = true
    }
    // Note: starred and pinned require separate queries
    // They should be handled in the search service by first
    // fetching the message IDs from message_stars/pinned_messages tables
  }
  
  // Add keywords for full-text search
  if (parsed.keywords.length > 0) {
    conditions.keywords = parsed.keywords
  }
  
  return conditions
}

/**
 * Format search results display
 */
export function formatSearchSummary(parsed: ParsedSearch): string {
  const parts: string[] = []
  
  if (parsed.filters.is) {
    parts.push(`Status: ${parsed.filters.is.join(', ')}`)
  }
  if (parsed.filters.from) {
    parts.push(`From: ${parsed.filters.from.join(', ')}`)
  }
  if (parsed.filters.in) {
    parts.push(`In: ${parsed.filters.in.join(', ')}`)
  }
  if (parsed.filters.has) {
    parts.push(`Has: ${parsed.filters.has.join(', ')}`)
  }
  if (parsed.filters.before) {
    parts.push(`Before: ${parsed.filters.before}`)
  }
  if (parsed.filters.after) {
    parts.push(`After: ${parsed.filters.after}`)
  }
  if (parsed.keywords.length > 0) {
    parts.push(`Keywords: "${parsed.keywords.join(' ')}"`)
  }
  
  return parts.join(' • ')
}
