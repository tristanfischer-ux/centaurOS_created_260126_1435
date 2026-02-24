'use client'

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Textarea } from '@/components/ui/textarea'
import { UserAvatar } from '@/components/ui/user-avatar'
import { SpeechButton } from '@/components/ui/speech-button'
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
  /** Show a speech-to-text mic button */
  enableSpeech?: boolean
}

export function MentionInput({
  value,
  onChange,
  members,
  placeholder,
  className,
  onSubmit,
  enableSpeech = false,
}: MentionInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState<Profile[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [mentionInfo, setMentionInfo] = useState<{ start: number; end: number } | null>(null)
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
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
    
    const fullName = profile.full_name
    const before = value.slice(0, mentionInfo.start)
    const after = value.slice(mentionInfo.end)
    
    // Use quotes if name contains spaces
    const hasSpace = fullName.includes(' ')
    const mentionText = hasSpace ? `@"${fullName}"` : `@${fullName}`
    const newValue = `${before}${mentionText} ${after}`
    
    onChange(newValue)
    
    // Keep dropdown open for multiple mentions if keepOpen is true
    if (!keepOpen) {
      setShowSuggestions(false)
    }
    
    textareaRef.current?.focus()
    
    // Set cursor position after the inserted mention
    setTimeout(() => {
      if (textareaRef.current) {
        const newPosition = mentionInfo.start + mentionText.length + 1 // +1 for space
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

  // Close suggestions when clicking outside (but not when clicking the dropdown itself)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      const isInTextarea = textareaRef.current?.contains(target)
      const isInDropdown = dropdownRef.current?.contains(target)
      
      if (!isInTextarea && !isInDropdown) {
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
        ref={dropdownRef}
        role="listbox"
        aria-label="Mention suggestions"
        aria-live="polite"
        aria-atomic="false"
        className="fixed bg-background border-2 border rounded-lg shadow-xl overflow-hidden"
        style={{
          top: dropdownPosition.top - 4,
          left: dropdownPosition.left,
          width: dropdownPosition.width,
          transform: 'translateY(-100%)',
          zIndex: 9999
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-2 text-xs text-muted-foreground border-b bg-muted" aria-hidden="true">
          Type to filter, ↑↓ to navigate, Enter to select
        </div>
        <div aria-live="polite" className="sr-only">
          {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''} available
        </div>
        <div className="max-h-[200px] overflow-y-auto bg-background">
          {suggestions.map((profile, index) => (
            <button
              key={profile.id}
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              id={`mention-option-${profile.id}`}
              onMouseDown={(e) => {
                // Prevent the mousedown from closing the dropdown or triggering other elements
                e.preventDefault()
                e.stopPropagation()
              }}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                insertMention(profile, false)
              }}
              className={cn(
                'w-full px-3 py-2 text-left text-sm flex items-center gap-3 transition-colors',
                index === selectedIndex ? 'bg-status-info-light text-status-info-dark' : 'hover:bg-muted'
              )}
            >
              <UserAvatar
                name={profile.full_name}
                size="sm"
                className="border border-slate-200 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate text-foreground">{profile.full_name}</div>
                <div className="text-xs text-muted-foreground truncate">{profile.email}</div>
              </div>
            </button>
          ))}
        </div>
      </div>,
      document.body
    )
  }

  const [isListening, setIsListening] = useState(false)

  const handleSpeechTranscript = useCallback(
    (text: string) => {
      onChange(value ? value + " " + text : text)
    },
    [onChange, value]
  )

  return (
    <div className="relative flex-1 w-full">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={isListening ? "Listening... speak now" : placeholder}
        className={cn(
          "w-full",
          enableSpeech && "pr-10",
          isListening && "border-destructive/50",
          className
        )}
      />
      {enableSpeech && (
        <SpeechButton
          onTranscript={handleSpeechTranscript}
          onListeningChange={setIsListening}
          className="absolute right-1 top-1"
        />
      )}
      {renderDropdown()}
    </div>
  )
}
