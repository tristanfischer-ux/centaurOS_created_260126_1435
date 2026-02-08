'use client'

import { useState } from 'react'
import { CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * ProfileStrengthGauge - Compact profile completeness indicator for providers.
 *
 * @description Shows a circular-style progress gauge with the profile strength
 * score. Expandable to reveal individual section completion status.
 * Much more compact than the old full-page checklist.
 *
 * @component
 */

interface ProfileStrengthGaugeProps {
  /** Profile strength score (0-100) */
  score: number
  /** Individual section completion data */
  sections: Array<{
    name: string
    weight: number
    completed: boolean
    suggestion: string
  }>
}

export function ProfileStrengthGauge({ score, sections }: ProfileStrengthGaugeProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const completedCount = sections.filter(s => s.completed).length
  const incompleteSections = sections.filter(s => !s.completed)

  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Circular gauge */}
            <div className="relative h-16 w-16 flex-shrink-0">
              <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
                {/* Background circle */}
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  fill="none"
                  stroke="hsl(var(--muted))"
                  strokeWidth="6"
                />
                {/* Progress arc */}
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  fill="none"
                  stroke={getScoreColor(score)}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${(score / 100) * 175.9} 175.9`}
                  className="transition-all duration-700 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={cn(
                  'text-sm font-bold',
                  score >= 80 ? 'text-status-success' :
                  score >= 50 ? 'text-status-warning' :
                  'text-destructive'
                )}>
                  {score}%
                </span>
              </div>
            </div>

            {/* Label */}
            <div>
              <p className="text-sm font-semibold text-foreground">
                Profile Strength
              </p>
              <p className="text-xs text-muted-foreground">
                {completedCount} of {sections.length} sections complete
              </p>
              {score < 80 && incompleteSections.length > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Next: {incompleteSections[0].name}
                </p>
              )}
            </div>
          </div>

          {/* Expand toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Hide details' : 'Show details'}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Expanded section list */}
        {isExpanded && (
          <div className="mt-4 pt-4 border-t space-y-2">
            {sections.map((section) => (
              <div
                key={section.name}
                className="flex items-start gap-2.5 py-1.5"
              >
                {section.completed ? (
                  <CheckCircle2 className="h-4 w-4 text-status-success flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-status-warning flex-shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <span className={cn(
                    'text-sm',
                    section.completed ? 'text-foreground' : 'text-muted-foreground'
                  )}>
                    {section.name}
                  </span>
                  {!section.completed && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {section.suggestion}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Returns the CSS color string for the gauge arc based on score.
 */
function getScoreColor(score: number): string {
  if (score >= 80) return 'hsl(var(--status-success))'
  if (score >= 50) return 'hsl(var(--status-warning))'
  return 'hsl(var(--destructive))'
}
