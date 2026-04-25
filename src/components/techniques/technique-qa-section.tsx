'use client'

/**
 * TechniqueQASection — Per-technique Q&A feed.
 *
 * @description Renders questions asked about a manufacturing technique and
 * their answers. Includes an "Ask a question" button that submits a new
 * question to the technique_questions table.
 *
 * Answers from specialist agents render with the specialist name badge.
 * Queued questions render a "Waiting for answer" state honestly.
 *
 * @component
 *
 * @example
 * <TechniqueQASection techniqueId="fdm" techniqueName="Fused Deposition Modelling" />
 */

import { useState, useEffect, useCallback, useTransition } from 'react'
import { MessageSquare, Send, Clock, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  getTechniqueQuestions,
  askTechniqueQuestion,
  type TechniqueQuestion,
} from '@/actions/project-techniques'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TechniqueQASectionProps {
  /** Technique slug, e.g. "fdm" */
  techniqueId: string
  /** Human-readable technique name for placeholder text */
  techniqueName: string
  /** Optional: associate new questions with a project */
  projectId?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TechniqueQASection({
  techniqueId,
  techniqueName,
  projectId,
}: TechniqueQASectionProps) {
  const [questions, setQuestions] = useState<TechniqueQuestion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAskForm, setShowAskForm] = useState(false)
  const [newQuestion, setNewQuestion] = useState('')
  const [isPending, startTransition] = useTransition()

  // Load questions on mount
  useEffect(() => {
    let cancelled = false
    setIsLoading(true)

    getTechniqueQuestions(techniqueId).then(result => {
      if (cancelled) return
      if (!result.error) {
        setQuestions(result.data)
      }
      setIsLoading(false)
    })

    return () => { cancelled = true }
  }, [techniqueId])

  const handleSubmit = useCallback(() => {
    if (!newQuestion.trim()) return
    startTransition(async () => {
      const result = await askTechniqueQuestion(techniqueId, newQuestion.trim(), projectId)
      if (result.error) {
        toast.error('Could not submit question')
        return
      }
      if (result.data) {
        setQuestions(prev => [{ ...result.data!, answers: [] }, ...prev])
        setNewQuestion('')
        setShowAskForm(false)
        toast.success('Question submitted. A specialist will respond shortly.')
      }
    })
  }, [techniqueId, projectId, newQuestion])

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">
            Questions about {techniqueName}
          </h3>
          {questions.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {questions.length}
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant={showAskForm ? 'ghost' : 'outline'}
          className="gap-1.5 h-7 text-xs"
          onClick={() => setShowAskForm(prev => !prev)}
        >
          {showAskForm ? 'Cancel' : (
            <>
              <MessageSquare className="h-3.5 w-3.5" />
              Ask a question
            </>
          )}
        </Button>
      </div>

      {/* Ask form */}
      {showAskForm && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Ask anything about {techniqueName} — tolerances, materials, cost, suppliers,
            design for manufacturing tips. Fang and Chase will respond.
          </p>
          <textarea
            value={newQuestion}
            onChange={e => setNewQuestion(e.target.value)}
            placeholder={`e.g. What wall thickness should I design for in ${techniqueName}?`}
            className="w-full text-sm border border-border rounded-md bg-card p-3 resize-none focus:outline-none focus:ring-2 focus:ring-international-orange/30 focus:border-international-orange min-h-[80px]"
            aria-label="Your question"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="gap-1.5 h-8 text-xs"
              disabled={isPending || !newQuestion.trim()}
              onClick={handleSubmit}
            >
              <Send className="h-3 w-3" />
              Submit question
            </Button>
            <p className="text-[10px] text-muted-foreground">
              Responses are queued and answered by specialists — not instant.
            </p>
          </div>
        </div>
      )}

      {/* Questions list */}
      {isLoading ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          Loading questions...
        </p>
      ) : questions.length === 0 ? (
        <div className="py-6 text-center">
          <MessageSquare className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">
            No questions yet. Be the first to ask about {techniqueName}.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map(question => (
            <QuestionCard key={question.id} question={question} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// QuestionCard
// ---------------------------------------------------------------------------

function QuestionCard({ question }: { question: TechniqueQuestion }) {
  const [expanded, setExpanded] = useState(false)
  const hasAnswers = (question.answers?.length ?? 0) > 0

  const statusLabel =
    question.status === 'answered'
      ? 'Answered'
      : question.status === 'closed'
      ? 'Closed'
      : 'Waiting for answer'

  const statusVariant: 'success' | 'secondary' | 'outline' =
    question.status === 'answered'
      ? 'success'
      : question.status === 'closed'
      ? 'outline'
      : 'secondary'

  const askedAt = new Date(question.created_at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Question row */}
      <button
        onClick={() => hasAnswers && setExpanded(prev => !prev)}
        className={cn(
          'w-full p-4 text-left space-y-2',
          hasAnswers ? 'cursor-pointer hover:bg-muted/30 transition-colors' : 'cursor-default',
        )}
        aria-expanded={expanded}
        disabled={!hasAnswers}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-foreground leading-relaxed flex-1">
            {question.question}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={statusVariant} className="text-[10px]">
              {question.status === 'answered' ? (
                <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
              ) : (
                <Clock className="h-2.5 w-2.5 mr-1" />
              )}
              {statusLabel}
            </Badge>
            {hasAnswers && (
              expanded
                ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">Asked {askedAt}</p>
      </button>

      {/* Answers (expanded) */}
      {expanded && hasAnswers && (
        <div className="border-t border-muted bg-muted/20 p-4 space-y-3">
          {question.answers!.map(answer => {
            const answeredAt = new Date(answer.created_at).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })
            const authorLabel = answer.specialist_id
              ? `${answer.specialist_id.replace(/-/g, ' ')} (specialist)`
              : 'ForgeOS team'

            return (
              <div key={answer.id} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-international-orange">
                    {authorLabel}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{answeredAt}</span>
                </div>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {answer.answer}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
