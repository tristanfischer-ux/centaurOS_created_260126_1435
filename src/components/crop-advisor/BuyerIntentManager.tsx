"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Plus, Megaphone } from "lucide-react"
import { IntentCard } from "./IntentCard"
import { IntentResponsesList } from "./IntentResponsesList"
import { CreateIntentDialog } from "./CreateIntentDialog"
import { CropAdvisorSkeleton } from "./CropAdvisorSkeletons"
import {
  fetchMyIntents,
  withdrawIntent,
  type BuyerIntent,
} from "@/actions/crop-advisor"

/**
 * Buyer view: create/manage demand signals and review grower responses.
 */
export function BuyerIntentManager() {
  const [intents, setIntents] = useState<BuyerIntent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [viewingResponses, setViewingResponses] = useState<BuyerIntent | null>(null)
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null)

  const loadIntents = useCallback(async () => {
    setIsLoading(true)
    const result = await fetchMyIntents()
    if (result.error) {
      setError(result.error)
    } else {
      setIntents(result.data)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    loadIntents()
  }, [loadIntents])

  const handleWithdraw = async (intentId: string) => {
    setWithdrawingId(intentId)
    const result = await withdrawIntent(intentId)
    if (!result.error) {
      setIntents((prev) =>
        prev.map((i) =>
          i.id === intentId ? { ...i, status: "withdrawn" } : i
        )
      )
    }
    setWithdrawingId(null)
  }

  if (viewingResponses) {
    return (
      <IntentResponsesList
        intent={viewingResponses}
        onClose={() => setViewingResponses(null)}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-semibold text-foreground">
            Your Demand Signals
          </h2>
          <p className="text-sm text-muted-foreground">
            Post what you need and growers will respond with offers.
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Post Signal
        </Button>
      </div>

      {isLoading && <CropAdvisorSkeleton />}

      {!isLoading && error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {!isLoading && !error && intents.length === 0 && (
        <EmptyState
          icon={<Megaphone className="h-10 w-10" />}
          title="No demand signals yet"
          description="Post a demand signal to let growers know what you need. They'll respond with offers including price, quantity, and availability."
          action={
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Post Your First Signal
            </Button>
          }
        />
      )}

      {!isLoading && !error && intents.length > 0 && (
        <div className="space-y-4">
          {intents.map((intent) => (
            <IntentCard
              key={intent.id}
              intent={intent}
              onWithdraw={handleWithdraw}
              onViewResponses={setViewingResponses}
              isWithdrawing={withdrawingId === intent.id}
            />
          ))}
        </div>
      )}

      <CreateIntentDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreated={loadIntents}
      />
    </div>
  )
}
