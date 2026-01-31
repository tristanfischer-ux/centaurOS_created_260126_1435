'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import type { AssessmentQuestion, AssessmentAnswer, CoverageStatus, PersonType } from '@/types/blueprints'
import { DOMAIN_CATEGORY_COLORS, DomainCategory } from '@/types/blueprints'
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  AlertTriangle,
  MinusCircle,
  Users,
  Sparkles,
  Save,
  SkipForward,
} from 'lucide-react'

interface GuidedAssessmentProps {
  questions: AssessmentQuestion[]
  onComplete: (answers: AssessmentAnswer[]) => void
  onSaveProgress?: (answers: AssessmentAnswer[]) => void
  className?: string
}

export function GuidedAssessment({
  questions,
  onComplete,
  onSaveProgress,
  className,
}: GuidedAssessmentProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Map<string, AssessmentAnswer>>(new Map())
  const [coveredByName, setCoveredByName] = useState('')
  const [notes, setNotes] = useState('')

  const currentQuestion = questions[currentIndex]
  const currentAnswer = answers.get(currentQuestion?.domain_id)
  const progress = ((currentIndex + 1) / questions.length) * 100
  const answeredCount = answers.size

  const categoryColors = currentQuestion?.category 
    ? DOMAIN_CATEGORY_COLORS[currentQuestion.category as DomainCategory]
    : null

  const handleAnswer = (status: CoverageStatus) => {
    const answer: AssessmentAnswer = {
      domain_id: currentQuestion.domain_id,
      status,
      notes: notes || undefined,
      covered_by: status === 'covered' || status === 'partial'
        ? coveredByName
          ? { type: 'team' as PersonType, name: coveredByName }
          : undefined
        : undefined,
    }

    const newAnswers = new Map(answers)
    newAnswers.set(currentQuestion.domain_id, answer)
    setAnswers(newAnswers)

    // Reset inputs for next question
    setCoveredByName('')
    setNotes('')

    // Auto-advance
    if (currentIndex < questions.length - 1) {
      setTimeout(() => setCurrentIndex(currentIndex + 1), 300)
    }
  }

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1)
      // Load any existing answer
      const existingAnswer = answers.get(questions[currentIndex + 1]?.domain_id)
      if (existingAnswer) {
        setCoveredByName(existingAnswer.covered_by?.name || '')
        setNotes(existingAnswer.notes || '')
      } else {
        setCoveredByName('')
        setNotes('')
      }
    }
  }

  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      const existingAnswer = answers.get(questions[currentIndex - 1]?.domain_id)
      if (existingAnswer) {
        setCoveredByName(existingAnswer.covered_by?.name || '')
        setNotes(existingAnswer.notes || '')
      } else {
        setCoveredByName('')
        setNotes('')
      }
    }
  }

  const handleSkip = () => {
    // Mark as gap and move on
    handleAnswer('gap')
  }

  const handleComplete = () => {
    onComplete(Array.from(answers.values()))
  }

  const handleSave = () => {
    onSaveProgress?.(Array.from(answers.values()))
  }

  if (!currentQuestion) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold">Assessment Complete!</h3>
          <p className="text-muted-foreground mt-2">
            You&apos;ve answered {answeredCount} questions.
          </p>
          <Button
            onClick={handleComplete}
            className="mt-4 bg-international-orange hover:bg-international-orange/90"
          >
            Save Results
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Progress header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Question {currentIndex + 1} of {questions.length}
          </span>
          <span className="font-medium">
            {answeredCount} answered
          </span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Question card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                {categoryColors && (
                  <Badge
                    variant="outline"
                    className={cn(categoryColors.text, categoryColors.bg, categoryColors.border)}
                  >
                    {currentQuestion.category}
                  </Badge>
                )}
                {currentQuestion.is_critical && (
                  <Badge variant="destructive">Critical</Badge>
                )}
              </div>
              <CardTitle className="text-xl">{currentQuestion.domain_name}</CardTitle>
              {currentQuestion.domain_path && currentQuestion.domain_path !== currentQuestion.domain_name && (
                <p className="text-sm text-muted-foreground mt-1">
                  {currentQuestion.domain_path}
                </p>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Question */}
          <div className="p-4 rounded-lg bg-muted">
            <p className="font-medium">{currentQuestion.question}</p>
            {currentQuestion.context && (
              <p className="text-sm text-muted-foreground mt-2">
                {currentQuestion.context}
              </p>
            )}
          </div>

          {/* Answer options */}
          <div className="space-y-3">
            <Label>Your Coverage</Label>
            <div className="grid grid-cols-2 gap-3">
              <AnswerButton
                status="covered"
                icon={CheckCircle2}
                label="Yes, we have this"
                description="Expert or competent coverage"
                selected={currentAnswer?.status === 'covered'}
                onClick={() => handleAnswer('covered')}
              />
              <AnswerButton
                status="partial"
                icon={Circle}
                label="Partially"
                description="Some capability, may need help"
                selected={currentAnswer?.status === 'partial'}
                onClick={() => handleAnswer('partial')}
              />
              <AnswerButton
                status="gap"
                icon={AlertTriangle}
                label="No, this is a gap"
                description="We'd need to hire or learn"
                selected={currentAnswer?.status === 'gap'}
                onClick={() => handleAnswer('gap')}
              />
              <AnswerButton
                status="not_needed"
                icon={MinusCircle}
                label="Not needed"
                description="Doesn't apply to our project"
                selected={currentAnswer?.status === 'not_needed'}
                onClick={() => handleAnswer('not_needed')}
              />
            </div>
          </div>

          {/* Covered by (show if covered/partial) */}
          {(currentAnswer?.status === 'covered' || currentAnswer?.status === 'partial') && (
            <div className="space-y-2">
              <Label htmlFor="covered-by">Who covers this?</Label>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <Input
                  id="covered-by"
                  value={coveredByName}
                  onChange={(e) => setCoveredByName(e.target.value)}
                  placeholder="Team member name..."
                  className="flex-1"
                />
              </div>
            </div>
          )}

          {/* Notes (always available) */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional context..."
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button
            variant="ghost"
            onClick={handleSkip}
          >
            <SkipForward className="mr-2 h-4 w-4" />
            Skip
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {onSaveProgress && (
            <Button variant="outline" onClick={handleSave}>
              <Save className="mr-2 h-4 w-4" />
              Save Progress
            </Button>
          )}

          {currentIndex === questions.length - 1 && answeredCount > 0 ? (
            <Button
              onClick={handleComplete}
              className="bg-international-orange hover:bg-international-orange/90"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Complete Assessment
            </Button>
          ) : (
            <Button onClick={handleNext}>
              Next
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// Answer button component
interface AnswerButtonProps {
  status: CoverageStatus
  icon: React.ElementType
  label: string
  description: string
  selected: boolean
  onClick: () => void
}

function AnswerButton({
  status,
  icon: Icon,
  label,
  description,
  selected,
  onClick,
}: AnswerButtonProps) {
  const colors = {
    covered: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
    partial: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
    gap: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
    not_needed: 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100',
  }

  const selectedColors = {
    covered: 'ring-2 ring-emerald-500',
    partial: 'ring-2 ring-amber-500',
    gap: 'ring-2 ring-rose-500',
    not_needed: 'ring-2 ring-slate-400',
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-1 p-4 rounded-lg border-2 transition-all text-left',
        colors[status],
        selected && selectedColors[status]
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5" />
        <span className="font-medium">{label}</span>
      </div>
      <span className="text-xs opacity-80">{description}</span>
    </button>
  )
}

// Quick assessment variant (fewer questions, faster)
interface QuickAssessmentProps {
  criticalQuestions: AssessmentQuestion[]
  onComplete: (answers: AssessmentAnswer[]) => void
  onSkip: () => void
  className?: string
}

export function QuickAssessment({
  criticalQuestions,
  onComplete,
  onSkip,
  className,
}: QuickAssessmentProps) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Quick Assessment</h3>
          <p className="text-sm text-muted-foreground">
            Answer {criticalQuestions.length} critical questions
          </p>
        </div>
        <Button variant="ghost" onClick={onSkip}>
          Skip for now
        </Button>
      </div>

      <GuidedAssessment
        questions={criticalQuestions}
        onComplete={onComplete}
      />
    </div>
  )
}
