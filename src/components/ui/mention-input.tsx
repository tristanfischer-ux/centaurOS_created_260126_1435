'use client'

import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getMentionAtCursor } from '@/lib/mentions'
import { cn, getInitials } from '@/lib/utils'

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
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [mounted, setMounted] = useState(false)

  const updateDropdownPosition = () => {
    if (textareaRef.current) {
      const rect = textareaRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.top,
        left: rect.left,
        width: Math.min(rect.width, 320) // max-w-xs equivalent
      })
    }
  }

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
      updateDropdownPosition()
    } else {
      setShowSuggestions(false)
    }
  }

  const insertMention = (profile: Profile, keepOpen = false) => {
    if (!mentionInfo) return
    
    const firstName = profile.full_name.split(' ')[0]
    const before = value.slice(0, mentionInfo.start)
    const after = value.slice(mentionInfo.end)
    const newValue = `${before}@${firstName} ${after}`
    
    onChange(newValue)
    
    // Keep dropdown open for multiple mentions if keepOpen is true
    if (!keepOpen) {
      setShowSuggestions(false)
    }
    
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

  // Set mounted state
  useEffect(() => {
    setMounted(true)
  }, [])

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

  // Update position on scroll/resize
  useEffect(() => {
    if (showSuggestions) {
      updateDropdownPosition()
      window.addEventListener('scroll', updateDropdownPosition, true)
      window.addEventListener('resize', updateDropdownPosition)
      return () => {
        window.removeEventListener('scroll', updateDropdownPosition, true)
        window.removeEventListener('resize', updateDropdownPosition)
      }
    }
  }, [showSuggestions])

  const renderDropdown = () => {
    if (!showSuggestions || suggestions.length === 0 || !dropdownPosition || !mounted) {
      return null
    }

    return createPortal(
      <div 
        role="listbox"
        aria-label="Mention suggestions"
        aria-live="polite"
        aria-atomic="false"
        className="fixed bg-white border-2 border-slate-200 rounded-lg shadow-xl z-[100] overflow-hidden"
        style={{
          top: dropdownPosition.top - 4,
          left: dropdownPosition.left,
          width: dropdownPosition.width,
          transform: 'translateY(-100%)'
        }}
      >
        <div className="p-2 text-xs text-slate-500 border-b bg-slate-50" aria-hidden="true">
          Type to filter, ↑↓ to navigate, Enter to select
        </div>
        <div aria-live="polite" className="sr-only">
          {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''} available
        </div>
        <div className="max-h-[200px] overflow-y-auto bg-white">
          {suggestions.map((profile, index) => (
            <button
              key={profile.id}
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              id={`mention-option-${profile.id}`}
              onClick={() => insertMention(profile, false)}
              className={cn(
                'w-full px-3 py-2 text-left text-sm flex items-center gap-3 transition-colors',
                index === selectedIndex ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50'
              )}
            >
              <Avatar className="h-8 w-8 border border-slate-200 shrink-0">
                <AvatarFallback className="bg-slate-100 text-slate-700 text-xs font-medium">
                  {getInitials(profile.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate text-slate-900">{profile.full_name}</div>
                <div className="text-xs text-slate-500 truncate">{profile.email}</div>
              </div>
            </button>
          ))}
        </div>
      </div>,
      document.body
    )
  }

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
      {renderDropdown()}
    </div>
  )
}
