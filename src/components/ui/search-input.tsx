"use client"

import { useState, useCallback } from "react"
import { Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { SpeechButton } from "@/components/ui/speech-button"
import { cn } from "@/lib/utils"

/**
 * SearchInput - A lightweight search input with icon, clear button, and optional speech-to-text.
 *
 * @description Simple search input for filtering lists. Includes a search icon
 * on the left, a clear button when there's a value, and an optional mic button
 * for voice input. Use with useDebounce for performant filtering.
 *
 * @example
 * const [query, setQuery] = useState('')
 * const debouncedQuery = useDebounce(query, 300)
 *
 * <SearchInput
 *   value={query}
 *   onChange={setQuery}
 *   placeholder="Search tasks..."
 *   enableSpeech
 * />
 */

interface SearchInputProps {
  /** Current search value */
  value: string
  /** Called when value changes */
  onChange: (value: string) => void
  /** Placeholder text */
  placeholder?: string
  /** Additional CSS classes for the container */
  className?: string
  /** Additional CSS classes for the input */
  inputClassName?: string
  /** Accessible label for screen readers */
  "aria-label"?: string
  /** Show a speech-to-text mic button */
  enableSpeech?: boolean
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  className,
  inputClassName,
  "aria-label": ariaLabel = "Search",
  enableSpeech = false,
}: SearchInputProps) {
  const [isListening, setIsListening] = useState(false)

  const handleTranscript = useCallback(
    (text: string) => {
      onChange(value ? value + " " + text : text)
    },
    [onChange, value]
  )

  return (
    <div className={cn("relative", className)}>
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
        aria-hidden="true"
      />
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isListening ? "Listening... speak now" : placeholder}
        className={cn(
          "pl-9",
          enableSpeech ? "pr-16" : "pr-9",
          isListening && "border-destructive/50",
          inputClassName
        )}
        aria-label={ariaLabel}
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
        {enableSpeech && (
          <SpeechButton
            onTranscript={handleTranscript}
            onListeningChange={setIsListening}
            className="h-6 w-6"
            iconSize="h-3.5 w-3.5"
          />
        )}
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
