"use client"

/**
 * Fraud Alert Badge Component
 * Displays warning indicators for flagged users and risk scores
 */

import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Shield, ShieldAlert, ShieldCheck, Info } from "lucide-react"
import { cn } from "@/lib/utils"

export type RiskLevel = "low" | "medium" | "high" | "critical"

interface RiskFactor {
  type: string
  weight: number
  description: string
}

interface FraudAlertBadgeProps {
  riskLevel: RiskLevel
  riskScore: number
  factors?: RiskFactor[]
  showScore?: boolean
  size?: "sm" | "md" | "lg"
  className?: string
  onClick?: () => void
}

export function FraudAlertBadge({
  riskLevel,
  riskScore,
  factors = [],
  showScore = true,
  size = "md",
  className,
  onClick,
}: FraudAlertBadgeProps) {
  const getIcon = () => {
    const iconClass = cn(
      size === "sm" && "h-3 w-3",
      size === "md" && "h-4 w-4",
      size === "lg" && "h-5 w-5"
    )

    switch (riskLevel) {
      case "critical":
        return <ShieldAlert className={cn(iconClass, "text-destructive")} />
      case "high":
        return <AlertTriangle className={cn(iconClass, "text-orange-500")} />
      case "medium":
        return <Shield className={cn(iconClass, "text-status-warning")} />
      case "low":
      default:
        return <ShieldCheck className={cn(iconClass, "text-status-success")} />
    }
  }

  const getBadgeVariant = (): "default" | "secondary" | "destructive" | "secondary" => {
    switch (riskLevel) {
      case "critical":
        return "destructive"
      case "high":
        return "destructive"
      case "medium":
        return "secondary"
      case "low":
      default:
        return "secondary"
    }
  }

  const getBackgroundColor = () => {
    switch (riskLevel) {
      case "critical":
        return "bg-status-error-light dark:bg-destructive/10 border-destructive dark:border-destructive"
      case "high":
        return "bg-orange-100 dark:bg-orange-950/30 border-orange-300 dark:border-orange-800"
      case "medium":
        return "bg-status-warning-light dark:bg-status-warning/10 border-status-warning dark:border-status-warning"
      case "low":
      default:
        return "bg-status-success-light dark:bg-status-success/10 border-status-success dark:border-status-success"
    }
  }

  const getLabelText = () => {
    switch (riskLevel) {
      case "critical":
        return "Critical Risk"
      case "high":
        return "High Risk"
      case "medium":
        return "Medium Risk"
      case "low":
      default:
        return "Low Risk"
    }
  }

  // Simple badge without popover for low risk
  if (riskLevel === "low" && factors.length === 0) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant={getBadgeVariant()}
              className={cn(
                "gap-1 cursor-default",
                size === "sm" && "text-xs px-1.5 py-0.5",
                size === "lg" && "text-sm px-3 py-1",
                className
              )}
              onClick={onClick}
            >
              {getIcon()}
              {showScore && <span>{riskScore}</span>}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{getLabelText()} - No concerns detected</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  // Detailed popover for elevated risk
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Badge
          variant={getBadgeVariant()}
          className={cn(
            "gap-1 cursor-pointer hover:opacity-80 transition-opacity",
            size === "sm" && "text-xs px-1.5 py-0.5",
            size === "lg" && "text-sm px-3 py-1",
            className
          )}
          onClick={onClick}
        >
          {getIcon()}
          {showScore && <span>{riskScore}</span>}
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getIcon()}
              <span className="font-medium">{getLabelText()}</span>
            </div>
            <Badge variant={getBadgeVariant()}>Score: {riskScore}/100</Badge>
          </div>

          {/* Risk Score Bar */}
          <div className="space-y-1">
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div
                className={cn(
                  "h-full transition-all duration-300",
                  riskLevel === "critical" && "bg-destructive",
                  riskLevel === "high" && "bg-orange-500",
                  riskLevel === "medium" && "bg-status-warning",
                  riskLevel === "low" && "bg-status-success"
                )}
                style={{ width: `${riskScore}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Low</span>
              <span>High</span>
            </div>
          </div>

          {/* Risk Factors */}
          {factors.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Contributing Factors</p>
              <div className="space-y-1.5">
                {factors.map((factor, index) => (
                  <div
                    key={index}
                    className={cn(
                      "flex items-center justify-between p-2 rounded text-sm",
                      getBackgroundColor()
                    )}
                  >
                    <span className="text-muted-foreground">{factor.description}</span>
                    <Badge variant="secondary" className="text-xs">
                      +{factor.weight}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Info footer */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            <p>
              Risk scores are calculated based on account activity patterns and
              automatically updated.
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Compact version for inline use
 */
interface FraudAlertIconProps {
  riskLevel: RiskLevel
  className?: string
}

export function FraudAlertIcon({ riskLevel, className }: FraudAlertIconProps) {
  if (riskLevel === "low") return null

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          {riskLevel === "critical" ? (
            <ShieldAlert className={cn("h-4 w-4 text-destructive", className)} />
          ) : riskLevel === "high" ? (
            <AlertTriangle className={cn("h-4 w-4 text-orange-500", className)} />
          ) : (
            <Shield className={cn("h-4 w-4 text-status-warning", className)} />
          )}
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {riskLevel === "critical"
              ? "Critical risk - Review required"
              : riskLevel === "high"
                ? "High risk user"
                : "Medium risk - Monitor"}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * Banner version for prominent display
 */
interface FraudAlertBannerProps {
  riskLevel: RiskLevel
  riskScore: number
  message?: string
  onReview?: () => void
}

export function FraudAlertBanner({
  riskLevel,
  riskScore,
  message,
  onReview,
}: FraudAlertBannerProps) {
  if (riskLevel === "low") return null

  const getBackgroundColor = () => {
    switch (riskLevel) {
      case "critical":
        return "bg-status-error-light dark:bg-destructive/10 border-destructive dark:border-destructive"
      case "high":
        return "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800"
      case "medium":
        return "bg-status-warning-light dark:bg-status-warning/10 border-status-warning dark:border-status-warning"
      default:
        return ""
    }
  }

  const getIconColor = () => {
    switch (riskLevel) {
      case "critical":
        return "text-destructive"
      case "high":
        return "text-orange-600"
      case "medium":
        return "text-status-warning"
      default:
        return ""
    }
  }

  const defaultMessage =
    riskLevel === "critical"
      ? "This user has critical fraud signals. Review before proceeding."
      : riskLevel === "high"
        ? "This user has elevated fraud signals. Proceed with caution."
        : "This user has some fraud signals. Monitor activity."

  return (
    <div className={cn("p-4 rounded-lg border", getBackgroundColor())}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={cn("h-5 w-5 mt-0.5", getIconColor())} />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium capitalize">{riskLevel} Risk</span>
            <Badge variant="secondary">Score: {riskScore}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{message || defaultMessage}</p>
        </div>
        {onReview && (
          <Button variant="secondary" size="sm" onClick={onReview}>
            Review
          </Button>
        )}
      </div>
    </div>
  )
}

export default FraudAlertBadge
