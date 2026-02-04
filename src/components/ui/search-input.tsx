"use client"

import { Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/**
 * SearchInput - A lightweight search input with icon and clear button.
 * 
 * @description Simple search input for filtering lists. Includes a search icon
 * on the left and a clear button when there's a value. Use with useDebounce
 * for performant filtering.
 * 
 * @example
 * const [query, setQuery] = useState('')
 * const debouncedQuery = useDebounce(query, 300)
 * 
 * <SearchInput
 *   value={query}
 *   onChange={setQuery}
 *   placeholder="Search tasks..."
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
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  className,
  inputClassName,
  "aria-label": ariaLabel = "Search",
}: SearchInputProps) {
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
        placeholder={placeholder}
        className={cn("pl-9 pr-9", inputClassName)}
        aria-label={ariaLabel}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
