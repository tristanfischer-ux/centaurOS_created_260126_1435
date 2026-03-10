'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Progress } from '@/components/ui/progress'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  CheckCircle2,
  Target,
  Loader2,
} from 'lucide-react'
import { getMatchedSuppliers, checkIsProvider } from '@/actions/rfq'

interface MatchReasoningCardProps {
  rfqId: string
  className?: string
}

export function MatchReasoningCard({
  rfqId,
  className,
}: MatchReasoningCardProps) {
  const [score, setScore] = useState<number | null>(null)
  const [reasons, setReasons] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchMatch = async () => {
      try {
        const providerResult = await checkIsProvider()
        if (!providerResult.isProvider || !providerResult.providerId) {
          setIsLoading(false)
          return
        }

        const { data: matches } = await getMatchedSuppliers(rfqId)
        if (!matches) {
          setIsLoading(false)
          return
        }
        const myMatch = matches.find((m) => m.provider_id === providerResult.providerId)

        if (myMatch) {
          setScore(myMatch.match_score)
          setReasons(myMatch.match_reasons)
        }
      } catch (error) {
        console.error('Failed to fetch match reasoning:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchMatch()
  }, [rfqId])

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="py-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Checking match...
        </CardContent>
      </Card>
    )
  }

  if (score === null) return null

  const getScoreColor = () => {
    if (score >= 70) return 'text-status-success'
    if (score >= 40) return 'text-status-warning'
    return 'text-muted-foreground'
  }

  const getProgressColor = () => {
    if (score >= 70) return '[&>div]:bg-status-success'
    if (score >= 40) return '[&>div]:bg-status-warning'
    return ''
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="w-4 h-4" />
          Why You Matched
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Match Score</span>
          <span className={cn('text-lg font-bold', getScoreColor())}>{score}</span>
        </div>
        <Progress value={score} className={cn('h-2', getProgressColor())} />

        {reasons.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {reasons.map((reason, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-3.5 h-3.5 text-status-success shrink-0" />
                <span className="text-muted-foreground">{reason}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
