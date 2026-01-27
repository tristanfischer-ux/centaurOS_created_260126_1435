// Parse @mentions from text
export function parseMentions(text: string): string[] {
  const mentionRegex = /@([a-zA-Z0-9_]+)/g
  const mentions: string[] = []
  let match
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1])
  }
  return mentions
}

// Check if a position in text is in a mention
export function getMentionAtCursor(text: string, cursorPosition: number): { 
  mention: string; 
  start: number; 
  end: number 
} | null {
  // Look backwards from cursor for @
  let start = cursorPosition - 1
  while (start >= 0 && text[start] !== '@' && text[start] !== ' ' && text[start] !== '\n') {
    start--
  }
  
  if (start < 0 || text[start] !== '@') return null
  
  const mention = text.slice(start + 1, cursorPosition)
  if (!/^[a-zA-Z0-9_]*$/.test(mention)) return null
  
  return { mention, start, end: cursorPosition }
}
