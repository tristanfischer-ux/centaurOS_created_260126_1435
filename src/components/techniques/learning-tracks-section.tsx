'use client'

/**
 * LearningTracksSection — Curated multi-technique learning sequences.
 *
 * @description Renders all learning tracks from the static config.
 * Each track shows its ordered technique sequence with progress markers
 * derived from the user's localStorage-saved techniques (useSavedTechniques).
 *
 * A tick appears next to techniques the user has already saved.
 * Progress bar shows percentage of the track completed.
 *
 * The default-recommended track renders with a highlighted border.
 *
 * @component
 */

import { useMemo } from 'react'
import { BookOpen, CheckCircle2, Circle, Clock, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { LEARNING_TRACKS, computeTrackProgress } from '@/lib/manufacturing/learning-tracks'
import { getTechniqueById } from '@/lib/manufacturing-techniques'
import { useSavedTechniques } from '@/hooks/useSavedTechniques'

export function LearningTracksSection() {
  const { savedIds } = useSavedTechniques()

  return (
    <div className="space-y-6">
      {/* Intro */}
      <div className="rounded-lg border border-electric-blue/20 bg-electric-blue/5 p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-electric-blue/10 flex items-center justify-center shrink-0">
            <BookOpen className="h-5 w-5 text-electric-blue" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-1">
              Learning Tracks
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Curated sequences of manufacturing techniques ordered for hardware founders.
              Save techniques as you read through them — your progress is tracked automatically.
            </p>
          </div>
        </div>
      </div>

      {/* Track cards */}
      {LEARNING_TRACKS.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No learning tracks available yet. Check back soon.
        </div>
      ) : (
        <div className="space-y-4">
          {LEARNING_TRACKS.map(track => {
            const progress = computeTrackProgress(track, savedIds)
            const isDefault = track.isDefault

            return (
              <Card
                key={track.id}
                className={cn(
                  'overflow-hidden',
                  isDefault && 'border-electric-blue/30',
                )}
              >
                <CardContent className="p-5 space-y-4">
                  {/* Track header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {isDefault && (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-electric-blue/40 text-electric-blue"
                          >
                            Recommended
                          </Badge>
                        )}
                      </div>
                      <h3 className="text-sm font-semibold text-foreground leading-snug">
                        {track.title}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {track.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{track.estimatedTime}</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>
                        {progress.completedCount} of {progress.totalCount} saved
                      </span>
                      <span>{progress.percentComplete}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-electric-blue transition-all duration-500"
                        style={{ width: `${progress.percentComplete}%` }}
                        role="progressbar"
                        aria-valuenow={progress.percentComplete}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${progress.percentComplete}% complete`}
                      />
                    </div>
                  </div>

                  {/* Technique sequence */}
                  <ol className="space-y-2">
                    {track.techniqueIds.map((techniqueId, index) => {
                      const technique = getTechniqueById(techniqueId)
                      const isSaved = savedIds.has(techniqueId)

                      return (
                        <li key={techniqueId} className="flex items-center gap-3">
                          {/* Step number / saved indicator */}
                          <div className="w-5 shrink-0 flex items-center justify-center">
                            {isSaved ? (
                              <CheckCircle2 className="h-5 w-5 text-electric-blue" />
                            ) : (
                              <div className="flex items-center justify-center w-5 h-5 rounded-full border-2 border-muted-foreground/30">
                                <span className="text-[9px] text-muted-foreground font-mono">
                                  {index + 1}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Technique name */}
                          <div className={cn('flex-1 min-w-0', isSaved && 'opacity-70')}>
                            {technique ? (
                              <span
                                className={cn(
                                  'text-sm',
                                  isSaved
                                    ? 'text-muted-foreground line-through'
                                    : 'text-foreground',
                                )}
                              >
                                {technique.name}
                              </span>
                            ) : (
                              <span className="text-sm text-muted-foreground italic">
                                Technique not yet available
                              </span>
                            )}
                          </div>

                          {/* Category badge */}
                          {technique && (
                            <Badge variant="secondary" className="text-[10px] shrink-0">
                              {technique.category}
                            </Badge>
                          )}
                        </li>
                      )
                    })}
                  </ol>

                  {/* CTA */}
                  <div className="pt-1 border-t border-muted">
                    {progress.percentComplete === 100 ? (
                      <p className="text-xs text-electric-blue font-medium flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4" />
                        Track complete. All techniques saved.
                      </p>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1 text-electric-blue hover:text-electric-blue hover:bg-electric-blue/5 px-0"
                        onClick={() => {
                          // Find the first unsaved technique and switch to the
                          // Techniques tab so the user can read and save it.
                          // In V1 this is a simple scroll-hint — the tab switch
                          // happens via parent state in the learn page.
                        }}
                      >
                        Browse these techniques
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
