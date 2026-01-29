'use client'

import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { getMentionAtCursor } from '@/lib/mentions'
import { cn } from '@/lib/utils'

interface Profile {
  id: string
  full_name: string
  email: string
}

interface MentionInputProps {
  value: string
  onChange: (value: string) => void
  members: Profile[]
  placeholder?: string
  className?: string
  onSubmit?: () => void
}

export function MentionInput({
  value,
  onChange,
  members,
  placeholder,
  className,
  onSubmit
}: MentionInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState<Profile[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [mentionInfo, setMentionInfo] = useState<{ start: number; end: number } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    onChange(newValue)
    
    const cursorPosition = e.target.selectionStart
    const mention = getMentionAtCursor(newValue, cursorPosition)
    
    if (mention) {
      const filtered = members.filter(m =>
        m.full_name.toLowerCase().includes(mention.mention.toLowerCase()) ||
        m.email.toLowerCase().includes(mention.mention.toLowerCase())
      )
      setSuggestions(filtered.slice(0, 5))
      setMentionInfo({ start: mention.start, end: mention.end })
      setShowSuggestions(filtered.length > 0)
      setSelectedIndex(0)
    } else {
      setShowSuggestions(false)
    }
  }

  const insertMention = (profile: Profile) => {
    if (!mentionInfo) return
    
    const firstName = profile.full_name.split(' ')[0]
    const before = value.slice(0, mentionInfo.start)
    const after = value.slice(mentionInfo.end)
    const newValue = `${before}@${firstName} ${after}`
    
    onChange(newValue)
    setShowSuggestions(false)
    textareaRef.current?.focus()
    
    // Set cursor position after the inserted mention
    setTimeout(() => {
      if (textareaRef.current) {
        const newPosition = mentionInfo.start + firstName.length + 2 // +2 for @ and space
        textareaRef.current.setSelectionRange(newPosition, newPosition)
      }
    }, 0)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showSuggestions) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onSubmit?.()
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      if (suggestions[selectedIndex]) {
        insertMention(suggestions[selectedIndex])
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (textareaRef.current && !textareaRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }

    if (showSuggestions) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showSuggestions])

  return (
    <div className="relative flex-1 w-full">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn("w-full", className)}
      />
      
      {showSuggestions && suggestions.length > 0 && (
        <div 
          role="listbox"
          aria-label="Mention suggestions"
          aria-live="polite"
          aria-atomic="false"
          className="absolute bottom-full mb-1 left-0 w-full max-w-xs bg-popover border rounded-lg shadow-lg z-50 overflow-hidden"
        >
          <div className="p-1 text-xs text-muted-foreground border-b" aria-hidden="true">
            Type to filter, ↑↓ to navigate, Enter to select
          </div>
          <div aria-live="polite" className="sr-only">
            {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''} available
          </div>
          {suggestions.map((profile, index) => (
            <button
              key={profile.id}
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              id={`mention-option-${profile.id}`}
              onClick={() => insertMention(profile)}
              className={cn(
                'w-full px-3 py-2 text-left text-sm flex items-center gap-2',
                index === selectedIndex ? 'bg-accent' : 'hover:bg-muted'
              )}
            >
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs" aria-hidden="true">
                {profile.full_name[0]}
              </div>
              <div>
                <div className="font-medium">{profile.full_name}</div>
                <div className="text-xs text-muted-foreground">{profile.email}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
