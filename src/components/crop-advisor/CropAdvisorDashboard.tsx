"use client"

import { useState, useEffect, useCallback } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RevenueProjectionCards } from "./RevenueProjectionCards"
import { CropScoreTable } from "./CropScoreTable"
import { DemandSupplyChart } from "./DemandSupplyChart"
import { PriceTrendSparklines } from "./PriceTrendSparklines"
import { BuyerIntentFeed } from "./BuyerIntentFeed"
import { CropAdvisorSkeleton, IntentFeedSkeleton } from "./CropAdvisorSkeletons"
import {
  fetchCropScores,
  fetchBuyerIntents,
  type CropScore,
  type BuyerIntent,
} from "@/actions/crop-advisor"

interface CropAdvisorDashboardProps {
  initialTab?: string
}

/**
 * Grower view: tabbed dashboard with crop recommendations and buyer signals.
 */
export function CropAdvisorDashboard({ initialTab }: CropAdvisorDashboardProps) {
  const [activeTab, setActiveTab] = useState(initialTab || "recommendations")
  const [scores, setScores] = useState<CropScore[]>([])
  const [intents, setIntents] = useState<BuyerIntent[]>([])
  const [isLoadingScores, setIsLoadingScores] = useState(true)
  const [isLoadingIntents, setIsLoadingIntents] = useState(true)
  const [scoreError, setScoreError] = useState<string | null>(null)
  const [intentError, setIntentError] = useState<string | null>(null)

  const loadScores = useCallback(async () => {
    setIsLoadingScores(true)
    setScoreError(null)
    const result = await fetchCropScores()
    if (result.error) {
      setScoreError(result.error)
    } else {
      setScores(result.data || [])
    }
    setIsLoadingScores(false)
  }, [])

  const loadIntents = useCallback(async () => {
    setIsLoadingIntents(true)
    setIntentError(null)
    const result = await fetchBuyerIntents()
    if (result.error) {
      setIntentError(result.error)
    } else {
      setIntents(result.data)
    }
    setIsLoadingIntents(false)
  }, [])

  useEffect(() => {
    loadScores()
    loadIntents()
  }, [loadScores, loadIntents])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">
          Crop Advisor
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Data-driven crop recommendations based on market demand, pricing trends, and buyer signals.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
          <TabsTrigger value="signals">
            Buyer Signals
            {intents.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full bg-international-orange/10 text-international-orange text-[10px] font-semibold">
                {intents.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recommendations" className="space-y-6 mt-4">
          {isLoadingScores && <CropAdvisorSkeleton />}

          {!isLoadingScores && scoreError && (
            <div className="text-center py-8">
              <p className="text-destructive mb-4">{scoreError}</p>
              <button
                onClick={loadScores}
                className="text-sm text-international-orange hover:underline"
              >
                Retry
              </button>
            </div>
          )}

          {!isLoadingScores && !scoreError && (
            <>
              <RevenueProjectionCards scores={scores} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <DemandSupplyChart scores={scores} />
                <PriceTrendSparklines scores={scores} />
              </div>
              <CropScoreTable scores={scores} />

              {/* Score legend */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                <span className="font-medium">Score breakdown:</span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-2 rounded-sm bg-international-orange" /> Demand
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-2 rounded-sm bg-info" /> Price Trend
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-2 rounded-sm bg-success" /> Supply Gap
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-2 rounded-sm bg-warning" /> Capability
                </span>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="signals" className="mt-4">
          {isLoadingIntents && <IntentFeedSkeleton />}

          {!isLoadingIntents && intentError && (
            <div className="text-center py-8">
              <p className="text-destructive mb-4">{intentError}</p>
              <button
                onClick={loadIntents}
                className="text-sm text-international-orange hover:underline"
              >
                Retry
              </button>
            </div>
          )}

          {!isLoadingIntents && !intentError && (
            <BuyerIntentFeed intents={intents} onResponded={loadIntents} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
