'use client'

/**
 * @file launchpad-client.tsx
 * 
 * @description Client component for the Entrepreneur's Launchpad.
 * Renders the business canvas, launch checklist, and growth path.
 * 
 * @component LaunchpadClient
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  Rocket,
  Target,
  Users,
  DollarSign,
  FileText,
  CheckCircle2,
  Circle,
  ArrowRight,
  Lightbulb,
  Store,
  BarChart3,
  BookOpen,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { BusinessCanvas } from '@/components/launchpad/business-canvas'

interface LaunchpadClientProps {
  foundryName: string
  foundryStage: string | null
  foundryIndustry: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  purposeData: any
  objectiveCount: number
  completedTasks: number
  totalTasks: number
  memberCount: number
  foundryId: string
}

/** The stages of the launch journey */
const LAUNCH_STAGES = [
  {
    id: 'validate',
    title: 'Validate Your Idea',
    description: 'Define what you\'re building and for whom',
    icon: Lightbulb,
    tasks: [
      { id: 'canvas', label: 'Fill out your Business Canvas', link: '#canvas', checkKey: 'purposeData' },
      { id: 'objective', label: 'Set your first objective', link: '/new-objectives', checkKey: 'objectiveCount' },
      { id: 'advisory', label: 'Get advice from the AI advisor', link: '/advisory', checkKey: null },
    ],
  },
  {
    id: 'setup',
    title: 'Set Up Operations',
    description: 'Get the basics running so you can execute',
    icon: FileText,
    tasks: [
      { id: 'tasks', label: 'Break objectives into tasks', link: '/new-tasks', checkKey: 'totalTasks' },
      { id: 'money', label: 'Set up your Money Map', link: '/money-map', checkKey: null },
      { id: 'strategy', label: 'Create a strategic timeline', link: '/new-objectives?mode=strategic', checkKey: null },
    ],
  },
  {
    id: 'grow',
    title: 'Get Your First Customer',
    description: 'Start generating revenue and momentum',
    icon: DollarSign,
    tasks: [
      { id: 'marketplace', label: 'List your service on the Marketplace', link: '/provider-portal', checkKey: null },
      { id: 'revenue', label: 'Log your first revenue in Money Map', link: '/money-map', checkKey: null },
      { id: 'track', label: 'Track progress on your canvas', link: '#canvas', checkKey: null },
    ],
  },
  {
    id: 'hire',
    title: 'Hire Your First Person',
    description: 'Grow your team when you\'re ready',
    icon: Users,
    tasks: [
      { id: 'guild', label: 'Browse Guild members', link: '/team', checkKey: 'memberCount' },
      { id: 'invite', label: 'Invite someone to your foundry', link: '/team', checkKey: null },
      { id: 'retainer', label: 'Set up a retainer agreement', link: '/retainers', checkKey: null },
    ],
  },
  {
    id: 'scale',
    title: 'Scale Your Business',
    description: 'Build systems that grow with you',
    icon: BarChart3,
    tasks: [
      { id: 'blueprint', label: 'Map your org with Org Blueprint', link: '/org-blueprint', checkKey: null },
      { id: 'snapshot', label: 'Take a financial snapshot', link: '/money-map', checkKey: null },
      { id: 'automate', label: 'Build prompt workflows with Agents', link: '/agents', checkKey: null },
    ],
  },
] as const

