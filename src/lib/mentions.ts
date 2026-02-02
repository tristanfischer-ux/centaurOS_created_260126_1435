/**
 * Mention types for different notification behaviors
 */
export type MentionType = 'user' | 'here' | 'channel' | 'everyone'

/**
 * Parsed mention with type and location
 */
export interface ParsedMention {
  type: MentionType
  value: string      // username or special keyword
  start: number
  end: number
}

/**
 * Special mentions with their notification behavior
 */
export const SPECIAL_MENTIONS: Record<string, { type: MentionType; description: string }> = {
  'here': { type: 'here', description: 'Notify active users in this channel' },
  'channel': { type: 'channel', description: 'Notify all members of this channel' },
  'everyone': { type: 'everyone', description: 'Notify everyone in the workspace' }
}

/**
 * Parse all mentions from text (both user mentions and special mentions)
 */
export function parseMentions(text: string): ParsedMention[] {
  const mentions: ParsedMention[] = []
  
  // Match @here, @channel, @everyone (special mentions)
  const specialRegex = /@(here|channel|everyone)\b/gi
  let match
  while ((match = specialRegex.exec(text)) !== null) {
    const keyword = match[1].toLowerCase() as keyof typeof SPECIAL_MENTIONS
    mentions.push({
      type: SPECIAL_MENTIONS[keyword].type,
      value: keyword,
      start: match.index,
      end: match.index + match[0].length
    })
  }
  
  // Match @username mentions (but not the special ones)
  const userRegex = /@([a-zA-Z0-9_]+)/g
  while ((match = userRegex.exec(text)) !== null) {
    const username = match[1].toLowerCase()
    // Skip if it's a special mention
    if (SPECIAL_MENTIONS[username]) continue
    
    mentions.push({
      type: 'user',
      value: match[1],
      start: match.index,
      end: match.index + match[0].length
    })
  }
  
  // Sort by position
  mentions.sort((a, b) => a.start - b.start)
  
  return mentions
}

/**
 * Parse only user mentions (for backwards compatibility)
 */
export function parseUserMentions(text: string): string[] {
  return parseMentions(text)
    .filter(m => m.type === 'user')
    .map(m => m.value)
}

/**
 * Check if text contains any special mentions
 */
export function hasSpecialMention(text: string): boolean {
  return parseMentions(text).some(m => m.type !== 'user')
}

/**
 * Get the highest priority mention type in text
 * Priority: everyone > channel > here > user
 */
export function getHighestPriorityMention(text: string): MentionType | null {
  const mentions = parseMentions(text)
  if (mentions.length === 0) return null
  
  const priority: MentionType[] = ['everyone', 'channel', 'here', 'user']
  for (const type of priority) {
    if (mentions.some(m => m.type === type)) return type
  }
  return null
}

/**
 * Check if a position in text is in a mention (for autocomplete)
 */
export function getMentionAtCursor(text: string, cursorPosition: number): { 
  mention: string; 
  start: number; 
  end: number;
  isSpecial?: boolean;
} | null {
  // Look backwards from cursor for @
  let start = cursorPosition - 1
  while (start >= 0 && text[start] !== '@' && text[start] !== ' ' && text[start] !== '\n') {
    start--
  }
  
  if (start < 0 || text[start] !== '@') return null
  
  const mention = text.slice(start + 1, cursorPosition)
  if (!/^[a-zA-Z0-9_]*$/.test(mention)) return null
  
  // Check if this might be a special mention
  const isSpecial = ['here', 'channel', 'everyone'].some(s => 
    s.startsWith(mention.toLowerCase())
  )
  
  return { mention, start, end: cursorPosition, isSpecial }
}

/**
 * Render mentions with highlighting (returns HTML string)
 * WARNING: Output must be sanitized before rendering
 */
export function renderMentionsAsHtml(text: string): string {
  const mentions = parseMentions(text)
  if (mentions.length === 0) return text
  
  let result = ''
  let lastIndex = 0
  
  for (const mention of mentions) {
    // Add text before this mention
    result += escapeHtml(text.slice(lastIndex, mention.start))
    
    // Add highlighted mention
    const mentionText = text.slice(mention.start, mention.end)
    const className = mention.type === 'user' 
      ? 'bg-electric-blue-light text-electric-blue px-1 rounded font-medium'
      : 'bg-status-warning-light text-status-warning-dark px-1 rounded font-medium'
    
    result += `<span class="${className}">${escapeHtml(mentionText)}</span>`
    lastIndex = mention.end
  }
  
  // Add remaining text
  result += escapeHtml(text.slice(lastIndex))
  
  return result
}

/**
 * Escape HTML characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Get users to notify based on mention type
 */
export function getMentionedUserIds(
  text: string,
  options: {
    allUserIds: string[]
    activeUserIds: string[]
    userIdsByUsername: Record<string, string>
  }
): string[] {
  const mentions = parseMentions(text)
  const userIds = new Set<string>()
  
  for (const mention of mentions) {
    switch (mention.type) {
      case 'everyone':
        // All users in workspace
        options.allUserIds.forEach(id => userIds.add(id))
        break
      case 'channel':
        // All members of the channel (same as allUserIds in context)
        options.allUserIds.forEach(id => userIds.add(id))
        break
      case 'here':
        // Only active users
        options.activeUserIds.forEach(id => userIds.add(id))
        break
      case 'user':
        // Specific user
        const userId = options.userIdsByUsername[mention.value.toLowerCase()]
        if (userId) userIds.add(userId)
        break
    }
  }
  
  return Array.from(userIds)
}
