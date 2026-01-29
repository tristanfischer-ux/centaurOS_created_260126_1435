"use client"

/**
 * Transaction Limit Card Component
 * Displays current transaction limits and usage
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"
import { Shield, TrendingUp, Clock, AlertTriangle, CheckCircle } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

interface LimitInfo {
  limit: number
  used: number
  remaining: number
  resetsAt?: Date | null
}

interface TransactionLimitCardProps {
  tier: "new" | "starter" | "established" | "trusted"
  tierName: string
  nextTier: string | null
  daysUntilNextTier: number | null
  limits: {
    single: { limit: number; used: number; remaining: number }
    daily: LimitInfo
    weekly: LimitInfo
    monthly: LimitInfo
  }
  showUpgradeInfo?: boolean
}

export function TransactionLimitCard({
  tier,
  tierName,
  nextTier,
  daysUntilNextTier,
  limits,
  showUpgradeInfo = true,
}: TransactionLimitCardProps) {
  const formatCurrency = (amount: number) => {
    if (amount === Infinity || amount === 0) return "Unlimited"
    return `£${amount.toLocaleString()}`
  }

  const getUsagePercent = (info: LimitInfo) => {
    if (info.limit === 0 || info.limit === Infinity) return 0
    return Math.min((info.used / info.limit) * 100, 100)
  }

  const getProgressColor = (percent: number) => {
    if (percent >= 90) return "bg-red-500"
    if (percent >= 70) return "bg-amber-500"
    return "bg-emerald-500"
  }

  const getTierBadgeVariant = (tier: string): "default" | "secondary" | "secondary" | "destructive" => {
    switch (tier) {
      case "trusted":
        return "default"
      case "established":
        return "secondary"
      default:
        return "secondary"
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Transaction Limits</CardTitle>
          </div>
          <Badge variant={getTierBadgeVariant(tier)}>{tierName}</Badge>
        </div>
        <CardDescription>Your spending limits based on account standing</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Single Transaction Limit */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Single Transaction</span>
            <span className="font-medium">{formatCurrency(limits.single.limit)}</span>
          </div>
          <p className="text-xs text-muted-foreground">Maximum amount per transaction</p>
        </div>

        {/* Daily Limit */}
        <LimitProgressRow
          label="Daily Limit"
          info={limits.daily}
          formatCurrency={formatCurrency}
          getUsagePercent={getUsagePercent}
          getProgressColor={getProgressColor}
        />

        {/* Weekly Limit */}
        <LimitProgressRow
          label="Weekly Limit"
          info={limits.weekly}
          formatCurrency={formatCurrency}
          getUsagePercent={getUsagePercent}
          getProgressColor={getProgressColor}
        />

        {/* Monthly Limit */}
        <LimitProgressRow
          label="Monthly Limit"
          info={limits.monthly}
          formatCurrency={formatCurrency}
          getUsagePercent={getUsagePercent}
          getProgressColor={getProgressColor}
        />

        {/* Upgrade Info */}
        {showUpgradeInfo && nextTier && daysUntilNextTier !== null && daysUntilNextTier > 0 && (
          <div className="mt-4 p-3 rounded-lg bg-muted/50 border">
            <div className="flex items-start gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">Limit Increase Coming</p>
                <p className="text-muted-foreground">
                  Your limits will automatically increase to{" "}
                  <span className="font-medium capitalize">{nextTier}</span> tier in{" "}
                  <span className="font-medium">{daysUntilNextTier} days</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Trusted Account Banner */}
        {tier === "trusted" && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-emerald-700 dark:text-emerald-400">
                  Trusted Account
                </p>
                <p className="text-emerald-600 dark:text-emerald-500">
                  You have the highest transaction limits available
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface LimitProgressRowProps {
  label: string
  info: LimitInfo
  formatCurrency: (amount: number) => string
  getUsagePercent: (info: LimitInfo) => number
  getProgressColor: (percent: number) => string
}

function LimitProgressRow({
  label,
  info,
  formatCurrency,
  getUsagePercent,
  getProgressColor,
}: LimitProgressRowProps) {
  const percent = getUsagePercent(info)
  const isUnlimited = info.limit === 0 || info.limit === Infinity

  return (
    <TooltipProvider>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{label}</span>
          <div className="flex items-center gap-2">
            {!isUnlimited && percent >= 80 && (
              <Tooltip>
                <TooltipTrigger>
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Approaching limit</p>
                </TooltipContent>
              </Tooltip>
            )}
            <span className="font-medium">
              {formatCurrency(info.used)} / {formatCurrency(info.limit)}
            </span>
          </div>
        </div>

        {!isUnlimited && (
          <div className="space-y-1">
            <Progress value={percent} className={`h-2 ${getProgressColor(percent)}`} />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{Math.round(percent)}% used</span>
              {info.resetsAt && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Resets {formatDistanceToNow(info.resetsAt, { addSuffix: true })}
                </span>
              )}
            </div>
          </div>
        )}

        {isUnlimited && (
          <div className="flex items-center gap-1 text-xs text-emerald-600">
            <CheckCircle className="h-3 w-3" />
            <span>Unlimited</span>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

export default TransactionLimitCard
