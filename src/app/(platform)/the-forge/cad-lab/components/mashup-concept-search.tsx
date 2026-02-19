"use client"

/**
 * MashupConceptSearch — AI-powered concept-to-STEP-combination discovery.
 *
 * @description The user describes what they want to create in natural language.
 * Claude searches the template library and returns 3–4 curated mashup "recipes",
 * each showing part thumbnails and a pre-filled generation concept.
 *
 * INTENT: Replace blank-page anxiety in Mashup Lab with inspired starting points.
 * Before this, users had to manually browse 200+ templates with no guidance.
 * Now they type "humanoid robot with quadcopter propellers" and get ready-to-go
 * combinations in seconds.
 */

import { useState, useTransition } from "react"
import Image from "next/image"
import { Sparkles, ArrowRight, FileBox, Shapes, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { suggestMashupCombinations } from "@/actions/cad-lab"
import type { MashupSuggestion, MashupSourceInput } from "@/lib/cad-lab-types"
import { cn } from "@/lib/utils"

// ─── Example prompts shown before any search ──────────────────────────

const EXAMPLE_PROMPTS = [
  "Humanoid robot with quadcopter propellers",
  "Mars rover with articulated crane arm",
  "Prosthetic hand with embedded pressure sensors",
  "Modular satellite with deployable solar wings",
] as const

// ─── Sub-components ───────────────────────────────────────────────────

/** Thumbnail for a single source part in a suggestion card. */
function PartThumbnail({ source }: { source: MashupSourceInput }): React.ReactElement {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="h-14 w-14 rounded-lg overflow-hidden bg-muted flex items-center justify-center border border-border">
        {source.thumbnail_url ? (
          <Image
            src={source.thumbnail_url}
            alt={source.name}
            width={56}
            height={56}
            className="h-full w-full object-cover"
            unoptimized
          />
        ) : (
          <FileBox className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <span className="text-[10px] text-muted-foreground text-center leading-tight max-w-[56px] truncate">
        {source.description ?? source.name}
      </span>
    </div>
  )
}

/** Loading skeleton while AI generates suggestions. */
function SuggestionSkeleton(): React.ReactElement {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="overflow-hidden">
          <CardContent className="p-5 space-y-4">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <div className="flex gap-3 pt-1">
              <Skeleton className="h-14 w-14 rounded-lg" />
              <Skeleton className="h-14 w-14 rounded-lg" />
              <Skeleton className="h-14 w-14 rounded-lg" />
            </div>
            <Skeleton className="h-9 w-full mt-2" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

/** A single AI suggestion card. */
function SuggestionCard({
  suggestion,
  onSelect,
}: {
  suggestion: MashupSuggestion
  onSelect: (sources: MashupSourceInput[], concept: string) => void
}): React.ReactElement {
  return (
    <Card className="flex flex-col overflow-hidden hover:shadow-md transition-shadow duration-200 border-border">
      <CardContent className="flex flex-col gap-4 p-5 flex-1">
        {/* Title + description */}
        <div>
          <h3 className="font-semibold text-foreground leading-tight">{suggestion.name}</h3>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{suggestion.description}</p>
        </div>

        {/* Part thumbnails */}
        <div className="flex flex-wrap gap-3">
          {suggestion.sources.map((source, i) => (
            <PartThumbnail key={`${source.name}-${i}`} source={source} />
          ))}
        </div>

        {/* Concept preview */}
        <p className="text-[11px] text-muted-foreground italic leading-relaxed border-l-2 border-international-orange/30 pl-2.5">
          {suggestion.concept}
        </p>

        {/* CTA */}
        <Button
          className="mt-auto w-full"
          onClick={() => onSelect(suggestion.sources, suggestion.concept)}
        >
          Use this combination
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  )
}

// ─── Main component ───────────────────────────────────────────────────

interface MashupConceptSearchProps {
  onSelect: (sources: MashupSourceInput[], concept: string) => void
  className?: string
}

/**
 * AI-powered mashup concept search panel.
 *
 * @description Renders a search input with example prompt chips. On submit,
 * calls suggestMashupCombinations and displays recipe cards with part thumbnails.
 */
export function MashupConceptSearch({
  onSelect,
  className,
}: MashupConceptSearchProps): React.ReactElement {
  const [query, setQuery] = useState("")
  const [suggestions, setSuggestions] = useState<MashupSuggestion[] | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSearch = (searchQuery: string): void => {
    const q = searchQuery.trim()
    if (!q) return
    setQuery(q)
    setSearchError(null)
    setSuggestions(null)

    startTransition(async () => {
      const result = await suggestMashupCombinations(q)
      if ("error" in result) {
        setSearchError(result.error)
      } else {
        setSuggestions(result.suggestions)
      }
    })
  }

  const handleExampleClick = (prompt: string): void => {
    setQuery(prompt)
    handleSearch(prompt)
  }

  const hasResults = suggestions !== null && suggestions.length > 0
  const isEmpty = suggestions !== null && suggestions.length === 0

  return (
    <div className={cn("space-y-5", className)}>
      {/* Search input */}
      <div className="space-y-3">
        <div className="flex gap-3">
          <Textarea
            placeholder="Describe what you want to create — e.g. a humanoid robot with quadcopter propellers"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSearch(query)
              }
            }}
            rows={2}
            className="resize-none flex-1"
          />
          <Button
            onClick={() => handleSearch(query)}
            disabled={isPending || !query.trim()}
            className="self-end shrink-0"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span className="ml-2 hidden sm:inline">
              {isPending ? "Thinking…" : "Find combinations"}
            </span>
          </Button>
        </div>

        {/* Example prompt chips */}
        {!hasResults && !isPending && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground self-center">Try:</span>
            {EXAMPLE_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => handleExampleClick(prompt)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
              >
                <Shapes className="h-3 w-3 shrink-0" />
                {prompt}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loading */}
      {isPending && <SuggestionSkeleton />}

      {/* Error */}
      {searchError && !isPending && (
        <p className="text-sm text-destructive">{searchError}</p>
      )}

      {/* Empty result */}
      {isEmpty && !isPending && (
        <p className="text-sm text-muted-foreground">
          No combinations found for that concept. Try rephrasing or use the template browser below.
        </p>
      )}

      {/* Suggestion cards */}
      {hasResults && !isPending && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {suggestions.length} combination{suggestions.length !== 1 ? "s" : ""} for &ldquo;{query}&rdquo;
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {suggestions.map((s, i) => (
              <SuggestionCard
                key={`${s.name}-${i}`}
                suggestion={s}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
