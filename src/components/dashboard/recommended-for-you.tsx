'use client'

import Link from 'next/link'
import {
  Lightbulb,
  Store,
  Workflow,
  Briefcase,
  GraduationCap,
  Target,
  Users,
  ArrowRight,
  Sparkles,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Objective {
  id: string
  title: string
  status: string
  progress?: number | null
  end_date: string | null
}

interface RecommendedForYouProps {
  objectives: Objective[]
  teamSize: number
  taskCount: number
  hasWorkflows: boolean
}

interface Recommendation {
  id: string
  title: string
  description: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  accentColor: string
  bgColor: string
  ctaLabel: string
}

/**
 * Recommended for You - Contextual suggestions based on what the user is working on.
 * Drives users to Marketplace, Inspiration, and Workflows naturally.
 * 
 * No "AI" language. These are just helpful suggestions from the platform,
 * like a good assistant noticing what you might need.
 */
export function RecommendedForYou({
  objectives,
  teamSize,
  taskCount,
  hasWorkflows,
}: RecommendedForYouProps) {
  const recommendations = generateRecommendations({
    objectives,
    teamSize,
    taskCount,
    hasWorkflows,
  })

  if (recommendations.length === 0) return null

  // Show max 3 recommendations
  const displayed = recommendations.slice(0, 3)

  return (
    <div className="bg-card rounded-2xl shadow-sm border overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b bg-gradient-to-r from-status-warning-light/50 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-status-warning-light rounded-lg">
              <Sparkles className="w-5 h-5 text-status-warning-dark" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Recommended for You</h2>
              <p className="text-sm text-muted-foreground">Based on what you're working on</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recommendation Cards */}
      <div className="p-4 space-y-3">
        {displayed.map((rec) => (
          <RecommendationCard key={rec.id} recommendation={rec} />
        ))}
      </div>
    </div>
  )
}

function RecommendationCard({ recommendation }: { recommendation: Recommendation }) {
  const Icon = recommendation.icon

  return (
    <Link
      href={recommendation.href}
      className="group flex items-start gap-4 p-4 rounded-xl border hover:shadow-md transition-all duration-200"
    >
      {/* Icon */}
      <div className={cn(
        "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
        recommendation.bgColor
      )}>
        <Icon className={cn("w-5 h-5", recommendation.accentColor)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-foreground group-hover:text-international-orange transition-colors">
          {recommendation.title}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
          {recommendation.description}
        </p>
        <span className={cn(
          "inline-flex items-center gap-1 mt-2 text-xs font-medium transition-colors",
          recommendation.accentColor,
        )}>
          {recommendation.ctaLabel}
          <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
        </span>
      </div>

      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-international-orange transition-colors flex-shrink-0 mt-1" />
    </Link>
  )
}

/**
 * Generates contextual recommendations based on user's current state.
 * Priority-ordered: most relevant first.
 */
function generateRecommendations({
  objectives,
  teamSize,
  taskCount,
  hasWorkflows,
}: {
  objectives: Objective[]
  teamSize: number
  taskCount: number
  hasWorkflows: boolean
}): Recommendation[] {
  const recs: Recommendation[] = []

  // 1. No objectives yet -> nudge to Inspiration
  if (objectives.length === 0) {
    recs.push({
      id: 'no-objectives',
      title: 'Set your first objective',
      description: 'Browse proven objective packs to get your team focused and moving in the right direction.',
      href: '/inspiration',
      icon: Lightbulb,
      accentColor: 'text-blue-600',
      bgColor: 'bg-blue-50',
      ctaLabel: 'Browse ideas',
    })
  }

  // 2. Objectives behind schedule -> suggest hiring help
  const behindSchedule = objectives.filter(o => {
    if (!o.end_date || !o.progress) return false
    const now = new Date()
    const end = new Date(o.end_date)
    const totalDuration = end.getTime() - now.getTime()
    // If more than halfway through time but less than 40% progress
    return totalDuration < 0 || (o.progress < 40 && totalDuration < 30 * 24 * 60 * 60 * 1000)
  })

  if (behindSchedule.length > 0) {
    const obj = behindSchedule[0]
    recs.push({
      id: 'behind-schedule',
      title: `Get expert help on "${obj.title}"`,
      description: 'Bring in a specialist to accelerate progress. Browse verified experts who can help.',
      href: '/marketplace?tab=People&subcategory=Executive',
      icon: Briefcase,
      accentColor: 'text-chart-5',
      bgColor: 'bg-chart-5/10',
      ctaLabel: 'Find an expert',
    })
  }

  // 3. Small team -> suggest hiring an apprentice
  if (teamSize <= 2 && taskCount > 5) {
    recs.push({
      id: 'small-team',
      title: 'Expand your capacity',
      description: 'Your team is handling a lot. Skilled apprentices can take on tasks and free you up for strategy.',
      href: '/marketplace?tab=People&subcategory=Apprentice',
      icon: GraduationCap,
      accentColor: 'text-status-info',
      bgColor: 'bg-status-info/10',
      ctaLabel: 'Browse talent',
    })
  }

  // 4. Has objectives but no workflows -> suggest workflows
  if (objectives.length > 0 && !hasWorkflows) {
    recs.push({
      id: 'try-workflows',
      title: 'Speed up with workflow templates',
      description: 'Use pre-built prompt chains to draft plans, analyse data, and prepare documents faster.',
      href: '/agents',
      icon: Workflow,
      accentColor: 'text-international-orange',
      bgColor: 'bg-international-orange/10',
      ctaLabel: 'Browse templates',
    })
  }

  // 5. Objectives exist but could use more structure -> Inspiration packs
  if (objectives.length > 0 && objectives.length < 4) {
    recs.push({
      id: 'more-objectives',
      title: 'Discover what to tackle next',
      description: 'Objective packs from experienced founders and operators. Ready to use, easy to customise.',
      href: '/inspiration',
      icon: Target,
      accentColor: 'text-purple-600',
      bgColor: 'bg-purple-50',
      ctaLabel: 'Get inspired',
    })
  }

  // 6. General marketplace nudge (always available as fallback)
  if (recs.length < 2) {
    recs.push({
      id: 'marketplace-explore',
      title: 'Find the right people and services',
      description: 'Experts, apprentices, tools, and services to help your foundry move faster.',
      href: '/marketplace',
      icon: Store,
      accentColor: 'text-green-600',
      bgColor: 'bg-green-50',
      ctaLabel: 'Explore marketplace',
    })
  }

  // 7. General team nudge
  if (recs.length < 3 && teamSize === 0) {
    recs.push({
      id: 'invite-team',
      title: 'Invite your team',
      description: 'Collaboration starts with your team. Invite members to share tasks, objectives, and updates.',
      href: '/team',
      icon: Users,
      accentColor: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      ctaLabel: 'Invite people',
    })
  }

  return recs
}
