"use client"

/**
 * Admin User Risk Card Component
 * Displays user risk score and details
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  ShieldAlert,
  Shield,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  ExternalLink,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"

type RiskLevel = "low" | "medium" | "high" | "critical"

interface RiskFactor {
  type: string
  weight: number
  description: string
}

interface UserRiskCardProps {
  userName: string
  email: string
  riskScore: number
  riskLevel: RiskLevel
  factors: RiskFactor[]
  accountAgeDays: number
  lastActivityAt?: string
  onViewDetails?: () => void
  onManageLimits?: () => void
  compact?: boolean
}

export function UserRiskCard({
  userName,
  email,
  riskScore,
  riskLevel,
  factors,
  accountAgeDays,
  lastActivityAt,
  onViewDetails,
  onManageLimits,
  compact = false,
}: UserRiskCardProps) {
  const getRiskIcon = () => {
    switch (riskLevel) {
      case "critical":
        return <ShieldAlert className="h-5 w-5 text-red-500" />
      case "high":
        return <AlertTriangle className="h-5 w-5 text-orange-500" />
      case "medium":
        return <Shield className="h-5 w-5 text-amber-500" />
      default:
        return <ShieldCheck className="h-5 w-5 text-emerald-500" />
    }
  }

  const getRiskColor = () => {
    switch (riskLevel) {
      case "critical":
        return "text-red-500"
      case "high":
        return "text-orange-500"
      case "medium":
        return "text-amber-500"
      default:
        return "text-emerald-500"
    }
  }

  const getProgressColor = () => {
    switch (riskLevel) {
      case "critical":
        return "bg-red-500"
      case "high":
        return "bg-orange-500"
      case "medium":
        return "bg-amber-500"
      default:
        return "bg-emerald-500"
    }
  }

  const getBadgeVariant = (): "default" | "secondary" | "destructive" | "outline" => {
    switch (riskLevel) {
      case "critical":
      case "high":
        return "destructive"
      case "medium":
        return "secondary"
      default:
        return "outline"
    }
  }

  if (compact) {
    return (
      <div
        className={cn(
          "flex items-center justify-between p-4 rounded-lg border",
          riskLevel === "critical" && "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20",
          riskLevel === "high" && "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/20"
        )}
      >
        <div className="flex items-center gap-3">
          {getRiskIcon()}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{userName || "Unknown User"}</span>
              <Badge variant={getBadgeVariant()} className="capitalize">
                {riskLevel}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{email}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className={cn("text-2xl font-bold", getRiskColor())}>
              {riskScore}
            </div>
            <p className="text-xs text-muted-foreground">Risk Score</p>
          </div>
          {onViewDetails && (
            <Button variant="ghost" size="icon" onClick={onViewDetails}>
              <ExternalLink className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <Card
      className={cn(
        riskLevel === "critical" &&
          "border-red-200 dark:border-red-800",
        riskLevel === "high" &&
          "border-orange-200 dark:border-orange-800"
      )}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            {getRiskIcon()}
            <div>
              <CardTitle>{userName || "Unknown User"}</CardTitle>
              <CardDescription>{email}</CardDescription>
            </div>
          </div>
          <Badge variant={getBadgeVariant()} className="capitalize">
            {riskLevel} Risk
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Risk Score Display */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Risk Score</span>
            <span className={cn("text-2xl font-bold", getRiskColor())}>
              {riskScore}/100
            </span>
          </div>
          <Progress
            value={riskScore}
            className={cn("h-2", getProgressColor())}
          />
          <div className="flex justify-between mt-1 text-xs text-muted-foreground">
            <span>Low Risk</span>
            <span>High Risk</span>
          </div>
        </div>

        {/* Account Info */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Account Age</p>
            <p className="font-medium">{accountAgeDays} days</p>
          </div>
          {lastActivityAt && (
            <div>
              <p className="text-muted-foreground">Last Activity</p>
              <p className="font-medium">
                {formatDistanceToNow(new Date(lastActivityAt), {
                  addSuffix: true,
                })}
              </p>
            </div>
          )}
        </div>

        {/* Risk Factors */}
        {factors.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Risk Factors</p>
            <div className="space-y-1.5">
              {factors.map((factor, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 rounded bg-muted/50"
                >
                  <span className="text-sm">{factor.description}</span>
                  <Badge variant="outline" className="text-xs">
                    +{factor.weight}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          {onViewDetails && (
            <Button variant="outline" className="flex-1" onClick={onViewDetails}>
              View Details
              <ExternalLink className="h-4 w-4 ml-2" />
            </Button>
          )}
          {onManageLimits && (
            <Button variant="outline" className="flex-1" onClick={onManageLimits}>
              Manage Limits
              <TrendingUp className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * High Risk Users Summary for dashboard
 */
interface HighRiskUser {
  userId: string
  userName: string | null
  email: string
  signalCount: number
  latestSignalDate: string | null
}

interface HighRiskUsersSummaryProps {
  users: HighRiskUser[]
  onViewUser: (userId: string) => void
}

export function HighRiskUsersSummary({
  users,
  onViewUser,
}: HighRiskUsersSummaryProps) {
  if (users.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <ShieldCheck className="h-8 w-8 mx-auto mb-2" />
        <p>No high-risk users detected</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {users.slice(0, 5).map((user) => (
        <div
          key={user.userId}
          className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
          onClick={() => onViewUser(user.userId)}
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <div>
              <p className="font-medium text-sm">
                {user.userName || "Unknown User"}
              </p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{user.signalCount} signals</Badge>
            {user.latestSignalDate && (
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(user.latestSignalDate), {
                  addSuffix: true,
                })}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default UserRiskCard
