'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  GraduationCap,
  Clock,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Wrench,
  Briefcase,
  Sparkles,
  Target,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Shape returned by `getApprenticeProgrammes`.
 * Uses broad types to match Supabase's `Json` return type.
 */
export interface Programme {
  id: string
  title: string
  level: number
  standard_code: string | null
  duration_months: number
  otjt_hours_required: number
  description: string | null
  skills_framework: Record<string, string[]> | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  learning_outcomes: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assessment_plan: any
  is_active: boolean | null
}

interface ProgrammeDetailCardProps {
  programme: Programme
  /** Show "Enroll Apprentice" button (for admins) */
  canEnroll?: boolean
  onEnroll?: (programmeId: string) => void
}

const LEVEL_LABELS: Record<number, string> = {
  3: 'Advanced',
  4: 'Higher',
  5: 'Foundation Degree',
  6: 'Degree',
  7: 'Masters',
}

const SKILL_CATEGORY_META: Record<string, { label: string; icon: typeof Wrench }> = {
  technical: { label: 'Technical', icon: Wrench },
  professional: { label: 'Professional', icon: Briefcase },
  ai: { label: 'AI & Automation', icon: Sparkles },
}

/**
 * Rich card showing a single apprenticeship programme with expandable details.
 *
 * @description Displays programme title, level, duration, OTJT requirements,
 * and skills framework. Expandable to show full skill breakdown.
 */
export function ProgrammeDetailCard({ programme, canEnroll, onEnroll }: ProgrammeDetailCardProps) {
  const [expanded, setExpanded] = useState(false)

  const skills = programme.skills_framework || {}
  const totalSkills = Object.values(skills).reduce((sum, arr) => sum + arr.length, 0)
  const levelLabel = LEVEL_LABELS[programme.level] || `Level ${programme.level}`

  return (
    <Card className="border hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0 flex-1">
            <CardTitle className="text-base font-semibold text-foreground">
              {programme.title}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                <GraduationCap className="h-3 w-3 mr-1" />
                Level {programme.level} — {levelLabel}
              </Badge>
              {programme.standard_code && (
                <Badge variant="outline" className="text-xs">
                  {programme.standard_code}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Description */}
        {programme.description && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {programme.description}
          </p>
        )}

        {/* Key Stats */}
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>{programme.duration_months} months</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <BookOpen className="h-4 w-4" />
            <span>{programme.otjt_hours_required} OTJT hours</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Target className="h-4 w-4" />
            <span>{totalSkills} skills</span>
          </div>
        </div>

        {/* Skill Tags (collapsed) */}
        {!expanded && totalSkills > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {Object.values(skills)
              .flat()
              .slice(0, 6)
              .map((skill) => (
                <Badge key={skill} variant="outline" className="text-xs capitalize">
                  {skill.replace(/_/g, ' ')}
                </Badge>
              ))}
            {totalSkills > 6 && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                +{totalSkills - 6} more
              </Badge>
            )}
          </div>
        )}

        {/* Expanded: Full Skill Breakdown */}
        {expanded && (
          <div className="space-y-4 pt-2 border-t">
            {Object.entries(skills).map(([category, categorySkills]) => {
              const meta = SKILL_CATEGORY_META[category] || {
                label: category.charAt(0).toUpperCase() + category.slice(1),
                icon: Target,
              }
              const Icon = meta.icon
              return (
                <div key={category} className="space-y-2">
                  <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {meta.label}
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {categorySkills.map((skill) => (
                      <Badge key={skill} variant="secondary" className="text-xs capitalize">
                        {skill.replace(/_/g, ' ')}
                      </Badge>
                    ))}
                  </div>
                </div>
              )
            })}

            {/* Funding estimate */}
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">Estimated funding:</strong>{' '}
                Up to £{getFundingBand(programme.level).toLocaleString()} government contribution.
                SMEs co-invest just 5%.
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-4 w-4 mr-1" />
                Less Detail
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-1" />
                More Detail
              </>
            )}
          </Button>
          {canEnroll && onEnroll && (
            <Button size="sm" onClick={() => onEnroll(programme.id)}>
              Enroll Apprentice
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function getFundingBand(level: number): number {
  const bands: Record<number, number> = { 3: 9000, 4: 12000, 5: 15000, 6: 22000, 7: 27000 }
  return bands[level] || 12000
}
