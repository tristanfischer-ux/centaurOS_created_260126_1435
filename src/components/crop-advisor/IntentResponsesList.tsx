"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { MessageCircle, Check } from "lucide-react"
import {
  fetchIntentResponses,
  acceptIntentResponse,
  type IntentResponse,
  type BuyerIntent,
} from "@/actions/crop-advisor"

interface IntentResponsesListProps {
  intent: BuyerIntent
  onClose?: () => void
}

function getResponseStatusVariant(status: string): "success" | "warning" | "destructive" | "secondary" {
  switch (status) {
    case "accepted": return "success"
    case "pending": return "warning"
    case "declined": return "destructive"
    case "withdrawn": return "secondary"
    default: return "secondary"
  }
}

/**
 * Shows grower responses to a specific buyer intent.
 * Buyers can accept a response, which fulfills the intent.
 */
export function IntentResponsesList({ intent, onClose }: IntentResponsesListProps) {
  const [responses, setResponses] = useState<IntentResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      const result = await fetchIntentResponses(intent.id)
      if (result.error) {
        setError(result.error)
      } else {
        setResponses(result.data)
      }
      setIsLoading(false)
    }
    load()
  }, [intent.id])

  const handleAccept = async (responseId: string) => {
    setAcceptingId(responseId)
    const result = await acceptIntentResponse(responseId)
    if (result.error) {
      setError(result.error)
    } else {
      // Update local state
      setResponses((prev) =>
        prev.map((r) =>
          r.id === responseId ? { ...r, status: "accepted" } : r
        )
      )
    }
    setAcceptingId(null)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">
            Responses to: {intent.product_name}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {intent.weekly_quantity_kg} kg/week
          </p>
        </div>
        {onClose && (
          <Button size="sm" variant="ghost" onClick={onClose}>
            Back
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        )}

        {!isLoading && error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {!isLoading && !error && responses.length === 0 && (
          <EmptyState
            icon={<MessageCircle className="h-8 w-8" />}
            title="No responses yet"
            description="Growers haven't responded to this signal yet. Give it some time."
          />
        )}

        {!isLoading &&
          responses.map((response) => (
            <div
              key={response.id}
              className="flex items-start justify-between gap-4 p-3 rounded-lg border border-border"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm text-foreground">
                    {response.responder_name}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {response.foundry_name}
                  </span>
                  <Badge variant={getResponseStatusVariant(response.status)}>
                    {response.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span>£{Number(response.offered_price_per_kg).toFixed(2)}/kg</span>
                  <span>{response.offered_quantity_kg} kg/wk</span>
                  <span>
                    From{" "}
                    {new Date(response.available_from).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  {response.growing_method && <span>{response.growing_method}</span>}
                </div>
                {response.message && (
                  <p className="text-sm text-muted-foreground mt-1">{response.message}</p>
                )}
              </div>

              {response.status === "pending" && intent.status === "active" && (
                <Button
                  size="sm"
                  variant="success"
                  onClick={() => handleAccept(response.id)}
                  disabled={acceptingId === response.id}
                >
                  <Check className="h-3.5 w-3.5 mr-1" />
                  {acceptingId === response.id ? "Accepting..." : "Accept"}
                </Button>
              )}
            </div>
          ))}
      </CardContent>
    </Card>
  )
}
