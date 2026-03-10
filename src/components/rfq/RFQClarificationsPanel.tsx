'use client'

import { useState, useEffect, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { HelpCircle, MessageSquare, Loader2 } from 'lucide-react'
import {
  publishClarification,
  getRFQClarifications,
} from '@/actions/rfq'
import type { RFQClarification } from '@/types/rfq'

interface RFQClarificationsPanelProps {
  rfqId: string
  isOwner: boolean
  /** Info request messages that the buyer can publish as clarifications */
  infoRequests?: Array<{
    id: string
    message: string | null
    provider_profile?: { full_name: string | null } | null
  }>
}

export function RFQClarificationsPanel({
  rfqId,
  isOwner,
  infoRequests = [],
}: RFQClarificationsPanelProps) {
  const [clarifications, setClarifications] = useState<RFQClarification[]>([])
  const [isPending, startTransition] = useTransition()
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({})
  const [publishingId, setPublishingId] = useState<string | null>(null)

  useEffect(() => {
    loadClarifications()
  }, [rfqId])

  async function loadClarifications() {
    const result = await getRFQClarifications(rfqId)
    if (result.data) {
      setClarifications(result.data)
    }
  }

  function handlePublishFromInfoRequest(question: string) {
    const draft = answerDrafts[question] || ''
    if (!draft.trim()) return

    setPublishingId(question)
    startTransition(async () => {
      const result = await publishClarification(rfqId, question, draft.trim())
      if (result.success) {
        setAnswerDrafts((prev) => {
          const next = { ...prev }
          delete next[question]
          return next
        })
        await loadClarifications()
      }
      setPublishingId(null)
    })
  }

  if (clarifications.length === 0 && !isOwner) {
    return null
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <HelpCircle className="w-4 h-4" />
          Clarifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Published clarifications — visible to everyone */}
        {clarifications.length > 0 ? (
          <div className="space-y-3">
            {clarifications.map((c) => (
              <div key={c.id} className="p-3 rounded-lg bg-muted/50 space-y-1">
                <div className="flex items-start gap-2">
                  <MessageSquare className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{c.question}</p>
                    {c.answer && (
                      <p className="text-sm text-muted-foreground mt-1">{c.answer}</p>
                    )}
                    {c.answered_at && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Answered {new Date(c.answered_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No clarifications published yet.</p>
        )}

        {/* Buyer: publish info requests as clarifications */}
        {isOwner && infoRequests.length > 0 && (
          <div className="pt-3 border-t space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Publish from supplier questions
            </p>
            {infoRequests
              .filter((ir): ir is typeof ir & { message: string } => !!ir.message)
              .map((ir) => {
                const question = ir.message
                const alreadyPublished = clarifications.some(
                  (c) => c.question === question
                )
                if (alreadyPublished) return null

                return (
                  <div
                    key={ir.id}
                    className="p-3 rounded-lg border space-y-2"
                  >
                    <p className="text-sm">
                      <span className="font-medium">
                        {ir.provider_profile?.full_name || 'Supplier'}
                      </span>
                      : {question}
                    </p>
                    <Textarea
                      placeholder="Type your answer..."
                      value={answerDrafts[question] || ''}
                      onChange={(e) =>
                        setAnswerDrafts((prev) => ({
                          ...prev,
                          [question]: e.target.value,
                        }))
                      }
                      rows={2}
                      className="text-sm"
                    />
                    <Button
                      size="sm"
                      onClick={() =>
                        handlePublishFromInfoRequest(question)
                      }
                      disabled={
                        isPending ||
                        !answerDrafts[question]?.trim()
                      }
                    >
                      {publishingId === question ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : null}
                      Publish as Clarification
                    </Button>
                  </div>
                )
              })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