export function LaunchpadClient({
  foundryName,
  foundryStage,
  foundryIndustry,
  purposeData,
  objectiveCount,
  completedTasks,
  totalTasks,
  memberCount,
  foundryId,
}: LaunchpadClientProps) {
  // Calculate progress for each stage
  const stageProgress = calculateStageProgress({
    purposeData,
    objectiveCount,
    totalTasks,
    completedTasks,
    memberCount,
  })

  // Determine current stage (first incomplete one)
  const currentStageIndex = stageProgress.findIndex(p => p < 100)
  const overallProgress = Math.round(
    stageProgress.reduce((sum, p) => sum + p, 0) / stageProgress.length
  )

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1 h-6 bg-international-orange rounded-full" />
            <h1 className="text-2xl font-display font-bold text-foreground">
              Launch Checklist
            </h1>
          </div>
          <p className="text-muted-foreground">
            Your step-by-step guide to building {foundryName}. Follow the checklist,
            or jump to whatever feels right.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {foundryStage && (
            <StatusBadge status="info" size="sm">
              {foundryStage.replace('_', ' ')}
            </StatusBadge>
          )}
          <div className="text-right">
            <p className="text-2xl font-bold text-international-orange">{overallProgress}%</p>
            <p className="text-xs text-muted-foreground">Overall progress</p>
          </div>
        </div>
      </div>

      {/* Business Canvas Section */}
      <BusinessCanvas
        purposeData={purposeData}
        foundryName={foundryName}
        foundryIndustry={foundryIndustry}
        foundryId={foundryId}
      />

      {/* Launch Stages */}
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Rocket className="h-5 w-5 text-international-orange" />
          Your Launch Journey
        </h2>

        <div className="space-y-4">
          {LAUNCH_STAGES.map((stage, index) => {
            const Icon = stage.icon
            const progress = stageProgress[index]
            const isCurrent = index === currentStageIndex
            const isCompleted = progress === 100
            const isFuture = index > currentStageIndex

            return (
              <Card
                key={stage.id}
                className={cn(
                  'border transition-all',
                  isCurrent && 'border-international-orange/30 shadow-sm',
                  isCompleted && 'bg-muted/30',
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-3 text-base">
                      <div className={cn(
                        'flex items-center justify-center h-8 w-8 rounded-lg',
                        isCompleted && 'bg-status-success-light text-status-success',
                        isCurrent && 'bg-international-orange text-background',
                        isFuture && 'bg-muted text-muted-foreground',
                      )}>
                        {isCompleted ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <Icon className="h-4 w-4" />
                        )}
                      </div>
                      <div>
                        <span className={cn(
                          isCompleted && 'text-muted-foreground line-through',
                        )}>
                          {stage.title}
                        </span>
                        {isCurrent && (
                          <StatusBadge status="warning" size="sm" className="ml-2">
                            Current
                          </StatusBadge>
                        )}
                      </div>
                    </CardTitle>
                    <span className="text-xs text-muted-foreground font-mono">
                      {progress}%
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground pl-11">{stage.description}</p>
                </CardHeader>

                {(isCurrent || isCompleted) && (
                  <CardContent className="pt-0">
                    <div className="pl-11 space-y-2">
                      {stage.tasks.map((task) => {
                        const isTaskDone = isTaskCompleted(task.checkKey, {
                          purposeData,
                          objectiveCount,
                          totalTasks,
                          memberCount,
                        })

                        return (
                          <Link
                            key={task.id}
                            href={task.link}
                            className={cn(
                              'flex items-center gap-3 py-2 px-3 rounded-lg text-sm transition-colors',
                              isTaskDone
                                ? 'text-muted-foreground'
                                : 'text-foreground hover:bg-muted',
                            )}
                          >
                            {isTaskDone ? (
                              <CheckCircle2 className="h-4 w-4 text-status-success flex-shrink-0" />
                            ) : (
                              <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            )}
                            <span className={cn(isTaskDone && 'line-through')}>
                              {task.label}
                            </span>
                            {!isTaskDone && (
                              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
                            )}
                          </Link>
                        )
                      })}
                    </div>
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      </div>

      {/* Learning Path */}
      <Card className="border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-5 w-5 text-international-orange" />
            Learning Path
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Get expert advice tailored to your business. The AI advisor knows your context
            and can answer questions about finance, legal, marketing, and more.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button variant="outline" asChild>
              <Link href="/advisory">
                <Lightbulb className="h-4 w-4 mr-2" />
                Ask the AI Advisor
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/marketplace?category=Services">
                <Store className="h-4 w-4 mr-2" />
                Find an Expert
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// --- Helpers ---

interface ProgressContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  purposeData: any
  objectiveCount: number
  totalTasks: number
  completedTasks: number
  memberCount: number
}

function calculateStageProgress(ctx: ProgressContext): number[] {
  return LAUNCH_STAGES.map((stage) => {
    const completed = stage.tasks.filter(task =>
      isTaskCompleted(task.checkKey, ctx)
    ).length
    return Math.round((completed / stage.tasks.length) * 100)
  })
}

function isTaskCompleted(
  checkKey: string | null,
  ctx: { purposeData: unknown; objectiveCount: number; totalTasks: number; memberCount: number }
): boolean {
  if (!checkKey) return false

  switch (checkKey) {
    case 'purposeData':
      return !!ctx.purposeData
    case 'objectiveCount':
      return ctx.objectiveCount > 0
    case 'totalTasks':
      return ctx.totalTasks > 0
    case 'memberCount':
      return ctx.memberCount > 1
    default:
      return false
  }
}
