'use client'

import Link from 'next/link'
import { Target, ChevronRight, Calendar, Lightbulb, Briefcase, ArrowRight, Map } from 'lucide-react'
import { differenceInDays } from 'date-fns'
import { cn } from '@/lib/utils'
import { Progress } from '@/components/ui/progress'

interface Objective {
  id: string
  title: string
  description?: string | null
  status: string
  progress?: number | null
  start_date: string | null
  end_date: string | null
  created_at: string
  creator?: { full_name: string | null; avatar_url?: string | null } | null
  is_strategic_goal?: boolean | null
  is_demo?: boolean
}

interface ObjectiveCardsProps {
  objectives: Objective[]
}

/**
 * Objective Progress Cards with contextual next-step nudges.
 * 
 * Each objective gets a subtle suggestion based on its state:
 * - New / low progress: nudge to Inspiration for packs
 * - Behind schedule: nudge to Marketplace for expert help
 * - On track: encouragement only
 * 
 * These nudges drive revenue without being pushy.
 */
export function ObjectiveCards({ objectives }: ObjectiveCardsProps) {
  const activeObjectives = objectives.filter(obj => 
    obj.status === 'Active' || obj.status === 'In_Progress'
  ).slice(0, 3) // Show top 3
  
  return (
    <div className="bg-card rounded-2xl shadow-sm border overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b bg-gradient-to-r from-status-info-light/50 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-status-info-light rounded-lg">
              <Target className="w-5 h-5 text-status-info" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Active Objectives</h2>
              <p className="text-sm text-muted-foreground">Track your strategic goals</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Objective Cards */}
      <div className="p-6 space-y-4">
        {activeObjectives.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
              <Target className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              No active objectives yet
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Link
                href="/new-objectives"
                className="inline-flex items-center justify-center gap-1 text-sm text-international-orange hover:text-orange-700 font-medium"
              >
                Create your first objective
              </Link>
              <span className="text-muted-foreground hidden sm:inline">&middot;</span>
              <Link
                href="/playbooks"
                className="inline-flex items-center justify-center gap-1 text-sm text-status-info hover:text-status-info-dark font-medium"
              >
                <Lightbulb className="w-3.5 h-3.5" />
                Browse objective packs
              </Link>
            </div>
          </div>
        ) : (
          activeObjectives.map((objective) => (
            <ObjectiveCard key={objective.id} objective={objective} />
          ))
        )}
      </div>
      
      {/* Footer */}
      {activeObjectives.length > 0 && (
        <div className="p-4 bg-muted/50 border-t">
          <Link
            href="/new-objectives"
            className="text-sm text-international-orange hover:text-orange-700 font-medium flex items-center gap-1 group w-fit"
          >
            View all objectives
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      )}
    </div>
  )
}

function ObjectiveCard({ objective }: { objective: Objective }) {
  const progress = objective.progress || 0
  const daysRemaining = objective.end_date 
    ? differenceInDays(new Date(objective.end_date), new Date())
    : null
  const nudge = getObjectiveNudge(objective, progress, daysRemaining)
  
  return (
    <div className="rounded-xl border overflow-hidden">
      <Link
        href={`/objectives/${objective.id}`}
        className="block p-4 hover:bg-muted/30 transition-all duration-200 group"
      >
        <div className="space-y-3">
          {/* Title and Progress */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground group-hover:text-international-orange transition-colors line-clamp-2">
                {objective.title}
              </h3>
              {objective.is_demo && (
                <span className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground bg-muted rounded px-1.5 py-0 shrink-0 font-medium">
                  Demo
                </span>
              )}
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-international-orange transition-colors flex-shrink-0" />
          </div>
          
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Progress</span>
              <span className={cn(
                "font-bold",
                progress >= 75 ? "text-status-success" :
                progress >= 50 ? "text-status-info" :
                progress >= 25 ? "text-status-warning" :
                "text-muted-foreground"
              )}>
                {progress}%
              </span>
            </div>
            <Progress 
              value={progress} 
              className={cn(
                "h-2",
                progress >= 75 ? "[&>div]:bg-status-success" :
                progress >= 50 ? "[&>div]:bg-status-info" :
                progress >= 25 ? "[&>div]:bg-status-warning" :
                "[&>div]:bg-muted-foreground"
              )}
            />
          </div>
          
          {/* Footer Info */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            {daysRemaining !== null && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {daysRemaining > 0 ? `${daysRemaining} days left` : 
                 daysRemaining === 0 ? 'Due today' :
                 'Overdue'}
              </span>
            )}
            {objective.creator?.full_name && (
              <span className="truncate">
                by {objective.creator.full_name}
              </span>
            )}
          </div>
        </div>
      </Link>

      {/* Strategic goal timeline link */}
      {objective.is_strategic_goal && (
        <Link
          href={`/strategic-planner/${objective.id}`}
          className="flex items-center gap-2 px-4 py-2.5 border-t bg-international-orange/5 border-international-orange/10 hover:bg-international-orange/10 transition-colors"
        >
          <Map className="w-3.5 h-3.5 flex-shrink-0 text-international-orange" />
          <span className="text-xs text-international-orange font-medium">View strategic timeline</span>
          <ArrowRight className="w-3 h-3 ml-auto flex-shrink-0 text-international-orange" />
        </Link>
      )}

      {/* Contextual nudge - subtle, helpful suggestion */}
      {nudge && !objective.is_strategic_goal && (
        <Link
          href={nudge.href}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 border-t transition-colors",
            nudge.bgColor, nudge.hoverBg
          )}
        >
          <nudge.icon className={cn("w-3.5 h-3.5 flex-shrink-0", nudge.color)} />
          <span className={cn("text-xs", nudge.color)}>{nudge.label}</span>
          <ArrowRight className={cn("w-3 h-3 ml-auto flex-shrink-0", nudge.color)} />
        </Link>
      )}
    </div>
  )
}

interface Nudge {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  bgColor: string
  hoverBg: string
}

/**
 * Generate a contextual nudge based on objective state.
 * Only shows for objectives that could benefit from action.
 */
function getObjectiveNudge(
  objective: Objective,
  progress: number,
  daysRemaining: number | null
): Nudge | null {
  // Overdue or very behind -> suggest expert help
  if (daysRemaining !== null && daysRemaining < 0) {
    return {
      label: 'Get expert help to catch up',
      href: '/marketplace?tab=People&subcategory=Executive',
      icon: Briefcase,
      color: 'text-chart-5',
      bgColor: 'bg-chart-5/5 border-chart-5/10',
      hoverBg: 'hover:bg-chart-5/10',
    }
  }

  // Very low progress -> suggest inspiration packs for structure
  if (progress < 15) {
    return {
      label: 'Find a ready-made plan to get started',
      href: '/playbooks',
      icon: Lightbulb,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50/50 border-blue-100',
      hoverBg: 'hover:bg-blue-50',
    }
  }

  // Behind schedule (less than halfway through, with little time left)
  if (daysRemaining !== null && daysRemaining < 14 && progress < 40) {
    return {
      label: 'Bring in extra hands to accelerate',
      href: '/marketplace?tab=People',
      icon: Briefcase,
      color: 'text-chart-5',
      bgColor: 'bg-chart-5/5 border-chart-5/10',
      hoverBg: 'hover:bg-chart-5/10',
    }
  }

  // Don't show nudges for objectives that are on track
  return null
}
