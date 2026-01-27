'use client'

import { Markdown } from './markdown'

interface Profile {
  id: string
  full_name: string | null
}

interface MentionTextProps {
  content: string
  members?: Profile[]
}

export function MentionText({ content, members = [] }: MentionTextProps) {
  if (!content) return null

  // Check if content has mentions
  const hasMentions = /@\w+/.test(content)
  
  // If there are no mentions, just render as markdown
  if (!hasMentions) {
    return <Markdown content={content} />
  }

  // Split content by mentions to render them with special styling
  const parts = content.split(/(@\w+)/g)
  
  // Check if any non-mention parts contain markdown syntax
  const hasMarkdown = parts.some((part, i) => 
    !part.startsWith('@') && part && /[#*_`\[\]]/.test(part)
  )

  // If there's markdown, render as markdown but we'll lose mention highlighting
  // For now, prioritize mention highlighting over markdown when both are present
  // A future enhancement could process mentions in markdown-aware way
  
  return (
    <div className="whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.startsWith('@')) {
          const name = part.slice(1)
          const member = members.find(m => 
            m.full_name && m.full_name.toLowerCase().startsWith(name.toLowerCase())
          )
          return (
            <span 
              key={i} 
              className="text-blue-600 font-medium bg-blue-50 px-1 rounded"
              title={member?.full_name || undefined}
            >
              {part}
            </span>
          )
        }
        // Render non-mention parts as plain text
        // Note: If markdown support is needed alongside mentions, this would need enhancement
        return <span key={i}>{part}</span>
      })}
    </div>
  )
}
