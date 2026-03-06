'use client'

// INTENT: The Inspiration page (formerly Learn, formerly half of Inspiration)
// contains educational/reference content: manufacturing techniques, tutorials,
// and Q&A. Action content (packs, projects, subsystems) now lives on the
// Objectives page as "Other ideas for you to be getting on with".

import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  BookOpen,
  Factory,
  MessageSquare,
  HelpCircle,
  Search,
  Clock,
  ChevronRight,
  X,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  Wrench,
  ListChecks,
  Loader2,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { typography } from '@/lib/design-system'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { TechniquesExplorer } from '@/components/techniques'
import { InsightsExplorer } from '@/components/techniques/insights-explorer'
import { ALL_TECHNIQUES } from '@/lib/manufacturing-techniques'
import type { TechniqueEnrichment } from '@/types/manufacturing-techniques'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { QuestionCard } from '@/components/advisory/question-card'
import type { Question } from '@/components/advisory/question-card'
import { AskModal } from '@/components/advisory/ask-modal'
import { StatusLegend } from '@/components/advisory/status-legend'
import { createAdvisoryQuestion } from '@/actions/advisory'
import { toast } from 'sonner'
import type { TutorialListItem, TutorialDetail } from '@/actions/tutorials'
import { getTutorialBySlug } from '@/actions/tutorials'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

type LearnTabId = 'techniques' | 'insights' | 'tutorials' | 'qa'

interface Tab {
  id: LearnTabId
  label: string
  icon: React.ComponentType<{ className?: string }>
  count?: number
  activeClasses: string
  iconColor: string
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface LearnPageProps {
  tutorials?: TutorialListItem[]
  questions?: Question[]
  enrichments?: TechniqueEnrichment[]
}

export function LearnPage({
  tutorials = [],
  questions = [],
  enrichments = [],
}: LearnPageProps) {
  const [activeTab, setActiveTab] = useState<LearnTabId>('techniques')

  // Q&A state
  const [qaSearchQuery, setQaSearchQuery] = useState('')

  const [selectedTutorial, setSelectedTutorial] = useState<TutorialListItem | null>(null)
  const [tutorialDetail, setTutorialDetail] = useState<TutorialDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Fetch full tutorial detail when a tutorial card is clicked
  useEffect(() => {
    if (!selectedTutorial) {
      setTutorialDetail(null)
      return
    }

    let cancelled = false
    setLoadingDetail(true)
    setTutorialDetail(null)

    getTutorialBySlug(selectedTutorial.slug).then((result) => {
      if (cancelled) return
      if ('error' in result) {
        toast.error(result.error)
      } else {
        setTutorialDetail(result)
      }
      setLoadingDetail(false)
    })

    return () => { cancelled = true }
  }, [selectedTutorial])

  const filteredQuestions = useMemo(() => {
    if (!qaSearchQuery.trim()) return questions
    const query = qaSearchQuery.toLowerCase()
    return questions.filter(q =>
      q.title.toLowerCase().includes(query) ||
      q.body.toLowerCase().includes(query) ||
      q.category.toLowerCase().includes(query)
    )
  }, [questions, qaSearchQuery])

  const handleAskQuestion = useCallback(async (data: {
    title: string
    body: string
    category: string
    visibility: 'public' | 'foundry'
    getAiAnswer: boolean
  }): Promise<{ error?: string; questionId?: string }> => {
    const result = await createAdvisoryQuestion({
      title: data.title,
      body: data.body,
      category: data.category,
      visibility: data.visibility === 'public' ? 'network' : 'foundry',
      getAiAnswer: data.getAiAnswer,
    })

    if (result.error) {
      toast.error(result.error)
      return { error: result.error }
    }

    toast.success(
      data.getAiAnswer
        ? 'Question submitted! AI is generating an answer...'
        : 'Question submitted successfully'
    )
    return { questionId: result.data?.id }
  }, [])

  // ---------------------------------------------------------------------------
  // Tab config
  // ---------------------------------------------------------------------------

  const tabs: Tab[] = useMemo(() => [
    {
      id: 'techniques',
      label: 'Techniques',
      icon: Factory,
      count: ALL_TECHNIQUES.length,
      iconColor: 'text-international-orange',
      activeClasses: 'bg-international-orange/10 text-international-orange border-international-orange',
    },
    {
      id: 'insights',
      label: 'Real-World Insights',
      icon: Factory,
      count: enrichments.length,
      iconColor: 'text-international-orange',
      activeClasses: 'bg-international-orange/10 text-international-orange border-international-orange',
    },
    {
      id: 'tutorials',
      label: 'Tutorials & Guides',
      icon: BookOpen,
      count: tutorials.length,
      iconColor: 'text-electric-blue',
      activeClasses: 'bg-electric-blue/10 text-electric-blue border-electric-blue',
    },
    {
      id: 'qa',
      label: 'Q&A',
      icon: MessageSquare,
      count: questions.length,
      iconColor: 'text-chart-5',
      activeClasses: 'bg-chart-5/10 text-chart-5 border-chart-5',
    },
  ], [tutorials.length, questions.length, enrichments.length])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="pb-4 border-b border-muted">
        {/* Cascade breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
          <a href="/workshop" className="hover:text-foreground transition-colors">Workshop</a>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground font-medium">Inspiration</span>
        </nav>
        <div className={typography.pageHeader}>
          <div className={typography.pageHeaderAccent} />
          <h1 className={typography.h1}>
            <BookOpen className="h-7 w-7 mr-3 inline-block text-electric-blue" />
            Inspiration
          </h1>
        </div>
        <p className={cn(typography.pageSubtitle, 'mt-1')}>
          Techniques, tutorials, and expert guidance to level up your craft.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-2" role="tablist">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium',
                'border transition-all duration-200 select-none',
                isActive
                  ? cn(tab.activeClasses, 'shadow-sm')
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              <Icon className={cn('h-4 w-4', !isActive && tab.iconColor)} />
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={cn(
                    'text-xs tabular-nums px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center',
                    isActive ? 'bg-white/60' : 'bg-muted',
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ================================================================== */}
      {/* TECHNIQUES tab                                                     */}
      {/* ================================================================== */}
      {activeTab === 'techniques' && <TechniquesExplorer />}

      {/* ================================================================== */}
      {/* INSIGHTS tab                                                       */}
      {/* ================================================================== */}
      {activeTab === 'insights' && <InsightsExplorer enrichments={enrichments} />}

      {/* ================================================================== */}
      {/* TUTORIALS tab                                                      */}
      {/* ================================================================== */}
      {activeTab === 'tutorials' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Step-by-step tutorials, safety guides, and best practices for hardware engineering.
          </p>

          {tutorials.length === 0 ? (
            <EmptyState
              title="Tutorials are being prepared"
              description="Check back soon as new tutorials are added."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fade-in">
              {tutorials.map((tutorial) => (
                <Card
                  key={tutorial.id}
                  className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 hover:border-electric-blue/30"
                  onClick={() => setSelectedTutorial(tutorial)}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">
                        {tutorial.title}
                      </h3>
                      {tutorial.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {tutorial.description}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {tutorial.difficulty && (
                        <Badge
                          variant={
                            tutorial.difficulty === 'beginner' ? 'success' :
                            tutorial.difficulty === 'intermediate' ? 'warning' :
                            'destructive'
                          }
                          className="text-[10px]"
                        >
                          {tutorial.difficulty}
                        </Badge>
                      )}
                      {tutorial.topic && (
                        <Badge variant="secondary" className="text-[10px]">
                          {tutorial.topic}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 border-t border-muted">
                      {tutorial.estimated_read_minutes != null && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {tutorial.estimated_read_minutes} min read
                        </span>
                      )}
                    </div>

                    {tutorial.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {tutorial.tags.slice(0, 3).map((tag, i) => (
                          <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {tag}
                          </span>
                        ))}
                        {tutorial.tags.length > 3 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            +{tutorial.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Tutorial Detail Dialog */}
          <Dialog open={!!selectedTutorial} onOpenChange={(open) => !open && setSelectedTutorial(null)}>
            <DialogContent size="lg" className="max-h-[90vh] flex flex-col">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-electric-blue" />
                  {selectedTutorial?.title}
                </DialogTitle>
              </DialogHeader>

              {selectedTutorial && (
                <div className="flex-1 overflow-y-auto space-y-6 pb-4 pr-1">
                  {/* Meta badges */}
                  <div className="flex flex-wrap gap-2">
                    {selectedTutorial.difficulty && (
                      <Badge variant={
                        selectedTutorial.difficulty === 'beginner' ? 'success' :
                        selectedTutorial.difficulty === 'intermediate' ? 'warning' :
                        'destructive'
                      }>
                        {selectedTutorial.difficulty}
                      </Badge>
                    )}
                    {selectedTutorial.topic && (
                      <Badge variant="secondary">{selectedTutorial.topic}</Badge>
                    )}
                    {selectedTutorial.estimated_read_minutes != null && (
                      <Badge variant="secondary">
                        <Clock className="h-3 w-3 mr-1" />
                        {selectedTutorial.estimated_read_minutes} min read
                      </Badge>
                    )}
                  </div>

                  {selectedTutorial.description && (
                    <p className="text-sm text-muted-foreground">{selectedTutorial.description}</p>
                  )}

                  {/* Loading state */}
                  {loadingDetail && (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-electric-blue" />
                      <span className="ml-2 text-sm text-muted-foreground">Loading tutorial...</span>
                    </div>
                  )}

                  {/* Full tutorial content */}
                  {tutorialDetail && (
                    <>
                      {/* Prerequisites */}
                      {tutorialDetail.prerequisites.length > 0 && (
                        <div className="rounded-lg border border-muted bg-muted/30 p-4 space-y-2">
                          <h3 className="text-sm font-semibold flex items-center gap-2">
                            <ListChecks className="h-4 w-4 text-electric-blue" />
                            Prerequisites
                          </h3>
                          <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
                            {tutorialDetail.prerequisites.map((p, i) => (
                              <li key={i}>{p}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Tools mentioned */}
                      {tutorialDetail.tools_mentioned.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          <Wrench className="h-4 w-4 text-muted-foreground mt-0.5" />
                          {tutorialDetail.tools_mentioned.map((tool, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {tool}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Sections */}
                      {tutorialDetail.sections.map((section, idx) => (
                        <div key={idx} className="space-y-3">
                          <h3 className="text-base font-semibold text-foreground border-b border-muted pb-1">
                            {section.heading}
                          </h3>
                          <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">
                            {section.content}
                          </div>
                          {section.tips.length > 0 && (
                            <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 space-y-1.5">
                              {section.tips.map((tip, i) => (
                                <p key={i} className="text-sm flex gap-2">
                                  <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                                  <span className="text-muted-foreground">{tip}</span>
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Common mistakes */}
                      {tutorialDetail.common_mistakes.length > 0 && (
                        <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-4 space-y-2">
                          <h3 className="text-sm font-semibold flex items-center gap-2 text-destructive">
                            <AlertTriangle className="h-4 w-4" />
                            Common Mistakes
                          </h3>
                          <ul className="text-sm text-muted-foreground space-y-1.5 ml-6 list-disc">
                            {tutorialDetail.common_mistakes.map((m, i) => (
                              <li key={i}>{m}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Key takeaways */}
                      {tutorialDetail.key_takeaways.length > 0 && (
                        <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-4 space-y-2">
                          <h3 className="text-sm font-semibold flex items-center gap-2 text-emerald-600">
                            <CheckCircle2 className="h-4 w-4" />
                            Key Takeaways
                          </h3>
                          <ul className="text-sm text-muted-foreground space-y-1.5 ml-6 list-disc">
                            {tutorialDetail.key_takeaways.map((t, i) => (
                              <li key={i}>{t}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Tags */}
                      {selectedTutorial.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-muted">
                          {selectedTutorial.tags.map((tag, i) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedTutorial(null)}>
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* ================================================================== */}
      {/* Q&A tab                                                            */}
      {/* ================================================================== */}
      {activeTab === 'qa' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Get AI-powered insights verified by human experts.
            </p>
            <AskModal onSubmit={handleAskQuestion} />
          </div>

          <StatusLegend className="pb-2" />

          {questions.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search questions..."
                  value={qaSearchQuery}
                  onChange={(e) => setQaSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {filteredQuestions.length} {filteredQuestions.length === 1 ? 'question' : 'questions'}
                {qaSearchQuery && ' found'}
              </p>
            </div>
          )}

          {filteredQuestions.length === 0 ? (
            <Card className="border-2 border-dashed">
              <CardContent className="py-12">
                <EmptyState
                  icon={<HelpCircle className="h-12 w-12" />}
                  title={qaSearchQuery ? "No questions match your search" : "No questions yet"}
                  description={
                    qaSearchQuery
                      ? "Try adjusting your search terms."
                      : "Ask your first question to get AI-powered insights verified by experts."
                  }
                  action={
                    qaSearchQuery ? (
                      <Button variant="link" onClick={() => setQaSearchQuery('')} className="text-electric-blue">
                        Clear Search
                      </Button>
                    ) : (
                      <AskModal
                        onSubmit={handleAskQuestion}
                        trigger={
                          <Button className="gap-2">
                            <MessageSquare className="h-4 w-4" />
                            Ask a Question
                          </Button>
                        }
                      />
                    )
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredQuestions.map((question) => (
                <QuestionCard key={question.id} question={question} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
